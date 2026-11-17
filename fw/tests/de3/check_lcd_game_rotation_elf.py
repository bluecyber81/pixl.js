"""Check linked LCD menu/game coordinates and physical-key mapping, including wake.

Runs the real Cortex-M4 BIN with panel/SPI, PWM, radio activity and event delivery
boundaries modelled. With --expect-app655-bug it must reproduce the old bug.
"""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import struct
from subprocess import check_output

from unicorn import Uc, UC_ARCH_ARM, UC_MODE_MCLASS, UC_MODE_THUMB, UC_HOOK_CODE, UC_HOOK_MEM_WRITE
from unicorn.arm_const import (UC_CPU_ARM_CORTEX_M4, UC_ARM_REG_LR, UC_ARM_REG_MSP,
                               UC_ARM_REG_PC, UC_ARM_REG_R0, UC_ARM_REG_R1,
                               UC_ARM_REG_R2, UC_ARM_REG_R3)
from check_stack_watermark_elf import tool
from test_lcd_game_pixels import CASES, PORT, capture


def verify(build, expect_app655_bug):
    binary = (build / 'pixljs.bin').read_bytes()
    symbols = {r[2]: int(r[0], 16) for line in check_output(
        [tool('nm'), '-n', build / 'pixljs.out'], text=True).splitlines()
               if len(r := line.split()) == 3}
    cpu = Uc(UC_ARCH_ARM, UC_MODE_MCLASS | UC_MODE_THUMB)
    cpu.ctl_set_cpu_model(UC_CPU_ARM_CORTEX_M4)
    for base, size in [(0, 0x80000), (0x20000000, 0x10000), (0x50000000, 0x1000)]:
        cpu.mem_map(base, size)
    cpu.mem_write(symbols['__isr_vector'], binary)
    length = symbols['__data_end__'] - symbols['__data_start__']
    cpu.mem_write(symbols['__data_start__'], bytes(cpu.mem_read(symbols['__etext'], length)))
    top = symbols['__StackTop']
    scratch = symbols['__HeapBase']
    regs = (UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3)

    def respond(value=0):
        cpu.reg_write(UC_ARM_REG_R0, value)
        cpu.reg_write(UC_ARM_REG_PC, cpu.reg_read(UC_ARM_REG_LR))

    def hook(fn, callback):
        a = symbols[fn]
        return cpu.hook_add(UC_HOOK_CODE, callback, begin=a, end=a)

    def call(fn, *args):
        for reg, value in zip(regs, args):
            cpu.reg_write(reg, value)
        cpu.reg_write(UC_ARM_REG_MSP, top)
        cpu.reg_write(UC_ARM_REG_LR, 0x101)
        pc = symbols[fn] if isinstance(fn, str) else fn
        cpu.emu_start(pc | 1, 0x100, count=150000)
        assert cpu.reg_read(UC_ARM_REG_PC) == 0x100 and cpu.reg_read(UC_ARM_REG_MSP) == top, fn
        return cpu.reg_read(UC_ARM_REG_R0)

    # Obtain the application-owned U8g2 object rather than a private test copy.
    contexts = []
    def context_capture(*_):
        contexts.append(cpu.reg_read(regs[0]))
        respond()
    probe = hook('u8x8_SetContrast', context_capture)
    call('mui_u8g2_set_contrast_level', 80)
    cpu.hook_del(probe)
    context, = contexts
    settings = call('settings_get_data')
    fb = call('u8g2_m_16_8_f', scratch)
    tx = []
    selected = None
    dc = None
    def acquire(*_):
        nonlocal selected
        assert selected is None
        selected = cpu.reg_read(regs[0])
        assert struct.unpack('<I', cpu.mem_read(selected, 4))[0] == 27
        tx.append([])
        respond()
    def xfer(*_):
        assert selected is not None and dc is not None
        rx, rx_len, buf, count = struct.unpack('<IIII', cpu.mem_read(cpu.reg_read(regs[0]), 16))
        assert rx == rx_len == 0 and 0 < count <= 128
        tx[-1].append((dc, bytes(cpu.mem_read(buf, count))))
        respond()
    def release(*_):
        nonlocal selected
        assert selected == cpu.reg_read(regs[0])
        selected = None
        respond()
    def gpio_write(machine, access, addr, size, value, opaque):
        nonlocal dc
        if value == 1 << 28:
            dc = addr == 0x50000508
    def gpio_callback(*_):
        # GPIO_DC through u8x8_gpio_SetDC uses the real MMIO-writing path.
        # Only panel delays/reset timing are outside the register model.
        if cpu.reg_read(regs[1]) != 74:  # U8X8_MSG_GPIO_DC = 64 + 10
            respond(1)
    for name in ('hal_spi_bus_attach', 'app_pwm_init', 'mui_u8g2_set_backlight_level',
                 'nrf_log_frontend_std_1', 'ble_remote_local_activity'):
        hook(name, lambda *_: respond())
    hook('hal_spi_bus_aquire', acquire)
    hook('hal_spi_bus_xfer', xfer)
    hook('hal_spi_bus_release', release)
    hook('u8g2_nrf_gpio_and_delay_spi_cb', gpio_callback)
    cpu.hook_add(UC_HOOK_MEM_WRITE, gpio_write, begin=0x50000508, end=0x5000050c)

    def cmd_bytes():
        return b''.join(data for transaction in tx for is_data, data in transaction if not is_data)

    def render_pages(which):
        """Interpret the actual page/column commands from the linked ST7567 drivers."""
        page = col = 0
        for transaction in tx:
            for is_data, data in transaction:
                if is_data:
                    assert page < 8 and col + len(data) <= 128
                    which[128*page+col:128*page+col+len(data)] = data
                    col += len(data)
                else:
                    for cmd in data:
                        if 0xb0 <= cmd <= 0xb7: page = cmd & 7
                        elif 0x10 <= cmd <= 0x1f: col = (col & 15) | (cmd & 15) << 4
                        elif cmd < 0x10: col = (col & 0xf0) | cmd
                        else: raise AssertionError(f'unexpected panel command in draw {cmd:02x}')

    posted = []
    def input_queue(*_):
        _, arg, token = struct.unpack('<III', cpu.mem_read(cpu.reg_read(regs[1]), 12))
        assert token
        posted.append(bytes((arg & 255, arg >> 8)))
        respond()
    hook('mui_post', input_queue)
    def press(physical, kind, expected):
        call('mui_input_on_bsp_btn_event', physical, kind)
        event, = posted
        posted.clear()
        assert tuple(event) == (expected, kind)
        cpu.mem_write(scratch, event)
        call('game_view_on_input', 0, scratch)

    def controls(swap):
        cpu.mem_write(settings + 25, bytes([swap]))  # persisted struct ABI
        call('game_view_on_enter', 0)
        for physical in (0, 2, 1):
            mapped = 2 - physical if swap else physical
            press(physical, 0, mapped)
            assert [call('game_view_key_pressed', i) for i in range(3)] == [i == mapped for i in range(3)]
            if physical == 1:
                for repeat in range(11):
                    press(physical, 4, mapped)
                    assert bool(call('JOY_exit')) == (repeat == 10)
            press(physical, 1, mapped)
            assert all(call('game_view_key_pressed', i) == 0 for i in range(3))
            assert call('JOY_exit') == 0
        press(0, 0, 2 if swap else 0)
        call('game_view_on_exit', 0)
        assert not any(call('game_view_key_pressed', i) for i in range(3))

    traces = {name: capture(PORT, name, False, raw=True) for name in CASES}
    results = []
    # Second pass re-enters the hardware profile from the saved flip after sleep.
    for wake, rotation in ((False, 0), (False, 1), (True, 1), (True, 0)):
        if wake or not results:
            cpu.mem_write(settings + 24, bytes([rotation]))
            tx.clear()
            call('mui_u8g2_init', context)
            init = cmd_bytes()
            assert bytes.fromhex('e2 a2 a0 c8 23 81 32 2f b0 af a6') in init, init.hex()
            assert 0xa1 not in init and 0xc0 not in init
        tx.clear()
        if not wake:
            call('mui_u8g2_set_flip_display', rotation)
            assert tx == [], 'menu changes panel registers on runtime flip'
        # Reference the menu's own visible corner orientation on the panel's wire.
        cpu.mem_write(fb, bytes(1024))
        for x, y in [(0, 0), (17, 22), (127, 63)]:
            call('u8g2_DrawPixel', context, x, y)
        call('u8g2_SendBuffer', context)
        menu = bytearray(1024)
        render_pages(menu)
        projected = bytearray(1024)
        for x, y in [(0, 0), (17, 22), (127, 63)]:
            if rotation: x, y = 127-x, 63-y
            projected[(y//8)*128+x] |= 1 << (y%8)
        assert menu == projected
        for swap in (0, 1):
            controls(swap)
        for name, trace in traces.items():
            cursor = frames = changed = 0
            actual = bytearray([0xa5] * 1024)
            expected = actual.copy()
            tx.clear()
            call('JOY_init')
            assert len(tx) == 8 and all(len(group) == 2 for group in tx)
            render_pages(actual)
            assert actual == bytes(1024)
            expected[:] = actual
            while cursor < len(trace):
                tx.clear()
                for row in range(8):
                    page, count = trace[cursor:cursor+2]
                    assert row == page
                    pixels = trace[cursor+2:cursor+2+count]
                    cursor += 2 + count
                    # Independent per-pixel mapping of the logical 0..count-1
                    # window. Bytes outside Tris's 82-column redraw are preserved.
                    for x, value in enumerate(pixels):
                        for b in range(8):
                            y = row*8 + b
                            px, py = (127-x, 63-y) if rotation else (x, y)
                            index, mask = (py//8)*128+px, 1 << (py%8)
                            expected[index] = (expected[index] & ~mask) | (mask if (value >> b)&1 else 0)
                    cpu.mem_write(scratch, pixels)
                    call('JOY_OLED_write_page', page, scratch, count)
                assert len(tx) == 8 and all(len(group) == 2 for group in tx)
                render_pages(actual)
                changed += actual != expected
                frames += 1
            broken = expect_app655_bug and rotation == 1
            assert (changed > 0) if broken else (changed == 0), (name, wake, rotation, changed)
            results.append(dict(game=name, wake=wake, rotation=rotation*180, frames=frames,
                                differingFrames=changed, panelSha256=sha256(actual).hexdigest()))
        if wake or rotation == 1:
            tx.clear()
            call('mui_u8g2_deinit', context)
            assert 0xae in cmd_bytes()
    help_widths = {}
    if not expect_app655_bug:
        # The scene dispatcher, selection callback, help/back navigation,
        # translations and linked font run intact. List storage is modelled.
        # Model objects below application RAM, in the unused SoftDevice
        # reservation in this emulation, so no application storage overlaps.
        app, list_addr, dispatcher, fake_item = [0x20000800+n for n in (0, 64, 576, 896)]
        assert fake_item + 8 < symbols['__data_start__']
        items, callbacks = [], []
        cpu.mem_write(app, struct.pack('<IIII', 0, list_addr, 0, dispatcher))
        call('mui_list_view_set_user_data', list_addr, app)
        def clear(*_):
            items.clear()
            respond()
        def bind(*_):
            callbacks.append(cpu.reg_read(regs[1]))
            respond()
        def add(extended):
            def record(*_):
                items.append((cpu.reg_read(regs[1]), cpu.reg_read(regs[2]),
                              cpu.reg_read(regs[3]) if extended else 0))
                respond()
            return record
        hook('mui_list_view_clear_items', clear)
        hook('mui_list_view_set_selected_cb', bind)
        hook('mui_list_view_add_item', add(False))
        hook('mui_list_view_add_item_ext', add(True))
        hook('mui_view_dispatcher_switch_to_view', lambda *_: respond())
        call('mui_scene_dispatcher_set_scene_defines', dispatcher, symbols['game_scene_defines'], 3)
        call('mui_scene_dispatcher_set_user_data', dispatcher, app)
        call('u8g2_SetFont', context, symbols['u8g2_font_wqy12_t_gb2312a'])
        def string(address):
            return bytes(cpu.mem_read(address, 64)).split(b'\0', 1)[0].decode()
        for lang, title, back, actions in [(0, 'Spielsteuerung', 'Zurück', ('Schub', 'Feuern', 'Ball starten', 'Drehen')),
                                          (1, 'Game controls', 'Back', ('Thrust', 'Fire', 'Launch ball', 'Rotate'))]:
            call('setLanguage', lang)
            call('mui_scene_dispatcher_next_scene', dispatcher, 0)
            icon, address, _ = items[-1]
            assert len(items) == 6 and string(address) == title
            cpu.mem_write(fake_item, struct.pack('<H', icon))
            call(callbacks[-1], 0, list_addr, fake_item)
            assert call('mui_scene_dispatcher_current_scene', dispatcher) == 2 and len(items) == 8
            assert string(items[0][1]) == back
            assert [string(v) for _, _, v in items[-4:]] == list(actions)
            widths = []
            for _, name, value in items:
                title_width = call('u8g2_GetUTF8Width', context, name)
                value_width = call('u8g2_GetUTF8Width', context, value) if value else 0
                used = 13 + title_width + (value_width + 7 if value_width else 0)
                assert 13 < used <= 128, (string(name), value_width, used)
                widths.append(used)
            help_widths[title] = widths
            call(callbacks[-1], 0, list_addr, fake_item)
            assert call('mui_scene_dispatcher_current_scene', dispatcher) == 0
            assert len(items) == 6 and string(items[-1][1]) == title
    return dict(binSha256=sha256(binary).hexdigest(), hardware=False,
                panelInitHex=init.hex(), registersChangedByRuntimeRotation=False,
                controls='both physical side keys and center / repeat / release; swap on and off; game enter and exit',
                helpUsedPixels=help_widths, cases=results)


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('build', type=Path)
    p.add_argument('--expect-app655-bug', action='store_true')
    p.add_argument('--out', type=Path)
    a = p.parse_args()
    result = verify(a.build, a.expect_app655_bug)
    report = json.dumps(result, indent=2) + '\n'
    if a.out:
        a.out.write_text(report, encoding='utf-8')
    print(report)
