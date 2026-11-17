"""Exercise the OLED information-command table and real ARM reply serializers.

The incoming DF event and RTC are modeled. Only the final BLE transmitter is
intercepted. Cached power samples and menu events below are test inputs.
"""
import argparse
from hashlib import sha256
from pathlib import Path
import struct
from subprocess import check_output

from unicorn import UC_ARCH_ARM, UC_HOOK_CODE, UC_MODE_MCLASS, UC_MODE_THUMB, Uc
from unicorn.arm_const import (UC_CPU_ARM_CORTEX_M4, UC_ARM_REG_LR, UC_ARM_REG_MSP,
                               UC_ARM_REG_PC, UC_ARM_REG_R0, UC_ARM_REG_R1,
                               UC_ARM_REG_R2, UC_ARM_REG_R3)
from check_stack_watermark_elf import tool


def verify(elf, binary):
    records = check_output([tool("nm"), "-n", elf], text=True).splitlines()
    syms = {parts[2]: int(parts[0], 16) for row in records if len(parts := row.split()) == 3}
    cpu = Uc(UC_ARCH_ARM, UC_MODE_THUMB | UC_MODE_MCLASS)
    cpu.ctl_set_cpu_model(UC_CPU_ARM_CORTEX_M4)
    rtc = 0x40011000
    for addr, size in ((0, 0x80000), (0x20000000, 0x10000), (rtc, 0x1000), (0xe000e000, 0x1000)):
        cpu.mem_map(addr, size)
    image = binary.read_bytes()
    cpu.mem_write(syms["__isr_vector"], image)
    size = syms["__data_end__"] - syms["__data_start__"]
    cpu.mem_write(syms["__data_start__"], bytes(cpu.mem_read(syms["__etext"], size)))
    sp = syms["__StackTop"] - 16
    req = syms["__HeapBase"]
    event = req + 248
    assert event + 8 <= syms["__HeapLimit"]

    def call(address, *args):
        if isinstance(address, str):
            address = syms[address]
        for reg, arg in zip((UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3), args):
            cpu.reg_write(reg, arg)
        if len(args) == 5:
            cpu.mem_write(sp, struct.pack("<I", args[4]))
        cpu.reg_write(UC_ARM_REG_MSP, sp)
        cpu.reg_write(UC_ARM_REG_LR, 0x101)
        cpu.emu_start(address | 1, 0x100, count=120000)
        assert cpu.reg_read(UC_ARM_REG_PC) == 0x100 and cpu.reg_read(UC_ARM_REG_MSP) == sp

    packets = []

    def transmit(uc, address, size, unused):
        packets.append(bytes(uc.mem_read(uc.reg_read(UC_ARM_REG_R0), 248)))
        uc.reg_write(UC_ARM_REG_PC, uc.reg_read(UC_ARM_REG_LR))

    send = syms["df_core_send_frame"]
    cpu.hook_add(UC_HOOK_CODE, transmit, begin=send, end=send)
    table = syms["df_proto_handler_info_entries"]
    commands = {}
    for i in range(32):
        cmd, ptr = struct.unpack("<II", cpu.mem_read(table + i * 8, 8))
        if not cmd and not ptr:
            break
        assert cmd not in commands and ptr & 1 and syms["__isr_vector"] <= ptr - 1 < syms["__isr_vector"] + len(image)
        commands[cmd] = ptr
    assert {4, 6, 8, 9, 11} <= set(commands)

    def request(cmd, data=b"", status=0, chunk=0):
        frame = bytearray(248)
        struct.pack_into("<BBH", frame, 0, cmd, status, chunk)
        frame[4:4+len(data)] = data
        frame[247] = len(data)
        cpu.mem_write(req, bytes(frame))
        cpu.mem_write(event, struct.pack("<II", 2, req))
        packets.clear()
        call(commands[cmd], event)
        assert len(packets) == 1
        reply = packets[0]
        assert reply[0] == cmd and reply[2:4] == b"\0\0" and reply[247] <= 243
        return reply[1], reply[4:4+reply[247]]

    def report(cmd, data, magic, version, length):
        st, out = request(cmd, data)
        assert st == 0 and len(out) == length and out[:5] == magic + bytes([version]), (cmd, out)
        if magic != b"UIDG":
            assert out[5] == length
        return out

    call("mui_mem_init")
    call("runtime_diag_stack_init")
    call("runtime_diag_ble_disconnected", 0x13)
    call("runtime_diag_vfs_error", 0xa2, 0xfffffff0)
    ram = report(6, b"", b"PXDG", 1, 64)
    assert ram[6] & 0x6d == 0x6d and ram[8:10] == bytes([0x13, 0xa2])
    assert struct.unpack_from("<H", ram, 12)[0] == 1 and struct.unpack_from("<i", ram, 20)[0] == -16
    heap_free, = struct.unpack_from("<I", ram, 24)
    pool, = struct.unpack_from("<I", ram, 40)
    stack, stack_free = struct.unpack_from("<II", ram, 48)
    assert 0 < heap_free <= pool and stack == 8192 and 0 < stack_free <= stack
    print(f"PASS PXDG: linked allocator and stack watermark, pool={pool}, emulated free stack={stack_free}")

    before = report(8, b"", b"PXPD", 1, 16)
    assert before[6:] == bytes(10)
    call("runtime_diag_boot_capture", 4)
    call("runtime_diag_power_sample", 3950, 1, 1, 1, 45)
    power = report(8, b"", b"PXPD", 1, 16)
    assert power[6] == 31 and struct.unpack_from("<IHH", power, 8) == (4, 3950, 45)
    print("PASS PXPD: empty cache and synthetic reset, voltage, charge flag and sleep timeout")

    call("runtime_diag_startup_mark", 0, 0)
    for step, ticks in enumerate((0x400, 0x800)):
        cpu.mem_write(rtc+0x504, struct.pack("<I", ticks))
        call("startup_storage_checkpoint", step)
    marks = (0, 128, 130, 135, 140, 150)
    for phase, ms in enumerate(marks[1:], 1):
        call("runtime_diag_startup_mark", phase, ms)
    for selector, version, length in [(b"", 1, 32), (b"\x01", 2, 40), (b"\x02", 3, 80)]:
        startup = report(9, selector, b"PXST", version, length)
        assert startup[6] == 63 and struct.unpack_from("<6I", startup, 8) == marks
        if version >= 2:
            assert startup[7] == 3 and struct.unpack_from("<II", startup, 32) == (62, 125), (startup[7], struct.unpack_from("<II", startup, 32))
        if version == 3:
            assert startup[40:] == bytes(40)  # No PackedFS mount profile on this board.
    print("PASS PXST v1-v3: six markers and two application storage checkpoints; absent PackedFS profile")

    call("mui_menu_diag_enter")
    call("mui_nav_diag_raw", 1, 2)
    for selector, version, length in [(b"\x01", 1, 16), (b"\x02", 2, 32)]:
        menu = report(4, selector, b"PXMI", version, length)
        assert menu[6] == 1 and menu[8:11] == b"\0\0\1"
    call("mui_menu_diag_leave")
    call("mui_nav_diag_begin")
    call("mui_nav_diag_raw", 1, 2)
    call("mui_nav_diag_end")
    ui = report(4, b"", b"UIDG", 1, 104)
    assert not ui[5] and struct.unpack_from("<H",ui,6)[0] == 1 and struct.unpack_from("<H",ui,22)[0] == 1
    print("PASS PXMI v1/v2 and UIDG: independent first-menu and Settings input observations")
    flash = report(11, b"", b"PXJF", 1, 12)
    assert flash[6:] == bytes(6)  # Flash probe has not run.
    for cmd in (4, 6, 8, 9, 11):
        for args in [(b"\xff", 0, 0), (b"", 1, 0), (b"", 0, 1)]:
            assert request(cmd, *args) == (1, b""), (cmd,args)
    print("PASS PXJF empty cache and 15 malformed requests; OLED BIN SHA-256", sha256(image).hexdigest())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("elf", type=Path)
    parser.add_argument("binary", type=Path)
    args = parser.parse_args()
    verify(args.elf, args.binary)
