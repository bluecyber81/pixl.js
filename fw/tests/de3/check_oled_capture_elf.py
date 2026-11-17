"""Exercise the OLED file/remote photo handlers from a linked OLED ELF and BIN."""

import argparse
import hashlib
from pathlib import Path
import struct
from subprocess import check_output

from check_stack_watermark_elf import tool
from unicorn import Uc, UcError, UC_ARCH_ARM, UC_HOOK_CODE, UC_MODE_MCLASS, UC_MODE_THUMB
from unicorn.arm_const import (UC_CPU_ARM_CORTEX_M4, UC_ARM_REG_LR, UC_ARM_REG_MSP,
                               UC_ARM_REG_PC, UC_ARM_REG_R0, UC_ARM_REG_R1,
                               UC_ARM_REG_R2, UC_ARM_REG_R3)


def verify(elf, binary):
    rows = (line.split() for line in check_output([tool('nm'), '-n', elf], text=True).splitlines())
    sym = {row[2]: int(row[0], 16) for row in rows if len(row) == 3}
    cpu = Uc(UC_ARCH_ARM, UC_MODE_MCLASS | UC_MODE_THUMB)
    cpu.ctl_set_cpu_model(UC_CPU_ARM_CORTEX_M4)
    cpu.mem_map(0, 0x80000)
    cpu.mem_write(sym['__isr_vector'], binary.read_bytes())
    cpu.mem_map(0x20000000, 0x10000)
    # Startup copies initialized objects from flash before entering the application.
    size = sym['__data_end__'] - sym['__data_start__']
    cpu.mem_write(sym['__data_start__'], bytes(cpu.mem_read(sym['__etext'], size)))
    regs = (UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3)
    top = sym['__StackTop']
    work = sym['__HeapBase']
    assert sym['__HeapLimit'] - work >= 256

    def call(name, *args):
        for reg, value in zip(regs, args):
            cpu.reg_write(reg, value)
        cpu.reg_write(UC_ARM_REG_MSP, top)
        cpu.reg_write(UC_ARM_REG_LR, 0x101)
        try:
            cpu.emu_start(sym[name] | 1, 0x100, count=600000)
        except UcError as exc:
            raise RuntimeError(f'{name}, PC={cpu.reg_read(UC_ARM_REG_PC):#x}') from exc
        assert cpu.reg_read(UC_ARM_REG_PC) == 0x100 and cpu.reg_read(UC_ARM_REG_MSP) == top, name
        return cpu.reg_read(UC_ARM_REG_R0)

    def intercept(name, callback):
        def hook(machine, address, size, userdata):
            result = callback(machine.reg_read(regs[0]), machine.reg_read(regs[1]))
            machine.reg_write(regs[0], 0 if result is None else result)
            machine.reg_write(UC_ARM_REG_PC, machine.reg_read(UC_ARM_REG_LR))
        addr = sym[name]
        return cpu.hook_add(UC_HOOK_CODE, hook, begin=addr, end=addr)

    # Ask the real UI setter for the owning u8g2 context without needing panel GPIO.
    contexts = []
    hook = intercept('u8x8_SetContrast', lambda ctx, _: contexts.append(ctx))
    call('mui_u8g2_set_contrast_level', 50)
    cpu.hook_del(hook)
    context, = contexts
    ui = call('mui')
    call('u8g2_Setup_sh1106_128x64_noname_f', context, sym['u8g2_cb_r0'],
         sym['u8x8_HW_com_spi_nrf52832'] | 1, sym['u8g2_nrf_gpio_and_delay_spi_cb'] | 1)
    framebuffer = call('u8g2_m_16_8_f', work)
    assert cpu.mem_read(work, 1) == b'\x08'
    cpu.mem_write(ui, b'\x01')  # mui_t.initialized
    call('mui_set_auto_update', ui, 1)
    original = bytes((i * 37 + i // 128) & 255 for i in range(1024))
    cpu.mem_write(framebuffer, original)

    idle = True
    replies = []
    def file_reply(ptr, _):
        data = cpu.mem_read(ptr, 248)
        replies.append((bytes(data[:4]), bytes(data[4:4 + data[247]])))
    intercept('df_proto_vfs_is_idle', lambda *_: int(idle))
    intercept('df_core_send_frame', file_reply)
    def file_request(page):
        cpu.mem_write(work, struct.pack('<II', 2, work + 8))
        data = b'LCD1' + bytes([page])
        cpu.mem_write(work + 8, struct.pack('<BBH243sB', 10, 0, 0, data, len(data)))
        replies.clear()
        call('df_proto_handler_info_display_page', work)
        reply, = replies
        return reply
    for page in range(8):
        expected = b'PXLC' + bytes((1, page, 128, 64)) + hashlib.sha256(original).digest()
        assert file_request(page) == (bytes([10, 0, 0, 0]), expected + original[page*128:(page+1)*128])
    idle = False
    assert file_request(0) == (bytes([10, 1, 0, 0]), b'')
    idle = True
    call('mui_set_auto_update', ui, 0)
    assert file_request(0) == (bytes([10, 1, 0, 0]), b'')
    print('PASS linked PXLC: eight 128-byte pages, full-frame SHA-256, VFS busy and direct-game rejection.')

    # Run actual protocol, bridge, TLSF allocator and snapshot lifecycle. Stub
    # the transport/clock and critical sections normally supplied by the radio.
    for name, value in (('ble_remote_transport_ready', 1), ('ble_remote_mode_active', 1),
                        ('ble_session_generation', 1), ('ble_mode_transition_pending', 0),
                        ('other_owner', 0), ('ble_nus_max_data_length', 247),
                        ('app_timer_cnt_get', 100), ('app_util_critical_region_enter', 0),
                        ('app_util_critical_region_exit', 0)):
        intercept(name, lambda *_, v=value: v)
    wire = []
    intercept('ble_nus_tx_data', lambda ptr, size: wire.append(bytes(cpu.mem_read(ptr, size))))
    call('mui_mem_init')
    assert call('ble_remote_set_enabled', 1)
    def request(op, seq, index):
        generation = bytes(cpu.mem_read(sym['local_generation'], 4))
        cpu.mem_write(work, generation + struct.pack('<4BH2B', 80, 88, 1, op, seq, index, 0))
        wire.clear()
        call('ble_remote_receive', work, 12)
        call('ble_remote_poll')
        frame, = wire
        assert frame[:6] == struct.pack('<4BH', 80, 88, 1, 128 | op, seq) and frame[8:10] == bytes([63, 0])
        return frame
    assert request(0, 1, 0)[6] == 0
    assert request(5, 2, 0)[6] == 1  # menu framebuffer invalid during a game
    call('mui_set_auto_update', ui, 1)
    pixels = bytearray()
    for i in range(32):
        frame = request(5, i+3, i*4)
        assert frame[6:] == bytes([0, 1, 63, 0, i*4, 32]) + original[32*i:32*i+32]
        pixels.extend(frame[12:])
        if i == 0:
            assert cpu.mem_read(sym['lcd_frame'], 4) != bytes(4)
            cpu.mem_write(framebuffer, bytes(1024))
    assert pixels == original and cpu.mem_read(sym['lcd_frame'], 4) == bytes(4)
    assert request(5, 34, 124) == frame  # last chunk replays after freeing the frame
    print('PASS linked remote: capability 63, direct-game BUSY, 1024 frozen bytes in 32 chunks, '
          'repaint during transfer, heap release and byte-identical last-chunk replay. No real BLE link.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('elf', type=Path)
    parser.add_argument('binary', type=Path)
    args = parser.parse_args()
    verify(args.elf, args.binary)
