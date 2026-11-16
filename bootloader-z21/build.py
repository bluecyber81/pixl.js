"""Prepare the bound LCD Z21 sources and invoke the pinned standalone ARM builder."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
Z20 = ROOT.with_name("bootloader-z20")
Z19 = ROOT.with_name("bootloader-z19")


def prepare(destination):
    inputs = json.loads((ROOT / "SOURCE_BINDING.json").read_bytes())["files"]
    tests = json.loads((ROOT / "TEST_BINDING.json").read_bytes())["files"]
    destination.mkdir(parents=True, exist_ok=False)
    for name, digest in {**inputs, **tests}.items():
        # The standalone builder in the manifest is the original one from Z19.
        roots = (Z19,) if name == "build.py" else (ROOT, Z20, Z19)
        source = next((folder / name for folder in roots if (folder / name).is_file()), None)
        if source is None or sha256(source.read_bytes()).hexdigest() != digest:
            raise ValueError(f"Bound Z21 input missing or changed: {name}")
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    for name in ("SOURCE_BINDING.json", "TEST_BINDING.json", "README.md"):
        shutil.copyfile(ROOT / name, destination / name)
    for name in ("LICENSE", "LICENSE_NORDIC.txt"):
        shutil.copyfile(Z19 / name, destination / name)


def main():
    parser = argparse.ArgumentParser(description=__doc__, add_help=False)
    parser.add_argument("--prepare", type=Path, help="Write the standalone Z21 tree into a new directory.")
    args, build_args = parser.parse_known_args()
    if args.prepare:
        if build_args:
            parser.error("--prepare is a standalone operation")
        prepare(args.prepare)
        return
    if "--output" not in build_args:
        build_args.extend(["--output", str(ROOT / "_build")])
    with tempfile.TemporaryDirectory(prefix="allmiibo-z21-") as temp:
        stage = Path(temp) / "source"
        prepare(stage)
        subprocess.run([sys.executable, "-B", str(stage / "build.py"), *build_args], check=True)


if __name__ == "__main__":
    main()
