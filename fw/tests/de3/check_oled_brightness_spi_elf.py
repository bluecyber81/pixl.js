"""Trace linked OLED UI input through U8g2, HAL and Nordic SDK to SPIM DMA.

No production function in the display/brightness/SPI chain is replaced. Model
only GPIO/SPIM hardware registers, SDK critical-region boundaries, delays, RTC
and the scene transition after confirming. The real controller, radio, light
output and interrupt timing are not exercised.
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
                              (0x40000000, 0x100000), (0x50000000, 0x1000), (0xe000e000, 0x2000)):
            cpu.mem_map(address, size)
        cpu.mem_write(self.symbols['__isr_vector'], binary.read_bytes())
        count = self.symbols['__data_end__'] - self.symbols['__data_start__']
        cpu.mem_write(self.symbols['__data_start__'], bytes(cpu.mem_read(self.symbols['__etext'], count)))
        self.top = self.symbols['__StackTop']
        self.gpio = 0
        self.masked = False
        self.transfers = []
        self.pin_events = []
        self.scene_returns = 0
        self.hook('app_util_critical_region_enter', self.enter)
        self.hook('app_util_critical_region_exit', self.leave)
        self.hook('app_timer_cnt_get', lambda: self.respond(0))
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
            assert frequency == 0x20000000, ('OLED must use 2 MHz', hex(frequency))
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

    def expect_contrast(self, percent):
        expected = (max(1, min(100, percent)) - 1) * 255 // 99
        assert [(x['data'], x['hex']) for x in self.transfers] == [(False, '81'), (False, f'{expected:02x}')], (percent, self.transfers)
        assert not self.masked and self.gpio & (1 << 27)
        return expected


def verify(directory):
    elf, binary = directory / 'pixljs.out', directory / 'pixljs.bin'
    with TemporaryDirectory(prefix='oled-spi-elf-') as folder:
        extracted = Path(folder) / 'from-elf.bin'
        run([tool('objcopy'), '-O', 'binary', elf, extracted], check=True)
        assert extracted.read_bytes() == binary.read_bytes(), 'ELF does not describe the supplied application BIN'
    model = Model(elf, binary)
    assert 'u8g2_Setup_sh1106_128x64_noname_f' in model.symbols
    assert 'u8g2_Setup_st7567_enh_dg128064_f' not in model.symbols
    model.call('hal_spi_bus_init')
    flash_device = model.symbols['__HeapBase']
    model.write32(flash_device, 18)
    model.call('hal_spi_bus_attach', flash_device)
    # mui_t.u8g2 is naturally aligned after its three uint8 fields (ARM ABI).
    display = model.call('mui') + 4
    settings = model.call('settings_get_data')
    model.cpu.mem_write(settings + 11, bytes([80]))
    model.call('mui_u8g2_init', display)
    init_bytes = ''.join(x['hex'] for x in model.transfers)
    assert init_bytes.startswith('ae') and init_bytes.endswith('81cbaf'), init_bytes
    assert all(not x['data'] for x in model.transfers)

    levels = []
    for value in range(256):
        model.clear()
        model.call('mui_u8g2_set_contrast_level', value)
        levels.append(model.expect_contrast(value))
    assert len(set(levels)) == 100

    # Synthetic object storage only; the linked view event handler, real scene
    # callback and complete driver/SDK chain execute. Layout is the ARM ABI of
    # mui_progress_bar_s (m-string header is 12 bytes), mui_view_s and settings.
    view, bar, event, app = model.symbols['__HeapBase'], model.symbols['__HeapBase'] + 64, model.symbols['__HeapBase'] + 128, model.symbols['__HeapBase'] + 160
    model.write32(view, bar)
    model.write32(bar + 16, 100)
    model.write32(bar + 20, 0)
    model.write32(bar + 28, model.symbols['settings_scene_oled_contrast_event_cb'] | 1)
    model.write32(bar + 32, app)
    ui_cases = 0
    for start, key, kind in ((start, key, kind) for start in range(0, 101, 5)
                             for key in (0, 2) for kind in (2, 4)):
        model.cpu.mem_write(settings + 11, bytes([80]))
        model.write32(bar + 24, start)
        model.cpu.mem_write(event, bytes([key, kind]))  # SHORT / REPEAT
        model.clear()
        model.call('mui_progress_bar_on_input', view, event)
        expected = (100 if start == 0 else start - 5) if key == 0 else (0 if start == 100 else start + 5)
        assert model.u32(bar + 24) == expected
        model.expect_contrast(expected)
        assert model.cpu.mem_read(settings + 11, 1) == bytes([80]), 'preview persisted without confirmation'
        ui_cases += 1
    for kind in (0, 1, 3):  # PRESS / RELEASE / LONG do not change brightness.
        for key in (0, 1, 2):
            model.write32(bar + 24, 50)
            model.cpu.mem_write(event, bytes([key, kind]))
            model.clear()
            model.call('mui_progress_bar_on_input', view, event)
            assert not model.transfers and model.u32(bar + 24) == 50
    model.write32(bar + 24, 5)
    model.cpu.mem_write(event, bytes([1, 2]))
    model.clear()
    model.call('mui_progress_bar_on_input', view, event)
    model.expect_contrast(5)
    assert model.cpu.mem_read(settings + 11, 1) == bytes([5]) and model.scene_returns == 1
    model.clear()
    model.call('mui_u8g2_deinit', display)
    assert [(x['data'], x['hex']) for x in model.transfers] == [(False, 'ae')]
    model.clear()
    model.call('mui_u8g2_init', display)
    assert ''.join(x['hex'] for x in model.transfers).endswith('810aaf'), 'wake failed to reapply saved 5 percent'
    # Ordinary UI and game redraws must not overwrite the requested contrast.
    model.clear()
    model.call('u8g2_SendBuffer', display)
    draw_commands = [x['hex'] for x in model.transfers if not x['data']]
    assert draw_commands == [value for page in range(8) for value in ('40', '10', '02', f'{0xb0 + page:02x}')]
    assert sum(x['bytes'] for x in model.transfers if x['data']) == 1024
    pixel_buffer = app + 128
    for rotation in (0, 1):
        model.call('mui_u8g2_set_flip_display', rotation)
        for width in (1, 82, 128):
            pixels = bytes((x * 17 + 5) & 255 for x in range(width))
            model.cpu.mem_write(pixel_buffer, pixels)
            model.clear()
            model.call('JOY_OLED_write_page', 3, pixel_buffer, width)
            assert len(model.transfers) == 2 and not model.transfers[0]['data'] and model.transfers[1]['data']
            column = 2 + (128 - width if rotation else 0)
            assert model.transfers[0]['hex'] == bytes([0xb0 | (4 if rotation else 3), 0x10 | column >> 4, column & 15]).hex()
            output = bytes(int(f'{value:08b}'[::-1], 2) for value in reversed(pixels)) if rotation else pixels
            assert model.transfers[1]['hex'] == output.hex()
    # Negative controls: no-op byte callback and wrong D/C would be missed by
    # the older pre-callback test; this physical-boundary model must reject both.
    rejected = []
    hook = model.hook('u8x8_HW_com_spi_nrf52832', lambda: model.respond(1))
    model.clear()
    model.call('mui_u8g2_set_contrast_level', 20)
    try:
        model.expect_contrast(20)
    except AssertionError:
        rejected.append('no-op board byte callback')
    model.cpu.hook_del(hook)
    def wrong_dc():
        if model.cpu.reg_read(UC_ARM_REG_R1) == 32:
            model.cpu.reg_write(UC_ARM_REG_R2, 1)
    hook = model.hook('u8x8_HW_com_spi_nrf52832', wrong_dc)
    model.clear()
    model.call('mui_u8g2_set_contrast_level', 20)
    try:
        model.expect_contrast(20)
    except AssertionError:
        rejected.append('D/C forced to data for contrast')
    model.cpu.hook_del(hook)
    assert len(rejected) == 2
    return {'binarySha256': sha256(binary.read_bytes()).hexdigest(), 'elfSha256': sha256(elf.read_bytes()).hexdigest(),
            'initCommandBytes': init_bytes, 'contrastInputs': 256, 'distinctRegisterLevels': 100,
            'elfMatchesBin': True, 'uiLeftRightCases': ui_cases, 'centerConfirmation': 'passed', 'wakeSavedValue': 'passed',
            'ignoredInputCases': 9, 'redraw': '1024-byte menu buffer and six rotated/partial game pages',
            'negativeControlsRejected': rejected,
            'boundary': 'real linked Nordic SDK SPIM TASKS_START with modeled DMA completion and GPIO',
            'notTested': ['physical OLED light output', 'SPI electrical timing', 'radio interrupts', 'actual flash settings persistence']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--out', type=Path)
    args = parser.parse_args()
    result = verify(args.directory)
    if args.out:
        args.out.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, indent=2))
