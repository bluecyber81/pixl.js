"""Repeat source-bound host and actual ARM Thumb tests; never connects to hardware.

Linux, Python 3, GCC/ASan/UBSan, GNU nm, Unicorn 2.x required.
The output directory must not yet exist. This leaves supplied evidence unchanged.
"""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import platform
import subprocess
import sys
import unicorn

ROOT = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--output', type=Path, required=True)
a = p.parse_args()
out = a.output.resolve()
out.mkdir(parents=True, exist_ok=False)
src = ROOT
tests = ROOT / 'tests'
art = src / '_build'
rows = []

def run(name, arguments):
    proc = subprocess.run([str(x) for x in arguments], cwd=ROOT,
                          capture_output=True, text=True)
    log = out / (name + '.log')
    log.write_text(proc.stdout + proc.stderr, encoding='utf-8')
    rows.append({'test': name, 'exitCode': proc.returncode, 'log': log.name,
                 'sha256': hashlib.sha256(log.read_bytes()).hexdigest()})
    print(name, proc.returncode, flush=True)
    if proc.returncode:
        raise RuntimeError('Test failed: ' + name + '; see ' + str(log))

py = [sys.executable, '-B']
run('source-binding', [*py, src/'build.py', '--check'])
run('build-export-contract', [*py, tests/'test_build_contract.py'])
run('reset-bind', [*py, tests/'Neustart/bind_merged.py', src,
                  tests/'Neustart/Vorlagen', out/'reset'])
run('reset-native-sanitizers', ['bash', out/'reset/run.sh'])
run('session-native-sanitizers', [*py, tests/'Sitzungswechsel/test_session.py', src,
                                tests/'Sitzungswechsel/joined_fixture.c', out/'session', '--integrated'])
run('ingress-native-sanitizers', [*py, tests/'Paketannahme/test_ingress.py', src, out/'ingress.json'])
run('display-native-sanitizers', [*py, tests/'Display/run_display.py',
                                tests/'Display/Referenz', src, out/'display.json'])
run('final-phases-native-sanitizers', [*py, tests/'Display/run_final_phases.py', src, out/'final-phases'])
run('display-buttons-arm', [*py, tests/'Display/run_arm_ui.py', art/'bootloader.out', out/'arm-ui.json'])
run('crypto-arm-69', [*py, tests/'elf_crypto_regression.py', '--elf', art/'bootloader.out',
                      '--bin', art/'BOOTLOADER_UNSIGNED_ANALYSIS.bin', '--fixtures', tests/'crypto-fixtures',
                      '--output', out/'arm-crypto.json'])
result = {'schema': 1, 'passed': True, 'createdUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'hostPlatform': platform.platform(), 'python': sys.version, 'unicorn': unicorn.__version__,
          'hardwareAccess': False, 'sourceChanged': False, 'firmwareSigned': False,
          'elfSha256': hashlib.sha256((art/'bootloader.out').read_bytes()).hexdigest(), 'tests': rows,
          'limitations': ['Modeled SDK, MMIO, GPIO, flash and radio boundaries; no physical device test.',
                         'ARM crypto executes real linked code, but does not boot the full MCU/SoftDevice.']}
(out/'RUN_RESULT.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
print('PASS: all repeated host and ARM tests completed')
