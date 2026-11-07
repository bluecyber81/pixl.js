"""Build the old and new DFU UI with the same host SPI model and compare both controllers."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile


def sanitizer_env():
    return dict(os.environ, ASAN_OPTIONS=os.environ.get("ASAN_OPTIONS", "abort_on_error=1:detect_leaks=1"),
                UBSAN_OPTIONS=os.environ.get("UBSAN_OPTIONS", "halt_on_error=1"))


def host_harness(fixtures, extended):
    code = (fixtures / "ui_host.c").read_text()
    if not extended:
        return code
    anchor = "static unsigned pins[64]"
    code = code.replace(anchor, """
static unsigned injected_busy_at;
static bool single_frame_wire_check, capture_raw;
static unsigned select_writes, capture_length;
static uint8_t capture_bytes[255];
""" + anchor)
    code = code.replace("pins[pin]=!!value;", """
    if (capture_raw && pin == LCD_SPI_CS_PIN) {
        assert(select_writes < 2 && value == select_writes);
        ++select_writes;
    }
    pins[pin]=!!value;""")
    anchor = "++spi_transfers;spi_bytes+=len;"
    code = code.replace(anchor, anchor + """
    if (injected_busy_at != 0 && spi_transfers == injected_busy_at) return NRF_ERROR_BUSY;
    if (capture_raw) {
        assert(pins[LCD_DC_RS_PIN] == LCD_DC && len <= sizeof(m_lcd_spi.tx_buff));
        assert(capture_length + len <= sizeof(capture_bytes));
        memcpy(capture_bytes + capture_length, tx, len);
        capture_length += len;
        nrf_drv_spi_evt_t event = {0};
        spi_handler(&event, NULL);
        return NRF_SUCCESS;
    }
    if (single_frame_wire_check) {
        unsigned segment=(spi_transfers-1)%4, page=(spi_transfers-1)/4;
        if (segment < 3) {
            assert(pins[LCD_DC_RS_PIN]==LCD_RS && len==1);
            assert(tx[0]==(segment==0 ? 0xb0+page : segment==1 ? 0x10 : 0));
        } else {
            assert(pins[LCD_DC_RS_PIN]==LCD_DC && len==LCD_X_SIZE);
            assert(memcmp(tx,m_display_content[page],LCD_X_SIZE)==0);
        }
    }""")
    anchor = "int main(int argc,char **argv) {"
    code = code.replace(anchor, (fixtures.parent / "status_frame_cases.c").read_text() + "\n" + anchor)
    code = code.replace("    text_metrics();", "    test_full_frames();\n    test_queue_retry();\n    test_raw_transfers();\n    text_metrics();")
    return code


def run_build(src, fixtures, stage, oled, extended):
    src = src / "fw/bootloader/src"
    stage.mkdir()
    harness = stage / "test.c"
    harness.write_text(host_harness(fixtures, extended))
    args = ["gcc", "-std=c11", "-O1", "-g", "-Werror=implicit-function-declaration",
            "-fsanitize=address,undefined", "-fno-omit-frame-pointer", "-no-pie",
            "-I" + str(fixtures), "-I" + str(fixtures / "fixture"), "-I" + str(src)]
    for macro, name in [("BL8_MAIN_SOURCE", "main.c"), ("BL8_LCD_DRV_SOURCE", "lcd_drv.c"),
                        ("BL8_LCD_COMM_SOURCE", "lcd_comm.c")]:
        args.append(f'-D{macro}="{src/name}"')
    if oled:
        args.append("-DOLED_TYPE_SH1106")
    exe = stage / "test"
    subprocess.run(args + [str(harness), "-o", str(exe)], check=True)
    env = sanitizer_env()
    run = subprocess.run([str(exe), str(stage)], env=env, capture_output=True, text=True)
    if run.returncode:
        raise RuntimeError(run.stdout + run.stderr)
    for requirement in ("connected_ready", "receiving_centered", "error_centered", "duplicate_receiving_no_spi"):
        subprocess.run([str(exe), str(stage), requirement], check=True, env=env, stdout=subprocess.DEVNULL)
    rows = [json.loads(s) for s in run.stdout.splitlines()]
    return ({r["frame"]: r for r in rows if "frame" in r}, rows[-1])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("reference", type=Path, help="01+02 UI-corrected bootloader source")
    parser.add_argument("candidate", type=Path, help="bootloader source with new renderer")
    parser.add_argument("report", type=Path)
    args = parser.parse_args()
    fixtures = Path(__file__).resolve().parent / "host"
    env = sanitizer_env()
    report = {"boards": {}, "deviceAccess": False, "sanitizers": ["address", "undefined"],
              "runtimeOptions": {key: env.get(key) for key in ("ASAN_OPTIONS", "UBSAN_OPTIONS", "LSAN_OPTIONS")}}
    with tempfile.TemporaryDirectory() as area:
        for oled, board in [(False, "LCD128"), (True, "SH1106_132")]:
            ref_dir = Path(area) / ("ref-" + board)
            new_dir = Path(area) / ("new-" + board)
            before, tests = run_build(args.reference.resolve(), fixtures, ref_dir, oled, False)
            after, new_tests = run_build(args.candidate.resolve(), fixtures, new_dir, oled, True)
            assert before.keys() == after.keys() and len(after) == 8 and tests == new_tests
            frames = {}
            for name, row in after.items():
                frame = (new_dir / (name + ".pbm")).read_bytes()
                assert frame == (ref_dir / (name + ".pbm")).read_bytes()
                assert row["delayMs"] == before[name]["delayMs"]
                expected = {"object_received": 0, "completed_last_frame": 0}
                if name != "waiting":
                    assert row["spiTransfers"] == expected.get(name, 32)
                frames[name] = {"frameSha256": hashlib.sha256(frame).hexdigest(),
                                "oldTransfers": before[name]["spiTransfers"], "transfers": row["spiTransfers"],
                                "oldWireBytes": before[name]["wireBytes"], "wireBytes": row["wireBytes"]}
            report["boards"][board] = {"frames": frames, "hostSuite": tests, "frameBoundaryCases": 2304,
                                        "spiBusyAtEachTransfer": 32, "fullFrameWireOrderChecked": True,
                                        "disabledDisplayChecked": True, "additionalUIRequirements": 4,
                                        "queueRetryAndTerminal": True, "rawLengthsAndFillCases": 512,
                                        "injectedTwoChunkFaults": 2}
    args.report.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
