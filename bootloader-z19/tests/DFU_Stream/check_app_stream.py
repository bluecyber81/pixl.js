"""Transfer a pinned release or candidate through Z19's native DFU model after a disconnect."""
import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from zipfile import ZipFile
import zlib

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
FIXTURE = ROOT / 'tests/Sitzungswechsel'
sys.path.insert(0, str(ROOT / 'tests'))
from run_offline import verify_sanitizer_environment
RELEASE_PAYLOADS = {
    # SHA-256 of the complete signed ZIP -> SHA-256 of its application payload.
    '8056bc504552f20c14fc34b6b6677a1b3bba83afc3727208939d0eda59c83d00':
        '3c52e23507a851d786d86f3e7f7ec6f6ccc9e17ef14fafbb68ec8a87b6e5caf0',  # DE3.69 / 641
    '891762b78ffbd6c7b30b4719e3539a9007b58918aea4ed19397a5f44b1ebc8fc':
        '0cc4aefa5de41fd7b11d8f356ab545414381bdd22c88a5fbdeb53b2f9eb37f02',  # DE3.68 / 640
    '75d7fd2481de3dd0108ab1b8fbb9523f9f95c66cf597b01be2ed33df212e76e2':
        '115593075921247d7d37bc1138beb43437b140ad9c38e0b4e67c4a78795dd1b0',  # DE3.64 / 636
    '01df3896f73cc5776e0a72318742fd44803e2899625c26de5a33fee15c535fb2':
        'ad07ceafabfea1071d512ef63414fa553854659326ba70220a36316754a4a298',  # DE3.65 / 637
    '7fac25c2d7f32d8347375cc5d0e8b00160b0b46e16dd67757d3e0260db03baed':
        '26c3ad95953ae4df204fe7de93b68423f1d5f1c0bb7581663afb52e795932ef3',  # DE3.66 / 638
    '014ecc5cee9c01014c89c021fc22400a94d2e7e517134f4b3e3f06c004738e14':
        'db1ec1258c05aacf6fcdea83d29ea5962424d50c56d28b6c7b249a7f0766a236',  # DE3.67 / 639
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    image_source = parser.add_mutually_exclusive_group(required=True)
    image_source.add_argument('--app-only', type=Path, help='Exact signed app-only release listed in RELEASE_PAYLOADS.')
    image_source.add_argument('--test-bin', type=Path, help='A local candidate binary; also supply its pinned SHA-256.')
    parser.add_argument('--expected-sha256', help='Expected payload digest for --test-bin.')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--no-leak-check', action='store_true',
                        help='Explicitly disable leak detection; keep ASan and UBSan.')
    args = parser.parse_args()
    if not __debug__:
        parser.error('Bootloader tests require Python assertions. Remove -O and PYTHONOPTIMIZE.')
    if args.output.exists():
        parser.error('Output already exists')
    if args.app_only:
        with args.app_only.open('rb') as source:
            expected = RELEASE_PAYLOADS.get(sha256(source.read()).hexdigest())
            if args.expected_sha256 or expected is None:
                parser.error('Expected an exact signed reference package listed in RELEASE_PAYLOADS.')
            source.seek(0)
            with ZipFile(source) as archive:
                entry = json.loads(archive.read('manifest.json'))['manifest']['application']
                image = archive.read(entry['bin_file'])
    else:
        if not args.expected_sha256 or not 8192 < args.test_bin.stat().st_size <= 0x5b000:
            parser.error('--test-bin requires --expected-sha256 and an app-sized binary.')
        image = args.test_bin.read_bytes()
        expected = args.expected_sha256.lower()
    if sha256(image).hexdigest() != expected or len(image) % 4:
        raise ValueError('Application digest or alignment mismatch')
    with tempfile.TemporaryDirectory() as tmp:
        stage = Path(tmp)
        leaks = not args.no_leak_check
        options = {'ASAN_OPTIONS':f'abort_on_error=1:detect_leaks={int(leaks)}',
                   'UBSAN_OPTIONS':'halt_on_error=1',
                   'LSAN_OPTIONS':f'detect_leaks={int(leaks)}:exitcode=23'}
        env = dict(os.environ, **options)
        env.pop('PYTHONOPTIMIZE', None)
        try:
            reason = verify_sanitizer_environment(env, leaks, stage)
        except FileNotFoundError as error:
            reason = f'Sanitizer control could not start: {error.filename}'
            (stage/'sanitizer-control.log').write_text(str(error), encoding='utf-8')
        if reason:
            result = dict(schema=1, passed=False, status='BLOCKED', reason=reason,
                          appSha256=expected, deviceAccess=False,
                          sanitizerOptions=options, sanitizerControl='BLOCKED',
                          leakDetectionEnabled=leaks, leakDetectionConfirmed=False,
                          sanitizerControlLog=(stage/'sanitizer-control.log').read_text())
            args.output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
            print('BLOCKED', reason)
            return 2
        subprocess.run([sys.executable,'-B',str(FIXTURE/'test_session.py'),str(ROOT),
                        str(FIXTURE/'joined_fixture.c'),str(stage),'--integrated','--emit-only'],env=env,check=True)
        flags = ['-std=c11','-O1','-g','-fshort-enums','-fno-pie','-no-pie',
                 '-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer',
                 '-Wno-int-to-pointer-cast','-Wno-pointer-to-int-cast','-DEXPECT_LENGTH_GUARD_FIX=1',
                 '-DEXPECT_ADMISSION_CRC_FIX=1']
        exe = stage/'stream'
        subprocess.run(['gcc',*flags,'-I'+str(stage),str(HERE/'app_stream.c'),'-o',str(exe)],check=True)
        submitted = stage/'submitted.bin'
        received = stage/'received.bin'
        submitted.write_bytes(image)
        proc = subprocess.run([exe,submitted,received],env=env,text=True,
                              stdout=subprocess.PIPE,check=True)
        result = json.loads(proc.stdout.splitlines()[-1])
        if received.read_bytes() != image or result['finalCrc32'] != zlib.crc32(image):
            raise ValueError('Received bytes or final CRC differ from the released app')
        result.update(passed=True, status='PASS', sanitizerControl='PASS',
                      leakDetectionEnabled=leaks, leakDetectionConfirmed=leaks,
                      appSha256=expected, inputKind='signed-reference' if args.app_only else 'local-test-binary',
                      deviceAccess=False, sanitizerOptions=options,
                      boundFixtureSha256=sha256((stage/'session_joined.c').read_bytes()).hexdigest(),
                      scope='Host GCC C model: Z19 data CREATE/WRITE/CRC/EXECUTE, modeled BLE disconnect and settings restoration after accepted init.',
                      limitations=['Signature/activation validator, flash hardware and S112 are modeled here.',
                                   'No physical reset, MBR boot copy, or actual radio connection.'])
    args.output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print('PASS',result['payloadBytes'],'bytes, resume',result['reportedResumeOffset'],expected)


if __name__ == '__main__':
    sys.exit(main())
