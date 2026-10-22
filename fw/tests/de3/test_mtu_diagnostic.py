"""Actual INFO05/BLE/idle functions and pinned Nordic GATT implementation.

The radio boundary is mocked. This proves lifecycle and wire contracts, not
an over-the-air MTU23 exchange. Use the installed pinned SDK, no downloads.
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
FW = HERE.parents[1]
SRC = FW / 'application/src'
SDK_GATT_SHA256 = '8639e289bf9f28943700adcee47f5fdfbe539de545d1877acbe66de0389db354'


def build_source(sdk):
    sdk_source = sdk / 'components/ble/nrf_ble_gatt/nrf_ble_gatt.c'
    assert hashlib.sha256(sdk_source.read_bytes()).hexdigest() == SDK_GATT_SHA256
    gatt = sdk_source.read_text()
    ble = (SRC/'mod/ble/ble_main.c').read_text()
    info = (SRC/'mod/df/df_proto_info.c').read_text()
    vfs = (SRC/'mod/df/df_proto_vfs.c').read_text()
    assert '{DF_PROTO_CMD_INFO_MTU_DIAGNOSTIC, df_proto_handler_info_mtu_diagnostic}' in info
    assert '#define NRF_SDH_BLE_GATT_MAX_MTU_SIZE 250' in (FW/'application/config/sdk_config.h').read_text()
    parts = [Path(__file__).with_name('mtu_diagnostic_host.c.in').read_text()]
    sdk_functions = ('static void link_init(', 'ret_code_t nrf_ble_gatt_init(',
                     'ret_code_t nrf_ble_gatt_att_mtu_periph_set(',
                     'uint16_t nrf_ble_gatt_eff_mtu_get(', 'static void on_connected_evt(',
                     'static void on_disconnected_evt(', 'static void on_exchange_mtu_rsp_evt(',
                     'static void on_exchange_mtu_request_evt(')
    bodies = '\n\n'.join(function(gatt, x) for x in sdk_functions)
    bodies += '\n\n' + '\n\n'.join(function(ble, x) for x in
        ('static bool ble_device_name_is(', 'void gatt_evt_handler(', 'void gatt_init(',
         'void ble_init(', 'void ble_device_mode_prepare(', 'bool ble_mtu_diagnostic('))
    bodies += '\n\n' + function(vfs, 'bool df_proto_vfs_is_idle(')
    bodies += '\n\n' + function(info, 'static void df_proto_handler_info_mtu_diagnostic(')
    return parts[0].replace('/* ACTUAL_FUNCTIONS */', bodies)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk-root', type=Path, default=Path(os.environ.get('NRF52_SDK_ROOT', '/opt/nRF5_SDK_17.1.0_ddde560')))
    parser.add_argument('--sanitize', action='store_true')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    report = {'device_access': False, 'sanitizers': args.sanitize, 'pinned_sdk_gatt_sha256': SDK_GATT_SHA256,
              'source_sha256': {p: hashlib.sha256((SRC/p).read_bytes()).hexdigest() for p in
                  ('mod/ble/ble_main.c', 'mod/ble/ble_main.h', 'mod/df/df_proto_info.c',
                   'mod/df/df_proto_info.h', 'mod/df/df_proto_vfs.c', 'mod/df/df_proto_vfs.h')},
              'limits': ['Actual Nordic functions with mocked SoftDevice replies; no radio or Windows session.',
                         'Actual device must report ATT23 after reconnect; sending20B alone is not sufficient.']}
    with tempfile.TemporaryDirectory(prefix='pixl-mtu-diagnostic-') as temporary:
        temp = Path(temporary)
        cfile = temp/'test.c'
        cfile.write_text(build_source(args.sdk_root))
        binary = temp/'test'
        command = ['gcc', '-std=c11', '-O1', '-g', '-Wall', '-Wextra', '-Werror',
                   '-Wno-unused-function', '-Wno-unused-parameter',
                   '-I', str(SRC/'mod/df'), '-I', str(SRC/'mod/ble')]
        if args.sanitize:
            command += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all',
                        '-fno-omit-frame-pointer', '-fno-pie', '-no-pie']
        built = subprocess.run(command+[str(cfile), '-o', str(binary)], capture_output=True, text=True, timeout=60)
        assert built.returncode == 0, built.stdout+built.stderr
        ran = subprocess.run([str(binary)], capture_output=True, text=True, timeout=60)
        report.update({'exit_code': ran.returncode, 'output': ran.stdout+ran.stderr, 'passed': ran.returncode == 0})
        print(report['output'], end='')
        assert ran.returncode == 0, report
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2)+'\n')


if __name__ == '__main__':
    main()
