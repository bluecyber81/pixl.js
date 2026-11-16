"""Check the LCD profile and contrast commands in the final Cortex-M4 application."""

import argparse
from pathlib import Path
from subprocess import check_output
import struct

from check_stack_watermark_elf import tool
from unicorn import Uc, UC_ARCH_ARM, UC_HOOK_CODE, UC_MODE_MCLASS, UC_MODE_THUMB
from unicorn.arm_const import (UC_CPU_ARM_CORTEX_M4, UC_ARM_REG_LR, UC_ARM_REG_MSP,
                               UC_ARM_REG_PC, UC_ARM_REG_R0, UC_ARM_REG_R1,
                               UC_ARM_REG_R2, UC_ARM_REG_R3)


def verify(elf, binary):
    rows = (line.split() for line in check_output([tool('nm'), '-n', elf], text=True).splitlines())
    symbols = {row[2]: int(row[0], 16) for row in rows if len(row) == 3}
    cpu = Uc(UC_ARCH_ARM, UC_MODE_MCLASS | UC_MODE_THUMB)
    cpu.ctl_set_cpu_model(UC_CPU_ARM_CORTEX_M4)
    cpu.mem_map(0, 0x80000)
    cpu.mem_map(0x20000000, 0x10000)
    cpu.mem_write(symbols['__isr_vector'], binary.read_bytes())
    top = symbols['__StackTop']

    def call(name, *args):
        for reg, value in zip((UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3), args):
            cpu.reg_write(reg, value)
        cpu.reg_write(UC_ARM_REG_MSP, top)
        cpu.reg_write(UC_ARM_REG_LR, 0x101)
        cpu.emu_start(symbols[name] | 1, 0x100, count=50000)
        assert cpu.reg_read(UC_ARM_REG_PC) == 0x100 and cpu.reg_read(UC_ARM_REG_MSP) == top
        return cpu.reg_read(UC_ARM_REG_R0)

    def respond():
        cpu.reg_write(UC_ARM_REG_R0, 1)
        cpu.reg_write(UC_ARM_REG_PC, cpu.reg_read(UC_ARM_REG_LR))

    # Obtain the actual application-owned display instance used by the setter.
    contexts = []
    def remember_context(machine, address, size, data):
        contexts.append(cpu.reg_read(UC_ARM_REG_R0))
        respond()

    addr = symbols['u8x8_SetContrast']
    hook = cpu.hook_add(UC_HOOK_CODE, remember_context, begin=addr, end=addr)
    call('mui_u8g2_set_contrast_level', 80)
    cpu.hook_del(hook)
    context, = contexts

    # Stub only the byte/GPIO boundary. Setup, rotation, drawing and ST7567
    # command encoding run from the application BIN without mapped peripherals.
    commands = []
    def capture_byte(machine, address, size, data):
        if cpu.reg_read(UC_ARM_REG_R1) == 23:  # U8X8_MSG_BYTE_SEND
            commands.extend(cpu.mem_read(cpu.reg_read(UC_ARM_REG_R3), cpu.reg_read(UC_ARM_REG_R2)))
        respond()

    byte_cb = symbols['u8x8_HW_com_spi_nrf52832']
    gpio_cb = symbols['u8g2_nrf_gpio_and_delay_spi_cb']
    cpu.hook_add(UC_HOOK_CODE, capture_byte, begin=byte_cb, end=byte_cb)
    cpu.hook_add(UC_HOOK_CODE, lambda *args: respond(), begin=gpio_cb, end=gpio_cb)
    call('u8g2_Setup_st7567_enh_dg128064_f', context, symbols['u8g2_cb_r0'], byte_cb | 1, gpio_cb | 1)

    info = cpu.mem_read(symbols['u8x8_st7567_enh_dg128064_display_info'], 24)
    assert tuple(info[16:18]) == (16, 8) and struct.unpack_from('<HH', info, 20) == (128, 64)
    height_ptr = symbols['__HeapBase']
    buffer = call('u8g2_m_16_8_f', height_ptr)
    assert cpu.mem_read(height_ptr, 1) == b'\x08'
    for rotate, index, mask in ((0, 0, 1), (1, 1023, 128)):
        call('mui_u8g2_set_flip_display', rotate)
        cpu.mem_write(buffer, bytes(1024))
        call('u8g2_DrawPixel', context, 0, 0)
        expected = bytearray(1024)
        expected[index] = mask
        assert bytes(cpu.mem_read(buffer, 1024)) == expected

    levels = []
    for percent in range(256):
        commands.clear()
        call('mui_u8g2_set_contrast_level', percent)
        effective = min(100, max(60, percent))
        expected = ((effective - 1) * 255 // 99) >> 2
        assert commands == [0x81, expected], (percent, commands, expected)
        levels.append(expected)
    assert len(set(levels)) == 27
    print('PASS linked LCD ST7567 128x64, 1024 framebuffer bytes, opposite corner at 180 degrees; '
          '256 input values produced contrast command 0x81 and 27 levels (37..63).')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('elf', type=Path)
    parser.add_argument('binary', type=Path)
    args = parser.parse_args()
    verify(args.elf, args.binary)
