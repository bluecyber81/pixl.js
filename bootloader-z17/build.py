"""Rebuild unsigned LCD Z17 with the pinned Docker or native Linux toolchain.

Does not sign, flash, access hardware, or alter a host SDK installation.
The Docker image or exact native SDK archive/compiler must already be available.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parent
IMAGE = 'solosky/nrf52-sdk@sha256:ef337de9a0504dc3cf0f94a0a8d09f06193b318b3cc9b1bc5bd0b92a7bc1ea16'
OLD_HEADER = '4505df359460dc12df197ab00cb523c0eb3214f379e1a0c24ae3bdc2070ea210'
NEW_HEADER = '555417cf107cab5569878ee4f8b1d91e783b55dddc7e2900e204f624e107d7ef'
COMPILER_SHA = 'a3c5b9d3b1d05160462b6c86e46f3a3471db314f6406f0e6a98973524ab00da3'
COMPILER_VERSION = '12.2.1 20221205'
SDK_ARCHIVE_SHA = 'f726a4e717a0d8e00fe3de9f1e76b19a0c9646291de00097a75cda44c4bcd6d6'


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
    for address, expected in [(0x10001014, 0x77000), (0x10001018, 0x7E000)]:
        if bytes(memory[address + n] for n in range(4)) != expected.to_bytes(4, 'little'):
            raise ValueError('Unexpected UICR bootloader or MBR parameter address')
    end = 1 + max(address for address in memory if address < 0x7E000)
    if 0x7E000 - end < 1024:
        raise ValueError('ELF/HEX leaves less than the required 1 KiB of flash headroom')
    return bytes(memory.get(address, 255) for address in range(0x77000, 0x7E000)), end - 0x77000


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
    parser.add_argument('--mode', choices=['docker', 'native'], default='docker')
    parser.add_argument('--toolchain', type=Path, help='Native Linux Arm GNU 12.2.Rel1 root (never installed or modified).')
    parser.add_argument('--sdk-archive', type=Path, help='Exact Nordic_SDK_Buildquellen_17_1_0.tar.gz for an isolated SDK copy.')
    parser.add_argument('--output', type=Path, default=ROOT/'_build')
    parser.add_argument('--derive', action='store_true', help='Explicit unsigned candidate derivation; reports hashes without claiming reproduction.')
    args = parser.parse_args()
    manifest = verify_sources()
    if args.check:
        print(f"PASS: {len(manifest['files'])} candidate inputs match the source manifest.")
        return
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise RuntimeError('Preserve the existing _build results before rebuilding.')
    if args.mode == 'native':
        if os.name != 'posix' or args.toolchain is None or args.sdk_archive is None:
            raise RuntimeError('Native mode requires Linux, --toolchain and --sdk-archive.')
        compiler = args.toolchain.resolve()/'bin/arm-none-eabi-gcc'
        if sha(compiler) != COMPILER_SHA or sha(args.sdk_archive) != SDK_ARCHIVE_SHA:
            raise RuntimeError('Pinned compiler or SDK archive hash mismatch.')
        # Do not inherit MAKEFLAGS, GCC_EXEC_PREFIX, LD_PRELOAD, CFLAGS or other
        # host compiler overrides. The SDK and source copy stay private.
        native_env = {key: os.environ[key] for key in ('HOME', 'TMPDIR') if key in os.environ}
        native_env.update(PATH=str(compiler.parent)+':/usr/bin:/bin', LANG='C', LC_ALL='C')
        version = subprocess.check_output([str(compiler), '--version'], env=native_env, text=True).splitlines()[0]
        if COMPILER_VERSION not in version:
            raise RuntimeError('Pinned compiler version mismatch.')
    with tempfile.TemporaryDirectory(prefix='allmiibo-z17-') as temporary:
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
echo "{COMPILER_SHA}  $(command -v arm-none-eabi-gcc)" | sha256sum -c -
arm-none-eabi-gcc --version | head -n1 > /out/compiler.txt
cd /work/fw/bootloader
export CFLAGS=-fstack-usage
make -j8 VERBOSE=1 BOARD=LCD bootloader > /out/build.log 2>&1
cp ../_build/bootloader.out ../_build/bootloader.hex ../_build/bootloader.map /out/
arm-none-eabi-size ../_build/bootloader.out > /out/size.txt
'''
        (stage / 'build.sh').write_text(script, encoding='utf-8', newline='\n')
        if args.mode == 'docker':
            result = subprocess.run(['docker', 'run', '--rm', '--pull=never', '--network', 'none',
                                     '--mount', f'type=bind,source={stage},target=/stage,readonly',
                                     '--mount', f'type=bind,source={output},target=/out',
                                     IMAGE, 'bash', '/stage/build.sh'], capture_output=True, text=True, timeout=600)
        else:
            sdk = stage/'sdk'
            sdk.mkdir()
            with tarfile.open(args.sdk_archive) as archive:
                archive.extractall(sdk, filter='data')
            nvic = sdk/'components/softdevice/s112/headers/nrf_nvic.h'
            if sha(nvic) != OLD_HEADER:
                raise RuntimeError('Unexpected unpatched SDK header.')
            work = stage/'work'
            with tarfile.open(stage/'sources.tar') as archive:
                archive.extractall(work, filter='data')
            shutil.copyfile(work/'sdk-overrides/nrf_nvic.h', nvic)
            if sha(nvic) != NEW_HEADER:
                raise RuntimeError('Patched SDK header mismatch.')
            env = dict(native_env, NRF52_SDK_ROOT=str(sdk), CFLAGS='-fstack-usage')
            command = ['make', '-j8', 'VERBOSE=1', 'BOARD=LCD',
                       f'GNU_INSTALL_ROOT={args.toolchain.resolve()}/bin/', 'bootloader']
            (output/'compiler.txt').write_text(version+'\n', encoding='utf-8')
            result = subprocess.run(command, cwd=work/'fw/bootloader', env=env,
                                    capture_output=True, text=True, timeout=600)
            (output/'build.log').write_text(result.stdout+result.stderr, encoding='utf-8')
            if not result.returncode:
                for name in ['bootloader.out', 'bootloader.hex', 'bootloader.map']:
                    shutil.copyfile(work/'fw/_build'/name, output/name)
                size = subprocess.check_output([str(args.toolchain.resolve()/'bin/arm-none-eabi-size'),
                                                str(output/'bootloader.out')], env=native_env, text=True)
                (output/'size.txt').write_text(size, encoding='utf-8')
        (output / 'runner.log').write_text(result.stdout + result.stderr, encoding='utf-8')
        if result.returncode:
            raise RuntimeError('Build failed; see _build/build.log and runner.log.')
    region, used = image_region(output / 'bootloader.hex')
    region_hash = hashlib.sha256(region).hexdigest()
    matches = region_hash == manifest['expectedPaddedBootloaderSha256'] and used == manifest['expectedBootloaderPayloadBytes']
    if not args.derive and not matches:
        raise RuntimeError('Rebuilt boot region or length differs from the tested candidate.')
    (output / 'BOOTLOADER_UNSIGNED_ANALYSIS.bin').write_bytes(region[:used])
    report = {'passed': True, 'reproductionVerified': matches, 'candidateDerivation': args.derive,
              'mode': args.mode, 'sdkImage': IMAGE, 'compilerSha256': COMPILER_SHA,
              'sdkArchiveSha256': SDK_ARCHIVE_SHA if args.mode == 'native' else None,
              'payloadBytes': used, 'flashHeadroomBytes': 28672-used,
              'paddedBootloaderSha256': region_hash,
              'sourceManifestSha256': sha(ROOT / 'SOURCE_BINDING.json'), 'deviceAccess': False,
              'signedPackageProduced': False, 'files': {p.name: sha(p) for p in output.iterdir() if p.is_file()}}
    (output / 'BUILD_RESULT.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print('PASS: ' + ('source-bound image reproduced.' if matches else 'unsigned candidate derived; bind the reported hash before reproduction.'))


if __name__ == '__main__':
    main()
