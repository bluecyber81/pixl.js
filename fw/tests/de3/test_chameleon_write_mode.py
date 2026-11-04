"""Offline actual-C regression for a write-mode menu accidentally selecting slots.

Extracts the real menu callbacks, tag slot-switch implementation and MIFARE
write-mode setter/getter. Only UI containers and storage/peripheral operations
are modelled. No firmware build, BLE, NFC, or device operations.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile

MODE = 'application/src/app/chameleon/scene/chameleon_scene_menu_card_write_mode_select.c'
SLOT = 'application/src/app/chameleon/scene/chameleon_scene_menu_card_slot_select.c'
EMU = 'components/chameleon-ultra/firmware/application/src/rfid/nfctag/tag_emulation.c'
MF1 = 'components/chameleon-ultra/firmware/application/src/rfid/nfctag/hf/nfc_mf1.c'
MF1_H = 'components/chameleon-ultra/firmware/application/src/rfid/nfctag/hf/nfc_mf1.h'


def extract(text, name):
    match = re.search(r'^[\w \t*]+\b' + re.escape(name) + r'\s*\([^;]*?\)\s*\{', text, re.M)
    if match is None:
        raise ValueError('Function missing: ' + name)
    opened = text.index('{', match.start())
    depth = 0
    for end in range(opened, len(text)):
        depth += (text[end] == '{') - (text[end] == '}')
        if depth == 0:
            return text[match.start():end + 1]
    raise ValueError('Unclosed function: ' + name)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, default=Path(__file__).resolve().parents[2], help='Firmware fw/ directory')
    parser.add_argument('--mode-source', type=Path, help='Isolated proposed menu file; otherwise source-root file')
    parser.add_argument('--sanitize', action='store_true')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    paths = {name: args.source_root / name for name in (MODE, SLOT, EMU, MF1, MF1_H)}
    if args.mode_source:
        paths[MODE] = args.mode_source
    raw = {name: path.read_bytes() for name, path in paths.items()}
    src = {name: data.decode('utf-8') for name, data in raw.items()}
    enum = re.search(r'typedef enum\s*\{\s*NFC_TAG_MF1_WRITE_NORMAL[\s\S]*?\}\s*nfc_tag_mf1_write_mode_t\s*;', src[MF1_H])
    if enum is None:
        raise ValueError('Actual write-mode enum missing')
    functions = '\n\n'.join([
        extract(src[EMU], 'tag_emulation_get_slot'),
        extract(src[EMU], 'tag_emulation_set_slot'),
        extract(src[EMU], 'tag_emulation_change_slot'),
        extract(src[MF1], 'nfc_tag_mf1_set_write_mode'),
        extract(src[MF1], 'nfc_tag_mf1_get_write_mode'),
        extract(src[MODE], 'chameleon_scene_menu_card_write_mode_select_on_event'),
        extract(src[MODE], 'chameleon_scene_menu_card_write_mode_select_on_enter'),
        extract(src[MODE], 'chameleon_scene_menu_card_write_mode_select_on_exit'),
        extract(src[SLOT], 'chameleon_scene_menu_card_slot_select_on_event'),
    ])
    fixture_path = Path(__file__).with_name('chameleon_write_mode.c.in')
    fixture_raw = fixture_path.read_bytes()
    code = fixture_raw.decode('utf-8').replace('@ACTUAL_ENUM@', enum.group()).replace('@ACTUAL_FUNCTIONS@', functions)
    compiler = shutil.which('gcc')
    if not compiler:
        raise RuntimeError('Existing gcc not found')
    scenarios = [(f'mode_slot_{slot}_mode_{mode}', ['mode', str(slot), str(mode)])
                 for slot in (0, 1, 2, 3, 7, 49) for mode in range(4)]
    scenarios += [(f'back_slot_{slot}', ['back', str(slot)]) for slot in (0, 7, 49)]
    scenarios += [(f'real_slot_selector_{slot}', ['slot', str(slot)]) for slot in (0, 3, 49)]
    scenarios += [(failure, [failure]) for failure in ('save_error', 'load_error')]
    scenarios += [('menu_exit_cleanup', ['exit'])]
    report = {'scope': __doc__, 'sanitize': args.sanitize,
              'source_root': str(args.source_root.resolve()),
              'source_sha256': {name: sha(data) for name, data in raw.items()},
              'test_sha256': sha(Path(__file__).read_bytes()), 'fixture_sha256': sha(fixture_raw),
              'generated_c_sha256': sha(code.encode()), 'results': [],
              'limitations': ['Storage read/write and UI container functions are deterministic mocks.',
                             'No physical NFC reader, power-loss, hardware, or display test.',
                             'The separately observed SHADOW_REQ display/focus issue is not modified by this patch.']}
    with tempfile.TemporaryDirectory(prefix='pixl-chameleon-mode-') as temp:
        folder = Path(temp)
        cfile, binary = folder / 'test.c', folder / ('test.exe' if os.name == 'nt' else 'test')
        cfile.write_text(code, encoding='utf-8')
        cmd = [compiler, '-std=c11', '-Wall', '-Wextra', '-Werror', '-Wno-unused-parameter',
               '-Wno-unused-function', '-O1', '-g']
        if args.sanitize:
            cmd += ['-fsanitize=address,undefined', '-fno-omit-frame-pointer', '-fno-pie', '-no-pie']
        cmd += [str(cfile), '-o', str(binary)]
        build = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        report['build'] = {'command': cmd, 'exit_code': build.returncode, 'output': build.stdout + build.stderr}
        if build.returncode == 0:
            for name, values in scenarios:
                run_cmd = [str(binary), *values]
                run = subprocess.run(run_cmd, capture_output=True, text=True, timeout=10)
                report['results'].append({'scenario': name, 'command': run_cmd, 'exit_code': run.returncode,
                                          'stdout': run.stdout, 'stderr': run.stderr})
    report['source_unchanged'] = all(path.read_bytes() == raw[name] for name, path in paths.items())
    report['passed'] = (report['source_unchanged'] and report['build']['exit_code'] == 0
                        and len(report['results']) == len(scenarios)
                        and all(row['exit_code'] == 0 and 'PASS' in row['stdout'] for row in report['results']))
    report['scenario_count'] = len(scenarios)
    report['passed_scenarios'] = sum(row['exit_code'] == 0 for row in report['results'])
    if args.report:
        with args.report.open('x', encoding='utf-8') as file:
            json.dump(report, file, indent=2)
    print(json.dumps({'passed': report['passed'], 'passed_scenarios': report['passed_scenarios'],
                      'scenario_count': report['scenario_count'], 'build_exit': report['build']['exit_code'],
                      'source_unchanged': report['source_unchanged'], 'report': str(args.report)}))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
