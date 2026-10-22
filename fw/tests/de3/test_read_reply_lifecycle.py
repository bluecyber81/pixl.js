"""Actual DF/Core/foreground/TX-ack lifecycle; no device or filesystem writes.

VFS endpoints and Nordic notification sink are mocked. --baseline preserves the
old source and requires its unsolicited-data bug to fail the same assertions.
"""
import argparse
import ast
import hashlib
import inspect
import json
from pathlib import Path
import subprocess
import tempfile

import test_dfu_transfer_guard as existing

HERE = Path(__file__).resolve().parent
FW = HERE.parents[1]
SIZES = (0, 1, 16, 17, 178, 179, 243, 244, 486, 540, 4096)


def build(root, folder, name, sanitize):
    src = root / 'application/src'
    harness = (HERE / 'ble_mtu_host.c').read_text().split('int main(', 1)[0]
    harness = '\n'.join(line for line in harness.splitlines()
                        if not line.startswith('static const df_cmd_entry_t capture_entries[]=')) + '\n'
    protocol = (src / 'mod/df/df_proto_vfs.c').read_text()
    harness = '#define HAS_READ_PENDING ' + str(int('bool read_pending;' in protocol)) + '\n' + harness
    harness = harness.replace('/* ACTUAL_PROTOCOL_INCLUDES */', '\n'.join(
        '#include "' + (src / path).as_posix() + '"' for path in existing.PRODUCTION))
    ble = (src / 'mod/ble/ble_main.c').read_text()
    harness = harness.replace('/* ACTUAL_BLE_FUNCTIONS */', '\n'.join(existing.function(ble, s) for s in
        ('ret_code_t ble_nus_tx_data(', 'size_t ble_nus_max_data_length(', 'void ble_nus_abort_transfer(')))
    close = existing.function(harness, 'static int32_t mock_close(')
    harness = harness.replace(close, 'static bool fail_close_for_read;\n' + close.replace(
        'return VFS_OK;', 'return fail_close_for_read ? VFS_ERR_FAIL : VFS_OK;'))
    read = existing.function(harness, 'static int32_t mock_read(')
    harness = harness.replace(read, 'static unsigned read_calls;\n' + read.replace(
        '(void)f;', '(void)f; ++read_calls;', 1))
    harness += (HERE / 'read_reply_lifecycle_host.c').read_text()
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
    parser.add_argument('--sanitize', action='store_true')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    source_hashes = {p: hashlib.sha256((FW / 'application/src' / p).read_bytes()).hexdigest()
                     for p in existing.PRODUCTION}
    report = {'device_access': False, 'sanitizers': args.sanitize, 'source_hashes': source_hashes,
              'cases': [], 'negative_controls': [],
              'limits': ['Actual DF/Core/BLE foreground code; mocked VFS endpoints and Nordic notifications.',
                         'Host ABI static assertions compare old/new struct size and existing field offsets.',
                         'Host passes do not prove actual MTU23 radio, physical NOR failures or IRQ timing.']}
    with tempfile.TemporaryDirectory(prefix='pixl-read-reply-') as td:
        folder = Path(td)
        # Reuse the existing narrow SDK boundary stubs, not its main/test cases.
        tree = ast.parse(inspect.getsource(existing.main))
        stubs = next(ast.literal_eval(n.value) for n in ast.walk(tree)
                     if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'stubs' for t in n.targets))
        for name, value in stubs.items(): (folder / name).write_text(value)
        executable = build(FW, folder, 'candidate', args.sanitize)
        scenarios = [(s, 540) for s in range(13) if s != 2] + [(2, length) for length in SIZES]
        for mtu in (23, 185, 250):
            for framed in (0, 1):
                for scenario, length in scenarios:
                    result = subprocess.run([str(executable), str(mtu), str(framed), str(scenario), str(length)],
                                            capture_output=True, text=True, timeout=15)
                    row = {'mtu': mtu, 'framed': bool(framed), 'scenario': scenario, 'length': length,
                           'exit_code': result.returncode, 'output': result.stdout + result.stderr}
                    report['cases'].append(row)
                    assert result.returncode == 0, row
        if args.baseline:
            baseline = args.baseline.resolve()
            executable = build(baseline, folder, 'baseline', False)
            report['baseline_protocol_sha256'] = hashlib.sha256(
                (baseline / 'application/src/mod/df/df_proto_vfs.c').read_bytes()).hexdigest()
            for mtu in (23, 185, 250):
                for framed in (0, 1):
                    for scenario in (0, 1, 4, 5):
                        result = subprocess.run([str(executable), str(mtu), str(framed), str(scenario), '540'],
                                                capture_output=True, text=True, timeout=15)
                        row = {'mtu': mtu, 'framed': bool(framed), 'scenario': scenario,
                               'exit_code': result.returncode, 'output': result.stdout + result.stderr}
                        report['negative_controls'].append(row)
                        assert result.returncode == 71 and 'sends==1 && file_offset==position && read_calls==calls' in row['output'], row
    assert source_hashes == {p: hashlib.sha256((FW / 'application/src' / p).read_bytes()).hexdigest()
                             for p in existing.PRODUCTION}
    report.update(passed=True, case_count=len(report['cases']), negative_control_count=len(report['negative_controls']))
    if args.report:
        with args.report.open('x', encoding='utf-8') as stream:
            json.dump(report, stream, indent=2)
            stream.write('\n')
    print(f"PASS {len(report['cases'])} READ lifecycle cases; {len(report['negative_controls'])} baseline negative controls")


if __name__ == '__main__':
    main()
