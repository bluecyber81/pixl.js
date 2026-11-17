"""Run the linked fault entries, cache clean, reset capture and BLE serializer on Cortex-M4."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import struct
from subprocess import check_output
from tempfile import TemporaryDirectory

from unicorn import (Uc, UC_ARCH_ARM, UC_HOOK_CODE, UC_HOOK_MEM_WRITE, UC_MODE_MCLASS,
                     UC_MODE_THUMB, UC_PROT_EXEC, UC_PROT_READ, UC_PROT_WRITE)
from unicorn.arm_const import (UC_CPU_ARM_CORTEX_M4, UC_ARM_REG_CONTROL, UC_ARM_REG_IPSR,
                               UC_ARM_REG_LR, UC_ARM_REG_MSP, UC_ARM_REG_PC, UC_ARM_REG_PRIMASK,
                               UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2)

from check_stack_watermark_elf import tool


def firmware(folder):
    elf = folder / 'pixljs.out'
    image = (folder / 'pixljs.bin').read_bytes()
    record = json.loads((folder / 'BUILD_RESULT.json').read_bytes())
    assert hashlib.sha256(image).hexdigest() == record['artifacts_sha256']['pixljs.bin']
    assert record['board'] in ('LCD', 'OLED')
    with TemporaryDirectory() as tmp:
        extracted = Path(tmp) / 'elf.bin'
        check_output([tool('objcopy'), '-O', 'binary', elf, extracted])
        assert extracted.read_bytes() == image
    rows = (line.split() for line in check_output([tool('nm'), '-n', elf], text=True).splitlines())
    symbols = {r[2]: int(r[0], 16) for r in rows if len(r) == 3}
    commands = {}
    start = symbols['df_proto_handler_info_entries'] - symbols['__isr_vector']
    for index in range(32):
        cmd, handler = struct.unpack_from('<B3xI', image, start + index * 8)
        if (cmd, handler) == (0, 0):
            break
        assert handler & 1 and cmd not in commands
        commands[cmd] = handler - 1
    else:
        raise AssertionError('unterminated info handler table')
    return record, symbols, image, commands


def verify(folder, older=None):
    metadata, s, image, commands = firmware(folder)
    assert commands[12] == s['df_proto_handler_info_build_fault']
    if older:
        old, _, _, legacy = firmware(older)
        assert old['board'] == metadata['board'] and old['counter'] < metadata['counter'] and set(legacy) == set(commands) - {12}
    source_id = metadata['source_id_sha256']
    assert re.fullmatch('[a-f0-9]{64}', source_id)
    sections = check_output([tool('readelf'), '-SW', folder / 'pixljs.out'], text=True)
    match = re.search(r'\.retained_fault\s+NOBITS\s+([0-9a-f]+)\s+[0-9a-f]+\s+([0-9a-f]+)', sections)
    assert match
    retained, length = (int(x, 16) for x in match.groups())
    assert (retained, length) == (0x200035e0, 28) and s['__stop_noinit'] <= retained
    top, low, cache = s['__StackTop'], s['__StackLimit'], s['m_cache_data']
    cpu = Uc(UC_ARCH_ARM, UC_MODE_MCLASS | UC_MODE_THUMB)
    cpu.ctl_set_cpu_model(UC_CPU_ARM_CORTEX_M4)
    cpu.mem_map(0, 0x80000)
    cpu.mem_write(s['__isr_vector'], image)
    cpu.mem_protect(0, 0x80000, UC_PROT_READ | UC_PROT_EXEC)
    cpu.mem_map(0x20000000, 0x10000, UC_PROT_READ | UC_PROT_WRITE)
    cpu.mem_map(0xe000e000, 0x1000)
    replies, writes, states = [], [], []
    aircr = 0xe000ed0c

    def reset_write(machine, access, address, size, value, user):
        assert size == 4 and value >> 16 == 0x5fa and value & 4
        writes.append((address, size))  # stopping here can suppress later hooks for this write
        machine.emu_stop()

    def capture(machine, address, size, user):
        data = machine.mem_read(machine.reg_read(UC_ARM_REG_R0), 248)
        replies.append((bytes(data[:4]), bytes(data[4:4 + data[247]])))
        machine.reg_write(UC_ARM_REG_PC, machine.reg_read(UC_ARM_REG_LR))

    cpu.hook_add(UC_HOOK_MEM_WRITE, reset_write, begin=aircr, end=aircr)
    cpu.hook_add(UC_HOOK_CODE, capture, begin=s['df_core_send_frame'], end=s['df_core_send_frame'])

    def call(name, *args, terminal=False, hard=False):
        cpu.reg_write(UC_ARM_REG_IPSR, 3 if hard else 0)
        cpu.reg_write(UC_ARM_REG_CONTROL, 0)
        cpu.reg_write(UC_ARM_REG_MSP, 0xdeadbe00 if hard else top)
        cpu.reg_write(UC_ARM_REG_PRIMASK, 0)
        cpu.reg_write(UC_ARM_REG_LR, 0x101)
        for reg, value in zip((UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2), args):
            cpu.reg_write(reg, value)
        if terminal:
            writes.clear()
            hook = cpu.hook_add(UC_HOOK_MEM_WRITE, lambda m, op, a, n, v, u: writes.append((a, n)))
        try:
            cpu.emu_start(s[name] | 1, 0x100, count=500000)
        finally:
            if terminal:
                cpu.hook_del(hook)
        if terminal:
            assert (aircr, 4) in writes, (name,writes)
            assert cpu.reg_read(UC_ARM_REG_PRIMASK) == 1, name
            assert all((retained <= a and a+n <= retained+length) or (a, n) in {(cache, 4), (aircr, 4)}
                       or (low <= a and a+n <= top) for a,n in writes), writes
            assert cpu.mem_read(cache, 4) == b'\xff'*4
        else:
            assert cpu.reg_read(UC_ARM_REG_PC) == 0x100 and cpu.reg_read(UC_ARM_REG_MSP) == top, name
        return cpu.reg_read(UC_ARM_REG_R0)

    def request(status=0, chunk=0, length=0, event_type=2):
        event = s['__HeapBase']
        cpu.mem_write(event, struct.pack('<II', event_type, event+8 if event_type == 2 else 0))
        cpu.mem_write(event+8, struct.pack('<BBH243xB', 12, status, chunk, length))
        replies.clear()
        call('df_proto_handler_info_build_fault', event)
        return replies.copy()

    def check_note(kind, sdk=0, pc=0, scenario=None):
        wire = b'PXBI' + bytes((1,80,{'LCD':1,'OLED':2}[metadata['board']],kind)) + source_id.encode('ascii') + struct.pack('<II', sdk, pc)
        assert len(wire) == 80
        note = call('fault_note_previous')
        assert struct.unpack('<III', cpu.mem_read(note, 12)) == (kind,sdk,pc)
        assert request() == request() == [(b'\x0c\x00\x00\x00', wire)]
        if scenario:
            states.append(dict(scenario=scenario, payloadHex=wire.hex()))

    cpu.mem_write(retained-4, b'BEFR' + b'\xff'*length + b'AFTR')
    call('fault_note_on_boot')
    check_note(0, scenario='none')
    cases = [('sdk','app_error_fault_handler',(0x12345678,0x23457,0xdeadbeef),1,0x12345678,0x23457),
             ('sdk-invalid-pc','app_error_fault_handler',(0xdeadbeef,0xeeee0000,0xffffffff),1,0xdeadbeef,0),
             ('hard','HardFault_Handler',(),2,0,0)]
    if '_exit' in s:
        cases.append(('exit','_exit',(0xffffffff,),3,0,0))
    for scenario, function, args, kind, sdk, pc in cases:
        cpu.mem_write(cache, b'\1\0\0\0')
        call(function,*args,terminal=True,hard=kind==2)
        record = bytes(cpu.mem_read(retained, length))
        assert struct.unpack('<7I', record) == (0x31465850,kind,sdk,pc,~kind&0xffffffff,~sdk&0xffffffff,~pc&0xffffffff)
        call('cache_clean')
        assert cpu.mem_read(retained, length) == record
        call('fault_note_on_boot')
        check_note(kind,sdk,pc,scenario)
        call('fault_note_on_boot')
        check_note(0)
        for i in range(0, length, 4):
            broken = bytearray(record)
            broken[i] ^= 1
            cpu.mem_write(retained,bytes(broken))
            call('fault_note_on_boot')
            check_note(0)
    assert cpu.mem_read(retained-4,4) == b'BEFR' and cpu.mem_read(retained+length,4) == b'AFTR'
    for arg in ({'status':1},{'chunk':256},{'length':1}):
        assert request(**arg) == [(b'\x0c\x01\x00\x00', b'')]
    for event in (0,1,3):
        assert request(event_type=event) == []
    return dict(sourceId=source_id, binSha256=hashlib.sha256(image).hexdigest(), states=states,
                retainedAddress=hex(retained), retainedBytes=length, cacheEnd=hex(s['__stop_noinit']),
                oldFirmwareCounter=old['counter'] if older else None,
                scope='Linked release code on emulated Cortex-M4, terminal AIRCR observed. No board, power loss or radio.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('arm', type=Path)
    parser.add_argument('--older', type=Path)
    parser.add_argument('--json', type=Path)
    args = parser.parse_args()
    result = verify(args.arm, args.older)
    if args.json:
        args.json.write_text(json.dumps(result,indent=2)+'\n')
    print('PASS',result['binSha256'],[s['scenario'] for s in result['states']],result['retainedAddress'])
