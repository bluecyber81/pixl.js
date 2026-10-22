"""Compile the actual metadata codec and buffer header with host assertions.

python3 fw/tests/de2/test_metadata.py --cc gcc --sanitize
No hardware access or external packages; temporary executables only.
"""
from pathlib import Path
import argparse
import os
import shlex
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cc", default=os.environ.get("CC", "gcc"))
    parser.add_argument("--sanitize", action="store_true")
    args = parser.parse_args()
    tests = Path(__file__).resolve().parent
    source = tests.parents[1] / "application/src/mod"
    with tempfile.TemporaryDirectory(prefix="pixl-metadata-host-") as tmp:
        executable = Path(tmp) / ("metadata.exe" if os.name == "nt" else "metadata")
        command = shlex.split(args.cc) + ["-std=c11", "-O1", "-g", "-Wall", "-Wextra", "-Werror",
            "-I", str(source / "vfs"), "-I", str(source / "df")]
        if args.sanitize:
            command += ["-fsanitize=address,undefined", "-fno-omit-frame-pointer"]
        subprocess.run(command + [str(tests / "ec_metadata_host.c"),
            str(source / "vfs/vfs_meta.c"), "-o", str(executable)], check=True, timeout=60)
        subprocess.run([str(executable)], check=True, timeout=45)


if __name__ == "__main__":
    main()
