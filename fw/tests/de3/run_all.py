"""Run DE2 regressions and DE3 tests; record actual output and source snapshot."""
from pathlib import Path
import argparse
from datetime import datetime, timezone
import hashlib
import json
import subprocess
import sys

FW = Path(__file__).resolve().parents[2]

def snapshot():
    paths = list((FW / 'application/src').rglob('*.c')) + list((FW / 'application/src').rglob('*.h'))
    for suffix in ('*.py', '*.c', '*.h', '*.json', '*.patch', '*.in', '*.inc'):
        paths += list((FW / 'tests').rglob(suffix))
    paths += list((FW / 'data').glob('*.csv')) + [FW / 'application/Makefile']
    for suffix in ('*.py', '*.sh', '*.ps1', '*.bat', '*.cmd'):
        paths += list((FW / 'scripts').glob(suffix))
    paths += list((FW / 'application/config').glob('*.h'))
    paths += list((FW / 'components/spiffs/src').glob('*.c'))
    paths += list((FW / 'components/spiffs/src').glob('*.h'))
    for suffix in ('*.c', '*.h'):
        paths += list((FW / 'components/chameleon-ultra/firmware/application/src').rglob(suffix))
    return {str(p.relative_to(FW)).replace('\\', '/'): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(set(paths))}

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--report', required=True, type=Path)
parser.add_argument('--minimum-suites', type=int, default=1)
args = parser.parse_args()
if args.report.exists():
    raise SystemExit('Use a new report path; preserve previous evidence')
if not __debug__:
    raise SystemExit('Full firmware regressions require Python assertions')
scripts = [script for folder in ('de2', 'de3') for script in sorted((FW / 'tests' / folder).glob('test_*.py'))]
if not scripts or len(scripts) < args.minimum_suites:
    raise SystemExit(f'Expected at least {args.minimum_suites} firmware suites, found {len(scripts)}')
before = snapshot()
results = []
for script in scripts:
    command = [sys.executable, '-B', str(script)]
    try:
        run = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=300)
        result = dict(script=script.relative_to(FW / 'tests').as_posix(), exit_code=run.returncode, stdout=run.stdout, stderr=run.stderr)
    except subprocess.TimeoutExpired as error:
        result = dict(script=script.relative_to(FW / 'tests').as_posix(), exit_code=-1, stdout='', stderr=str(error))
    results.append(result)
    print(('PASS' if result['exit_code'] == 0 else 'FAIL') + ': ' + result['script'], flush=True)
    if result['exit_code']:
        print(result['stdout'] + result['stderr'], flush=True)
after = snapshot()
report = {'finished_utc': datetime.now(timezone.utc).isoformat(), 'device_access': False,
          'hardware_mocked': True, 'source_snapshot': after, 'sources_unchanged_during_tests': before == after,
          'scripts': results, 'passed': before == after and all(r['exit_code'] == 0 for r in results)}
args.report.parent.mkdir(exist_ok=True, parents=True)
args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
raise SystemExit(0 if report['passed'] else 1)
