"""Execute the linked App669 MTUDv3/EVT! path on Cortex-M4.

The actual ELF/BIN and INFO05 registration are used. Only the sd_ble_opt_set
SVC boundary is modeled, after checking the linked S112 stub and option ABI.
RAM/NVIC are mapped; other radio, timer, storage or GPIO accesses fault. This
does not establish SoftDevice acceptance on hardware or physical throughput.
"""
import argparse
import json
from pathlib import Path
import struct
from subprocess import check_output

from check_build_fault_elf import firmware
from check_stack_watermark_elf import tool
from unicorn import (Uc, UC_ARCH_ARM, UC_HOOK_CODE, UC_MODE_MCLASS, UC_MODE_THUMB,
                     UC_PROT_EXEC, UC_PROT_READ, UC_PROT_WRITE)
from unicorn.arm_const import (UC_CPU_ARM_CORTEX_M4, UC_ARM_REG_LR, UC_ARM_REG_MSP,
                               UC_ARM_REG_PC, UC_ARM_REG_PRIMASK, UC_ARM_REG_R0,
                               UC_ARM_REG_R1, UC_ARM_REG_R2)


def verify(folder):
    metadata, symbols, image, commands = firmware(folder)
    s = symbols
    assert commands[5] == s['df_proto_handler_info_mtu_diagnostic']
    sizes = {r[3]: int(r[1], 16) for line in check_output(
        [tool('nm'), '-S', folder / 'pixljs.out'], text=True).splitlines()
        if len(r := line.split()) == 4}
    assert sizes['m_event_extension_enabled'] == 1 and sizes['m_event_extension_result'] == 4
    cpu = Uc(UC_ARCH_ARM, UC_MODE_MCLASS | UC_MODE_THUMB)
    cpu.ctl_set_cpu_model(UC_CPU_ARM_CORTEX_M4)
    cpu.mem_map(0, 0x80000)
    cpu.mem_write(s['__isr_vector'], image)
    cpu.mem_protect(0, 0x80000, UC_PROT_READ | UC_PROT_EXEC)
    cpu.mem_map(0x20000000, 0x10000, UC_PROT_READ | UC_PROT_WRITE)
    cpu.mem_map(0xe000e000, 0x1000)
    data = bytes(cpu.mem_read(s['__etext'], s['__data_end__'] - s['__data_start__']))
    cpu.mem_write(s['__data_start__'], data)
    # The pinned S112 sd_ble_opt_set wrapper is SVC 0x67; BX LR. No other SDK
    # call is intercepted. The option ID is BLE_OPT_BASE + 1 == 2.
    assert bytes(cpu.mem_read(s['sd_ble_opt_set'], 4)) == bytes.fromhex('67df7047')
    assert cpu.mem_read(s['m_event_extension_enabled'], 1) == b'\0'
    assert cpu.mem_read(s['m_event_extension_result'], 4) == b'\xff' * 4
    base = s['__HeapBase']
    event, frame, out, params = base, base + 8, base + 512, base + 600
    replies, cases, option_calls = [], ['linked_initial_data_baseline_off_unknown_result'], []
    api_result, sdk_enabled = 0, False

    def capture(machine, address, size, user):
        data = bytes(machine.mem_read(machine.reg_read(UC_ARM_REG_R0), 248))
        replies.append((data[:4], data[4:4 + data[247]]))
        machine.reg_write(UC_ARM_REG_PC, machine.reg_read(UC_ARM_REG_LR))

    def option_boundary(machine, address, size, user):
        nonlocal sdk_enabled
        assert machine.reg_read(UC_ARM_REG_R0) == 2
        option = bytes(machine.mem_read(machine.reg_read(UC_ARM_REG_R1), 8))
        assert option[0] in (0, 1) and option[1:] == bytes(7)
        assert struct.unpack('<I', machine.mem_read(s['nrf_nvic_state'] + 8, 4))[0] == 1
        option_calls.append((option[0], api_result))
        if not api_result:
            sdk_enabled = bool(option[0])
        machine.reg_write(UC_ARM_REG_R0, api_result)
        machine.reg_write(UC_ARM_REG_PC, machine.reg_read(UC_ARM_REG_LR))

    cpu.hook_add(UC_HOOK_CODE, capture, begin=s['df_core_send_frame'], end=s['df_core_send_frame'])
    cpu.hook_add(UC_HOOK_CODE, option_boundary, begin=s['sd_ble_opt_set'], end=s['sd_ble_opt_set'])

    def call(name, *args):
        for reg, value in zip((UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2), args):
            cpu.reg_write(reg, value & 0xffffffff)
        cpu.reg_write(UC_ARM_REG_MSP, s['__StackTop'])
        cpu.reg_write(UC_ARM_REG_LR, 0x101)
        cpu.reg_write(UC_ARM_REG_PRIMASK, 0)
        cpu.emu_start(s[name] | 1, 0x100, count=100000)
        assert cpu.reg_read(UC_ARM_REG_PC) == 0x100
        assert cpu.reg_read(UC_ARM_REG_MSP) == s['__StackTop']
        assert struct.unpack('<I', cpu.mem_read(s['nrf_nvic_state'] + 8, 4))[0] == 0
        return cpu.reg_read(UC_ARM_REG_R0)

    def request(payload=b'\2', status=0, chunk=0, event_type=2):
        cpu.mem_write(event, struct.pack('<II', event_type, frame if event_type == 2 else 0))
        data = bytearray(struct.pack('<BBH243xB', 5, status, chunk, len(payload)))
        data[4:4 + len(payload)] = payload
        cpu.mem_write(frame, bytes(data))
        replies.clear()
        unchanged = {name: bytes(cpu.mem_read(s[name], sizes[name]))
                     for name in ('m_gatt', 'm_link_profile')}
        call('df_proto_handler_info_mtu_diagnostic', event)
        for name, before in unchanged.items():
            assert bytes(cpu.mem_read(s[name], sizes[name])) == before, name
        return replies.copy()

    def query():
        before = option_calls.copy()
        response = request()
        assert option_calls == before and len(response) == 1 and response[0][0] == b'\5\0\0\0'
        value = response[0][1]
        assert len(value) == 40 and value[:5] == b'MTUD\3'
        assert value[32] == 1 | (2 if sdk_enabled else 0)
        assert value[33:36] == b'\0\6\0'
        return value

    def rejected(payload=b'EVT!\0', status=0, chunk=0):
        before = option_calls.copy()
        enabled = bytes(cpu.mem_read(s['m_event_extension_enabled'], 1))
        result = bytes(cpu.mem_read(s['m_event_extension_result'], 4))
        assert request(payload, status, chunk) == [(b'\5\1\0\0', b'')]
        assert option_calls == before
        assert cpu.mem_read(s['m_event_extension_enabled'], 1) == enabled
        assert cpu.mem_read(s['m_event_extension_result'], 4) == result

    cpu.mem_write(out - 1, b'\xa5' * 42)
    for wanted, pointer, length in ((-1, 0, 40), (-1, out, 39), (-2, out, 40),
                                    (2, out, 40), (-1, out, 40), (1, out, 40)):
        assert call('ble_test_diagnostic', wanted, pointer, length) == 0
        assert cpu.mem_read(out - 1, 42) == b'\xa5' * 42
    assert not option_calls
    cases.append('bounds_and_uninitialized_do_not_write_or_call_sdk')
    cpu.mem_write(s['m_ble_initialized'], b'\1')
    cpu.mem_write(s['m_gatt'], struct.pack('<HHBxHHBBI', 250, 250, 27, 250, 250, 0, 0, 0))
    cpu.mem_write(params, struct.pack('<4H', 24, 24, 0, 500))
    call('ble_link_profile_reset', params)
    cpu.mem_write(s['m_conn_handle'], b'\0\0')
    cpu.mem_write(s['m_nus_session_handle'], b'\0\0')
    cpu.mem_write(s['m_ble_nus_max_data_len'], struct.pack('<H', 247))
    cpu.mem_write(s['m_sessions_enabled'], b'\1')
    call('ble_work_connected')
    baseline = query()
    assert baseline[36:] == b'\xff' * 4
    legacy1, legacy2 = request(b'')[0][1], request(b'\1')[0][1]
    assert len(legacy1) == 16 and len(legacy2) == 32
    assert baseline[:4] == legacy2[:4] and baseline[5:32] == legacy2[5:]
    assert call('ble_test_diagnostic', -1, out, 40) == 1
    assert cpu.mem_read(out - 1, 1) == b'\xa5' and cpu.mem_read(out + 40, 1) == b'\xa5'
    cases.append('registered_v3_and_guarded_direct_query_preserve_v2_prefix')

    for enabled in (1, 0, 1):
        before = len(option_calls)
        response = request(b'EVT!' + bytes((enabled,)))
        assert response == [(b'\5\0\0\0', query())]
        assert len(option_calls) == before + 1 and option_calls[-1] == (enabled, 0)
        assert sdk_enabled == bool(enabled) and query()[36:] == bytes(4)
    cases.append('explicit_enable_disable_with_actual_option_abi_and_critical_region')
    for enabled in (0, 1):
        api_result = 0
        request(b'EVT!' + bytes((enabled,)))
        for api_result in (17, 6, 8, 7):  # BUSY, NOT_SUPPORTED, INVALID_STATE, INVALID_PARAM
            before = len(option_calls)
            response = request(b'EVT!' + bytes((1 - enabled,)))
            assert response[0][0] == b'\5\0\0\0'
            assert len(option_calls) == before + 1 and sdk_enabled == bool(enabled)
            assert query()[36:] == struct.pack('<I', api_result)
    cases.append('sdk_rejection_preserves_both_prior_states_and_reports_exact_error')
    api_result = 0
    cpu.mem_write(s['file_chunk_state'], b'\1')
    assert not query()[5] & 4
    rejected()
    cpu.mem_write(s['file_chunk_state'], b'\0')
    assert query()[5] & 4
    cases.append('linked_vfs_idle_gate_blocks_mutation_but_not_query')

    gates = {'m_ble_initialized': b'\0', 'm_sessions_enabled': b'\0', 'm_file_mode': b'\0',
             'm_remote_mode': b'\1', 'm_mode_pending': b'\1', 'm_conn_handle': b'\xff\xff',
             'm_nus_session_handle': b'\1\0', 'm_release_handle': b'\0\0'}
    for name, invalid in gates.items():
        old = bytes(cpu.mem_read(s[name], len(invalid)))
        cpu.mem_write(s[name], invalid)
        rejected()
        cpu.mem_write(s[name], old)
    call('ble_work_disconnected')
    rejected()
    call('ble_work_connected')
    cases.append('session_mode_release_wrong_handle_and_work_gates')

    for payload, status, chunk in ((b'\3', 0, 0), (b'\2\0', 0, 0), (b'EVT!', 0, 0),
        (b'EVT!\0\0', 0, 0), (b'EVT!\2', 0, 0), (b'EVT!\xff', 0, 0),
        (b'EVT!\1', 1, 0), (b'EVT!\1', 0, 1)):
        rejected(payload, status, chunk)
    before = option_calls.copy()
    for kind in (0, 1, 3):
        assert request(b'EVT!\1', event_type=kind) == []
    assert option_calls == before
    cases.append('malformed_requests_and_nonrequest_events_do_not_call_sdk')

    request(b'EVT!\1')
    assert request(b'')[0][1] == legacy1 and request(b'\1')[0][1] == legacy2
    cases.append('v1_v2_unchanged_after_test_mutation')
    # This models a handle change using real profile/work functions. Full GAP
    # disconnect/reconnect delivery is exercised separately in the C host test.
    before = option_calls.copy()
    cpu.mem_write(s['m_conn_handle'], b'\xff\xff')
    cpu.mem_write(s['m_nus_session_handle'], b'\xff\xff')
    call('ble_work_disconnected')
    call('ble_link_profile_reset', 0)
    disconnected = query()
    assert not disconnected[14] & 1 and disconnected[32:] == b'\3\0\6\0' + bytes(4)
    rejected()
    cpu.mem_write(s['m_conn_handle'], b'\0\0')
    cpu.mem_write(s['m_nus_session_handle'], b'\0\0')
    call('ble_link_profile_reset', params)
    call('ble_work_connected')
    assert query()[32:] == disconnected[32:] and option_calls == before
    cases.append('profile_and_handle_changes_preserve_global_sdk_setting')

    return {'passed': True, 'device_access': False, 'sourceId': metadata['source_id_sha256'],
        'binSha256': metadata['artifacts_sha256']['pixljs.bin'], 'cases': cases,
        'testStateFieldBytes': sizes['m_event_extension_enabled'] + sizes['m_event_extension_result'],
        'sdkBoundaryCalls': len(option_calls), 'sdkBoundary': 'sd_ble_opt_set; S112 SVC 0x67, option ID 2',
        'scope': 'Linked Cortex-M4 application code; seeded RAM and modeled option API return values. '
                 'No physical SoftDevice acceptance, radio timing, throughput, reboot or installation test.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('build', type=Path)
    parser.add_argument('--json', type=Path)
    args = parser.parse_args()
    result = verify(args.build)
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(result, indent=2) + '\n')
    print('PASS linked test MTUDv3/EVT!:', len(result['cases']), 'cases;', result['binSha256'])
