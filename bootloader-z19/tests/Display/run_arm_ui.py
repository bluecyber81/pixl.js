"""Exercise the linked LCD observer and button code (Unicorn 2 + nm)."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import struct
import sys
from unicorn import UC_HOOK_CODE, UC_HOOK_MEM_READ, UC_HOOK_MEM_WRITE
from unicorn.arm_const import UC_ARM_REG_LR, UC_ARM_REG_PC, UC_ARM_REG_R0

sys.path.insert(0, str(Path(__file__).resolve().parent / "host"))
from arm_observer_model import IRQProbe, Probe, STOP, run_case


def observer_cuts(elf, event):
    probe = IRQProbe(elf)
    probe.event("initialize")
    probe.event("connect")
    probe.drain()
    observer = probe.sym["dfu_observer"]
    end = min(pc for pc in probe.sym.values() if pc > observer)
    trace = []
    status_reads = []
    screen_writes = []
    in_observer = lambda pc: observer <= pc < end

    def track(uc, pc, size, data):
        if in_observer(pc):
            trace.append(pc)

    def track_memory(register):
        def visit(uc, access, addr, size, value, data):
            pc = uc.reg_read(UC_ARM_REG_PC)
            if in_observer(pc):
                register.append(pc)
        return visit

    probe.uc.hook_add(UC_HOOK_CODE, track)
    state = probe.sym["m_display_state"]
    screen = probe.sym["m_display_screen"]
    probe.uc.hook_add(UC_HOOK_MEM_READ, track_memory(status_reads), begin=state, end=state)
    probe.uc.hook_add(UC_HOOK_MEM_WRITE, track_memory(screen_writes), begin=screen, end=screen)
    probe.event(event)
    assert len(status_reads) == len(screen_writes) == 1, (event, trace, status_reads, screen_writes)
    cuts = trace[trace.index(status_reads[0]):]
    assert len(cuts) >= 7 and len(set(cuts)) == len(cuts) and screen_writes[0] in cuts
    return cuts, screen_writes[0], observer


def button_addresses(probe):
    if probe.lto:
        # This ELF inlines both button checks into main. See bound disassembly.
        return 0x7bd5a, 0x7ba58, 0x7bd7a
    start = probe.sym["nrf_bootloader_init"]
    end = min(pc for pc in probe.sym.values() if pc > start)
    code = bytes(probe.uc.mem_read(start, end-start))
    # Inlined Nordic GPIO->IN(0x510) read, TEST pin 7. Validate both
    # conditional branches and GPREGRET constant before using the offsets.
    gpio = bytes.fromhex("4ff0a043 d3f81035 1806")
    assert code.count(gpio) == 1
    pos = code.index(gpio)
    assert code[pos+10+1] == 0xd5  # BPL
    mask = bytes.fromhex("03f0f903 b12b")  # AND #0xf9, CMP #0xb1
    assert code.count(mask) == 1
    condition = code.index(mask) + len(mask)
    assert code[condition+1] == 0xd0

    def destination(offset):
        return start + offset + 4 + struct.unpack_from("b", code, offset)[0]*2

    assert destination(pos+10) == destination(condition)
    return start+pos, destination(condition), start+condition+2


def button(elf, name, hold_ms, second, flag, expected_delay, expected_dfu):
    p = Probe(elf)
    uc = p.uc
    check_gpio, dfu, app = button_addresses(p)
    delays = []
    result = []

    def set_pin(high):
        uc.mem_write(0x50000510, struct.pack("<I", 0x80 if high else 0))

    def hook(pc):
        if pc == p.sym["delay_machine_code.0"]:
            assert uc.reg_read(UC_ARM_REG_R0) == 64_000
            delays.append(pc)
            set_pin(len(delays) >= hold_ms)
            uc.reg_write(UC_ARM_REG_PC, uc.reg_read(UC_ARM_REG_LR))
        elif pc == p.sym["nrf_bootloader_init"]:
            assert struct.unpack("<I", uc.mem_read(0x5000071c, 4))[0] == 12
            set_pin(second)
            uc.mem_write(0x4000051c, struct.pack("<I", flag))
            uc.reg_write(UC_ARM_REG_PC, check_gpio | 1)
        elif pc in (dfu, app):
            result.append(pc == dfu)
            uc.reg_write(UC_ARM_REG_PC, STOP | 1)
    p.button = hook
    set_pin(hold_ms == 0)
    p.execute(0x7b9c4 if p.lto else p.sym["main"])
    assert result == [expected_dfu] and len(delays) == expected_delay, (name, result, len(delays))
    return {"case": name, "decision": "DFU" if result[0] else "App", "modeledMs": len(delays)}


def check_full_queue(elf):
    from unicorn.arm_const import UC_ARM_REG_R4
    p = IRQProbe(elf)
    p.event("initialize")
    waiting = p.frame()
    p.event("connect")
    p.drain()
    ready = p.frame()
    assert ready != waiting
    p.reject_queue = True

    def poll():
        # Site of the inlined poll after app_sched_execute and disconnect handling.
        p.uc.reg_write(UC_ARM_REG_R4, p.sym["m_display_retry"] - 1881)
        p.execute(0x7bb4a, cut=0x7bb84)

    p.event("disconnect")
    assert not p.queue and p.frame() == ready
    poll()
    assert p.frame() == waiting
    p.event("connect")
    assert not p.queue and p.frame() == waiting
    poll()
    assert p.frame() == ready
    cleanups = []

    def observe_cleanup(uc, pc, size, data):
        if pc == 0x79c08:
            assert not p.masked()
            cleanups.append(pc)
            # nrfx peripheral deinit is mocked; return through the original epilogue.
            uc.reg_write(UC_ARM_REG_PC, 0x79cdc | 1)

    p.uc.hook_add(UC_HOOK_CODE, observe_cleanup)
    p.execute(p.sym["dfu_observer"], 6)
    p.event("connect")
    assert not cleanups
    poll()
    poll()
    assert len(cleanups) == 1 and p.frame() == ready and not p.queue
    return ["Waiting after scheduler refusal", "Ready after scheduler refusal",
            "terminal cleanup dispatched once after late reconnect"]


def check_final_phases(elf):
    from unicorn.arm_const import UC_ARM_REG_R2, UC_ARM_REG_R4
    p = IRQProbe(elf)
    p.event("initialize")
    waiting = p.frame()
    p.event("connect")
    # Exact inlined phase bodies in the manifest-bound production ELF.
    # Hardware/validator/flash are outside these cuts; their ordering is tested
    # by the source-bound reset/session fixtures. No time delay is simulated.
    def phase(saving):
        p.uc.reg_write(UC_ARM_REG_R4, p.sym['m_display_state'] - 3789)
        p.uc.reg_write(UC_ARM_REG_R2, 4)
        p.execute(0x7acd0 if saving else 0x7ac56, cut=0x7ace2 if saving else 0x7ac66)
    phase(False); checking = p.frame()
    assert checking != waiting
    p.drain(); assert p.frame() == checking
    phase(True); saving = p.frame()
    assert saving not in (waiting, checking)
    phase(True); assert p.frame() == saving
    p.execute(p.sym['dfu_observer'],6)
    phase(False); phase(True)
    assert p.frame() == saving and p.uc.mem_read(p.sym['m_display_state'],1) == b'\x00'
    return {'checkingFrameSha256':checking,'savingFrameSha256':saving,
            'queuedConnectionCannotOverwrite':True,'terminalCannotRevive':True}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("elf", type=Path)
    parser.add_argument("report", type=Path)
    args = parser.parse_args()
    elf = args.elf.resolve()
    cases = []
    controls = []
    before = []
    for event in ("receiving", "error"):
        cuts, screen_write, entry = observer_cuts(elf, event)
        for reconnect in (False, True):
            for cut in cuts:
                r = run_case(elf, event, cut, reconnect)
                assert r["finalFramebuffer"] == ("ready" if reconnect else "waiting"), r
                cases.append(r)
            r = run_case(elf, event, screen_write, reconnect, force_bypass=True)
            assert r["irqMaskedAtRequest"] and r["finalFramebuffer"] == event, r
            controls.append(r)
            r = run_case(elf, event, entry, reconnect)
            assert r["finalFramebuffer"] == (event if reconnect else "waiting"), r
            before.append(r)
    buttons = [button(elf, *case) for case in [
        ("released", 0, 1, 0, 0, False), ("short press", 75, 1, 0, 80, False),
        ("near threshold", 2990, 1, 0, 2990, False), ("release by the later read", 3000, 1, 0, 3000, False),
        ("held through both reads", 4000, 0, 0, 3000, True), ("application request", 0, 1, 0xb1, 0, True),
        ("new press before later read", 0, 0, 0, 0, True)]]
    report = {"elfSha256": sha256(elf.read_bytes()).hexdigest(), "irqCuts": cases, "negativeControls": controls,
              "observerEntryBeforeValidation": before, "buttonCases": buttons,
              "limits": "MMIO, hardware time, BLE delivery, scheduler and SPI mocked. Observer-entry injections deliberately bypass DFU session ownership. No physical test."}
    if Probe(elf).lto:
        report["fullQueue"] = check_full_queue(elf)
        report["finalPhases"] = check_final_phases(elf)
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print("PASS", len(cases), "IRQ,", len(controls), "negative,", len(before), "entry,", len(buttons), "buttons")


if __name__ == "__main__":
    main()
