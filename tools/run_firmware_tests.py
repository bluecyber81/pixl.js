#!/usr/bin/env python3
"""Run the full or bounded host firmware profile in a disposable Linux source/SDK copy."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile

from build_lcd import SDK_ARCHIVE_SHA256, make_archive, sha256, source_hashes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk-archive', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--profile', choices=('full', 'bounded-host'), default='full')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    if sys.platform != 'linux' or sys.version_info < (3, 12) or not __debug__:
        parser.error('Use Linux/WSL Python >=3.12 with assertions enabled.')
    if sha256(args.sdk_archive) != SDK_ARCHIVE_SHA256:
        parser.error('SDK archive SHA-256 does not match the pinned source archive.')
    commands = ['gcc']
    unicorn_version = None
    if args.profile == 'full':
        commands.append('arm-linux-gnueabihf-gcc')
        try:
            import unicorn
        except ImportError:
            parser.error('The full profile requires Python Unicorn.')
        unicorn_version = unicorn.__version__
    for command in commands:
        if not shutil.which(command):
            parser.error('Missing test compiler: ' + command)
    report = args.report.absolute()
    for path in (report, report.with_suffix('.log'), report.with_suffix('.environment.json')):
        if path.exists():
            parser.error('Preserve previous evidence; choose a new --report path.')
    report.parent.mkdir(parents=True, exist_ok=True)
    minimum_suites = json.loads((root / 'RELEASE_INFO.json').read_bytes())['host_firmware_suites']
    if type(minimum_suites) is not int or minimum_suites < 1:
        parser.error('RELEASE_INFO.json must declare a positive host_firmware_suites count.')
    before = source_hashes(root / 'fw')
    with tempfile.TemporaryDirectory(prefix='allmiibo-host-') as tmp:
        folder = Path(tmp)
        make_archive(root, folder / 'source.tar')
        with tarfile.open(folder / 'source.tar') as archive:
            archive.extractall(folder, filter='data')
        sdk = folder / 'sdk'
        sdk.mkdir()
        with tarfile.open(args.sdk_archive) as archive:
            archive.extractall(sdk, filter='data')
        env = {key: os.environ[key] for key in ('PATH', 'HOME', 'TMPDIR') if key in os.environ}
        env.update(NRF5_SDK_PATH=str(sdk), NRF52_SDK_ROOT=str(sdk), LANG='C.UTF-8', LC_ALL='C.UTF-8',
                   PYTHONDONTWRITEBYTECODE='1', PYTHONOPTIMIZE='0')
        command = [sys.executable, '-B', str(folder / 'fw/tests/de3/run_all.py'),
                   '--minimum-suites', str(minimum_suites), '--profile', args.profile, '--report', str(report)]
        with report.with_suffix('.log').open('w', encoding='utf-8') as log:
            child = subprocess.Popen(command, cwd=folder, env=env, text=True,
                                     stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            for line in child.stdout:
                log.write(line); log.flush()
                print(line, end='', flush=True)
            status = child.wait()
    unchanged = before == source_hashes(root / 'fw')
    metadata = {'observedUTC': datetime.now(timezone.utc).isoformat(), 'python': sys.version,
                'profile': args.profile, 'minimumSuites': minimum_suites, 'unicorn': unicorn_version, 'deviceAccess': False,
                'isolation': 'temporary Linux source and SDK copies',
                'gcc': subprocess.check_output(['gcc', '--version'], text=True).splitlines()[0],
                'armCompiler': (subprocess.check_output(['arm-linux-gnueabihf-gcc', '--version'], text=True).splitlines()[0]
                                if 'arm-linux-gnueabihf-gcc' in commands else None),
                'sdkArchiveSHA256': SDK_ARCHIVE_SHA256, 'productionInputsUnchanged': unchanged,
                'productionInputs': before, 'exitCode': status}
    report.with_suffix('.environment.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
    return status if unchanged else 1


if __name__ == '__main__':
    raise SystemExit(main())
