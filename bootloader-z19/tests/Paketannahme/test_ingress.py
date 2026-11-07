"""Exercise real packet admission and disconnect logic; emulate the SDK transport and allocator."""
from pathlib import Path
from tempfile import TemporaryDirectory
import argparse
import hashlib
import json
import subprocess
import os


def body(src, marker):
    start = src.index(marker)
    first = src.index("{", start)
    depth = 1
    for i in range(first + 1, len(src)):
        depth += (src[i] == "{") - (src[i] == "}")
        if depth == 0:
            return src[start:i+1]
    raise ValueError(marker)


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("tree", type=Path)
parser.add_argument("report", type=Path)
parser.add_argument("--old", action="store_true")
args = parser.parse_args()
transport = (args.tree / "fw/bootloader/src/sdk/nrf_dfu_ble.c").read_text()
markers = ["static void response_session_reset(", "static void * response_context_get(", "static void response_fail_locked(", "static void on_flash_write(", "static void on_write("]
if not args.old:
    markers.insert(3,"static void ingress_fail(")
selected = {m: body(transport,m) for m in markers}
fixture = (Path(__file__).parent/"ingress_fixture.c").read_text()
source = fixture.replace("/* IMPLEMENTATION */", "\n\n".join(selected.values()))
with TemporaryDirectory() as directory:
    path = Path(directory)
    (path/"probe.c").write_text(source)
    records = {}
    for mode, more in (("native", []), ("asan_ubsan", ["-fsanitize=address,undefined", "-fno-sanitize-recover=all", "-fno-omit-frame-pointer"])):
        subprocess.run(["gcc", "-std=c11", "-Wall", "-Wextra", "-Werror", "-Wno-unused-parameter",
                        "-O1", "-g", "-fno-pie", "-no-pie", "-DEXPECT_OLD="+str(int(args.old)), *more,
                        str(path/"probe.c"), "-o", str(path/"probe")], check=True)
        env = dict(os.environ, ASAN_OPTIONS=os.environ.get("ASAN_OPTIONS", "detect_leaks=1"))
        records[mode] = subprocess.check_output([str(path/"probe")],text=True,env=env).splitlines()
args.report.write_text(json.dumps({"old":args.old,"sha256Functions":{m:hashlib.sha256(s.encode()).hexdigest() for m,s in selected.items()},
                                  "cases":records,"scope":"SDK allocator, scheduler and radio return codes simulated; actual ingress paths compiled"},indent=2)+"\n")
print(records)
