"""Portable actual-C BL6 regressions. Requires Python 3 and GCC/Clang on PATH.

SDK callbacks are mocks; this does not flash or access Bluetooth hardware.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'fw/bootloader/src'


def block(source, marker):
    start = source.index(marker)
    end = source.index('{', start) + 1
    depth = 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end]


def function(source, name):
    match = re.search(r'^(?:static\s+)?(?:void|bool|ret_code_t)\s+' + re.escape(name) + r'\([^;]*?\)\s*\{', source, re.M)
    if match is None:
        raise RuntimeError('Missing actual function: ' + name)
    return block(source, source[match.start():match.end() - 1])


def transport_source():
    source = (SRC / 'sdk/nrf_dfu_ble.c').read_text(encoding='utf-8')
    before, after = (ROOT / 'tests/transport_harness.c').read_text(encoding='utf-8').split('/* GENERATED_FUNCTIONS */')
    body = source[:source.index('#include')] + '\n#define CANDIDATE 1\n#define RUN_FINAL_ACK_TESTS 1\n' + before
    start = source.index('#define DFU_RESPONSE_QUEUE_SIZE')
    body += source[start:source.index('static ble_gap_conn_params_t', start)]
    for marker in ['static void response_session_reset(', 'static void * response_context_get(',
                   'static void response_fail_locked(', 'static void response_flush_locked(', 'static void response_send(',
                   'bool nrf_dfu_ble_response_pending(', 'static bool is_cccd_configured(', 'static uint32_t response_prepare(',
                   'static uint32_t response_select_obj_add(', 'static uint32_t response_crc_add(',
                   'static uint32_t response_ext_err_payload_add(', 'static void ble_dfu_req_handler_callback(',
                   'static uint16_t ctrl_pt_write_status(', 'static uint32_t on_ctrl_pt_write(',
                   'static bool on_rw_authorize_req(', 'static void on_flash_write(', 'static void on_write(']:
        body += block(source, marker) + '\n'
    body += 'static void dispatch_event(ble_evt_t const * p_ble_evt) { uint32_t err_code; ble_gap_evt_t const * p_gap=&p_ble_evt->evt.gap_evt; switch(p_ble_evt->header.evt_id) {\n'
    for case in ['BLE_GAP_EVT_CONNECTED', 'BLE_GAP_EVT_DISCONNECTED', 'BLE_GATTS_EVT_HVN_TX_COMPLETE',
                 'BLE_GATTS_EVT_RW_AUTHORIZE_REQUEST']:
        if 'case ' + case + ':' in source:
            body += block(source, 'case ' + case + ':') + ' break;\n'
    return body + 'default: break; } }\n' + after


def completion_source():
    boot = (SRC / 'sdk/nrf_bootloader.c').read_text(encoding='utf-8')
    req = (SRC / 'sdk/nrf_dfu_req_handler.c').read_text(encoding='utf-8')
    production = ''
    for name, source in [('m_final_reset_ready', boot), ('m_final_reset_expired', boot),
                         ('g_dfu_finalizing', req), ('g_dfu_final_success', req)]:
        production += re.search(r'^(?:static )?volatile bool ' + name + r';', source, re.M)[0] + '\n'
    loop = function(boot, 'loop_forever')
    if not loop.index('app_sched_execute();') < loop.index('final_reset_process();') < loop.index('wait_for_event();'):
        raise RuntimeError('Final reset must run after scheduler processing and before wait.')
    boot_names = ['reset_now', 'final_reset_timeout', 'nrf_dfu_completion_start', 'do_reset', 'final_reset_process',
                  'bootloader_reset', 'inactivity_timeout', 'dfu_observer']
    req_names = ['discard_final_request', 'on_dfu_complete', 'on_data_obj_execute_request_sched',
                 'on_data_obj_execute_request', 'nrf_dfu_req_handler_req_process', 'nrf_dfu_req_handler_req',
                 'nrf_dfu_req_handler_on_req']
    production += '\n'.join(function(boot, name) for name in boot_names)
    production += '\n' + '\n'.join(function(req, name) for name in req_names)
    return (ROOT / 'tests/final_execute_harness.c').read_text(encoding='utf-8').replace('/* ACTUAL_SOURCE */', production)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cc', default=os.environ.get('CC', 'gcc'))
    parser.add_argument('--sanitize', action='store_true', help='Use AddressSanitizer and UBSan (Linux compiler/runtime required).')
    parser.add_argument('--out', type=Path, default=ROOT / '_host-tests')
    args = parser.parse_args()
    compiler = shutil.which(args.cc)
    if compiler is None:
        raise SystemExit('C compiler not found; set --cc or CC.')
    args.out.mkdir(parents=True, exist_ok=True)
    runs = []
    report = {'passed': False, 'deviceAccess': False, 'sanitizers': args.sanitize, 'runs': runs,
              'limits': ['Selected actual C functions with synthetic SDK types and mocked hardware callbacks.',
                         'No RF delivery, actual flash timing, power-loss or hardware reboot test.',
                         'Historical BL4/BL5 negative controls are not included in this portable subset.']}
    flags = ['-std=c11', '-O1', '-g', '-Wall', '-Wextra', '-Werror', '-Wno-unused-function',
             '-Wno-unused-variable', '-Wno-unused-parameter', '-Wno-misleading-indentation', '-I' + str(SRC)]
    if args.sanitize:
        flags += ['-fsanitize=address,undefined', '-fno-omit-frame-pointer', '-fno-pie', '-no-pie']
    def run(command):
        result = subprocess.run([str(x) for x in command], capture_output=True, text=True, timeout=120)
        runs.append({'arguments': [Path(str(x)).name if Path(str(x)).is_absolute() else str(x) for x in command],
                     'exitCode': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr})
        if result.returncode:
            raise RuntimeError(result.stdout + result.stderr)
        return result.stdout
    try:
        for name, body in [('transport', transport_source()), ('completion', completion_source())]:
            source = args.out / (name + '.c')
            executable = args.out / (name + ('.exe' if os.name == 'nt' else ''))
            source.write_text(body, encoding='utf-8', newline='\n')
            run([compiler, *flags, source, '-o', executable])
            if name == 'transport':
                if 'checks=221 failures=0' not in run([executable]):
                    raise RuntimeError('Unexpected transport assertion count.')
            else:
                cases = ['sync_ack', 'timeout', 'deactivate_validation', 'async_flash', 'flash_not_idle_after_ready',
                         'terminal_requests', 'validation_failure', 'settings_immediate_error', 'early_reset',
                         'ordinary_events', 'partial_execute', 'commit_callback_missing', 'backup_callback_missing',
                         'commit_timeout_flash_busy', 'commit_timeout_then_callback', 'invalid_commit_callback_missing',
                         'settings_immediate_error_flash_busy', 'stale_timer_during_rearm']
                for case in cases:
                    run([executable, case])
        report.update(passed=True, transportAssertions=221, completionScenarios=18)
        report['sourceSha256'] = {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                                 for p in sorted((ROOT / 'fw').rglob('*')) if p.is_file()}
    finally:
        (args.out / 'RESULTS.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print('PASS: 221 transport assertions and 18 final-Execute scenarios; host mocks only.')


if __name__ == '__main__':
    main()
