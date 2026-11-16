"""Compile the actual Z20 LCD UI and exercise resumed-transfer lifecycle events.

The Nordic BLE/flash protocol and physical LCD are not executed here.  A resumed
controller may reuse the persisted init object; successful data Execute emits
OBJECT_RECEIVED without a new DFU_STARTED. The test checks the user-visible
status at that point, and protects errors/finalization/waiting against overwrite.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

CASES = r'''
static void connected(void) {
    initialize();
    event_irq(NRF_DFU_EVT_TRANSPORT_ACTIVATED);
    drain_queue();
    assert(m_display_screen == SCREEN_CONNECTED);
}
static void run_case(unsigned index, const char *out) {
    connected();
    if (index == 0) {
        dfu_observer(NRF_DFU_EVT_DFU_STARTED);
        event_irq(NRF_DFU_EVT_TRANSPORT_DEACTIVATED);
        drain_queue();
        event_irq(NRF_DFU_EVT_TRANSPORT_ACTIVATED);
        drain_queue();
    } else if (index == 1) {
        // Cold boot already restored the init; no new STARTED event.
    } else if (index == 2) {
        // Still queued CONNECTED redraw must render the newest state.
        event_irq(NRF_DFU_EVT_TRANSPORT_ACTIVATED);
    } else if (index == 3) {
        dfu_observer(NRF_DFU_EVT_DFU_FAILED);
    } else if (index == 4 || index == 5) {
        dfu_display_final_phase(index == 5);
    } else if (index == 6) {
        event_irq(NRF_DFU_EVT_TRANSPORT_DEACTIVATED);
        drain_queue();
    } else if (index == 7) {
        event_irq(NRF_DFU_EVT_DFU_COMPLETED);
        drain_queue();
    } else if (index == 8) {
        dfu_observer(NRF_DFU_EVT_DFU_STARTED);
    }
    unsigned expected = index < 3 ? SCREEN_RECEIVING : m_display_screen;
    zero_counts();
    dfu_observer(NRF_DFU_EVT_OBJECT_RECEIVED);
    drain_queue();
    unsigned after_first = spi_transfers;
    for (unsigned n = 0; n < 100; ++n) dfu_observer(NRF_DFU_EVT_OBJECT_RECEIVED);
    bool passed = m_display_screen == expected && spi_transfers == after_first &&
                  after_first == (index < 3 ? 32 : 0) && delay_ms == 0;
    printf("{\"case\":%u,\"expectedScreen\":%u,\"observedScreen\":%u,"
           "\"spiTransfers\":%u,\"passed\":%s}\n",
           index, expected, m_display_screen, spi_transfers, passed ? "true" : "false");
    if (index == 0) snapshot(out, "resume-status");
}
int main(int argc, char **argv) {
    assert(argc == 2);
    for (unsigned i = 0; i < 9; ++i) run_case(i, argv[1]);
    return 0;
}
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tree", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--main-source", type=Path)
    parser.add_argument("--expect-baseline-failure", action="store_true")
    args = parser.parse_args()
    tree, out = args.tree.resolve(), args.output.resolve()
    out.mkdir(parents=True, exist_ok=False)
    fixture = tree / "tests/Display/host"
    src = tree / "fw/bootloader/src"
    main_source = (args.main_source or src / "main.c").resolve()
    harness = (fixture / "ui_host.c").read_text().replace(
        "int main(int argc,char **argv)", "int previous_harness_main(int argc,char **argv)") + CASES
    env = dict(os.environ, ASAN_OPTIONS="abort_on_error=1:detect_leaks=0",
               UBSAN_OPTIONS="halt_on_error=1", LSAN_OPTIONS="detect_leaks=0")
    records = {}
    for oled, label in ((False, "LCD128"), (True, "SH1106_132")):
        stage = out / label
        stage.mkdir()
        c, exe = stage / "probe.c", stage / "probe"
        c.write_text(harness)
        command = ["gcc", "-std=c11", "-g", "-O1", "-no-pie",
                   "-fsanitize=address,undefined", "-fno-sanitize-recover=all",
                   "-fno-omit-frame-pointer", "-Werror=implicit-function-declaration",
                   "-I" + str(fixture), "-I" + str(fixture / "fixture"), "-I" + str(src),
                   '-DBL8_MAIN_SOURCE="' + str(main_source) + '"',
                   '-DBL8_LCD_DRV_SOURCE="' + str(src / "lcd_drv.c") + '"',
                   '-DBL8_LCD_COMM_SOURCE="' + str(src / "lcd_comm.c") + '"']
        if oled:
            command.append("-DOLED_TYPE_SH1106")
        subprocess.run(command + [str(c), "-o", str(exe)], check=True, timeout=60)
        result = subprocess.run([str(exe), str(stage)], capture_output=True, text=True,
                                env=env, timeout=30, check=True)
        (stage / "stdout.log").write_text(result.stdout + result.stderr)
        rows = [json.loads(line) for line in result.stdout.splitlines()]
        cases = [r for r in rows if "case" in r]
        assert len(cases) == 9
        failed = [r["case"] for r in cases if not r["passed"]]
        assert failed == ([0, 1, 2] if args.expect_baseline_failure else []), failed
        records[label] = dict(cases=cases, observedFailedCases=failed)
    report = dict(scope="Actual C LCD UI, host SPI/GPIO, scripted lifecycle events; no hardware access.",
                  baselineFailureExpected=args.expect_baseline_failure,
                  mainSource=str(main_source), mainSHA256=hashlib.sha256(main_source.read_bytes()).hexdigest(),
                  testSHA256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                  leakSanitizer=False, sanitizers=["ASan", "UBSan"], boards=records)
    (out / "RESULTS.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: v["observedFailedCases"] for k, v in records.items()}))


if __name__ == "__main__":
    main()
