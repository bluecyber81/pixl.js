"""Player lifetime tests with actual Nordic timer C and controlled platform edges.

No device access, electrical timing, or full RTC scheduler proof. --baseline
compares preserved DE3.19 source, with expected failures on the original defects.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
FW = HERE.parents[1]
spec = importlib.util.spec_from_file_location('player_fixture', HERE.parent / 'de2/test_player_v3.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)

MEMORY = r'''
static struct { uintptr_t address; size_t size; bool live; } regions[64];
static unsigned regions_used, ui_updates;
static bool pointer_was_freed(void *p) {
 uintptr_t address = (uintptr_t)p;
 for (unsigned i = regions_used; i; i--) {
  if (address >= regions[i-1].address && address - regions[i-1].address < regions[i-1].size)
   return !regions[i-1].live;
 }
 return false;
}
static void *mui_mem_malloc(size_t n) {
 if (allocation_fail) return NULL; assert(regions_used < 64);
 void *p = malloc(n); assert(p); allocations++;
 regions[regions_used].address = (uintptr_t)p; regions[regions_used].size = n;
 regions[regions_used++].live = true; return p;
}
static void mui_mem_free(void *p) {
 if (!p) return;
 for (unsigned i = regions_used; i; i--) if (regions[i-1].address == (uintptr_t)p && regions[i-1].live) {
  regions[i-1].live = false; frees++; free(p); return;
 }
 assert(!"untracked allocation");
}
'''

def build_stubs(temp, sdk):
    mui = fixture.STUB_MUI
    start = mui.index('static void *mui_mem_malloc')
    end = mui.index('static mui_view_t *mui_view_create', start)
    mui = mui[:start] + MEMORY + mui[end:]
    mui = mui.replace('static void mui_update(void *p) {(void)p;}',
                      'static void mui_update(void *p) {(void)p;ui_updates++;}')
    for name, body in {'mui_include.h': mui, 'app_timer.h': (HERE / 'player_timer_sdk_stub.h').read_text(),
                       'boards.h': '', 'nrf_log.h': '', 'i18n/language.h': '#define _T(x) #x\n',
                       'nrf_pwr_mgmt.h': 'static void nrf_pwr_mgmt_feed(void) {}\n'}.items():
        out = temp / name; out.parent.mkdir(parents=True, exist_ok=True); out.write_text(body)
    text = sdk.read_text()
    bodies = []
    for name in ['timer_req_schedule', 'app_timer_create', 'app_timer_start', 'app_timer_stop',
                 'timer_req_process', 'timer_expire']:
        body = fixture.function(text, name)
        if name == 'app_timer_create':
            body = body.replace('app_timer_create(', 'sdk_app_timer_create(', 1)
        bodies.append(body)
    wrapper = r'''
static ret_code_t app_timer_create(app_timer_id_t const *id, app_timer_mode_t mode, app_timer_timeout_handler_t cb) {
 create_calls++; last_timer = *id;
 if (fail_create) return NRF_ERROR_NO_MEM;
 return sdk_app_timer_create(id, mode, cb);
}
'''
    (temp / 'sdk_timer_functions.h').write_text((HERE / 'player_timer_sdk_edges.h').read_text() +
                                               '\n' + '\n'.join(bodies) + wrapper)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk', required=True, type=Path)
    parser.add_argument('--baseline', type=Path)
    parser.add_argument('--sanitize', action='store_true')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    report = {'passed': False, 'device_access': False, 'sanitize': args.sanitize,
              'sdk_sha256': hashlib.sha256(args.sdk.read_bytes()).hexdigest(), 'cases': []}
    modes = ['init_once', 'delayed_stop', 'late_callback', 'queued_recreate', 'competing_view',
             'start_queue_full', 'stop_queue_full', 'stop_queue_full_recreate', 'irq_teardown', 'create_failure']
    with tempfile.TemporaryDirectory(prefix='player-lifetime-') as td:
        temp = Path(td); build_stubs(temp, args.sdk)
        for label, fw in [('candidate', FW)] + ([('baseline', args.baseline)] if args.baseline else []):
            src = fw / 'application/src'; player = src / 'app/player/view'
            report[label + '_source_sha256'] = {name: hashlib.sha256((player / name).read_bytes()).hexdigest()
                                                 for name in ('player_view.c', 'player_view.h')}
            for suite in ('timer', 'close'):
                code = (HERE / ('player_timer_host.c' if suite == 'timer' else 'player_close_host.c')).read_text()
                if suite == 'close':
                    # This harness uses the simpler existing timer fixture; close behavior is independent.
                    close_folder = temp / 'close'; close_folder.mkdir(exist_ok=True)
                    (close_folder / 'app_timer.h').write_text(fixture.STUB_TIMER)
                    (close_folder / 'mui_include.h').write_text(fixture.STUB_MUI)
                    code = code.replace('PLAYER_SOURCE', '"player_view.c"')
                    extra = ['-I', str(close_folder)]
                else:
                    extra = []
                c = temp / (label + '_' + suite + '.c'); c.write_text(code)
                exe = c.with_suffix('.exe' if os.name == 'nt' else '.bin')
                cmd = ['gcc', '-std=c11', '-O1', '-g', '-Wall', '-Wextra', '-Werror',
                       '-Wno-unused-function', '-Wno-unused-parameter', '-Wno-misleading-indentation']
                if args.sanitize:
                    cmd += ['-DSANITIZER_BUILD', '-fsanitize=address,undefined', '-fno-sanitize-recover=all',
                            '-fno-omit-frame-pointer', '-fno-pie', '-no-pie']
                cmd += extra + ['-I', str(temp), '-I', str(player), '-I', str(src / 'mod/vfs')]
                built = subprocess.run(cmd + [str(c), '-o', str(exe)], capture_output=True, text=True, timeout=60)
                assert built.returncode == 0, built.stdout + built.stderr
                selected = modes if label == 'candidate' else ['init_once', 'delayed_stop', 'late_callback']
                if suite == 'close': selected = ['close_lifecycles']
                for mode in selected:
                    result = subprocess.run([str(exe), mode], capture_output=True, text=True, timeout=15)
                    failure_expected = label == 'baseline'
                    assert (result.returncode != 0) == failure_expected, (label, suite, mode, result.stdout, result.stderr)
                    if failure_expected:
                        assert 'assert' in result.stderr.lower() or 'AddressSanitizer' in result.stderr, result.stderr
                    else:
                        assert 'PASS' in result.stdout, result.stdout
                    report['cases'].append({'variant': label, 'suite': suite, 'mode': mode,
                                            'expected_failure': failure_expected, 'returncode': result.returncode,
                                            'stdout': result.stdout, 'stderr': result.stderr})
                    print(('PASS control ' if failure_expected else 'PASS ') + label + '/' + mode)
    report['passed'] = True
    report['limits'] = ['Synthetic FIFO, clock, sortlist and peripherals; real SDK create/start/stop/request/expire bodies.',
                        'Late callback is an adversarial injection; application config dispatches directly in RTC IRQ, not scheduler.',
                        'No device playback, physical IRQ timing, storage fault, RAM watermark, or complete SDK RTC proof.']
    if args.report: args.report.write_text(json.dumps(report, indent=2) + '\n')

if __name__ == '__main__': main()
