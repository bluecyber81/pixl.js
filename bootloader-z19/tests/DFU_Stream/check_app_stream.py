"""Send the known 636 app bytes through Z19's source-bound native DFU data path after a modeled disconnect."""
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
APP_ARCHIVE = '75d7fd2481de3dd0108ab1b8fbb9523f9f95c66cf597b01be2ed33df212e76e2'
PAYLOAD = '115593075921247d7d37bc1138beb43437b140ad9c38e0b4e67c4a78795dd1b0'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    image_source = parser.add_mutually_exclusive_group(required=True)
    image_source.add_argument('--app-only', type=Path, help='Known signed reference package DE3.64/636.')
    image_source.add_argument('--test-bin', type=Path, help='A local candidate binary; also supply its pinned SHA-256.')
    parser.add_argument('--expected-sha256', help='Expected payload digest for --test-bin.')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error('Output already exists')
    if args.app_only:
        if args.expected_sha256 or sha256(args.app_only.read_bytes()).hexdigest() != APP_ARCHIVE:
            parser.error('Expected the exact signed DE3.64 / 636 reference package.')
        with ZipFile(args.app_only) as archive:
            entry = json.loads(archive.read('manifest.json'))['manifest']['application']
            image = archive.read(entry['bin_file'])
        expected = PAYLOAD
    else:
        if not args.expected_sha256 or not 8192 < args.test_bin.stat().st_size <= 0x5b000:
            parser.error('--test-bin requires --expected-sha256 and an app-sized binary.')
        image = args.test_bin.read_bytes()
        expected = args.expected_sha256.lower()
    if sha256(image).hexdigest() != expected or len(image) % 4:
        raise ValueError('Application digest or alignment mismatch')
    with tempfile.TemporaryDirectory() as tmp:
        stage = Path(tmp)
        subprocess.run([sys.executable,'-B',str(FIXTURE/'test_session.py'),str(ROOT),
                        str(FIXTURE/'joined_fixture.c'),str(stage),'--integrated','--emit-only'],check=True)
        flags = ['-std=c11','-O1','-g','-fshort-enums','-fno-pie','-no-pie',
                 '-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer',
                 '-Wno-int-to-pointer-cast','-Wno-pointer-to-int-cast','-DEXPECT_LENGTH_GUARD_FIX=1',
                 '-DEXPECT_ADMISSION_CRC_FIX=1']
        exe = stage/'stream'
        subprocess.run(['gcc',*flags,'-I'+str(stage),str(HERE/'app_stream.c'),'-o',str(exe)],check=True)
        submitted = stage/'submitted.bin'
        received = stage/'received.bin'
        submitted.write_bytes(image)
        options = {'ASAN_OPTIONS':'abort_on_error=1:detect_leaks=1','UBSAN_OPTIONS':'halt_on_error=1',
                   'LSAN_OPTIONS':'detect_leaks=1:exitcode=23'}
        proc = subprocess.run([exe,submitted,received],env=dict(os.environ,**options),text=True,
                              stdout=subprocess.PIPE,check=True)
        result = json.loads(proc.stdout.splitlines()[-1])
        if received.read_bytes() != image or result['finalCrc32'] != zlib.crc32(image):
            raise ValueError('Received bytes or final CRC differ from the released app')
        result.update(passed=True, appSha256=expected, inputKind='signed-reference' if args.app_only else 'local-test-binary',
                      deviceAccess=False, sanitizerOptions=options,
                      boundFixtureSha256=sha256((stage/'session_joined.c').read_bytes()).hexdigest(),
                      scope='Host GCC C model: Z19 data CREATE/WRITE/CRC/EXECUTE, modeled BLE disconnect and settings restoration after accepted init.',
                      limitations=['Signature/activation validator, flash hardware and S112 are modeled here.',
                                   'No physical reset, MBR boot copy, or actual radio connection.'])
    args.output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print('PASS',result['payloadBytes'],'bytes, resume',result['reportedResumeOffset'],expected)


if __name__ == '__main__':
    main()
