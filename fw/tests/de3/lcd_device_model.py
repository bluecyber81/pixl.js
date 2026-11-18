"""Execute actual LCD firmware with modeled nRF52832 SPI/PWM peripherals.

Application, ST7567, HAL and Nordic SDK run unchanged. Only hardware registers,
critical-region boundaries, wait delays and RTC are modeled. Physical light,
electrical timing, radio and real flash persistence are not measured.
"""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import struct
from subprocess import check_output, run
from tempfile import TemporaryDirectory

from check_stack_watermark_elf import tool
from unicorn import Uc, UC_ARCH_ARM, UC_HOOK_CODE, UC_HOOK_MEM_WRITE, UC_MODE_MCLASS, UC_MODE_THUMB
from unicorn.arm_const import (UC_CPU_ARM_CORTEX_M4, UC_ARM_REG_LR, UC_ARM_REG_MSP,
                               UC_ARM_REG_PC, UC_ARM_REG_R0, UC_ARM_REG_R1,
                               UC_ARM_REG_R2, UC_ARM_REG_R3)


class Model:
    def __init__(self, elf, binary):
        rows = (line.split() for line in check_output([tool('nm'), '-n', elf], text=True).splitlines())
        self.symbols = {row[2]: int(row[0], 16) for row in rows if len(row) == 3}
        self.cpu = cpu = Uc(UC_ARCH_ARM, UC_MODE_MCLASS | UC_MODE_THUMB)
        cpu.ctl_set_cpu_model(UC_CPU_ARM_CORTEX_M4)
        for address, size in ((0, 0x80000), (0x20000000, 0x10000),
                              (0x10000000, 0x1000), (0xf0000000, 0x1000), (0x40000000, 0x100000), (0x50000000, 0x1000), (0xe000e000, 0x2000)):
            cpu.mem_map(address, size)
        cpu.mem_write(self.symbols['__isr_vector'], binary.read_bytes())
        count = self.symbols['__data_end__'] - self.symbols['__data_start__']
        cpu.mem_write(self.symbols['__data_start__'], bytes(cpu.mem_read(self.symbols['__etext'], count)))
        self.top = self.symbols['__StackTop']
        self.write32(0xf0000fe8, 0x30)
        self.gpio = 0
        self.masked = False
        self.transfers = []
        self.pin_events = []
        self.pwm_events = []
        self.scene_returns = 0
        self.rtc = 0
        self.hook('app_util_critical_region_enter', self.enter)
        self.hook('app_util_critical_region_exit', self.leave)
        self.hook('app_timer_cnt_get', lambda: self.respond(self.rtc))
        self.hook('mui_scene_dispatcher_previous_scene', self.previous)
        for name in ('app_error_handler_bare', 'app_error_fault_handler'):
            self.hook(name, lambda: (_ for _ in ()).throw(AssertionError('firmware fatal error')))
        # Only the waiting delay messages are intercepted. D/C/reset messages
        # execute the actual GPIO callback and writes, including U8g2 init.
        self.hook('u8g2_nrf_gpio_and_delay_spi_cb', self.delay)
        cpu.hook_add(UC_HOOK_MEM_WRITE, self.memory_write)

    def hook(self, name, fn):
        addr = self.symbols[name]
        def handler(*args):
            fn()
        return self.cpu.hook_add(UC_HOOK_CODE, handler, begin=addr, end=addr)

    def u32(self, address):
        return struct.unpack('<I', self.cpu.mem_read(address, 4))[0]

    def write32(self, address, value):
        self.cpu.mem_write(address, struct.pack('<I', value))

    def respond(self, value=0):
        self.cpu.reg_write(UC_ARM_REG_R0, value)
        self.cpu.reg_write(UC_ARM_REG_PC, self.cpu.reg_read(UC_ARM_REG_LR))

    def enter(self):
        assert not self.masked, 'unexpected nested SPI transaction'
        self.masked = True
        self.cpu.mem_write(self.cpu.reg_read(UC_ARM_REG_R0), b'\0')
        self.respond()

    def leave(self):
        assert self.masked and self.gpio & (1 << 27), 'CS must be released before IRQs'
        self.masked = False
        self.respond()

    def previous(self):
        self.scene_returns += 1
        self.respond()

    def delay(self):
        msg = self.cpu.reg_read(UC_ARM_REG_R1)
        if msg in (41, 42, 43, 44, 45):
            self.respond(1)

    def memory_write(self, cpu, access, address, size, value, data):
        if any(start <= address < start + 0x1000 for start in (0x40006000,0x40009000,0x4001f000)):
            self.pwm_events.append((address,value))
        if address in (0x50000508, 0x5000050c):
            assert size == 4
            self.gpio = self.gpio | value if address == 0x50000508 else self.gpio & ~value
            self.pin_events.append((address, value, self.gpio))
        if address == 0x40003010 and value == 1:  # SPIM0 TASKS_START
            assert self.masked, 'DMA started without application IRQ guard'
            assert not (self.gpio & (1 << 27)), 'display CS is not active'
            assert self.gpio & (1 << 18), 'flash must remain deselected'
            # Constants from the nRF52832 hardware register layout.
            tx, tx_len = self.u32(0x40003544), self.u32(0x40003548)
            rx, rx_len = self.u32(0x40003534), self.u32(0x40003538)
            assert 0 < tx_len <= 128 and rx_len == 0
            frequency = self.u32(0x40003524)
            assert frequency == 0x80000000, ('LCD must use 8 MHz', hex(frequency))
            assert self.u32(0x40003508) == 26 and self.u32(0x4000350c) == 25
            assert self.u32(0x40003554) == 0, 'SPI mode 0 and MSB-first required'
            payload = bytes(cpu.mem_read(tx, tx_len))
            self.transfers.append({'data': bool(self.gpio & (1 << 28)), 'hex': payload.hex(),
                                   'bytes': tx_len, 'frequency': frequency})
            self.write32(0x4000354c, tx_len)  # TXD.AMOUNT
            self.write32(0x4000353c, rx_len)  # RXD.AMOUNT
            self.write32(0x40003118, 1)      # EVENTS_END

    def call(self, name, *args):
        for reg, value in zip((UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3), args):
            self.cpu.reg_write(reg, value)
        self.cpu.reg_write(UC_ARM_REG_MSP, self.top)
        self.cpu.reg_write(UC_ARM_REG_LR, 0x101)
        try:
            self.cpu.emu_start(self.symbols[name] | 1, 0x100, count=1500000)
        except Exception as error:
            raise AssertionError(f'{name} at PC {self.cpu.reg_read(UC_ARM_REG_PC):08x}: {error}') from error
        assert self.cpu.reg_read(UC_ARM_REG_PC) == 0x100, (name, hex(self.cpu.reg_read(UC_ARM_REG_PC)))
        assert self.cpu.reg_read(UC_ARM_REG_MSP) == self.top
        return self.cpu.reg_read(UC_ARM_REG_R0)

    def clear(self):
        self.transfers.clear()
        self.pin_events.clear()
        self.pwm_events.clear()

    def expect_contrast(self, percent):
        expected = ((max(60, min(100, percent)) - 1) * 255 // 99) >> 2
        assert [(x['data'], x['hex']) for x in self.transfers] == [(False, '81'), (False, f'{expected:02x}')], (percent, self.transfers)
        assert not self.masked and self.gpio & (1 << 27)
        return expected


