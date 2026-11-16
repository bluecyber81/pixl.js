"""Exercise the linked LCD flash-identification reply on Cortex-M4 with a seeded cache."""

import argparse
from pathlib import Path
import struct
from subprocess import check_output

from check_stack_watermark_elf import tool
from unicorn import (Uc, UC_ARCH_ARM, UC_HOOK_CODE, UC_MODE_MCLASS, UC_MODE_THUMB,
                     UC_PROT_EXEC, UC_PROT_READ, UC_PROT_WRITE)
from unicorn.arm_const import (UC_CPU_ARM_CORTEX_M4, UC_ARM_REG_LR, UC_ARM_REG_MSP,
                               UC_ARM_REG_PC, UC_ARM_REG_R0)


def verify(elf, binary):
    records = (line.split() for line in check_output([tool('nm'), '-n', elf], text=True).splitlines())
    symbols = {row[2]: int(row[0], 16) for row in records if len(row) == 3}
    cpu = Uc(UC_ARCH_ARM, UC_MODE_MCLASS | UC_MODE_THUMB)
    cpu.ctl_set_cpu_model(UC_CPU_ARM_CORTEX_M4)
    # Only ordinary flash and RAM exist. Any SPI/GPIO register access faults.
    cpu.mem_map(0, 0x80000)
    cpu.mem_write(symbols['__isr_vector'], binary.read_bytes())
    cpu.mem_protect(0, 0x80000, UC_PROT_READ | UC_PROT_EXEC)
    cpu.mem_map(0x20000000, 0x10000, UC_PROT_READ | UC_PROT_WRITE)
    event = symbols['__HeapBase']
    frame = event + 8
    top = symbols['__StackTop']
    cache = symbols['m_cached_jedec']
    replies = []

    def capture_reply(machine, address, size, user_data):
        data = machine.mem_read(machine.reg_read(UC_ARM_REG_R0), 248)
        replies.append((bytes(data[:4]), bytes(data[4:4 + data[247]])))
        machine.reg_write(UC_ARM_REG_PC, machine.reg_read(UC_ARM_REG_LR))

    send = symbols['df_core_send_frame']
    cpu.hook_add(UC_HOOK_CODE, capture_reply, begin=send, end=send)

    def request(sample, *, status=0, chunk=0, length=0, event_type=2):
        cached = sample.to_bytes(4, 'little')
        cpu.mem_write(cache, cached)
        cpu.mem_write(event, struct.pack('<II', event_type, frame if event_type == 2 else 0))
        cpu.mem_write(frame, struct.pack('<BBH243xB', 11, status, chunk, length))
        replies.clear()
        cpu.reg_write(UC_ARM_REG_R0, event)
        cpu.reg_write(UC_ARM_REG_MSP, top)
        cpu.reg_write(UC_ARM_REG_LR, 0x101)
        cpu.emu_start(symbols['df_proto_handler_info_flash_jedec'] | 1, 0x100, count=5000)
        assert cpu.reg_read(UC_ARM_REG_PC) == 0x100 and cpu.reg_read(UC_ARM_REG_MSP) == top
        assert bytes(cpu.mem_read(cache, 4)) == cached
        return list(replies)

    for sample in (0, 0x03856015, 0x01854215):
        flags, maker, family, capacity = sample.to_bytes(4, 'big')
        expected = b'PXJF' + bytes((1, 12, flags, 0, maker, family, capacity, 0))
        assert request(sample) == [(b'\x0b\x00\x00\x00', expected)]
    for malformed in ({'status': 1}, {'chunk': 256}, {'length': 1}):
        assert request(0x03856015, **malformed) == [(b'\x0b\x01\x00\x00', b'')]
    for event_type in (0, 1, 3):
        assert request(0x03856015, event_type=event_type) == []
    print('PASS linked Cortex-M4 PXJF: 3 cached states, 3 malformed requests, 3 ignored events, no MMIO')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('elf', type=Path)
    parser.add_argument('binary', type=Path)
    args = parser.parse_args()
    verify(args.elf, args.binary)
