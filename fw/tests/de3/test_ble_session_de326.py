"""Actual NUS/GAP handlers and ble_work queue; mock radio/VFS-close boundary only.

No physical device access, duration stress, stack replacement, or simulated RF
proof. --report-dir binds results to exact production and test source hashes.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import tempfile
import unittest

FW = Path(__file__).resolve().parents[2]
BLE = FW / 'application/src/mod/ble'
HERE = Path(__file__).resolve().parent
CASES = ('discovery', 'duplicate_start', 'stopped_cleanup', 'stop_during_rx', 'reentrant_stop',
         'pending_cleanup', 'fast_resubscribe', 'observer_order', 'stale_handle',
         'reused_handle', 'disconnect_error', 'active_idle', 'legacy_modes', 'disabled',
         'join_release_contract', 'join_timeout', 'join_wrap', 'join_started_first', 'join_deadline_first', 'join_reused_handle',
         'join_stale_generation', 'join_disabled', 'join_other_mode', 'join_release_error',
         'join_30s_contract', 'join_gap_cancel', 'join_local_cancel', 'join_restores_three_minutes')
GLOBALS = ('m_conn_handle', 'm_nus_session_handle', 'm_release_handle', 'm_link_generation',
           'm_release_attempted', 'm_file_mode', 'm_sessions_enabled', 'm_advertising_active',
           'm_reported_link_state', 'm_link_state_handler', 'm_reported_status_state', 'm_status_state_handler', 'm_ble_initialized',
           'm_file_join_pending', 'm_file_join_tick', 'm_remote_mode', 'm_session_generation', 'm_timeout_overridden', 'm_file_link_handoff')


def function(source, name):
    match = re.search(r'^(?:static\s+)?(?:void|bool|ble_link_state_t|ret_code_t)\s+' + re.escape(name) + r'\([^;]*?\)\s*\{', source, re.M)
    assert match, name
    start = match.start(); end = source.index('{', start) + 1; depth = 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}'); end += 1
    return source[start:end]


def sources():
    files = [BLE / name for name in ('ble_main.c', 'ble_main.h', 'ble_work.c', 'ble_work.h')]
    files += [FW / 'application/config/sdk_config.h']
    files += [Path(__file__), HERE / 'ble_session_de326.c.in']
    return {str(p.relative_to(FW)).replace('\\', '/'): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}


def execute(sanitize=False, report_dir=None):
    before = sources(); ble = (BLE / 'ble_main.c').read_text(encoding='utf8')
    config = (FW / 'application/config/sdk_config.h').read_text(encoding='utf8')
    assert re.search(r'^#define APP_TIMER_CONFIG_RTC_FREQUENCY\s+1\s*$', config, re.M), 'RTC mock requires the release prescaler'
    work = (BLE / 'ble_work.c').read_text(encoding='utf8')
    work = re.sub(r'^#include[^\n]*\n', '', work, flags=re.M)
    declarations = '\n'.join(re.search(r'^static[^\n]*\b' + n + r'\b[^\n]*;[^\n]*', ble, re.M)[0] for n in GLOBALS)
    code = (HERE / 'ble_session_de326.c.in').read_text().replace('/* GLOBALS */', declarations)
    code = code.replace('/* ACTUAL_JOIN_TIMEOUT */', re.search(r'^#define BLE_FILE_JOIN_TIMEOUT_TICKS[^\n]*', ble, re.M)[0])
    code = code.replace('/* ACTUAL_WORK */', work)
    names = ('nus_data_handler', 'ble_file_join_poll', 'ble_release_stopped_session',
             'ble_process_pending', 'ble_link_state_get', 'ble_status_state_get', 'ble_stop_transport', 'ble_disable')
    code = code.replace('/* ACTUAL_BLE */', '\n'.join(function(ble, n) for n in names))
    connect = ble.split('case BLE_GAP_EVT_CONNECTED:', 1)[1].split('case BLE_GAP_EVT_DISCONNECTED:', 1)[0]
    disconnect = ble.split('case BLE_GAP_EVT_DISCONNECTED:', 1)[1].split('case BLE_GAP_EVT_PHY_UPDATE_REQUEST:', 1)[0]
    code = code.replace('/* CONNECT */', connect).replace('/* DISCONNECT */', disconnect)
    report = {'device_access': False, 'sanitizers': sanitize, 'source_sha256': before, 'cases': []}
    with tempfile.TemporaryDirectory(prefix='de326-nus-session-') as temporary:
        temp = Path(temporary); binary = temp / ('probe.exe' if os.name == 'nt' else 'probe')
        flags = shlex.split(os.environ.get('CC', 'gcc')) + ['-std=c11', '-O1', '-g', '-Wall', '-Wextra', '-Werror',
                 '-Wno-unused-function', '-Wno-unused-parameter', '-I', str(BLE)]
        if sanitize:
            flags += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all', '-fno-omit-frame-pointer', '-fno-pie', '-no-pie']
        cfile = temp / 'probe.c'; cfile.write_text(code, encoding='utf8')
        built = subprocess.run(flags + [str(cfile), '-o', str(binary)], capture_output=True, text=True, timeout=60)
        assert built.returncode == 0, built.stdout + built.stderr
        for case in CASES:
            ran = subprocess.run([str(binary), case], capture_output=True, text=True, timeout=10)
            report['cases'].append({'name': case, 'exit_code': ran.returncode, 'output': ran.stdout + ran.stderr})
            assert ran.returncode == 0, report['cases'][-1]
        # Keep the DE325 NUS handler exactly as shipped. Its absent STOPPED
        # handling must fail the same concrete pending-work cleanup contract.
        old_path = FW.parents[1] / 'allmiibo_de325_20261025/fw/application/src/mod/ble/ble_main.c'
        if old_path.exists():
            old = old_path.read_text(encoding='utf8')
            negative = code.replace(function(ble, 'nus_data_handler'), function(old, 'nus_data_handler'))
            old_connect = old.split('case BLE_GAP_EVT_CONNECTED:', 1)[1].split('case BLE_GAP_EVT_DISCONNECTED:', 1)[0]
            negative = negative.replace(connect, old_connect)
            cfile.write_text(negative, encoding='utf8')
            built = subprocess.run(flags + [str(cfile), '-o', str(binary)], capture_output=True, text=True, timeout=60)
            assert built.returncode == 0, built.stdout + built.stderr
            ran = subprocess.run([str(binary), 'stopped_cleanup'], capture_output=True, text=True, timeout=10)
            assert ran.returncode == 71, ran.stdout + ran.stderr
            report['negative_control'] = {'source': str(old_path), 'sha256': hashlib.sha256(old_path.read_bytes()).hexdigest(),
                                          'exit_code': ran.returncode, 'output': ran.stdout + ran.stderr}
        old_join_path = FW.parents[1] / 'allmiibo_de326_20261025/fw/application/src/mod/ble/ble_main.c'
        if old_join_path.exists():
            old = old_join_path.read_text(encoding='utf8')
            old_connect = old.split('case BLE_GAP_EVT_CONNECTED:', 1)[1].split('case BLE_GAP_EVT_DISCONNECTED:', 1)[0]
            negative = code.replace(function(ble, 'ble_process_pending'), function(old, 'ble_process_pending')).replace(connect, old_connect)
            # The old dispatcher predates the independent status subscriber.
            negative = re.sub(r'^static[^\n]*\b(?:m_status_state_handler|m_reported_status_state)\b[^\n]*;[^\n]*\n', '', negative, flags=re.M)
            cfile.write_text(negative, encoding='utf8')
            built = subprocess.run(flags + [str(cfile), '-o', str(binary)], capture_output=True, text=True, timeout=60)
            assert built.returncode == 0, built.stdout + built.stderr
            ran = subprocess.run([str(binary), 'join_release_contract'], capture_output=True, text=True, timeout=10)
            assert ran.returncode == 71, ran.stdout + ran.stderr
            report['join_negative_control'] = {'source': str(old_join_path), 'sha256': hashlib.sha256(old_join_path.read_bytes()).hexdigest(),
                                               'exit_code': ran.returncode, 'output': ran.stdout + ran.stderr}
        old_deadline_path = FW.parents[1] / 'allmiibo_de327_20261025/fw/application/src/mod/ble/ble_main.c'
        if old_deadline_path.exists():
            old = old_deadline_path.read_text(encoding='utf8')
            macro = re.search(r'^#define BLE_FILE_JOIN_TIMEOUT_TICKS[^\n]*', ble, re.M)[0]
            old_macro = re.search(r'^#define BLE_FILE_JOIN_TIMEOUT_TICKS[^\n]*', old, re.M)[0]
            negative = code.replace(macro, old_macro)
            cfile.write_text(negative, encoding='utf8')
            built = subprocess.run(flags + [str(cfile), '-o', str(binary)], capture_output=True, text=True, timeout=60)
            assert built.returncode == 0, built.stdout + built.stderr
            ran = subprocess.run([str(binary), 'join_30s_contract'], capture_output=True, text=True, timeout=10)
            assert ran.returncode == 71, ran.stdout + ran.stderr
            report['deadline_negative_control'] = {'source': str(old_deadline_path), 'sha256': hashlib.sha256(old_deadline_path.read_bytes()).hexdigest(),
                                                   'exit_code': ran.returncode, 'output': ran.stdout + ran.stderr}
    report['source_sha256_after'] = sources()
    assert before == report['source_sha256_after'], 'Sources changed during the run'
    report['passed'] = True
    report['limits'] = ['Actual production handlers/queue; radio, BLE common-state, timer and VFS-close mocked.',
                        'No OS-retained link or hardware advertising test; those require live confirmation.']
    if report_dir:
        report_dir.mkdir(parents=True, exist_ok=True)
        (report_dir / 'RESULTS.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
    negative_note = '; DE325 STOPPED handler rejected' if 'negative_control' in report else '; baseline absent, no negative control run'
    if 'join_negative_control' in report: negative_note += '; DE326 missing admission deadline rejected'
    if 'deadline_negative_control' in report: negative_note += '; DE327 late deadline rejected'
    print(f"PASS {len(CASES)} NUS session scenarios{negative_note}")
    return report


class SessionTests(unittest.TestCase):
    def test_real_session_lifecycle(self):
        execute(sanitize=bool(os.environ.get('BLE_SESSION_SANITIZE')))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sanitize', action='store_true')
    parser.add_argument('--report-dir', type=Path)
    args = parser.parse_args()
    execute(args.sanitize, args.report_dir)
