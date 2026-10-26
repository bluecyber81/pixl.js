"""Actual C loaders/delete callbacks: failed traversal is never a complete list.

VFS, UI and small containers are mocks; real Mlib/TLSF allocations are covered
separately in test_ram_list_growth.py. No device or tag contents are involved.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile

FW = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(FW / 'tests/de2'))
from test_player_v3 import function

FILES = {
    'application/src/mod/cwalk2.c': ['bounded_path_length', 'cwalk_append_segment'],
    'application/src/app/amiibo/scene/amiibo_scene_file_browser.c': [
        'amiibo_scene_file_browser_list_item_cmp', 'amiibo_scene_file_browser_reload_folders',
        'amiibo_scene_file_browser_on_selected'],
    'application/src/app/amiibo/scene/amiibo_scene_amiibo_detail.c': [
        'app_amiibo_file_neighbor', 'amiibo_scene_amiibo_detail_reload_files'],
    'application/src/app/amiibo/scene/amiibo_scene_amiibo_detail_menu.c': [
        'amiibo_scene_amiibo_detail_delete_tag_confirmed'],
}
CASES = list(range(19)) + list(range(20, 25))
NEGATIVE_CASES = [0, 1, 2, 3, 10, 11, 12, 13, 18, 20, 21]

def hashes(root):
    paths = list(FILES) + ['tests/de3/amiibo_file_errors.c.in', 'tests/de3/test_amiibo_file_errors.py']
    return {p: hashlib.sha256((root / p).read_bytes()).hexdigest() for p in paths if (root / p).is_file()}

def run(root, sanitize=False, baseline=False):
    pieces = []
    for rel, names in FILES.items():
        text = (root / rel).read_text(encoding='utf-8')
        if baseline:
            names = ['amiibo_scene_amiibo_detail_list_item_cmp' if n == 'app_amiibo_file_neighbor' else n for n in names]
        for name in names:
            # reload_files also has a prototype above its definition.
            if name == 'amiibo_scene_amiibo_detail_reload_files':
                text = text[text.index('static bool ' + name + '(app_amiibo_t *app) {'):]
            pieces.append(function(text, name))
    harness = Path(__file__).with_name('amiibo_file_errors_legacy.c.in' if baseline else 'amiibo_file_errors.c.in').read_text(encoding='utf-8')
    results = []
    with tempfile.TemporaryDirectory(prefix='pixl-file-errors-') as temp:
        folder = Path(temp)
        (folder / 'boards.h').write_text('', encoding='utf-8')
        source = folder / 'probe.c'
        source.write_text(harness.replace('@FUNCTIONS@', '\n'.join(pieces)), encoding='utf-8', newline='\n')
        binary = folder / ('probe.exe' if os.name == 'nt' else 'probe')
        cmd = shlex.split(os.environ.get('CC', 'gcc')) + ['-std=c11', '-O1', '-g', '-Wall', '-Wextra', '-Werror',
            '-Wno-unused-function', '-Wno-unused-parameter', '-Wno-pointer-to-int-cast',
            '-Wno-misleading-indentation', '-I', str(folder), '-I', str(root / 'application/src/mod/vfs')]
        if sanitize:
            cmd += ['-fsanitize=address,undefined', '-fno-omit-frame-pointer', '-fno-pie', '-no-pie']
        built = subprocess.run(cmd + [str(source), '-o', str(binary)], capture_output=True, text=True, timeout=60)
        assert built.returncode == 0, built.stdout + built.stderr
        for case in NEGATIVE_CASES if baseline else CASES:
            result = subprocess.run([str(binary), str(case)], capture_output=True, text=True, timeout=15)
            expected = 71 if baseline else 0
            assert result.returncode == expected, (case, result.returncode, result.stdout, result.stderr)
            if baseline:
                assert 'CHECK' in result.stderr
            assert 'AddressSanitizer' not in result.stderr and 'runtime error:' not in result.stderr
            results.append({'case': case, 'returncode': result.returncode, 'expected': expected, 'passed': True})
            print(('PASS negative DE328 case ' if baseline else 'PASS case ') + str(case))
    return results

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline-root', type=Path)
    parser.add_argument('--sanitize', action='store_true')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    before = hashes(FW)
    report = {'source_sha256': before, 'sanitize': args.sanitize, 'cases': run(FW, args.sanitize)}
    if args.baseline_root:
        report['negative_source_sha256'] = hashes(args.baseline_root)
        report['negative_control'] = run(args.baseline_root, args.sanitize, baseline=True)
    report['source_sha256_after'] = hashes(FW)
    assert report['source_sha256_after'] == before
    report['passed'] = True
    if args.output:
        args.output.mkdir(parents=True, exist_ok=True)
        (args.output / 'RESULTS.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    print('PASS 24 actual-C file-error cases; no RF/device test')
