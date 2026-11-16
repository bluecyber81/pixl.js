"""Replay an accepted Nordic DFU image through the Z20 data path in native C."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import zlib
from run_offline import verify_sanitizer_environment

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('binary', type=Path)
    parser.add_argument('expected_sha256')
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    if not __debug__:
        parser.error('Tests require Python assertions.')
    data = args.binary.read_bytes()
    if args.output.exists() or hashlib.sha256(data).hexdigest() != args.expected_sha256:
        parser.error('Expected new output and matching pinned input SHA-256.')
    if not 18 * 4096 < len(data) <= 0x5b000 or len(data) % 4:
        parser.error('Three-interruption exercise requires a word-aligned image above 72 KiB.')
    tests = Path(__file__).resolve().parent
    fixture = tests / 'Sitzungswechsel'
    env = dict(os.environ, ASAN_OPTIONS='abort_on_error=1:detect_leaks=1', UBSAN_OPTIONS='halt_on_error=1',
               LSAN_OPTIONS='detect_leaks=1:exitcode=23')
    env.pop('PYTHONOPTIMIZE', None)
    with tempfile.TemporaryDirectory() as temporary:
        stage = Path(temporary)
        reason = verify_sanitizer_environment(env, True, stage)
        if reason:
            raise RuntimeError(reason)
        subprocess.run([sys.executable, '-B', str(fixture/'test_session.py'), str(tests.parent),
                        str(fixture/'joined_fixture.c'), str(stage), '--integrated', '--emit-only'], env=env, check=True)
        exe = stage/'stream'
        subprocess.run(['gcc','-std=c11','-g','-O1','-fshort-enums','-fno-pie','-no-pie',
                        '-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer',
                        '-Wno-int-to-pointer-cast','-Wno-pointer-to-int-cast','-DEXPECT_LENGTH_GUARD_FIX=1',
                        '-DEXPECT_ADMISSION_CRC_FIX=1','-I'+str(stage),str(tests/'checkpoint_stream.c'),
                        '-o',str(exe)], env=env, check=True)
        result = subprocess.run([exe, args.binary, stage/'received.bin'], capture_output=True, text=True, env=env)
        if result.returncode:
            raise RuntimeError(f'C model failed ({result.returncode}). {result.stdout} {result.stderr}')
        record = json.loads(result.stdout.strip())
        if (stage/'received.bin').read_bytes() != data or record['finalCrc32'] != zlib.crc32(data):
            raise ValueError('Final content or CRC differs from submitted image')
        record.update(passed=True, sha256=args.expected_sha256, cutKinds=['link','link','cold-restart'],
                      duplicateExecuteExtraErases=0, modeledLinkCutsDuringCheckpoint=5,
                      modeledCheckpointPowerCuts=455, modeledAdmissionOrCompletionFailures=8,
                      sanitizers=['ASan','UBSan','LSan-positive-control'],
                      scope='Data phase after accepted init; SDK settings reinit, host-modeled flash, BLE, reset and validator. No device access.')
    args.output.write_text(json.dumps(record, indent=2)+'\n', encoding='utf8')
    print('PASS', record['payloadBytes'], 'bytes; resumed at', record['resumeOffsets'])

if __name__ == '__main__':
    main()
