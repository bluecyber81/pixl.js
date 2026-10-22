"""Offline DE3 battery/storage/status regression tests against actual source C.
No device, BLE, backups or network; only temporary host executables are created.
Usage: python test_storage_battery.py [--cc gcc] [--sanitize]
"""
import argparse
import os
from pathlib import Path
import re
import shlex
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cc', default=os.environ.get('CC', 'gcc'))
    parser.add_argument('--sanitize', action='store_true')
    args = parser.parse_args()
    tests = Path(__file__).resolve().parent
    src = tests.parents[1] / 'application/src'
    suites = {
        'battery': ('battery_host.c', 'bat.c', 'ACTUAL_BATTERY_INCLUDE'),
        'storage': ('storage_ui_host.c', 'app/settings/scene/settings_scene_storage.c', 'ACTUAL_STORAGE_INCLUDE'),
        'status': ('status_bar_host.c', 'app/status_bar/view/status_bar_view.c', 'ACTUAL_STATUS_INCLUDE'),
    }
    labels = sorted(set(re.findall(r'\b_L_[A-Z0-9_]+', '\n'.join(
        (src / entry[1]).read_text(encoding='utf-8-sig') for entry in suites.values()))))
    with tempfile.TemporaryDirectory(prefix='pixl-de3-storage-battery-') as tmp:
        temp = Path(tmp)
        (temp / 'i18n').mkdir()
        (temp / 'i18n/language.h').write_text('#pragma once\n' + ''.join(
            f'#define {name} "{name}"\n' for name in labels), encoding='utf-8')
        for name in ('app_error.h','app_timer.h','boards.h','nrf_drv_saadc.h','nrf_gpio.h',
                     'settings.h','app_settings.h','mui_list_view.h','nrf_log.h',
                     'mui_include.h','app_status_bar.h','mui_u8g2.h'):
            (temp / name).write_text('', encoding='utf-8')
        for name, (harness, actual, placeholder) in suites.items():
            code = (tests / harness).read_text(encoding='utf-8-sig').replace(
                f'/* {placeholder} */', f'#include "{(src / actual).as_posix()}"')
            cfile = temp / (name + '.c')
            exe = temp / (name + ('.exe' if os.name == 'nt' else ''))
            cfile.write_text(code, encoding='utf-8')
            command = shlex.split(args.cc) + ['-std=c11', '-O1', '-g', '-Wall', '-Wextra',
                '-Werror', '-Wno-unused-parameter', '-Wno-unused-function', '-I', str(temp),
                '-I', str(src), '-I', str(src / 'mod/vfs')]
            if args.sanitize:
                command += ['-fsanitize=address,undefined', '-fno-omit-frame-pointer']
            subprocess.run(command + [str(cfile), '-o', str(exe)], check=True, timeout=60)
            subprocess.run([str(exe)], check=True, timeout=45)
        # Verify real glyph data and font metrics, not mocked character widths.
        u8g2 = tests.parents[1] / 'components/u8g2/csrc'
        exe = temp / ('font.exe' if os.name == 'nt' else 'font')
        # Exact font source, relocated only so its board UI include uses the stub.
        (temp / 'mui_u8g2.h').write_text('#include "u8g2.h"\n', encoding='utf-8')
        font_source = temp / 'font_data.c'
        font_source.write_bytes((src / 'mui/u8g2_font_likeminecraft_te.c').read_bytes())
        command = shlex.split(args.cc) + ['-std=c11','-O1','-g','-ffunction-sections',
            '-fdata-sections','-Wl,--gc-sections','-I',str(temp),'-I',str(u8g2)]
        if args.sanitize:
            command += ['-fsanitize=address,undefined','-fno-omit-frame-pointer']
        subprocess.run(command + [str(tests / 'battery_font_host.c'),
            str(u8g2 / 'u8g2_font.c'), str(u8g2 / 'u8x8_8x8.c'),
            str(u8g2 / 'u8g2_kerning.c'),
            str(font_source), '-o', str(exe)], check=True, timeout=60)
        subprocess.run([str(exe)], check=True, timeout=45)
    print('PASS DE3 actual-source battery, storage UI and status-bar suites')


if __name__ == '__main__':
    main()
