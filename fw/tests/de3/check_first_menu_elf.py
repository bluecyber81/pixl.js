"""Check the actual LCD Cortex-M4 first-menu capture with a modeled RTC1.

Run with the production ELF and its flat binary. No input, IRQ timing, BLE
or LCD hardware is exercised. Requires Unicorn 2 and ARM GNU nm on Linux.
"""
import argparse
from pathlib import Path
import struct
from subprocess import check_output

from check_stack_watermark_elf import tool
from unicorn import Uc, UC_ARCH_ARM, UC_MODE_MCLASS, UC_MODE_THUMB
from unicorn.arm_const import (UC_CPU_ARM_CORTEX_M4, UC_ARM_REG_LR, UC_ARM_REG_MSP,
                               UC_ARM_REG_PC, UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2)


def verify(elf, binary):
    records = (line.split() for line in check_output([tool('nm'), '-n', elf], text=True).splitlines())
    symbols = {line[2]: int(line[0], 16) for line in records if len(line) == 3}
    cpu = Uc(UC_ARCH_ARM, UC_MODE_MCLASS | UC_MODE_THUMB)
    cpu.ctl_set_cpu_model(UC_CPU_ARM_CORTEX_M4)
    rtc1 = 0x40011000
    for start, size in ((0, 0x80000), (0x20000000, 0x10000), (0xe000e000, 0x1000), (rtc1, 0x1000)):
        cpu.mem_map(start, size)
    cpu.mem_write(symbols['__isr_vector'], binary.read_bytes())
    # Model the C runtime's .data copy, including the SDK RTC1 driver pointer.
    initial_data = cpu.mem_read(symbols['__etext'], symbols['__data_end__'] - symbols['__data_start__'])
    cpu.mem_write(symbols['__data_start__'], bytes(initial_data))
    out = symbols['__HeapBase']
    sp = symbols['__StackTop']

    def call(name, a=0, b=0, c=0):
        cpu.reg_write(UC_ARM_REG_R0, a)
        cpu.reg_write(UC_ARM_REG_R1, b)
        cpu.reg_write(UC_ARM_REG_R2, c)
        cpu.reg_write(UC_ARM_REG_MSP, sp)
        cpu.reg_write(UC_ARM_REG_LR, 0x101)
        cpu.emu_start(symbols[name] | 1, 0x100, count=100000)
        assert cpu.reg_read(UC_ARM_REG_PC) == 0x100 and cpu.reg_read(UC_ARM_REG_MSP) == sp
        return cpu.reg_read(UC_ARM_REG_R0)

    def snapshot(flags, app=0, counts=(0, 0, 0), milliseconds=0):
        assert call('mui_menu_diag_snapshot', out, 16) == 1
        expected = struct.pack('<4s8BI', b'PXMI', 1, 16, flags, app, *counts, 0, milliseconds)
        actual = bytes(cpu.mem_read(out, 16))
        assert actual == expected, f'PXMI {actual.hex()}, expected {expected.hex()}'

    cpu.mem_write(out, bytes([0xa5]) * 17)
    assert call('mui_menu_diag_snapshot', out, 15) == 0 and cpu.mem_read(out, 17) == bytes([0xa5]) * 17
    snapshot(0)
    call('mui_menu_diag_enter')
    for kind in range(3):
        call('mui_nav_diag_raw', 1, kind)
    snapshot(1, counts=(1, 1, 1))
    cpu.mem_write(rtc1 + 0x504, struct.pack('<I', 0xffff00))
    assert call('mui_menu_diag_select', 2) == 1
    call('mui_menu_diag_leave')
    snapshot(3, 2, (1, 1, 1))
    cpu.mem_write(rtc1 + 0x504, struct.pack('<I', 0x700))
    call('mui_menu_diag_return', 1)
    snapshot(15, 2, (1, 1, 1), 125)
    call('mui_menu_diag_enter')
    call('mui_nav_diag_raw', 1, 0)
    assert not call('mui_menu_diag_select', 6)
    snapshot(15, 2, (1, 1, 1), 125)
    assert cpu.mem_read(out + 16, 1) == b'\xa5'
    print('PASS Cortex-M4 first-menu wire, local counts, app 2, RTC rollover 125 ms, frozen across re-entry')

    # Exercise the wire format that the current file manager actually requests.
    first_menu = bytes(cpu.mem_read(out, 16))
    expected_header = first_menu[:4] + bytes((2, 32)) + first_menu[6:]
    guard = bytes([0xa5]) * 33
    cpu.mem_write(out, guard)
    assert call('mui_menu_diag_snapshot_v2', out, 31) == 0 and cpu.mem_read(out, 33) == guard
    assert call('mui_menu_diag_snapshot_v2', out, 32) == 1
    assert bytes(cpu.mem_read(out, 33)) == expected_header + bytes(16) + guard[-1:]
    call('mui_menu_return_diag_begin', 2, 7)
    call('mui_menu_return_diag_commit', 1, 2, 8)
    call('mui_menu_return_diag_draw', 7, 1, 1)
    call('mui_menu_return_diag_draw', 8, 2, 2)
    call('mui_menu_return_diag_draw', 8, 3, 0)
    call('mui_menu_return_diag_stale', 8)
    assert call('mui_menu_diag_snapshot_v2', out, 32) == 1
    expected_return = struct.pack('<IIH6B', 7, 8, 1, 2, 2, 2, 3, 2, 0)
    assert bytes(cpu.mem_read(out, 33)) == expected_header + expected_return + guard[-1:]
    print('PASS Cortex-M4 PXMI v2: short buffer, empty return, context matching, first and last frame, stale input')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('elf', type=Path)
    parser.add_argument('binary', type=Path)
    args = parser.parse_args()
    verify(args.elf, args.binary)
