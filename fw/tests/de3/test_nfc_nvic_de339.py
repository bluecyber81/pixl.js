"""Actual NFC stop + pinned Nordic critical-mask lifecycle, with negative control.

No live hardware. The fixture models NVIC W1S/W1C register side effects, rather
than treating critical sections as no-ops. Set PIXL_SANITIZE=1 for ASan/UBSan.
"""
from pathlib import Path
import hashlib
import os
import re
import shutil
import subprocess
import tempfile


def function(source, name):
    matches = list(re.finditer(r'(?m)^[^\n;{}]*\b' + re.escape(name) + r'\s*\([^;{}]*\)\s*\{', source))
    match = matches[-1]
    opening = source.index('{', match.start())
    depth = 1
    for i in range(opening + 1, len(source)):
        depth += (source[i] == '{') - (source[i] == '}')
        if not depth:
            return source[match.start():i + 1]
    raise ValueError(name)


def main():
    tests = Path(__file__).resolve().parent
    fw = tests.parents[1]
    hal = (fw / 'application/src/hal/hal_nfc_t2t.c').read_text(encoding='utf-8')
    header_path = tests / 'nfc_nvic_fixture/nrf_nvic.h'
    assert hashlib.sha256(header_path.read_bytes()).hexdigest() == '555417cf107cab5569878ee4f8b1d91e783b55dddc7e2900e204f624e107d7ef'
    header = header_path.read_text(encoding='utf-8')
    actual = '\n\n'.join(function(hal, name) for name in [
        'nrf_nfct_clock_event_handler', 'hal_nfc_events_clear', 'hal_nfc_stop',
        'hal_nfc_start', 'hal_nfc_set_nrfx_irq_enable', 'hal_nfc_re_setup',
        'hal_nfc_field_check', 'nrf_nfct_field_event_handler', 'TIMER4_IRQHandler'])
    sdk = '\n\n'.join(function(header, name) for name in [
        'sd_nvic_EnableIRQ', 'sd_nvic_DisableIRQ',
        'sd_nvic_critical_region_enter', 'sd_nvic_critical_region_exit'])
    template = (tests / 'nfc_nvic_de339.c.in').read_text(encoding='utf-8').replace('/* SDK_NVIC_FUNCTIONS */', sdk)
    old = actual.replace('(void)sd_nvic_DisableIRQ(NFCT_IRQn);', 'NVIC_DisableIRQ(NFCT_IRQn);')
    old = old.replace('(void)sd_nvic_DisableIRQ(TIMER4_IRQn);', 'NVIC_DisableIRQ(TIMER4_IRQn);')
    assert old != actual, 'Expected both production mask-safe disables for this regression'
    cc = shutil.which('gcc')
    if not cc:
        raise RuntimeError('An existing gcc is required; tests are not skipped')
    with tempfile.TemporaryDirectory(prefix='pixl-nfc-nvic-') as directory:
        for name, source, expected in [('current', actual, True), ('negative_control', old, False)]:
            path = Path(directory) / (name + '.c')
            exe = path.with_suffix('.exe' if os.name == 'nt' else '')
            path.write_text(template.replace('/* ACTUAL_SOURCE */', source), encoding='utf-8')
            command = [cc, '-std=c11', '-O1', '-g', '-Wall', '-Wextra', '-Werror', '-Wno-unused-parameter']
            if os.environ.get('PIXL_SANITIZE') == '1':
                command += ['-fsanitize=address,undefined', '-fno-omit-frame-pointer']
                if os.name != 'nt':
                    command += ['-fno-pie', '-no-pie']
            subprocess.run(command + [str(path), '-o', str(exe)], check=True, timeout=60)
            result = subprocess.run([str(exe)], text=True, capture_output=True, timeout=30)
            if expected:
                assert result.returncode == 0, result.stdout + result.stderr
                print(result.stdout, end='')
            else:
                assert result.returncode != 0 and '!enabled[0] && !enabled[1]' in result.stderr, result.stdout + result.stderr
                print('PASS negative control: raw IRQ disable is restored by the SDK critical-region mask')
    print('PASS DE3.39 actual NFC/Nordic NVIC integration')


if __name__ == '__main__':
    main()
