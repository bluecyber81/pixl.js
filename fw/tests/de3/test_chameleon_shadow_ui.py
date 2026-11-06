"""Actual-C tests: SHADOW_REQ displays/focuses as Shadow without altering state.

The actual MIFARE setter/getter/save callback and slot-switch implementation
remain unmodified. Only UI containers, storage I/O and card-size calculation
are mocked. Offline only; no BLE, NFC, firmware build or device access.
"""
from pathlib import Path
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
sys.dont_write_bytecode = True
from test_chameleon_write_mode import extract, sha, MODE, EMU, MF1, MF1_H

HELPER = 'application/src/app/chameleon/port/tag_helper.c'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--mode-source', type=Path)
    parser.add_argument('--helper-source', type=Path)
    parser.add_argument('--sanitize', action='store_true')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    paths = {name: args.source_root / name for name in (MODE, HELPER, EMU, MF1, MF1_H)}
    if args.mode_source:
        paths[MODE] = args.mode_source
    if args.helper_source:
        paths[HELPER] = args.helper_source
    raw = {name: path.read_bytes() for name, path in paths.items()}
    src = {name: data.decode('utf-8') for name, data in raw.items()}
    enum = re.search(r'typedef enum\s*\{\s*NFC_TAG_MF1_WRITE_NORMAL[\s\S]*?\}\s*nfc_tag_mf1_write_mode_t\s*;', src[MF1_H])
    table = re.search(r'(?:const static|static const) uint32_t mf1_write_mode_names\[4\]\s*=\s*\{[\s\S]*?\};', src[HELPER])
    if enum is None or table is None:
        raise ValueError('Actual enum/name table not found')
    functions = '\n\n'.join([
        extract(src[EMU], 'tag_emulation_get_slot'),
        extract(src[EMU], 'tag_emulation_set_slot'),
        extract(src[EMU], 'tag_emulation_change_slot'),
        extract(src[MF1], 'nfc_tag_mf1_set_write_mode'),
        extract(src[MF1], 'nfc_tag_mf1_get_write_mode'),
        extract(src[MF1], 'nfc_tag_mf1_data_savecb'),
        table.group(),
        extract(src[HELPER], 'tag_helper_get_mf_write_mode_name'),
        extract(src[MODE], 'chameleon_scene_menu_card_write_mode_select_on_event'),
        extract(src[MODE], 'chameleon_scene_menu_card_write_mode_select_on_enter'),
        extract(src[MODE], 'chameleon_scene_menu_card_write_mode_select_on_exit'),
    ])
    fixture = Path(__file__).with_name('chameleon_shadow_ui.c.in')
    fixture_raw = fixture.read_bytes()
    code = fixture_raw.decode('utf-8').replace('@ACTUAL_ENUM@', enum.group()).replace('@ACTUAL_FUNCTIONS@', functions)
    scenarios = [(f'name_state_{state}', ['name', str(state)]) for state in range(6)]
    scenarios += [(f'focus_state_{state}', ['focus', str(state)]) for state in range(5)]
    scenarios += [(f'select_slot_{slot}_mode_{mode}', ['select', str(mode), str(slot)])
                  for slot in (7, 49) for mode in range(4)]
    scenarios += [(f'save_contract_state_{state}', ['save', str(state)]) for state in range(5)]
    scenarios += [(f'shadow_reopen_slot_{slot}', ['reopen', '4', str(slot)]) for slot in (7, 49)]
    compiler = shutil.which('gcc')
    if not compiler:
        raise RuntimeError('Existing gcc unavailable')
    report = {'scope': __doc__, 'sanitize': args.sanitize,
              'source_root': str(args.source_root.resolve()),
              'source_sha256': {name: sha(data) for name, data in raw.items()},
              'test_sha256': sha(Path(__file__).read_bytes()),
              'extraction_helper_sha256': sha(Path(__file__).with_name('test_chameleon_write_mode.py').read_bytes()),
              'fixture_sha256': sha(fixture_raw), 'generated_c_sha256': sha(code.encode()), 'results': [],
              'limitations': ['Host tests use real selected C functions with UI/storage mocks.',
                             'Card-size calculation is a fixed sentinel; NFC RF and hardware are not tested.',
                             'The source-root slot fix is a prerequisite for combined selection tests.']}
    with tempfile.TemporaryDirectory(prefix='pixl-shadow-ui-') as tmp:
        tmp = Path(tmp)
        source = tmp / 'test.c'
        binary = tmp / ('test.exe' if os.name == 'nt' else 'test')
        source.write_text(code, encoding='utf-8')
        # The unchanged upstream name table uses 'const static' declaration order.
        cmd = [compiler, '-std=c11', '-Wall', '-Wextra', '-Werror', '-Wno-unused-parameter',
               '-Wno-unused-function', '-Wno-old-style-declaration', '-O1', '-g']
        if args.sanitize:
            cmd += ['-fsanitize=address,undefined', '-fno-omit-frame-pointer', '-fno-pie', '-no-pie']
        cmd += [str(source), '-o', str(binary)]
        build = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        report['build'] = {'command': cmd, 'exit_code': build.returncode, 'output': build.stdout + build.stderr}
        if build.returncode == 0:
            for name, params in scenarios:
                run_cmd = [str(binary), *params]
                run = subprocess.run(run_cmd, capture_output=True, text=True, timeout=10)
                report['results'].append({'scenario': name, 'command': run_cmd, 'exit_code': run.returncode,
                                          'stdout': run.stdout, 'stderr': run.stderr})
    report['source_unchanged'] = all(path.read_bytes() == raw[name] for name, path in paths.items())
    report['passed_scenarios'] = sum(row['exit_code'] == 0 for row in report['results'])
    report['scenario_count'] = len(scenarios)
    report['passed'] = (report['source_unchanged'] and report['build']['exit_code'] == 0
                        and len(report['results']) == len(scenarios)
                        and all(row['exit_code'] == 0 and 'PASS' in row['stdout'] for row in report['results']))
    if args.report:
        with args.report.open('x', encoding='utf-8') as file:
            json.dump(report, file, indent=2)
    print(json.dumps({key: report[key] for key in ('passed', 'passed_scenarios', 'scenario_count', 'source_unchanged')}
                     | {'build_exit': report['build']['exit_code'], 'report': str(args.report)}))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
