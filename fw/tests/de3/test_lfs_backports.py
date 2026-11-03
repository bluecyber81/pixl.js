"""Real LittleFS/PFS regression checks for the two DE3.36 core backports.

An optional --baseline-lfs runs identical tests against an unpatched LittleFS
source tree and requires every reproducer to fail before the candidate passes.
No device, user backup or network is accessed.
"""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import os
import shlex
import subprocess
import tempfile

FW = Path(__file__).resolve().parents[2]
PFS = FW / "application/src/mod/vfs"
HARNESS = Path(__file__).with_name("lfs_backport_host.c")
CASES = ("fcrc", "seek512", "seek4096", "pfs")
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--baseline-lfs", type=Path)
parser.add_argument("--output", type=Path)
parser.add_argument("--sanitize", action="store_true")
args = parser.parse_args()
out = args.output or Path(tempfile.mkdtemp(prefix="pixl-lfs-backports-"))
out.mkdir(parents=True, exist_ok=True)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
report = {
    "started_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "passed": False, "device_access": False, "sanitizers": args.sanitize,
    "upstream_fixes": [
        "https://github.com/littlefs-project/littlefs/commit/8b75de74c916ed516c634388f81c1bbcac446d41",
        "https://github.com/littlefs-project/littlefs/commit/366100b1403d2b680ed7a0f3bd0ba982c34d5c07",
    ],
    "library_baseline": "2.8.1 plus the two listed backports and b9b95ab (2.8.2 superblock wear threshold)",
    "disk_format": "LittleFS 2.1 / PFS1 unchanged",
    "limits": [
        "Synchronous host NOR simulation; not a real device or physical power-loss test.",
        "FCRC reproducer uses legal 512-byte blocks and 4-byte caches to expose the normally cached FCRC decode read.",
        "Seek and public PackedFS reproducers also cover actual 4096-byte blocks and 256-byte caches.",
    ],
    "runs": [],
}

def save():
    (out / "RESULTS.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

sources = [("baseline", args.baseline_lfs)] if args.baseline_lfs else []
sources.append(("candidate", FW / "components/littlefs"))
for name, lfs in sources:
    lfs = lfs.resolve()
    files = [HARNESS, Path(__file__), PFS / "packed_fs.c", PFS / "packed_fs.h",
             lfs / "lfs.c", lfs / "lfs.h", lfs / "lfs_util.c", lfs / "lfs_util.h"]
    before = {str(p): sha(p) for p in files}
    exe = out / (name + (".exe" if os.name == "nt" else ""))
    command = shlex.split(os.environ.get("CC", "gcc")) + [
        "-std=c11", "-O1", "-g", "-Wall", "-Wextra", "-Werror", "-DLFS_NO_MALLOC",
        "-DLFS_NO_DEBUG", "-DLFS_NO_WARN", "-DLFS_NO_ERROR", "-I", str(lfs), "-I", str(PFS),
        str(HARNESS), str(PFS / "packed_fs.c"), str(lfs / "lfs_util.c"), "-o", str(exe),
    ]
    if args.sanitize:
        command += ["-fsanitize=address,undefined", "-fno-sanitize-recover=all", "-fno-omit-frame-pointer", "-fno-pie", "-no-pie"]
    row = {"name": name, "command": command, "source_sha256": before, "cases": []}
    report["runs"].append(row)
    save()
    build = subprocess.run(command, capture_output=True, text=True, timeout=120)
    (out / (name + "_build.txt")).write_text(build.stdout + build.stderr, encoding="utf-8")
    row["build_exit_code"] = build.returncode
    save()
    assert build.returncode == 0, build.stdout + build.stderr
    for case in CASES:
        run = subprocess.run([str(exe.resolve()), case], capture_output=True, text=True, timeout=60)
        (out / (name + "_" + case + ".txt")).write_text(run.stdout + run.stderr, encoding="utf-8")
        result = {"case": case, "exit_code": run.returncode,
                  "expected_failure": name == "baseline", "stdout": run.stdout, "stderr": run.stderr}
        row["cases"].append(result)
        save()
        assert (run.returncode != 0) if name == "baseline" else (run.returncode == 0), result
        print(json.dumps({"variant": name, "case": case, "exit_code": run.returncode}), flush=True)
    row["source_sha256_after"] = {str(p): sha(p) for p in files}
    row["sources_unchanged"] = before == row["source_sha256_after"]
    save()
    assert row["sources_unchanged"], "Sources changed during verification"
report["passed"] = True
report["finished_utc"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
save()
print(json.dumps({"passed": True, "report": str((out / "RESULTS.json").resolve())}), flush=True)
