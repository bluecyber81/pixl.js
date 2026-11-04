"""Run the release ELF's main-stack instrumentation and PXDG serializer on Cortex-M4.

Usage: python3 check_stack_watermark_elf.py build/lcd-de359/pixljs.out
Requires Unicorn 2 and ARM GNU nm/objcopy. RAM and NVIC are emulated; there
is no physical chip, bootloader, radio, flash activity or interrupt timing.
"""
import argparse
from pathlib import Path
from shutil import which
import struct
from subprocess import check_output, run
from tempfile import TemporaryDirectory

from unicorn import Uc, UC_ARCH_ARM, UC_MODE_THUMB, UC_MODE_MCLASS
from unicorn.arm_const import (UC_CPU_ARM_CORTEX_M4, UC_ARM_REG_MSP, UC_ARM_REG_PSP,
                               UC_ARM_REG_PC, UC_ARM_REG_CONTROL, UC_ARM_REG_IPSR,
                               UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_LR)


def tool(name):
    for prefix in ('arm-none-eabi-', 'arm-linux-gnueabihf-'):
        path = which(prefix + name)
        if path:
            return path
    raise RuntimeError('ARM GNU ' + name + ' required')


def verify(elf):
    symbols = {}
    for line in check_output([tool('nm'), '-n', elf], text=True).splitlines():
        fields = line.split()
        if len(fields) == 3:
            symbols[fields[2]] = int(fields[0], 16)
    low, top = symbols['__StackLimit'], symbols['__StackTop']
    out = symbols['__HeapBase']
    assert top - low == 8192 and symbols['__HeapLimit'] - out >= 64
    cpu = Uc(UC_ARCH_ARM, UC_MODE_THUMB | UC_MODE_MCLASS)
    cpu.ctl_set_cpu_model(UC_CPU_ARM_CORTEX_M4)
    cpu.mem_map(0, 0x80000)
    cpu.mem_map(0x20000000, 0x10000)
    cpu.mem_map(0xe000e000, 0x1000)  # NVIC accessed by SDK critical regions
    with TemporaryDirectory() as temp:
        binary = Path(temp) / 'application.bin'
        run([tool('objcopy'), '-O', 'binary', elf, binary], check=True)
        cpu.mem_write(symbols['__isr_vector'], binary.read_bytes())

    def call(name, sp):
        cpu.reg_write(UC_ARM_REG_MSP, sp)
        cpu.reg_write(UC_ARM_REG_LR, 0x101)
        cpu.emu_start(symbols[name] | 1, 0x100, count=100000)
        assert cpu.reg_read(UC_ARM_REG_PC) == 0x100
        assert cpu.reg_read(UC_ARM_REG_MSP) == sp

    def read(sp=top):
        cpu.reg_write(UC_ARM_REG_R0, out)
        cpu.reg_write(UC_ARM_REG_R1, 64)
        call('runtime_diag_snapshot', sp)
        assert cpu.reg_read(UC_ARM_REG_R0) == 1
        wire = cpu.mem_read(out, 64)
        assert wire[:6] == b'PXDG\x01\x40' and wire[6] & 4
        reserved, free = struct.unpack_from('<II', wire, 48)
        assert reserved == top - low
        assert bool(wire[6] & 8) == (free != 0xffffffff)
        return free

    assert read() == 0xffffffff
    # Refuse an unexpected exception context, thread PSP or out-of-range MSP.
    cpu.reg_write(UC_ARM_REG_IPSR, 16)
    call('runtime_diag_stack_init', top)
    cpu.reg_write(UC_ARM_REG_IPSR, 0)
    assert read() == 0xffffffff
    cpu.reg_write(UC_ARM_REG_PSP, top - 512)
    cpu.reg_write(UC_ARM_REG_CONTROL, 2)
    call('runtime_diag_stack_init', top)
    cpu.reg_write(UC_ARM_REG_CONTROL, 0)
    call('runtime_diag_stack_init', low - 128)
    assert read() == 0xffffffff

    caller_sp = top - 512
    bottom_guard = bytes([0xde]) * 32
    live_caller = bytes([0x51]) * (top - caller_sp)
    cpu.mem_write(low - 32, bottom_guard)
    cpu.mem_write(caller_sp, live_caller)
    call('runtime_diag_stack_init', caller_sp)
    assert cpu.mem_read(low - 32, 32) == bottom_guard
    assert cpu.mem_read(caller_sp, len(live_caller)) == live_caller
    first = read()
    assert 4096 < first <= caller_sp - low
    # Simulate a large reserved caller frame without writing its locals.
    # A current MSP sample must lower the result even across untouched words.
    deep = read(low + 1536)
    assert 256 < deep <= 1536 and read() == deep

    saved_marker = bytes(cpu.mem_read(low + 256, 4))
    cpu.mem_write(low + 256, bytes(b ^ 0xff for b in saved_marker))
    call('runtime_diag_stack_init', top)  # never repaint a running stack
    assert read() == 256
    cpu.mem_write(low + 256, saved_marker)
    assert read() == 256  # a matching word cannot increase a reported value
    cpu.mem_write(low, b'\x00' * 4)
    assert read() == 0  # true zero is distinguishable from unavailable

    print(f'PASS Cortex-M4 release ELF: 8192 reserved, initial test watermark {first}, '
          f'then {deep}/256/256/0. Caller and guards intact; unavailable sentinel verified.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('elf', type=Path)
    verify(parser.parse_args().elf)
