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

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-tests', type=Path, required=True)
    parser.add_argument('--no-leak-check', action='store_true', help='Explicitly record that this runtime cannot run LSan; retain ASan/UBSan.')
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
    tests = args.source_tests.resolve()
    sys.path.insert(0, str(tests))
    from run_offline import verify_sanitizer_environment
    fixture = tests / 'Sitzungswechsel'
    env = dict(os.environ, ASAN_OPTIONS='abort_on_error=1:detect_leaks=1', UBSAN_OPTIONS='halt_on_error=1',
               LSAN_OPTIONS='detect_leaks=1:exitcode=23')
    env.pop('PYTHONOPTIMIZE', None)
    if args.no_leak_check:
        env.update(ASAN_OPTIONS='abort_on_error=1:detect_leaks=0', LSAN_OPTIONS='detect_leaks=0')
    with tempfile.TemporaryDirectory() as temporary:
        stage = Path(temporary)
        reason = verify_sanitizer_environment(env, not args.no_leak_check, stage)
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
                      sanitizers=['ASan','UBSan'] + ([] if args.no_leak_check else ['LSan-positive-control']),
                      leakCheckEnabled=not args.no_leak_check,
                      leakCheckLimitation='LSan is unavailable under the execution host ptrace boundary' if args.no_leak_check else None,
                      sourceBindingSha256=hashlib.sha256((tests.parent/'SOURCE_BINDING.json').read_bytes()).hexdigest(),
                      testBindingSha256=hashlib.sha256((tests.parent/'TEST_BINDING.json').read_bytes()).hexdigest(),
                      checkerSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                      scope='Data phase after accepted init; SDK settings reinit, host-modeled flash, BLE, reset and validator. No device access.')
    args.output.write_text(json.dumps(record, indent=2)+'\n', encoding='utf8')
    print('PASS', record['payloadBytes'], 'bytes; resumed at', record['resumeOffsets'])

if __name__ == '__main__':
    main()
