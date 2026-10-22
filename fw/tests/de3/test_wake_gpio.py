"""Actual shutdown chain and pinned SDK GPIO semantics; no device access.

Default: test this checkout. --source-root accepts an untouched baseline checkout.
PIXL_SANITIZE=1 or --sanitize enables host ASan/UBSan. --report preserves source
hashes, compile/runtime output and the distinction between compile and test failure.
"""
from pathlib import Path
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
import re
import subprocess
import tempfile

TESTS = Path(__file__).resolve().parent
FIXTURE = TESTS / 'wake_fixture'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def function(source, name):
    match = re.search(r'^[\w \*]+\b' + re.escape(name) + r'\([^;]*?\)\s*\{', source, re.M)
    if not match:
        raise ValueError('Function definition missing: ' + name)
    end = source.index('{', match.start()) + 1
    depth = 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[match.start():end]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, default=TESTS.parents[2])
    parser.add_argument('--report', type=Path)
    parser.add_argument('--sanitize', action='store_true')
    parser.add_argument('--cc', default=os.environ.get('CC', 'gcc'))
    args = parser.parse_args()
    if args.report and args.report.exists():
        raise SystemExit('Refusing to replace existing report')
    root = args.source_root.resolve()
    src = root / 'fw/application/src'
    sources = {name: (src / name).read_bytes() for name in (
        'main.c', 'mui/mui_core.c', 'mui/mui_input.c', 'mod/bsp_btn.c',
        'mod/bsp_btn.h', 'boards/board_lcd.h')}
    provenance = json.loads((FIXTURE / 'provenance.json').read_text(encoding='utf-8'))
    sdk = {}
    for name, info in provenance['files'].items():
        data = (FIXTURE / name).read_bytes()
        if sha(data) != info['fixture_sha256']:
            raise ValueError('SDK fixture hash mismatch: ' + name)
        sdk[name] = data.decode('utf-8')
    code = (TESTS / 'wake_gpio_host.c').read_text(encoding='utf-8')
    enums = re.findall(r'typedef enum\s*\{[^}]+\}\s*nrf_gpio_pin_\w+_t;', sdk['nrf_gpio.h'])
    if len(enums) != 5:
        raise ValueError('Expected exactly five SDK GPIO enum definitions')
    replacements = {
        'SDK_GPIO_CONSTANTS': sdk['gpio_bitfields.h'],
        'SDK_GPIO_ENUMS': '\n'.join(enums),
        'SDK_GPIO_FUNCTIONS': '\n'.join(function(sdk['nrf_gpio.h'], name) for name in (
            'nrf_gpio_pin_port_decode', 'nrf_gpio_cfg', 'nrf_gpio_cfg_input',
            'nrf_gpio_cfg_default', 'nrf_gpio_cfg_sense_set')),
        'SDK_GPIOTE_FUNCTIONS': '\n'.join(function(sdk['nrfx_gpiote.c'], name) for name in (
            'nrfx_gpiote_in_event_disable', 'nrfx_gpiote_in_uninit')),
        'SDK_BSP_FUNCTIONS': '\n'.join(function(sdk['bsp.c'], name) for name in (
            'wakeup_button_cfg', 'bsp_wakeup_button_enable')),
        'ACTUAL_BOARD_INCLUDE': sources['boards/board_lcd.h'].decode('utf-8'),
        'ACTUAL_BUTTON_INCLUDE': '#include "' + (src / 'mod/bsp_btn.c').as_posix() + '"',
        'ACTUAL_INPUT_DEINIT': function(sources['mui/mui_input.c'].decode('utf-8'), 'mui_input_deinit'),
        'ACTUAL_MUI_DEINIT': function(sources['mui/mui_core.c'].decode('utf-8'), 'mui_deinit'),
        'ACTUAL_SLEEP_ID': re.search(r'^#define BTN_ID_SLEEP\s+\d+.*$', sources['main.c'].decode('utf-8'), re.M).group(0),
        'ACTUAL_SHUTDOWN': function(sources['main.c'].decode('utf-8'), 'shutdown_handler'),
    }
    for name, value in replacements.items():
        marker = '/* ' + name + ' */'
        if code.count(marker) != 1:
            raise ValueError('Missing or repeated fixture marker: ' + marker)
        code = code.replace(marker, value)
    sanitize = args.sanitize or os.environ.get('PIXL_SANITIZE') == '1'
    report = dict(source_root=str(root), device_access=False, hardware_mocked=True,
                  physical_wakeup_tested=False, sdk_provenance=provenance,
                  source_sha256={name: sha(data) for name, data in sources.items()},
                  generated_translation_unit_sha256=sha(code.encode()), sanitized=sanitize)
    with tempfile.TemporaryDirectory(prefix='pixl-wake-gpio-') as temporary:
        folder = Path(temporary)
        (folder / 'mui_nav_diag.h').write_text('#pragma once\n#define mui_nav_diag_raw(key,type) ((void)(key),(void)(type))\n', encoding='utf-8')
        for name in ('app_button.h', 'app_timer.h', 'bsp.h', 'nrf_log.h', 'nrf_pwr_mgmt.h', 'nrf_drv_gpiote.h'):
            (folder / name).write_text('#pragma once\n', encoding='utf-8')
        cfile = folder / 'wake.c'
        binary = folder / ('wake.exe' if os.name == 'nt' else 'wake')
        cfile.write_text(code, encoding='utf-8')
        command = [args.cc, '-std=c11', '-O1', '-g', '-Wall', '-Wextra', '-Werror',
                   '-Wno-unused-function', '-I', str(folder)]
        if sanitize:
            command += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all', '-fno-omit-frame-pointer']
            if os.name != 'nt':
                command += ['-no-pie']
        command += [str(cfile), '-o', str(binary)]
        built = subprocess.run(command, capture_output=True, text=True, timeout=60)
        report['compile'] = dict(command=command, exit_code=built.returncode, stdout=built.stdout, stderr=built.stderr)
        if built.returncode == 0:
            try:
                ran = subprocess.run([str(binary)], capture_output=True, text=True, timeout=30)
                report['run'] = dict(exit_code=ran.returncode, stdout=ran.stdout, stderr=ran.stderr)
            except (OSError, subprocess.TimeoutExpired) as error:
                report['run'] = dict(exit_code=-1, stdout='', stderr=str(error), infrastructure_error=True)
        else:
            report['run'] = None
    report['sources_unchanged'] = all((src / name).read_bytes() == data for name, data in sources.items())
    report['passed'] = (report['sources_unchanged'] and built.returncode == 0 and report['run']['exit_code'] == 0)
    report['finished_utc'] = datetime.now(timezone.utc).isoformat()
    print(built.stdout + built.stderr, end='')
    if report['run']:
        print(report['run']['stdout'] + report['run']['stderr'], end='')
    if args.report:
        args.report.parent.mkdir(exist_ok=True, parents=True)
        args.report.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
