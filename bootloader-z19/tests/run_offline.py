"""Repeat source-bound tests offline. Linux, Python 3; GCC for host, Unicorn 2.x and nm for ARM."""
from pathlib import Path
import argparse
import datetime
import hashlib
import importlib
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
TESTS = ROOT / 'tests'
ART = ROOT / '_build'


def prerequisites(kind):
    if kind == 'host':
        missing = [name for name in ('gcc', 'bash') if not shutil.which(name)]
        return ', '.join(missing) + ' unavailable' if missing else None
    try:
        unicorn = importlib.import_module('unicorn')
    except (ImportError, OSError) as exc:
        return 'Unicorn unavailable: ' + str(exc)
    if not unicorn.__version__.startswith('2.'):
        return 'Expected Unicorn 2.x, found ' + unicorn.__version__
    if not shutil.which('nm'):
        return 'GNU nm unavailable'
    if any(not (ART / f).is_file() for f in ('bootloader.out', 'BOOTLOADER_UNSIGNED_ANALYSIS.bin')):
        return 'Missing bound bootloader ELF or BIN'
    return None


def verify_sanitizer_environment(env, enable_leaks, output):
    # A tiny runtime control separates "flags requested" from "leak checking actually active".
    source = """#include <stdlib.h>
__attribute__((noinline)) static void allocate(void) {
    void *mem = malloc(37);
    if (!mem) abort();
    __asm__ volatile ("" : : "r"(mem) : "memory");
}
int main(int argc, char **argv) { if (argc > 1) allocate(); return 0; }
"""
    records = []
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp)
        (path/'control.c').write_text(source, encoding='utf-8')
        exe = path/'control'
        commands = [['gcc', '-O0', '-g', '-fsanitize=address,undefined', '-no-pie',
                     str(path/'control.c'), '-o', str(exe)], [str(exe)], [str(exe), 'intentional-leak']]
        for i, command in enumerate(commands):
            result = subprocess.run(command, env=env, capture_output=True, text=True)
            records.append(f'control {i}, exit {result.returncode}\n{result.stdout}{result.stderr}')
            okay = result.returncode == 0
            if i == 2 and enable_leaks:
                okay = result.returncode != 0 and 'LeakSanitizer: detected memory leaks' in result.stderr
            if not okay:
                (output/'sanitizer-control.log').write_text('\n'.join(records), encoding='utf-8')
                return 'Sanitizer prerequisites failed; see sanitizer-control.log'
    (output/'sanitizer-control.log').write_text('\n'.join(records), encoding='utf-8')
    return None


