"""Rebuild the frozen LCD BL8 with the pinned offline Docker SDK.

Does not sign, flash, access hardware, or alter a host SDK installation.
Docker image must already be available (see README.md).
"""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parent
IMAGE = 'solosky/nrf52-sdk@sha256:ef337de9a0504dc3cf0f94a0a8d09f06193b318b3cc9b1bc5bd0b92a7bc1ea16'
OLD_HEADER = '4505df359460dc12df197ab00cb523c0eb3214f379e1a0c24ae3bdc2070ea210'
NEW_HEADER = '555417cf107cab5569878ee4f8b1d91e783b55dddc7e2900e204f624e107d7ef'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def image_region(path):
    memory, upper, eof = {}, 0, False
    for line in path.read_text(encoding='ascii').splitlines():
        if not line.startswith(':') or eof:
            raise ValueError('Invalid Intel HEX line')
        data = bytes.fromhex(line[1:])
        if len(data) < 5 or sum(data) % 256 or len(data) != data[0] + 5:
            raise ValueError('Invalid Intel HEX checksum or length')
        count, offset, kind = data[0], int.from_bytes(data[1:3], 'big'), data[3]
        if kind == 4:
            if count != 2 or offset:
                raise ValueError('Invalid HEX linear base')
            upper = int.from_bytes(data[4:6], 'big') << 16
        elif kind == 2:
            if count != 2 or offset:
                raise ValueError('Invalid HEX segment base')
            upper = int.from_bytes(data[4:6], 'big') << 4
        elif kind == 0:
            if offset + count > 65536:
                raise ValueError('HEX row crosses address boundary')
            for index, value in enumerate(data[4:4 + count]):
                address = upper + offset + index
                if address in memory or not (0x77000 <= address < 0x7E000 or 0x10001014 <= address < 0x1000101C):
                    raise ValueError('Unexpected bootloader image address')
                memory[address] = value
        elif kind == 1:
            if count or offset:
                raise ValueError('Invalid HEX EOF')
            eof = True
        elif kind in (3, 5):
            if count != 4 or offset:
                raise ValueError('Invalid HEX start address')
        else:
            raise ValueError('Unsupported Intel HEX record')
    if not eof or 0x77000 not in memory:
        raise ValueError('Missing HEX EOF or bootloader vector')
    return bytes(memory.get(address, 255) for address in range(0x77000, 0x7E000))


def verify_sources():
    manifest = json.loads((ROOT / 'SOURCE_BINDING.json').read_text(encoding='utf-8'))
    for name, expected in manifest['files'].items():
        candidate = ROOT / name
        if candidate.is_symlink() or ROOT not in candidate.resolve().parents or sha(candidate) != expected:
            raise RuntimeError('Frozen source changed: ' + name)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Only check frozen source hashes; no Docker or build.')
    args = parser.parse_args()
    manifest = verify_sources()
    if args.check:
        print(f"PASS: {len(manifest['files'])} frozen BL8 inputs match the historical build binding.")
        return
    output = ROOT / '_build'
    output.mkdir(exist_ok=True)
    if any(output.iterdir()):
        raise RuntimeError('Preserve the existing _build results before rebuilding.')
    with tempfile.TemporaryDirectory(prefix='allmiibo-bl8-') as temporary:
        stage = Path(temporary)
        with tarfile.open(stage / 'sources.tar', 'w') as archive:
            for name in manifest['files']:
                archive.add(ROOT / name, arcname=name, recursive=False)
        script = f'''#!/bin/bash
set -euo pipefail
mkdir /work
tar -xf /stage/sources.tar -C /work
nvic="$NRF52_SDK_ROOT/components/softdevice/s112/headers/nrf_nvic.h"
echo "{OLD_HEADER}  $nvic" | sha256sum -c -
cp /work/sdk-overrides/nrf_nvic.h "$nvic"
echo "{NEW_HEADER}  $nvic" | sha256sum -c -
arm-none-eabi-gcc --version | head -n1 > /out/compiler.txt
cd /work/fw/bootloader
export CFLAGS=-fstack-usage
make -j8 BOARD=LCD bootloader > /out/build.log 2>&1
cp ../_build/bootloader.out ../_build/bootloader.hex ../_build/bootloader.map /out/
arm-none-eabi-size ../_build/bootloader.out > /out/size.txt
'''
        (stage / 'build.sh').write_text(script, encoding='utf-8', newline='\n')
        result = subprocess.run(['docker', 'run', '--rm', '--pull=never', '--network', 'none',
                                 '--mount', f'type=bind,source={stage},target=/stage,readonly',
                                 '--mount', f'type=bind,source={output},target=/out',
                                 IMAGE, 'bash', '/stage/build.sh'], capture_output=True, text=True, timeout=600)
        (output / 'runner.log').write_text(result.stdout + result.stderr, encoding='utf-8')
        if result.returncode:
            raise RuntimeError('Build failed; see _build/build.log and runner.log.')
    region_hash = hashlib.sha256(image_region(output / 'bootloader.hex')).hexdigest()
    if region_hash != manifest['expectedPaddedBootloaderSha256']:
        raise RuntimeError('Rebuilt BL8 region differs from the signed release; do not package it.')
    report = {'passed': True, 'sdkImage': IMAGE, 'paddedBootloaderSha256': region_hash,
              'sourceManifestSha256': sha(ROOT / 'SOURCE_BINDING.json'), 'deviceAccess': False,
              'signedPackageProduced': False, 'files': {p.name: sha(p) for p in output.iterdir() if p.is_file()}}
    (output / 'BUILD_RESULT.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print('PASS: BL8 rebuilt and its padded firmware region matches the release.')


if __name__ == '__main__':
    main()
