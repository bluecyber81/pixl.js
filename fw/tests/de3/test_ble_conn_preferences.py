"""Keep established BLE links after preferred-parameter negotiation fails.

Compile the actual application initialization with the pinned Nordic module's
initialization, connection events, preference checks and timeout callback.
The SoftDevice and timer boundary is mocked; this is not a radio speed test.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

from test_ble_mtu import function


HERE = Path(__file__).resolve().parent
BLE_SOURCE = HERE.parents[1] / 'application/src/mod/ble/ble_main.c'
SDK_PARAMS_SHA256 = 'ce003b7aea88a24b8c23fe7240794df97071de730b3136165187bdeba7f9ef9e'


def build_source(ble, sdk):
    constants = ble[ble.index('#define MIN_CONN_INTERVAL'):ble.index('#define DEAD_BEEF')]
    sdk_functions = (
        'static ble_conn_params_instance_t * instance_get(',
        'static __INLINE void instance_claim(',
        'static __INLINE void instance_free(',
        'static bool is_conn_params_ok(',
        'static void send_error_evt(',
        'static bool send_update_request(',
        'static void update_timeout_handler(',
        'ret_code_t ble_conn_params_init(',
        'static void conn_params_negotiation(',
        'static void on_connect(',
        'static void on_disconnect(',
        'static void on_conn_params_update(',
    )
    bodies = '\n\n'.join(function(sdk, signature) for signature in sdk_functions)
    # Including the original registered callback makes --ble-source useful for
    # showing the same behavioral assertion fail against the previous source.
    if 'static void on_conn_params_evt(' in ble:
        bodies += '\n\n' + function(ble, 'static void on_conn_params_evt(')
    bodies += '\n\n' + function(ble, 'static void conn_params_error_handler(')
    bodies += '\n\n' + function(ble, 'static void conn_params_init(')
    template = (HERE / 'ble_conn_preferences_host.c.in').read_text()
    return template.replace('/* ACTUAL_CONSTANTS */', constants).replace('/* ACTUAL_FUNCTIONS */', bodies)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk-root', type=Path,
                        default=Path(os.environ.get('NRF52_SDK_ROOT') or os.environ.get('NRF5_SDK_PATH') or
                                     '/opt/nRF5_SDK_17.1.0_ddde560'))
    parser.add_argument('--ble-source', type=Path, default=BLE_SOURCE)
    parser.add_argument('--sanitize', action='store_true')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    sdk_path = args.sdk_root / 'components/ble/common/ble_conn_params.c'
    sdk_sha = hashlib.sha256(sdk_path.read_bytes()).hexdigest()
    if sdk_sha != SDK_PARAMS_SHA256:
        raise SystemExit('Use the pinned Nordic connection-parameters implementation')
    report = {
        'device_access': False,
        'sanitizers': args.sanitize,
        'asan_options': os.environ.get('ASAN_OPTIONS') if args.sanitize else None,
        'source_sha256': hashlib.sha256(args.ble_source.read_bytes()).hexdigest(),
        'pinned_sdk_conn_params_sha256': sdk_sha,
        'limits': [
            'Actual application and SDK functions; mocked SoftDevice and timer boundaries.',
            'Valid links with unchanged central parameters are modeled, not observed on a handset.',
            'No transfer-speed or over-the-air measurement.',
        ],
    }
    with tempfile.TemporaryDirectory(prefix='pixl-ble-conn-preferences-') as temporary:
        temp = Path(temporary)
        source = temp / 'test.c'
        source.write_text(build_source(args.ble_source.read_text(), sdk_path.read_text()))
        binary = temp / 'test'
        command = ['gcc', '-std=c11', '-O1', '-g', '-Wall', '-Wextra', '-Werror',
                   # Nordic uses 32-bit handles as timer context on the nRF52.
                   '-Wno-pointer-to-int-cast', '-Wno-int-to-pointer-cast']
        if args.sanitize:
            command += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all',
                        '-fno-omit-frame-pointer', '-fno-pie', '-no-pie']
        built = subprocess.run(command + [str(source), '-o', str(binary)],
                               capture_output=True, text=True, timeout=60)
        if built.returncode:
            raise RuntimeError(built.stdout + built.stderr)
        run = subprocess.run([str(binary)], capture_output=True, text=True, timeout=60)
        report.update({'exit_code': run.returncode, 'output': run.stdout + run.stderr,
                       'cases': [json.loads(line) for line in run.stdout.splitlines() if line.startswith('{')],
                       'passed': run.returncode == 0})
        print(report['output'], end='')
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + '\n')
    raise SystemExit(0 if report['passed'] else 1)


if __name__ == '__main__':
    main()
