#!/usr/bin/env python3
"""Run all immutable Z19 stream-mode tests against their App662/App654 references.

The frozen suite's release-table contract predates newer normal LCD releases.
Its original tests and real reference ZIPs run unchanged in a temporary tree.
The workflow separately binds and streams the current release application.
"""
import argparse
import ast
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from zipfile import ZipFile


def check_modes(root, output):
    if not __debug__:
        raise ValueError('Z19 mode tests require Python assertions.')
    if output.exists():
        raise ValueError('Choose a new report path; preserve existing evidence.')
    boot = root / 'bootloader-z19'
    binding_bytes = (boot / 'TEST_BINDING.json').read_bytes()
    binding = json.loads(binding_bytes)['files']
    names = ('tests/test_app_stream_modes.py', 'tests/DFU_Stream/check_app_stream.py', 'tests/run_offline.py')
    files = {name: (boot / name).read_bytes() for name in names}
    for name, data in files.items():
        if sha256(data).hexdigest() != binding[name]:
            raise ValueError('Z19 bound test source mismatch: ' + name)
    module = ast.parse(files['tests/DFU_Stream/check_app_stream.py'])
    tables = [node.value for node in module.body if isinstance(node, ast.Assign)
              and any(isinstance(target, ast.Name) and target.id == 'RELEASE_PAYLOADS' for target in node.targets)]
    if len(tables) != 1:
        raise ValueError('Expected the single frozen release-payload table.')
    payloads = ast.literal_eval(tables[0])
    references = []
    archives = {}
    for version, counter, filename in (
        ('2.22.0-DE3.89', 662, 'Allmiibo_LCD_DE3_89_662_NUR_APP.zip'),
        ('2.22.0-DE3.81', 654, 'Allmiibo_LCD_DE3_81_654_NUR_APP.zip'),
    ):
        name = 'fw/releases/' + filename
        data = (root / name).read_bytes()
        digest = sha256(data).hexdigest()
        if digest not in payloads:
            raise ValueError('Historical ZIP is absent from the bound release table: ' + name)
        with ZipFile(BytesIO(data)) as archive:
            manifest = json.loads(archive.read('manifest.json'))['manifest']
            if set(manifest) != {'application'}:
                raise ValueError('Expected a historical application-only manifest.')
            image = archive.read(manifest['application']['bin_file'])
        if sha256(image).hexdigest() != payloads[digest]:
            raise ValueError('Historical payload differs from the bound release table.')
        archives[name] = data
        references.append(dict(version=version, counter=counter, application_ota_path=name,
                               ota_sha256=digest, application_sha256=payloads[digest]))
    with tempfile.TemporaryDirectory(prefix='z19-frozen-release-modes-') as tmp:
        stage = Path(tmp)
        for name, data in files.items():
            copied = stage / 'bootloader-z19' / name
            copied.parent.mkdir(parents=True, exist_ok=True)
            copied.write_bytes(data)
        for name, data in archives.items():
            copied = stage / name
            copied.parent.mkdir(parents=True, exist_ok=True)
            copied.write_bytes(data)
        metadata = dict(references[0], previous_lcd_release=references[1])
        (stage / 'RELEASE_INFO.json').write_text(json.dumps(metadata, indent=2) + '\n')
        run = subprocess.run([sys.executable, '-B', str(stage / 'bootloader-z19/tests/test_app_stream_modes.py')],
                             cwd=stage, text=True, capture_output=True, timeout=120)
    unchanged = (binding_bytes == (boot / 'TEST_BINDING.json').read_bytes()
                 and all(data == (boot / name).read_bytes() for name, data in files.items())
                 and all(data == (root / name).read_bytes() for name, data in archives.items()))
    passed = run.returncode == 0 and 'Ran 4 tests' in run.stderr and 'skipped=' not in run.stderr and unchanged
    result = dict(passed=passed, scope='All four unchanged Z19 stream-mode tests with historical App662/App654 reference ZIPs.',
                  currentReleaseScope='The current release ZIP, payload and native stream are checked separately by the workflow.',
                  references=references, sourceHashes={name: sha256(data).hexdigest() for name, data in files.items()},
                  testBindingSha256=sha256(binding_bytes).hexdigest(), sourceInputsUnchanged=unchanged,
                  executedTests=4 if 'Ran 4 tests' in run.stderr else None,
                  exitCode=run.returncode, stdout=run.stdout, stderr=run.stderr,
                  deviceAccess=False, nativeDfuStreamExecuted=False)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('x', encoding='utf-8') as target:
        target.write(json.dumps(result, indent=2) + '\n')
    print(run.stdout, end='')
    print(run.stderr, end='', file=sys.stderr)
    if not passed:
        raise RuntimeError('The complete historical Z19 stream-mode suite did not pass unchanged.')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    check_modes(Path(__file__).resolve().parents[1], args.output)


if __name__ == '__main__':
    main()
