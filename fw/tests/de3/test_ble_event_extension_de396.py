"""Actual App669 test-only INFO05/SoftDevice option policy, with pinned S112 ABI.

Radio, GATT and SDK initialization boundaries are modeled. No actual airtime,
throughput, phone compatibility or device installation is established here.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

from test_ble_link_diagnostic import build_source as link_source, SDK_GAP_SHA256
from test_ble_mtu import function

HERE = Path(__file__).resolve().parent
SRC = HERE.parents[1] / 'application/src'
SDK_BLE_SHA256 = '9b8131fffee18f0548c30990e501e7337b36e27f82d59ee61c3a8df5678e5d23'


def build_source(ble, info):
    # Reuse the actual GAP/GATT/INFO harness, not a second copy of the policy.
    prefix = link_source(ble, info).split('int main(void) {', 1)[0]
    prefix = prefix.replace('#define PIXL_RUNTIME_DIAGNOSTICS 1',
        '#define PIXL_RUNTIME_DIAGNOSTICS 1\n#define PIXL_TEST_DIAGNOSTICS 1\n'
        '#define NRF_SDH_BLE_GAP_EVENT_LENGTH 6')
    implementation = function(ble, 'bool ble_test_diagnostic(') + '\n\n' + function(ble, 'static void ble_stack_init(')
    tail = (HERE / 'ble_event_extension_de396_host.c.in').read_text()
    return prefix + tail.replace('/* ACTUAL_TEST_FUNCTIONS */', implementation)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk-root', type=Path, default=Path(os.environ.get('NRF52_SDK_ROOT') or
        os.environ.get('NRF5_SDK_PATH') or '/opt/nRF5_SDK_17.1.0_ddde560'))
    parser.add_argument('--sanitize', action='store_true')
    parser.add_argument('--negative-controls', action='store_true')
    parser.add_argument('--report', type=Path)
    parser.add_argument('--wire-vectors', type=Path)
    args = parser.parse_args()
    headers = args.sdk_root / 'components/softdevice/s112/headers'
    pinned = {'ble.h': SDK_BLE_SHA256, 'ble_gap.h': SDK_GAP_SHA256}
    for name, expected in pinned.items():
        if hashlib.sha256((headers / name).read_bytes()).hexdigest() != expected:
            raise SystemExit('Use the pinned S112 headers from nRF5 SDK 17.1.0: ' + name)
    ble = (SRC / 'mod/ble/ble_main.c').read_text()
    info = (SRC / 'mod/df/df_proto_info.c').read_text()
    source = build_source(ble, info)
    report = {'schema': 1, 'device_access': False, 'sanitizers': args.sanitize,
        'pinned_s112_headers': pinned,
        'source_sha256': {p: hashlib.sha256((SRC / p).read_bytes()).hexdigest() for p in
                         ('mod/ble/ble_main.c', 'mod/ble/ble_main.h', 'mod/df/df_proto_info.c')},
        'limits': ['Actual application functions and S112 option ABI; mocked SoftDevice, timer and GATT boundary.',
                   'Configured extension is global until changed or stack restart; no negotiated airtime measurement.',
                   'No physical phone, radio, throughput, battery or installation test.']}
    with tempfile.TemporaryDirectory(prefix='pixl-event-extension-') as temporary:
        temp = Path(temporary)
        (temp / 'nrf.h').write_text('#pragma once\n#define __STATIC_INLINE static inline\n')

        def run(code, name):
            cfile, binary = temp / (name + '.c'), temp / name
            cfile.write_text(code)
            command = ['gcc', '-std=c11', '-O1', '-g', '-Wall', '-Wextra', '-Werror',
                '-Wno-unused-parameter', '-Wno-unused-function', '-I', str(temp), '-I', str(headers),
                '-I', str(SRC / 'mod/ble'), '-I', str(SRC / 'mod/df')]
            if args.sanitize:
                command += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all',
                            '-fno-omit-frame-pointer', '-fno-pie', '-no-pie']
            built = subprocess.run(command + [str(cfile), '-o', str(binary)], capture_output=True, text=True, timeout=60)
            if built.returncode:
                raise RuntimeError(built.stdout + built.stderr)
            return subprocess.run([str(binary)], capture_output=True, text=True, timeout=60)

        result = run(source, 'actual')
        report.update(passed=result.returncode == 0, output=result.stdout + result.stderr,
                      cases=[json.loads(line) for line in result.stdout.splitlines() if line.startswith('{')])
        print(report['output'], end='')
        if result.returncode:
            raise RuntimeError('Actual event-extension policy failed')
        if args.negative_controls:
            mutants = {
                'trust_rejected_setting': source.replace('if (result == NRF_SUCCESS) m_event_extension_enabled = requested_extension != 0;',
                                                        'm_event_extension_enabled = requested_extension != 0;'),
                'omit_vfs_idle_gate': source.replace('evt->df->data[4] <= 1 && idle &&', 'evt->df->data[4] <= 1 &&'),
                'mutate_on_read': source.replace('if (requested_extension >= 0) {', 'if (requested_extension >= -1) {'),
                'forget_global_state_on_disconnect': source.replace('ble_link_profile_reset(NULL);',
                    'ble_link_profile_reset(NULL); m_event_extension_enabled = false;'),
                'omit_stack_default_reset': source.replace('    m_event_extension_enabled = false;\n', ''),
            }
            report['negative_controls'] = {}
            for name, mutant in mutants.items():
                assert mutant != source, name
                failed = run(mutant, name)
                assert failed.returncode == 71 and 'CHECK' in failed.stderr, (name, failed.stdout, failed.stderr)
                report['negative_controls'][name] = {'detected': True, 'assertion': failed.stderr.strip()}
            print('PASS %d deliberate event-extension regressions rejected' % len(mutants))
        if args.wire_vectors:
            wire = next(line[5:] for line in result.stdout.splitlines() if line.startswith('WIRE '))
            args.wire_vectors.parent.mkdir(parents=True, exist_ok=True)
            args.wire_vectors.write_text(json.dumps({'source': 'actual C serializer', 'device_access': False,
                'command': 5, 'requestHex': '02', 'responsePayloadHex': wire,
                'expected': {'schemaVersion': 3, 'effectiveAttMtu': 250, 'gattValueCapacity': 247,
                    'connectionIntervalUnits': 24, 'slaveLatency': 0, 'supervisionTimeoutUnits': 500,
                    'rxPhy': 2, 'txPhy': 2, 'testProfile': True, 'eventLengthUnits': 6,
                    'eventExtensionEnabled': True, 'lastEventExtensionResult': 0}}, indent=2) + '\n')
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
