"""Materialize the hash-bound Z20 tree and run the inherited pinned ARM builder."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
BASE = ROOT.with_name('bootloader-z19')

def prepare(stage):
    binding = json.loads((ROOT / 'SOURCE_BINDING.json').read_bytes())
    if stage.exists():
        raise FileExistsError(f"Choose a new output directory: {stage}")
    tests = json.loads((ROOT / 'TEST_BINDING.json').read_bytes())
    stage.mkdir(parents=True)
    for name, digest in {**binding['files'], **tests['files']}.items():
        candidate = ROOT / name
        # The standalone builder itself is the hash-pinned builder inherited from Z19.
        if name == 'build.py' or not candidate.is_file():
            candidate = BASE / name
        if hashlib.sha256(candidate.read_bytes()).hexdigest() != digest:
            raise ValueError(f"Input digest mismatch for {name}")
        destination = stage / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(candidate, destination)
    for name in ('SOURCE_BINDING.json', 'TEST_BINDING.json', 'README.md'):
        shutil.copy2(ROOT / name, stage / name)
    for name in ('LICENSE', 'LICENSE_NORDIC.txt'):
        shutil.copy2(BASE / name, stage / name)


def main():
    parser = argparse.ArgumentParser(description=__doc__, add_help=False)
    parser.add_argument('--prepare', type=Path, help='Write a fresh standalone source and test tree.')
    args, build_args = parser.parse_known_args()
    if args.prepare:
        if build_args:
            parser.error('--prepare is a standalone operation')
        prepare(args.prepare)
        return
    if '--output' not in build_args:
        build_args.extend(['--output', str(ROOT / '_build')])
    with tempfile.TemporaryDirectory(prefix='allmiibo-z20-') as tmp:
        stage = Path(tmp) / 'source'
        prepare(stage)
        subprocess.run([sys.executable, '-B', str(stage / 'build.py'), *build_args], check=True)

if __name__ == '__main__':
    main()
