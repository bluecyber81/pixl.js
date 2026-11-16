"""Check the Z21 resume screen in the linked ARM image with mocked SPI and BLE."""
from hashlib import sha256
from pathlib import Path
import argparse
import json
import sys

from unicorn import UC_HOOK_CODE
sys.path.insert(0, str(Path(__file__).resolve().parent / "Display/host"))
from arm_observer_model import IRQProbe

def run(elf):
    probe = IRQProbe(elf)
    observer = probe.sym["dfu_observer"]
    probe.event("initialize")
    probe.event("connect")
    probe.drain()
    ready = probe.frame()
    probe.event("receiving")
    receiving = probe.frame()
    assert ready != receiving
    probe.event("disconnect")
    probe.drain()
    probe.event("connect")
    probe.drain()
    assert probe.frame() == ready
    draws = []
    draw = probe.sym["display_draw"]
    probe.uc.hook_add(UC_HOOK_CODE, lambda machine, pc, length, data: draws.append(pc), begin=draw, end=draw)
    # NRF_DFU_EVT_OBJECT_RECEIVED follows DFU_STARTED in the bound Nordic SDK.
    for _ in range(101):
        probe.execute(observer, 4)
        assert probe.frame() == receiving
    assert len(draws) == 1
    probe.event("error")
    error = probe.frame()
    assert error not in (ready, receiving)
    count = len(draws)
    probe.execute(observer, 4)
    assert probe.frame() == error and len(draws) == count
    return {"elfSha256": sha256(elf.read_bytes()).hexdigest(),
            "acceptedObjectEventsInResumedSession": 101, "redrawsOnThoseEvents": 1,
            "receivingFrameEqualsFreshTransfer": True, "errorFramePreserved": True,
            "scope": "Linked ARM observer and drawing functions. Event, hardware and radio are modeled."}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("elf", type=Path)
    parser.add_argument("report", type=Path)
    args = parser.parse_args()
    result = run(args.elf)
    args.report.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print("PASS: one redraw covers 101 accepted-object events in the resumed session")
