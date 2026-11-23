"""Render the Chameleon error and discard screens from the linked LCD application."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import struct

from unicorn.arm_const import UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3

from lcd_device_model import Model


class ModalModel(Model):
    """The input FIFO nests its diagnostic critical region inside its queue lock."""

    def enter(self):
        if not self.masked:
            return super().enter()
        assert self.gpio & (1 << 27), "Nested critical section during an LCD transaction"
        self.cpu.mem_write(self.cpu.reg_read(UC_ARM_REG_R0), b"\x01")
        self.respond()

    def leave(self):
        if self.cpu.reg_read(UC_ARM_REG_R0):
            assert self.masked
            self.respond()
        else:
            super().leave()


def verify(directory):
    binary = directory / "pixljs.bin"
    model = ModalModel(directory / "pixljs.out", binary)
    model.call("hal_spi_bus_init")
    scratch = model.symbols["__HeapBase"]
    model.write32(scratch, 18)
    model.call("hal_spi_bus_attach", scratch)
    model.write32(scratch, 27)  # idle LCD select before initializing the UI heap
    model.call("hal_spi_bus_attach", scratch)
    ui = model.call("mui")
    framebuffer = ui + 4
    # GPIO/timer setup is outside this check. Real MUI queue, dispatcher,
    # LCD transfers and input generation handling run in the linked image.
    for name in ("mui_input_init", "mui_anim_core_init", "nrf_pwr_mgmt_input_activity", "mui_u8g2_poll_dim"):
        model.hook(name, lambda: model.respond())
    model.call("mui_init", ui)
    app = model.call("mui_mem_malloc", 256)
    assert app
    view, canvas, text_copy = (scratch + n for n in (64, 96, 128))
    model.cpu.mem_write(view, struct.pack("<5I", app, model.symbols["app_chameleon_save_error_draw"] | 1,
                                         model.symbols["app_chameleon_save_error_input"] | 1, 0, 0))
    model.cpu.mem_write(canvas, struct.pack("<IBBBB", framebuffer, 0, 0, 128, 64))
    dispatcher = model.call("mui_view_dispatcher_create")
    assert dispatcher
    model.call("mui_view_dispatcher_add_view", dispatcher, 0, view)
    model.call("mui_view_dispatcher_attach", dispatcher, 0)  # fullscreen
    model.call("mui_view_dispatcher_switch_to_view", dispatcher, 0)
    model.call("mui_tick", ui)
    rows = []

    def record_text():
        pointer = model.cpu.reg_read(UC_ARM_REG_R3)
        data = bytearray()
        while len(data) < 96:
            value = model.cpu.mem_read(pointer + len(data), 1)[0]
            if not value:
                break
            data.append(value)
        assert len(data) < 96, "Unterminated LCD label"
        label = data.decode()
        rows.append((model.cpu.reg_read(UC_ARM_REG_R1), model.cpu.reg_read(UC_ARM_REG_R2), label))

    model.hook("mui_canvas_draw_utf8", record_text)

    def draw(expected_rows):
        rows.clear()
        model.clear()
        model.call("mui_update_now", ui)
        pixels = b"".join(bytes.fromhex(t["hex"]) for t in model.transfers if t["data"])
        assert len(rows) == expected_rows, rows
        assert len({y for _, y, _ in rows}) == expected_rows, rows
        for x, y, label in rows:
            assert 10 <= y <= 62 and label, (y, label)
            model.cpu.mem_write(text_copy, label.encode() + b"\0")
            width = model.call("mui_canvas_get_utf8_width", canvas, text_copy)
            assert x + width <= 128, (label, x, width)
            for letter in set(label):
                assert model.call("u8g2_font_get_glyph_data", framebuffer, ord(letter)), label
        assert len(pixels) == 1024 and any(pixels)
        return {"labels": [label for _, _, label in rows], "frameSha256": sha256(pixels).hexdigest()}

    def queue_short(key):
        for kind in (0, 1, 2):  # debounced press, release and short
            model.call("mui_input_on_bsp_btn_event", key, kind)

    def short(key):
        queue_short(key)
        model.call("mui_tick", ui)

    result = {}
    for language, name in enumerate(("de", "en")):
        model.call("setLanguage", language)
        model.cpu.mem_write(app, bytes(256))
        issue = model.call("chameleon_last_save_issue")
        frames = []
        for stage, code in ((0, 0), (1, -1), (2, -91), (3, -7), (4, -91), (5, 8)):
            model.cpu.mem_write(issue, struct.pack("<B3xi", stage, code))
            frame = draw(5)
            if code:
                assert str(code) in frame["labels"][1], frame
            frames.append(frame)
        assert len({f["labels"][1] for f in frames}) == len(frames)
        # All three gestures begin before the first choice frame. Only the
        # first can open it; the second and third must not select or confirm.
        for key in (2, 2, 1):
            queue_short(key)
        model.call("mui_tick", ui)
        default = draw(4)
        assert ("[Nein]" if name == "de" else "[No]") in default["labels"][2], default
        short(2)
        selected = draw(4)
        assert ("[Ja]" if name == "de" else "[Yes]") in selected["labels"][2], selected
        assert selected["frameSha256"] != default["frameSha256"]
        short(0)
        assert draw(4) == default
        short(1)
        assert draw(5) == frames[-1]
        result[name] = {"errorStages": frames, "default": default, "selected": selected}
    return {"passed": True, "binarySha256": sha256(binary.read_bytes()).hexdigest(), "languages": result,
            "scope": "Linked MUI button events, FIFO, modal choices, fonts and ST7567 frame data in emulation. Injected diagnostic records."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    result = verify(args.directory)
    output = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.out:
        args.out.write_text(output, encoding="utf-8")
    print(output, end="")
