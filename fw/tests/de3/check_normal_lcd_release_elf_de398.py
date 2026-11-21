"""Execute the normal LCD DE3.98/App671 diagnostic handlers on Cortex-M4.

The only intercepted function is the outgoing DF frame sink. Application
flash, RAM and NVIC are mapped; any SPI/radio/RTC/GPIO or SVC access fails.
Link observations are explicitly seeded RAM, startup observations use the
actual recorder functions, and PXGC exercises the actual unmounted store.
The separate production-C/NOR suite covers mounted GC and snapshot lifetime.
"""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import struct
from subprocess import check_output

from check_build_fault_elf import firmware
from check_stack_watermark_elf import tool
from unicorn import (Uc, UC_ARCH_ARM, UC_HOOK_CODE, UC_HOOK_INTR,
                     UC_MODE_MCLASS, UC_MODE_THUMB, UC_PROT_EXEC,
                     UC_PROT_READ, UC_PROT_WRITE)
from unicorn.arm_const import (UC_CPU_ARM_CORTEX_M4, UC_ARM_REG_CONTROL,
                               UC_ARM_REG_IPSR, UC_ARM_REG_LR, UC_ARM_REG_MSP,
                               UC_ARM_REG_PC, UC_ARM_REG_PRIMASK, UC_ARM_REG_R0,
                               UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3)


