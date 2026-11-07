"""Retain an extra 2 KiB in a disposable checkout and require the GNU linker to reject it."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=Path)
parser.add_argument("report", type=Path)
args = parser.parse_args()
def try_extra(extra_bytes, expression):
  with tempfile.TemporaryDirectory() as area:
    root = Path(area) / "negative"
    shutil.copytree(args.source, root, ignore=shutil.ignore_patterns("_build", "__pycache__"))
    path = "fw/bootloader/src/main.c"
    with (root/path).open("ab") as f:
        f.write(('\n__attribute__((used,section(".crypto_data.test_reserve"))) '
                 f'const unsigned char reserve_probe[{extra_bytes}] = {{1}};\n').encode())
    manifest = root / "SOURCE_BINDING.json"
    data = json.loads(manifest.read_bytes())
    data["files"][path] = hashlib.sha256((root/path).read_bytes()).hexdigest()
    manifest.write_text(json.dumps(data), encoding="utf-8")
    proc = subprocess.run([sys.executable, str(root/"build.py")], capture_output=True, text=True)
    log = (root/"_build/build.log").read_text()
    messages = [line for line in log.splitlines() if re.search(expression, line)]
    assert proc.returncode != 0 and messages, log[-3000:]
    assert not (root/"_build/BOOTLOADER_UNSIGNED_ANALYSIS.bin").exists()
    return {"rejectedExtraBytes": extra_bytes, "linker": messages}

args.report.write_text(json.dumps({
    "pass": True, "minimumHeadroom": 1024,
    "checks": [try_extra(1200, "including RAM initializers exceeds"),
               try_extra(2048, "region .FLASH. overflowed by")]
}, indent=2)+"\n")
