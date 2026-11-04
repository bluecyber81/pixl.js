"""Bind one DE3.59 build to immutable inputs and products; no device operations.

Generated sources/version must be ready before begin. Previous application
objects/products are archived before normal make. Private keys are never read here.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re

VERSION = '2.22.0-DE3.59'
COUNTER = 631
IMAGE = 'solosky/nrf52-sdk@sha256:ef337de9a0504dc3cf0f94a0a8d09f06193b318b3cc9b1bc5bd0b92a7bc1ea16'
ARTIFACTS = ('pixljs_ota_v2.22.0-DE3.59.zip', 'pixljs.bin', 'pixljs.out', 'pixljs.map',
             'pixljs.hex', 'size_report_LCD.json', 'size_report_LCD.txt')
ROOTS = ('application', 'bootloader', 'components', 'ld', 'data', 'scripts', 'tests', 'resources', 'docs')
SUFFIXES = {'.c','.h','.s','.S','.cc','.cpp','.hpp','.inc','.ld','.mk','.a','.lib',
            '.py','.sh','.ps1','.bat','.cmd','.csv','.txt','.bdf','.json','.cfg','.config',
            '.bmp','.png','.svg','.aseprite','.patch','.in'}
SKIP_DIRS = {'.git','_build','__pycache__','.venv','.pytest_cache','.mypy_cache'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha_file(path):
    path = Path(path)
    before = path.stat()
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    after = path.stat()
    require((before.st_size, before.st_mtime_ns) == (after.st_size, after.st_mtime_ns),
            'File changed while hashing: ' + str(path))
    return digest.hexdigest()


def source_snapshot(fw):
    fw = Path(fw)
    paths = set()
    for root in ROOTS:
        folder = fw / root
        if not folder.exists():
            continue
        for directory, names, files in os.walk(folder):
            names[:] = sorted(n for n in names if n not in SKIP_DIRS)
            for name in files:
                path = Path(directory) / name
                if path.suffix in SUFFIXES or name in {'Makefile','CMakeLists.txt','bdfconv_linux'}:
                    paths.add(path)
    if (fw / 'Makefile').exists():
        paths.add(fw / 'Makefile')
    require(paths, 'Empty build source snapshot')
    return {p.relative_to(fw).as_posix(): sha_file(p) for p in sorted(paths)}


def host_source_snapshot(fw):
    fw = Path(fw)
    paths = list((fw / 'application/src').rglob('*.c')) + list((fw / 'application/src').rglob('*.h'))
    for suffix in ('*.py', '*.c', '*.h', '*.json', '*.patch', '*.in', '*.inc'):
        paths += list((fw / 'tests').rglob(suffix))
    paths += list((fw / 'data').glob('*.csv')) + [fw / 'application/Makefile']
    for suffix in ('*.py', '*.sh', '*.ps1', '*.bat', '*.cmd'):
        paths += list((fw / 'scripts').glob(suffix))
    paths += list((fw / 'application/config').glob('*.h'))
    paths += list((fw / 'components/spiffs/src').glob('*.c'))
    paths += list((fw / 'components/spiffs/src').glob('*.h'))
    paths += list((fw / 'components/littlefs').glob('*.c'))
    paths += list((fw / 'components/littlefs').glob('*.h'))
    for suffix in ('*.c', '*.h'):
        paths += list((fw / 'components/chameleon-ultra/firmware/application/src').rglob(suffix))
    return {p.relative_to(fw).as_posix(): sha_file(p) for p in sorted(set(paths))}


def atomic_json(path, value):
    path = Path(path)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    temporary.replace(path)


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def now():
    return datetime.now(timezone.utc).isoformat()


def validate_run_id(run_id):
    require(isinstance(run_id, str) and re.fullmatch(r'[a-zA-Z0-9_-]{8,80}', run_id), 'Invalid build run ID')


def start(fw, run_id):
    validate_run_id(run_id)
    fw = Path(fw).resolve()
    build = fw / '_build'
    require(build.resolve() == build, 'Build directory resolves outside its fixed workspace path')
    build.mkdir(exist_ok=True)
    archive = build / 'de3_previous' / run_id
    require(archive.resolve() == archive, 'Archive resolves outside its fixed workspace path')
    archive.mkdir(parents=True, exist_ok=False)
    # Retire the old success marker FIRST. Existing products cannot satisfy this run.
    for name in ('de3_build_manifest.json', 'de3_build_started.json') + ARTIFACTS:
        old = build / name
        if old.exists():
            old.replace(archive / name)
    objects = build / 'pixljs'
    require(objects.resolve() == objects, 'Application objects resolve outside their fixed workspace path')
    if objects.exists():
        require(objects.is_dir(), 'Application object path is not a directory')
        objects.replace(archive / 'pixljs')
    require(not objects.exists(), 'Previous application objects remain')
    atomic_json(build / 'de3_build_started.json', {'status':'preparing', 'run_id':run_id,
                'started_utc':now(), 'version':VERSION, 'counter':COUNTER, 'board':'LCD',
                'application_objects_retired':True})


def begin(fw, run_id):
    validate_run_id(run_id)
    fw = Path(fw)
    path = fw / '_build/de3_build_started.json'
    state = read_json(path)
    require(state['status'] == 'preparing' and state['run_id'] == run_id, 'Build start is missing or stale')
    require(not (fw / '_build/de3_build_manifest.json').exists(), 'Stale success manifest remains')
    require(state.get('application_objects_retired') is True and not (fw / '_build/pixljs').exists(),
            'Previous application objects were not retired before compilation')
    state.update(status='compiling', compile_started_utc=now(), source_snapshot=source_snapshot(fw))
    atomic_json(path, state)


def finish(fw, run_id):
    fw = Path(fw)
    state = read_json(fw / '_build/de3_build_started.json')
    require(state['status'] == 'compiling' and state['run_id'] == run_id, 'Build compilation evidence is stale')
    require(source_snapshot(fw) == state['source_snapshot'], 'Sources changed during ARM build')
    products = {}
    for name in ARTIFACTS:
        path = fw / '_build' / name
        require(path.is_file() and path.stat().st_size > 0, 'Missing fresh artifact: ' + name)
        products[name] = {'sha256':sha_file(path), 'bytes':path.stat().st_size}
    require(source_snapshot(fw) == state['source_snapshot'], 'Sources changed while hashing build products')
    manifest = dict(state, status='passed', finished_utc=now(), sdk_image=IMAGE,
                    network='none', force_application_rebuild=True, artifacts=products,
                    sources_unchanged_during_build=True)
    atomic_json(fw / '_build/de3_build_manifest.json', manifest)
    return manifest


def verify_manifest(fw, manifest, run_id):
    fw = Path(fw)
    validate_run_id(run_id)
    require(manifest.get('status') == 'passed' and manifest.get('run_id') == run_id, 'Stale/failed build manifest')
    require(manifest.get('version') == VERSION and manifest.get('counter') == COUNTER and
            manifest.get('board') == 'LCD' and manifest.get('sdk_image') == IMAGE and
            manifest.get('network') == 'none' and manifest.get('force_application_rebuild') is True and
            manifest.get('application_objects_retired') is True,
            'Wrong build configuration')
    require(manifest.get('sources_unchanged_during_build') is True, 'Unstable build sources')
    require(source_snapshot(fw) == manifest.get('source_snapshot'), 'Current sources do not match ARM build')
    require(set(manifest.get('artifacts', {})) == set(ARTIFACTS), 'Incomplete artifact evidence')
    for name in ARTIFACTS:
        path = fw / '_build' / name
        value = manifest['artifacts'][name]
        require(path.is_file() and path.stat().st_size == value['bytes'] and
                sha_file(path) == value['sha256'], 'Artifact does not match ARM build: ' + name)


def verify_version_marker(payload, version_header):
    require(isinstance(payload, bytes), 'Payload must be bytes')
    require(VERSION.encode('ascii') + b'\0' in payload, 'Missing exact terminated firmware version')
    markers = set(re.findall(rb'2\.[0-9]+\.[0-9]+-DE3(?:\.[0-9]+)?(?:-[A-Za-z0-9._+-]+)?\x00', payload))
    require(markers == {VERSION.encode('ascii') + b'\0'},
            'Unexpected DE3 firmware marker remains')
    definitions = re.findall(r'^#define VERSION "([^"\r\n]+)"$', version_header, re.M)
    require(definitions == [VERSION], 'Generated version header does not match exact target')


def verify_host_tests(fw, tests, manifest):
    fw = Path(fw)
    require(tests.get('passed') is True and tests.get('sources_unchanged_during_tests') is True,
            'Host tests failed or sources changed during tests')
    expected = {folder + '/' + p.name for folder in ('de2','de3')
                for p in (fw / 'tests' / folder).glob('test_*.py')}
    actual = tests.get('scripts', [])
    require(expected and len(actual) == len(expected) and
            {r['script'] for r in actual} == expected and all(r['exit_code'] == 0 for r in actual),
            'Missing, duplicate or failed host test script')
    current = host_source_snapshot(fw)
    require(current == tests.get('source_snapshot'), 'Current host source/test set differs from tested set')
    require(all(manifest['source_snapshot'].get(path) == digest for path, digest in current.items()),
            'Host-tested sources differ from ARM build')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('start','begin','finish'))
    parser.add_argument('--run-id', required=True)
    args = parser.parse_args()
    fw = Path(__file__).resolve().parents[1]
    {'start':start, 'begin':begin, 'finish':finish}[args.action](fw, args.run_id)
    print(VERSION + ' build evidence: ' + args.action + ' ' + args.run_id)


if __name__ == '__main__':
    main()