def verify(folder):
    metadata, symbols, image, info = firmware(folder)
    s = symbols
    assert metadata['version'] == '2.22.0-DE3.98'
    assert metadata['counter'] == 671
    assert s['__StackTop'] - s['__StackLimit'] == 8192
    assert 'u8g2_Setup_st7567_enh_dg128064_f' in s
    assert 'u8g2_Setup_sh1106_128x64_noname_f' not in s
    assert info[5] == s['df_proto_handler_info_mtu_diagnostic']
    assert info[9] == s['df_proto_handler_info_startup_diagnostic']
    sizes = {r[3]: int(r[1], 16) for line in check_output(
        [tool('nm'), '-S', folder / 'pixljs.out'], text=True).splitlines()
        if len(r := line.split()) == 4}
    assert sizes['m_gatt'] == 16 and sizes['m_link_profile'] == 24
    absent = ('ble_test_diagnostic', 'm_event_extension_enabled',
              'm_event_extension_result', 'mount_profile',
              'runtime_diag_mount_scan_begin', 'runtime_diag_profile_begin',
              'runtime_diag_profile_end', 'runtime_diag_startup_profile_snapshot')
    for name in absent:
        assert not any(key == name or key.startswith(name + '.') for key in s), name
    for name in ('ble_link_diagnostic', 'runtime_diag_startup_cache_snapshot',
                 'vfs_packed_gc_diagnostic', 'pfs_gc_diagnostic'):
        assert name in s, name
    vfs = {}
    start = s['df_proto_handler_vfs_entries'] - s['__isr_vector']
    for index in range(64):
        command, handler = struct.unpack_from('<B3xI', image, start + index * 8)
        if not command:
            assert not handler
            break
        assert handler & 1 and command not in vfs
        vfs[command] = handler - 1
    else:
        raise AssertionError('Unterminated VFS command registry')
    assert vfs[0x1c] == s['df_proto_handler_vfs_storage_info']

    cpu = Uc(UC_ARCH_ARM, UC_MODE_MCLASS | UC_MODE_THUMB)
    cpu.ctl_set_cpu_model(UC_CPU_ARM_CORTEX_M4)
    cpu.mem_map(0, 0x80000)
    cpu.mem_write(s['__isr_vector'], image)
    cpu.mem_protect(0, 0x80000, UC_PROT_READ | UC_PROT_EXEC)
    cpu.mem_map(0x20000000, 0x10000, UC_PROT_READ | UC_PROT_WRITE)
    cpu.mem_map(0xe000e000, 0x1000)
    cpu.mem_write(s['__data_start__'], bytes(cpu.mem_read(
        s['__etext'], s['__data_end__'] - s['__data_start__'])))
    scratch = s['__HeapBase']
    event, frame, out, params = scratch, scratch + 8, scratch + 264, scratch + 384
    assert params + 8 <= s['__HeapLimit']
    replies, cases, nvic_scratch_changes = [], [], set()
    assert sizes['nrf_nvic_state'] == 12

    def capture(machine, address, size, user):
        raw = bytes(machine.mem_read(machine.reg_read(UC_ARM_REG_R0), 248))
        assert raw[247] <= 243
        replies.append((raw[0], raw[1], struct.unpack_from('<H', raw, 2)[0],
                        raw[4:4 + raw[247]]))
        machine.reg_write(UC_ARM_REG_PC, machine.reg_read(UC_ARM_REG_LR))

    def forbidden_interrupt(machine, number, user):
        raise AssertionError(f'Unexpected interrupt/SVC {number}; no hardware API is stubbed')

    cpu.hook_add(UC_HOOK_CODE, capture, begin=s['df_core_send_frame'], end=s['df_core_send_frame'])
    cpu.hook_add(UC_HOOK_INTR, forbidden_interrupt)

    def call(name, *args):
        extra = args[4:]
        entry_sp = s['__StackTop'] - ((4 * len(extra) + 7) & ~7)
        if extra:
            cpu.mem_write(entry_sp, struct.pack('<' + 'I' * len(extra), *extra))
        for reg, value in zip((UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3), args):
            cpu.reg_write(reg, value & 0xffffffff)
        cpu.reg_write(UC_ARM_REG_MSP, entry_sp)
        cpu.reg_write(UC_ARM_REG_LR, 0x101)
        cpu.reg_write(UC_ARM_REG_PRIMASK, 0)
        cpu.reg_write(UC_ARM_REG_CONTROL, 0)
        cpu.reg_write(UC_ARM_REG_IPSR, 0)
        cpu.emu_start(s[name] | 1, 0x100, count=200000)
        assert cpu.reg_read(UC_ARM_REG_PC) == 0x100, name
        assert cpu.reg_read(UC_ARM_REG_MSP) == entry_sp, name
        assert struct.unpack('<I', cpu.mem_read(s['nrf_nvic_state'] + 8, 4))[0] == 0
        return cpu.reg_read(UC_ARM_REG_R0)

    def text(pointer):
        value = bytearray()
        while byte := cpu.mem_read(pointer + len(value), 1)[0]:
            value.append(byte)
            assert len(value) < 128
        return value.decode('ascii')

    version = text(call('version_get_version', 0))
    assert version == metadata['version']
    assert text(call('version_get_source_id')) == metadata['source_id_sha256']
    cases.append('actual_linked_DE3_98_version_and_source_id_bound_to_App671_build_record')

    def request(command, payload=b'', status=0, chunk=0, event_type=2, expected_vfs_error=None):
        assert len(payload) <= 243
        cpu.mem_write(event, struct.pack('<II', event_type, frame if event_type == 2 else 0))
        raw = bytearray(struct.pack('<BBH243xB', command, status, chunk, len(payload)))
        raw[4:4 + len(payload)] = payload
        cpu.mem_write(frame, bytes(raw))
        replies.clear()
        # Read-only application state: stack and the SDK's two saved IRQ-mask
        # words are bookkeeping. Real sd_nvic_critical_region_enter stores
        # the current masks there; __cr_flag must still return to zero.
        # No API is intercepted to hide these writes. Input, diagnostics,
        # globals and reserved scratch remain byte-identical.
        before = bytes(cpu.mem_read(0x20000000, s['__StackLimit'] - 0x20000000))
        expected = before
        if expected_vfs_error is not None:
            # Malformed VFS commands intentionally record BAD_REQUEST. Build
            # the exact allowed delta through the real recorder, then restore
            # the seeded input. This avoids hard-coding a private state layout
            # or silently exempting all runtime diagnostic state from comparison.
            call('runtime_diag_vfs_error', command, expected_vfs_error)
            expected = bytes(cpu.mem_read(0x20000000, len(before)))
            cpu.mem_write(0x20000000, before)
        name = {5: 'df_proto_handler_info_mtu_diagnostic',
                9: 'df_proto_handler_info_startup_diagnostic',
                0x1c: 'df_proto_handler_vfs_storage_info'}[command]
        call(name, event)
        after = bytes(cpu.mem_read(0x20000000, len(before)))
        differences = [(0x20000000 + i, a, b)
                       for i, (a, b) in enumerate(zip(expected, after)) if a != b]
        assert all(s['nrf_nvic_state'] <= address < s['nrf_nvic_state'] + 8
                   for address, _, _ in differences), (command, payload, differences[:32])
        nvic_scratch_changes.update(address for address, _, _ in differences)
        return replies.copy()

    def accepted(command, payload, length, prefix):
        result = request(command, payload)
        assert len(result) == 1 and result[0][:3] == (command, 0, 0), result
        wire = result[0][3]
        assert len(wire) == length and wire.startswith(prefix), wire.hex()
        return wire

    def rejected(command, payload, **kwargs):
        expected_error = -1000 if command == 0x1c else None
        assert request(command, payload, expected_vfs_error=expected_error, **kwargs) == [(command, 1, 0, b'')]

    # Observed link RAM is seeded; actual RAM-only GATT/profile/work functions
    # are used. There is no modeled PHY procedure or SoftDevice return value.
    cpu.mem_write(s['m_ble_initialized'], b'\1')
    cpu.mem_write(s['m_gatt'], struct.pack('<HHBxHHBBI', 250, 250, 27, 250, 250, 0, 0, 0))
    cpu.mem_write(params, struct.pack('<4H', 48, 48, 0, 400))
    call('ble_link_profile_reset', params)
    cpu.mem_write(s['m_conn_handle'], b'\0\0')
    cpu.mem_write(s['m_nus_session_handle'], b'\0\0')
    cpu.mem_write(s['m_ble_nus_max_data_len'], struct.pack('<H', 247))
    cpu.mem_write(s['m_sessions_enabled'], b'\1')
    call('ble_work_connected')
    legacy = accepted(5, b'', 16, b'MTUD\1')
    link = accepted(5, b'\1', 32, b'MTUD\2')
    assert link[5:14] == legacy[5:14]
    assert struct.unpack_from('<4H', link, 6) == (250, 250, 250, 247)
    assert link[14] & 3 == 3 and struct.unpack_from('<3H', link, 16) == (48, 0, 400)
    cpu.mem_write(out - 1, b'\xa5' * 34)
    for pointer, length in ((0, 32), (out, 31)):
        assert call('ble_link_diagnostic', pointer, length) == 0
        assert cpu.mem_read(out - 1, 34) == b'\xa5' * 34
    assert call('ble_link_diagnostic', out, 32) == 1
    assert cpu.mem_read(out - 1, 1) == b'\xa5' and cpu.mem_read(out + 32, 1) == b'\xa5'
    cases.append('registered_MTUDv1_v2_exact_lengths_link_fields_and_direct_bounds')

    for payload in (b'\2', b'\2\0', b'EVT!\0', b'EVT!\1', b'EVT!\2', b'EVT!'):
        rejected(5, payload)
    cases.append('MTUDv3_and_both_EVT_settings_rejected_without_RAM_mutation_or_SVC')

    # Seed a completed cache/startup record through the real recorder APIs.
    call('runtime_diag_startup_mark', 0, 0)
    call('runtime_diag_storage_mark', 0, 1900)
    call('runtime_diag_storage_mark', 1, 1910)
    for phase, milliseconds in enumerate((2000, 2010, 2050, 2070, 2080), 1):
        call('runtime_diag_startup_mark', phase, milliseconds)
    call('runtime_diag_mount_begin')
    call('runtime_diag_mount_configured', 3)
    call('runtime_diag_mount_read', 256, 1)
    call('runtime_diag_mount_read', 128, 0)
    for hit, eligible in ((1, 1), (0, 1), (0, 0)):
        call('runtime_diag_mount_cache', hit, eligible)
    call('runtime_diag_mount_complete', 0, 1900, 26, 13, 256)
    startup = accepted(9, b'\3', 84, b'PXST\4\x54')
    assert startup[6:8] == b'\x3f\3'
    assert struct.unpack_from('<6I', startup, 8) == (0, 2000, 2010, 2050, 2070, 2080)
    assert struct.unpack_from('<2I', startup, 32) == (1900, 1910)
    assert struct.unpack_from('<10I', startup, 40) == (23, 0, 3, 1900, 2, 256, 1, 1, 1, 1)
    assert startup[80:] == bytes((26, 13, 0, 1))
    for selector, version_number, length in ((b'', 1, 32), (b'\1', 2, 40), (b'\2', 3, 80)):
        old = accepted(9, selector, length, b'PXST' + bytes((version_number, length)))
        assert old[8:32] == startup[8:32]
        if version_number > 1:
            assert old[6:length] == startup[6:length]
    assert accepted(9, b'\3', 84, b'PXST\4\x54') == startup
    for payload in (b'\4', b'\4\0', b'\0', b'\3\0'):
        rejected(9, payload)
    cases.append('actual_startup_recorders_registered_v1_to_v4_and_v5_rejected')

    assert cpu.mem_read(s['store'], 4) == bytes(4)
    gc = accepted(0x1c, b'E\2', 24, b'PXGC\1\x18E')
    assert gc[7:] == bytes(17)
    assert accepted(0x1c, b'E', 8, b'\1E\3') == bytes((1, 69, 3, 0, 7, 128, 64, 48))
    assert accepted(0x1c, b'E\1', 8, b'\1E\3') == bytes((1, 69, 3, 0, 15, 128, 64, 48))
    cpu.mem_write(out - 1, b'\xa5' * 26)
    for pointer, length in ((0, 24), (out, 23)):
        assert call('vfs_packed_gc_diagnostic', pointer, length) == 0
        assert cpu.mem_read(out - 1, 26) == b'\xa5' * 26
    assert call('vfs_packed_gc_diagnostic', out, 24) == 1
    assert bytes(cpu.mem_read(out, 24)) == gc
    assert cpu.mem_read(out - 1, 1) == b'\xa5' and cpu.mem_read(out + 24, 1) == b'\xa5'
    for payload in (b'E\3', b'I\2', b'E\2\0', b''):
        rejected(0x1c, payload)
    cases.append('actual_PXGCv1_unmounted_RAM_snapshot_bounds_and_legacy_storage_capabilities')

    for command, payload in ((5, b'\1'), (9, b'\3'), (0x1c, b'E\2')):
        rejected(command, payload, status=1)
        rejected(command, payload, chunk=1)
        for event_type in (0, 1, 3):
            assert request(command, payload, event_type=event_type) == []
    cases.append('malformed_frames_and_nonrequest_events_preserve_application_RAM_except_SDK_saved_IRQ_masks')
    cases.append('test_eventextension_and_mount_profiler_code_and_state_symbols_absent')
    return {
        'passed': True, 'deviceAccess': False, 'version': version, 'counter': 671,
        'sourceId': metadata['source_id_sha256'],
        'binSha256': sha256(image).hexdigest(),
        'elfSha256': sha256((folder / 'pixljs.out').read_bytes()).hexdigest(),
        'buildRecordSha256': sha256((folder / 'BUILD_RESULT.json').read_bytes()).hexdigest(),
        'checkerSha256': sha256(Path(__file__).read_bytes()).hexdigest(),
        'cases': cases, 'absentTestSymbols': list(absent),
        'registeredHandlers': {'INFO05': hex(info[5]), 'INFO09': hex(info[9]), 'VFS1c': hex(vfs[0x1c])},
        'counterEvidence': 'Exact BUILD_RESULT counter and artifact binding; signed DFU init counter is verified separately.',
        'modeledBoundary': 'df_core_send_frame response capture only; no SDK, storage, timer or radio success stubs.',
        'ramComparisonException': {'symbol': 'nrf_nvic_state', 'offset': 0, 'bytes': 8,
                                   'reason': 'Actual SDK critical-region saved IRQ-mask bookkeeping; critical flag is checked zero separately.',
                                   'observedChangedByteAddresses': sorted(hex(address) for address in nvic_scratch_changes)},
        'malformedVfsExpectedMutation': 'Exactly runtime_diag_vfs_error(command=0x1c,error=-1000), including its error counter; computed with the actual linked recorder and compared against the handler result.',
        'seededObservations': 'Explicit link RAM and synthetic startup-recorder inputs; these are not device measurements.',
        'scope': 'Actual linked normal LCD diagnostic handlers, registry, serializers and recorder functions. '
                 'RAM/NVIC only; unknown peripheral access and every SVC fail. '
                 'PXGC linked test covers unmounted state; real mounted/pinned/error state is covered by the separate C/NOR test. '
                 'No hardware timing, BLE operation, complete stack bound or installation claim.'
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('build', type=Path)
    parser.add_argument('--json', type=Path)
    args = parser.parse_args()
    result = verify(args.build)
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, indent=2))