def cases(out):
    py = [sys.executable, '-B']
    return [
        ('source-binding', 'common', [*py, ROOT/'build.py', '--check']),
        ('build-export-contract', 'host', [*py, TESTS/'test_build_contract.py']),
        ('reset-bind', 'host', [*py, TESTS/'Neustart/bind_merged.py', ROOT, TESTS/'Neustart/Vorlagen', out/'reset']),
        ('reset-native-sanitizers', 'host', ['bash', out/'reset/run.sh']),
        ('session-native-sanitizers', 'host', [*py, TESTS/'Sitzungswechsel/test_session.py', ROOT,
                                              TESTS/'Sitzungswechsel/joined_fixture.c', out/'session', '--integrated']),
        ('ingress-native-sanitizers', 'host', [*py, TESTS/'Paketannahme/test_ingress.py', ROOT, out/'ingress.json']),
        ('display-native-sanitizers', 'host', [*py, TESTS/'Display/run_display.py', TESTS/'Display/Referenz', ROOT, out/'display.json']),
        ('final-phases-native-sanitizers', 'host', [*py, TESTS/'Display/run_final_phases.py', ROOT, out/'final-phases']),
        ('display-buttons-arm', 'arm', [*py, TESTS/'Display/run_arm_ui.py', ART/'bootloader.out', out/'arm-ui.json']),
        ('crypto-arm-69', 'arm', [*py, TESTS/'elf_crypto_regression.py', '--elf', ART/'bootloader.out',
                                  '--bin', ART/'BOOTLOADER_UNSIGNED_ANALYSIS.bin', '--fixtures', TESTS/'crypto-fixtures',
                                  '--output', out/'arm-crypto.json']),
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--host-only', action='store_true')
    mode.add_argument('--arm-only', action='store_true')
    parser.add_argument('--no-leak-check', action='store_true', help='Explicitly disable host leak detection; keep ASan and UBSan.')
    args = parser.parse_args()
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=False)
    selected = 'host' if args.host_only else 'arm' if args.arm_only else 'full'
    wanted = {'host', 'arm'} if selected == 'full' else {selected}
    reasons = {kind: prerequisites(kind) for kind in sorted(wanted)}
    env = os.environ.copy()
    sanitizer = None
    if 'host' in wanted:
        leaks = not args.no_leak_check
        env.update(ASAN_OPTIONS=f'abort_on_error=1:detect_leaks={int(leaks)}',
                   UBSAN_OPTIONS='halt_on_error=1', LSAN_OPTIONS=f'detect_leaks={int(leaks)}:exitcode=23')
        if not reasons['host']:
            reasons['host'] = verify_sanitizer_environment(env, leaks, out)
        sanitizer = {'compilerFlags': ['-fsanitize=address,undefined'],
                     'options': {key: env[key] for key in ('ASAN_OPTIONS','UBSAN_OPTIONS','LSAN_OPTIONS')},
                     'control': 'BLOCKED' if reasons['host'] else 'PASS',
                     'leakDetectionConfirmed': leaks and reasons['host'] is None}
    rows = []
    failed = set()
    for name, group, command in cases(out):
        row = {'test': name, 'group': group}
        if group != 'common' and group not in wanted:
            row.update(status='SKIPPED', reason='Excluded by mode ' + selected)
        elif reasons.get(group):
            row.update(status='BLOCKED', reason=reasons[group])
        elif 'source-binding' in failed or (name == 'reset-native-sanitizers' and 'reset-bind' in failed):
            row.update(status='BLOCKED', reason='Required earlier test failed')
        else:
            log = out/(name+'.log')
            proc = subprocess.run([str(x) for x in command], cwd=ROOT, env=env, capture_output=True, text=True)
            log.write_text(proc.stdout+proc.stderr, encoding='utf-8')
            row.update(status='PASS' if proc.returncode == 0 else 'FAIL', exitCode=proc.returncode,
                       log=log.name, sha256=hashlib.sha256(log.read_bytes()).hexdigest())
            if proc.returncode:
                failed.add(name)
        rows.append(row)
        print(name, row['status'], row.get('reason', ''), flush=True)
    blocked = any(row['status']=='BLOCKED' for row in rows)
    passed = not (failed or blocked)
    tested_arm = any(r['group']=='arm' and 'exitCode' in r for r in rows)
    result = {'schema':2, 'passed':passed, 'mode':selected, 'fullSuitePassed':passed and selected=='full',
              'createdUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'hostPlatform':platform.platform(), 'python':sys.version, 'hostSanitizers':sanitizer,
              'unicorn':getattr(sys.modules.get('unicorn'), '__version__', None),
              'hardwareAccess':False, 'sourceChanged':False, 'firmwareSigned':False,
              'elfSha256':hashlib.sha256((ART/'bootloader.out').read_bytes()).hexdigest() if tested_arm else None,
              'tests':rows, 'limitations':['Modeled SDK, MMIO, GPIO, flash and radio boundaries.',
                                          'ARM tests invoke linked functions, without booting the full MCU or SoftDevice.']}
    (out/'RUN_RESULT.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
    return 1 if failed else 2 if blocked else 0


if __name__ == '__main__':
    sys.exit(main())