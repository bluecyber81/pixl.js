"""Execute production progress-bar, settings callbacks and display setters in C.

No device. --baseline-proof checks that the old source fails the same bounds
and rendering regressions. Constructors are tested with each allocation failing.
"""
import argparse
import os
from pathlib import Path
import re
import shlex
import subprocess
import tempfile


def function(source, name):
    match = re.search(r'^(?:static )?(?:void|ret_code_t|int8_t) ' + re.escape(name) + r'\([^;]*?\)\s*\{', source, re.M)
    if not match:
        raise ValueError('Missing production function: ' + name)
    start = match.start()
    brace = source.index('{', start)
    depth, end = 1, brace + 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--cc', default=os.environ.get('CC', 'gcc'))
    parser.add_argument('--baseline-proof', action='store_true')
    parser.add_argument('--sanitize', action='store_true')
    args = parser.parse_args()
    source = args.source_root.resolve() / 'application/src'
    progress = source / 'mui/view/mui_progress_bar.c'
    header = progress.with_suffix('.h')
    u8g2 = (source / 'mui/mui_u8g2.c').read_text(encoding='utf-8')
    scenes = source / 'app/settings/scene'
    callbacks = '\n'.join(function((scenes / ('settings_scene_' + name + '.c')).read_text(encoding='utf-8'),
                                  'settings_scene_' + name + '_event_cb')
                          for name in ('lcd_backlight', 'oled_contrast'))
    harness = Path(__file__).with_name('progress_bar_host.c').read_text(encoding='utf-8')
    harness = harness.replace('/* ACTUAL_PROGRESS_HEADER */', re.sub(r'^#include .*$', '', header.read_text(encoding='utf-8'), flags=re.M))
    harness = harness.replace('/* ACTUAL_PROGRESS_SOURCE */', re.sub(r'^#include .*$', '', progress.read_text(encoding='utf-8'), flags=re.M))
    names = ['mui_u8g2_set_backlight_level', 'mui_u8g2_set_contrast_level']
    if 'backlight_pwm_duty_set' in u8g2:
        names = ['backlight_pwm_duty_set', 'mui_u8g2_get_backlight_level'] + names
    backlight_state = ''
    if 'backlight_level_apply' in u8g2:
        names.insert(1, 'backlight_level_apply')
        backlight_state = 'static bool m_backlight_preview_active, m_backlight_restore_pending, m_dimmed, m_dim_retry_pending;'
    harness = harness.replace('/* ACTUAL_BACKLIGHT_STATE */', backlight_state)
    contrast_source = (scenes / 'settings_scene_oled_contrast.c').read_text(encoding='utf-8')
    callbacks += '\n' + function(contrast_source, 'settings_scene_oled_contrast_on_enter')
    contrast_policy = (Path(__file__).resolve().parents[2] / 'application/src/mui/mui_contrast.h').read_text()
    harness = contrast_policy.replace('#include "boards.h"', '') + harness
    harness = harness.replace('/* ACTUAL_DISPLAY_SETTERS */', '\n'.join(function(u8g2, name) for name in names))
    harness = harness.replace('/* ACTUAL_SETTINGS_CALLBACKS */', callbacks)
    with tempfile.TemporaryDirectory(prefix='pixl-slider-') as directory:
        temp = Path(directory)
        cfile = temp / 'test.c'
        cfile.write_text(harness, encoding='utf-8')
        for board in ('LCD', 'OLED'):
            binary = temp / (board + ('.exe' if os.name == 'nt' else ''))
            command = shlex.split(args.cc) + ['-std=c11', '-O1', '-g', '-Wall', '-Wextra',
                '-Werror', '-Wno-unused-function', '-Wno-unused-parameter', '-D' + board + '_SCREEN']
            if args.sanitize:
                command += ['-fsanitize=address,undefined,float-cast-overflow', '-fno-sanitize-recover=all',
                            '-fno-omit-frame-pointer', '-fno-pie', '-no-pie']
            subprocess.run(command + [str(cfile), '-lm', '-o', str(binary)], check=True, timeout=60)
            if args.baseline_proof:
                scenarios = (0, 1, 2, 4) if board == 'LCD' else (2,)
            else:
                scenarios = range(6) if board == 'LCD' else (2, 5)
            for scenario in scenarios:
                result = subprocess.run([str(binary), str(scenario)], capture_output=True, text=True, timeout=15)
                if args.baseline_proof:
                    if result.returncode != 71 or 'FAIL' not in result.stderr:
                        raise AssertionError((board, scenario, result.returncode, result.stdout, result.stderr))
                    print('PASS baseline negative control', board, scenario, result.stderr.strip())
                else:
                    if result.returncode:
                        raise AssertionError((board, scenario, result.returncode, result.stdout, result.stderr))
                    print(result.stdout.strip())
    print('PASS production slider, settings/display bounds and allocation cleanup' + (' baseline proofs' if args.baseline_proof else ''))


if __name__ == '__main__':
    main()
