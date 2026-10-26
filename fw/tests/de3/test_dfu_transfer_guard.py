"""Actual DF/VFS/core/foreground/BLE code: DFU refusal and reply lifecycle.

Storage operations and Nordic notification submission are mocked. --baseline
compiles the unchanged old sources and requires their unsafe acceptance to fail.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
from test_ble_mtu import function

HERE = Path(__file__).resolve().parent
FW = HERE.parents[1]
PRODUCTION = ('mod/df/df_proto_vfs.c', 'mod/df/df_proto_info.c', 'mod/df/df_core.c',
              'mod/ble/ble_df_driver.c', 'mod/ble/ble_work.c')


def build(root, folder, name, sanitize):
    src = root / 'application/src'
    harness = (HERE / 'ble_mtu_host.c').read_text().split('int main(', 1)[0]
    harness = '\n'.join(line for line in harness.splitlines()
                        if not line.startswith('static const df_cmd_entry_t capture_entries[]=')) + '\n'
    harness = harness.replace('/* ACTUAL_PROTOCOL_INCLUDES */', '\n'.join(
        '#include "' + (src / path).as_posix() + '"' for path in PRODUCTION))
    ble = (src / 'mod/ble/ble_main.c').read_text()
    harness = harness.replace('/* ACTUAL_BLE_FUNCTIONS */', '\n'.join(function(ble, s) for s in
        ('ret_code_t ble_nus_tx_data(', 'size_t ble_nus_max_data_length(', 'void ble_nus_abort_transfer(')))
    close = function(harness, 'static int32_t mock_close(')
    harness = harness.replace(close, 'static bool fail_close_for_dfu;\n' + close.replace(
        'return VFS_OK;', 'return fail_close_for_dfu ? VFS_ERR_FAIL : VFS_OK;'))
    harness = harness.replace('void ble_disable(void) { ++disable_calls; }',
        'void ble_disable(void) { ++disable_calls; ble_work_disconnected(); }')
    harness += (HERE / 'dfu_transfer_guard_host.c').read_text()
    cfile = folder / (name + '.c')
    cfile.write_text(harness)
    executable = folder / (name + '.exe')
    command = ['gcc', '-std=c11', '-O1', '-g', '-Wall', '-Wextra', '-Werror',
               '-Wno-unused-parameter', '-Wno-sign-compare', '-Wno-unused-function', '-I', str(folder)]
    for subdir in ('mod/df', 'mod/vfs', 'mod/ble'):
        command += ['-I', str(src / subdir)]
    if sanitize:
        command += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all',
                    '-fno-omit-frame-pointer', '-fno-pie', '-no-pie']
    result = subprocess.run(command + [str(cfile), '-o', str(executable)], capture_output=True,
                            text=True, timeout=60)
    assert result.returncode == 0, result.stdout + result.stderr
    return executable


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', type=Path)
    parser.add_argument('--malformed-baseline', type=Path,
                        help='Unmodified DE3.19 must fail the newly covered malformed DFU requests')
    parser.add_argument('--report', type=Path)
    parser.add_argument('--sanitize', action='store_true')
    args = parser.parse_args()
    report = {'device_access': False, 'sanitizers': args.sanitize, 'cases': [],
              'source_sha256': {p: hashlib.sha256((FW/'application/src'/p).read_bytes()).hexdigest()
                               for p in PRODUCTION},
              'limits': ['Synthetic storage/radio submission, no physical SPI/BLE timing.',
                         'OPEN/CLOSE/abandon state, dispatch and transport are actual production C.',
                         'Unclosed write rejection is not a claim of atomic storage or power-loss recovery.']}
    with tempfile.TemporaryDirectory(prefix='pixl-dfu-owned-transfer-') as temporary:
        folder = Path(temporary)
        stubs = {
            'boards.h': '', 'nrf_pwr_mgmt.h': '',
            'app_timer.h': '#include <stdint.h>\n#define APP_TIMER_TICKS(ms) (ms)\nuint32_t app_timer_cnt_get(void);\nuint32_t app_timer_cnt_diff_compute(uint32_t,uint32_t);\n',
            'utils2.h': 'void enter_dfu(void);\n',
            'mui_nav_diag.h': '#include <stdbool.h>\n#include <stddef.h>\n#include <stdint.h>\n#define MUI_NAV_DIAG_SNAPSHOT_SIZE 104u\nstatic inline bool mui_nav_diag_snapshot(uint8_t *out,size_t cap){(void)out;(void)cap;return false;}\n',
            'version2.h': 'static inline int version_get(void){return 0;}\nstatic inline const char *version_get_version(int unused){(void)unused;return "2.21.0-DE3.13";}\n',
            'vfs_driver_fs.h': '#include <stdint.h>\n#include <stddef.h>\nint32_t vfs_spiffs_storage_diagnose(uint8_t,uint8_t,uint8_t*,size_t,size_t*);\n',
            'vfs_spiffs_diag.h': '#include <stdbool.h>\n#include <stdint.h>\nstatic inline bool vfs_spiffs_diag_generation_matches(uint8_t s,uint16_t g){(void)s;(void)g;return false;}\n',
            'nrf_log.h': '#define NRF_LOG_INFO(...) ((void)0)\n',
            'nrf_log_ctrl.h': '#define NRF_LOG_FLUSH() ((void)0)\n',
            'app_util_platform.h': '#define CRITICAL_REGION_ENTER() do { ++critical_depth;\n#define CRITICAL_REGION_EXIT() --critical_depth; } while(0)\n',
        }
        for name, contents in stubs.items(): (folder / name).write_text(contents)
        executable = build(FW, folder, 'candidate', args.sanitize)
        for mtu in (23, 185, 250):
            for scenario in range(12):
                result = subprocess.run([str(executable), str(scenario), str(mtu)],
                                        capture_output=True, text=True, timeout=15)
                row = {'mtu': mtu, 'scenario': scenario, 'exit_code': result.returncode,
                       'output': result.stdout + result.stderr}
                report['cases'].append(row)
                print(row['output'], end='', flush=True)
                assert result.returncode == 0, row
        if args.baseline:
            baseline = args.baseline.resolve()
            executable = build(baseline, folder, 'baseline', False)
            report['baseline_info_sha256'] = hashlib.sha256(
                (baseline/'application/src/mod/df/df_proto_info.c').read_bytes()).hexdigest()
            report['negative_controls'] = []
            for scenario in range(4):
                result = subprocess.run([str(executable), str(scenario), '250'],
                                        capture_output=True, text=True, timeout=15)
                row = {'scenario': scenario, 'exit_code': result.returncode,
                       'output': result.stdout + result.stderr}
                report['negative_controls'].append(row)
                assert result.returncode == 71 and 'status==DF_STATUS_ERR' in row['output'], row
                print('PASS unchanged DE3.12 negative control:', scenario, flush=True)
        if args.malformed_baseline:
            baseline=args.malformed_baseline.resolve()
            executable=build(baseline,folder,'malformed_baseline',False)
            report['malformed_negative_controls']=[]
            for scenario in range(7,12):
                result=subprocess.run([str(executable),str(scenario),'250'],capture_output=True,text=True,timeout=15)
                row={'scenario':scenario,'exit_code':result.returncode,'output':result.stdout+result.stderr}
                report['malformed_negative_controls'].append(row)
                assert result.returncode==71 and 'status==DF_STATUS_ERR' in row['output'],row
            report['malformed_baseline_info_sha256']=hashlib.sha256(
                (baseline/'application/src/mod/df/df_proto_info.c').read_bytes()).hexdigest()
    report['passed'] = True
    if args.report: args.report.write_text(json.dumps(report, indent=2) + '\n')
    print('PASS 36 DFU ownership/reply/session/malformed-request scenarios; no device access')


if __name__ == '__main__': main()
