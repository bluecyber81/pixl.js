"""Run all offline DE2 host regression scripts with the existing C toolchain.

No device access, dependencies installed, or source files generated in place.
Optional --report writes the complete command outputs and test source hashes.
ASan/UBSan tests are additionally run using the individual --sanitize options
under Linux, as documented in the accompanying validation reports.
"""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--report', type=Path)
args = parser.parse_args()
tests = Path(__file__).resolve().parent
results = []
for path in sorted(tests.glob('test_*.py')):
    command = [sys.executable, '-B', str(path)]
    result = subprocess.run(command, capture_output=True, text=True,
                            encoding='utf-8', errors='replace', timeout=240)
    results.append({'script': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                    'exit_code': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr})
    print(('PASS' if result.returncode == 0 else 'FAIL') + ': ' + path.name, flush=True)
    if result.returncode:
        print(result.stdout + result.stderr, flush=True)
report = {'finished_utc': datetime.now(timezone.utc).isoformat(),
          'device_access': False, 'hardware_mocked': True,
          'scripts': results, 'passed': all(r['exit_code'] == 0 for r in results)}
if args.report:
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
sys.exit(0 if report['passed'] else 1)
