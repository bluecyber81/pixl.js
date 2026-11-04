"""Actual C DF/core/foreground queue at ATT MTU 23/185/250; no device.

--fallback-root allows this isolated five-file patch to use unchanged baseline
headers. --baseline-proof requires the old sources to fail the same MTU23 test.
"""
import argparse
import json
import os
from pathlib import Path
import shlex
import subprocess
import tempfile


def function(text, signature):
    start = text.index(signature)
    opening = text.index('{', start)
    depth = 1
    for i in range(opening + 1, len(text)):
        depth += (text[i] == '{') - (text[i] == '}')
        if not depth:
            return text[start:i + 1]
    raise ValueError(signature)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--fallback-root', type=Path)
    parser.add_argument('--cc', default=os.environ.get('CC', 'gcc'))
    parser.add_argument('--sanitize', action='store_true')
    parser.add_argument('--baseline-proof', action='store_true')
    parser.add_argument('--negative-controls', action='store_true', help='Require four deliberately regressed production-C builds to fail assertions')
    parser.add_argument('--write-wire-vectors', action='store_true', help='Explicitly regenerate the shared C/browser wire fixtures')
    args = parser.parse_args()
    roots = [args.source_root.resolve()]
    if args.fallback_root:
        roots.append(args.fallback_root.resolve())

    def source(path):
        for root in roots:
            candidate = root / 'application/src' / path
            if candidate.is_file():
                return candidate
        raise FileNotFoundError(path)

    includes = '\n'.join('#include "' + source(p).as_posix() + '"' for p in (
        'mod/df/df_proto_vfs.c', 'mod/df/df_proto_info.c', 'mod/df/df_core.c', 'mod/ble/ble_df_driver.c', 'mod/ble/ble_work.c'))
    ble = source('mod/ble/ble_main.c').read_text(encoding='utf-8')
    funcs = [function(ble, 'ret_code_t ble_nus_tx_data(')]
    if not args.baseline_proof:
        funcs += [function(ble, 'size_t ble_nus_max_data_length('), function(ble, 'void ble_nus_abort_transfer(')]
    harness = Path(__file__).with_name('ble_mtu_host.c').read_text(encoding='utf-8')
    harness = harness.replace('/* ACTUAL_PROTOCOL_INCLUDES */', includes)
    harness = harness.replace('/* ACTUAL_BLE_FUNCTIONS */', '\n'.join(funcs))
    with tempfile.TemporaryDirectory(prefix='pixl-ble-mtu-') as folder:
        temp = Path(folder)
        for name, text in {
            'boards.h': '',
            'app_timer.h': '#include <stdint.h>\n#define APP_TIMER_TICKS(ms) (ms)\nuint32_t app_timer_cnt_get(void);\nuint32_t app_timer_cnt_diff_compute(uint32_t now, uint32_t before);\n',
            'utils2.h': '#pragma once\n#include <stdbool.h>\nbool enter_dfu(void);\nbool system_reboot(void);\nbool system_prepare_reset(void);\nbool system_reset_prepared(void);\nvoid system_cancel_reset(void);\n',
            # The new read-only UI command has its own actual-module tests.
            'mui_nav_diag.h': '#include <stdbool.h>\n#include <stddef.h>\n#include <stdint.h>\n#define MUI_NAV_DIAG_SNAPSHOT_SIZE 104u\nstatic inline bool mui_nav_diag_snapshot(uint8_t *out, size_t cap) { (void)out; (void)cap; return false; }\n',
            'version2.h': 'static inline int version_get(void) { return 0; }\nstatic inline const char *version_get_version(int unused) { (void)unused; return "2.21.0-DE3.10"; }\n',
            'vfs_driver_fs.h': '#include <stdint.h>\n#include <stddef.h>\nint32_t vfs_spiffs_storage_diagnose(uint8_t,uint8_t,uint8_t*,size_t,size_t*);\n',
            'vfs_spiffs_diag.h': '#include <stdbool.h>\n#include <stdint.h>\nstatic inline bool vfs_spiffs_diag_generation_matches(uint8_t s,uint16_t g){(void)s;(void)g;return false;}\n',
            'nrf_log.h': '#define NRF_LOG_INFO(...) ((void)0)\n',
            'nrf_log_ctrl.h': '#define NRF_LOG_FLUSH() ((void)0)\n',
            'nrf_pwr_mgmt.h': '',
            'app_util_platform.h': '#define CRITICAL_REGION_ENTER() do { ++critical_depth;\n#define CRITICAL_REGION_EXIT() --critical_depth; } while (0)\n',
        }.items():
            (temp / name).write_text(text, encoding='utf-8')
        cfile = temp / 'test.c'
        cfile.write_text(harness, encoding='utf-8')
        binary = temp / ('test.exe' if os.name == 'nt' else 'test')
        command = shlex.split(args.cc) + ['-std=c11', '-O1', '-g', '-Wall', '-Wextra',
            '-Werror', '-Wno-unused-parameter', '-Wno-sign-compare', '-Wno-unused-function', '-I', str(temp)]
        for root in roots:
            for subdir in ('mod/df', 'mod/vfs', 'mod/ble'):
                command += ['-I', str(root / 'application/src' / subdir)]
        if args.sanitize:
            command += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all', '-fno-omit-frame-pointer', '-fno-pie', '-no-pie']
        subprocess.run(command + [str(cfile), '-o', str(binary)], check=True, timeout=60)
        if args.baseline_proof:
            result = subprocess.run([str(binary), '0'], capture_output=True, text=True, timeout=15)
            if result.returncode != 71 or 'CHECK' not in result.stderr:
                raise AssertionError((result.returncode, result.stdout, result.stderr))
            print('PASS baseline reproduces MTU23 missing-response failure:', result.stderr.strip())
        else:
            for scenario in list(range(28)) + [29,30]:
                subprocess.run([str(binary), str(scenario)], check=True, timeout=15)
            wire = subprocess.run([str(binary), '28'], capture_output=True, text=True, check=True, timeout=15)
            vectors = json.loads(wire.stdout)
            vector_file = Path(__file__).with_name('df_mtu_wire_vectors.json')
            if args.write_wire_vectors:
                vector_file.write_text(json.dumps(vectors, indent=2) + '\n', encoding='utf-8')
            assert vectors == json.loads(vector_file.read_text(encoding='utf-8')), 'Actual-C wire output differs from the browser regression fixtures'
            print('PASS actual-C output matches shared browser wire fixtures')
            print('PASS 31 actual-C BLE MTU, bounded RX assembly, replies, capability, timeout, DFU and stale-session scenarios')
            if args.negative_controls:
                mutations = [
                    ('missing_legacy_opt_in', 'mod/ble/ble_df_driver.c',
                     'if (!m_framed_rx) {', 'if (false) {', 30),
                    ('oneshot_mtu_error', 'mod/df/df_core.c',
                     'if (m_df_ctx.driver->send(out) != 0) {',
                     'if(out->length>df_core_max_payload()){out->length=0;out->status=1;out->chunk=0;}\n    if (m_df_ctx.driver->send(out) != 0) {', 6),
                    ('premature_rx_dispatch', 'mod/ble/ble_df_driver.c',
                     '++m_rx_next_chunk;\n        return;', '++m_rx_next_chunk;', 18),
                    ('missing_timeout', 'mod/ble/ble_df_driver.c',
                     '>= DF_FRAGMENT_TIMEOUT_TICKS', '> 0xffffffu', 21),
                    ('missing_rx_sequence_guard', 'mod/ble/ble_df_driver.c',
                     '(chunk & 0x7fff) != m_rx_next_chunk', 'false', 19),
                ]
                for name, relative, old, new, scenario in mutations:
                    original = source(relative)
                    text = original.read_text(encoding='utf-8')
                    assert text.count(old) == 1, (name, 'mutation anchor changed')
                    mutated = temp / (name + '.c')
                    mutated.write_text(text.replace(old, new), encoding='utf-8')
                    cfile.write_text(harness.replace(original.as_posix(), mutated.as_posix()), encoding='utf-8')
                    subprocess.run(command + [str(cfile), '-o', str(binary)], check=True, timeout=60)
                    failed = subprocess.run([str(binary), str(scenario)], capture_output=True, text=True, timeout=15)
                    assert failed.returncode == 71 and 'CHECK' in failed.stderr, (name, failed.returncode, failed.stdout, failed.stderr)
                    print('PASS negative control rejected:', name, failed.stderr.strip())



if __name__ == '__main__':
    main()
