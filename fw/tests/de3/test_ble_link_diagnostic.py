"""Actual LCD GAP events, foreground PHY policy and backward-compatible INFO05.

Pinned S112 headers provide the real event structures, statuses and API types.
SoftDevice calls, timer and GATT-state boundary are mocked; no radio throughput
or handset acceptance is implied. No SDK download is performed by this test.
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
SRC = HERE.parents[1] / 'application/src'
SDK_GAP_SHA256 = '0ec9439c9e87a917cfbc65817bd8fb696060b4154919fee0f08ebbfefa84067c'


def build_source(ble, info):
    begin = ble.index('typedef struct {\n    uint32_t request_result, retry_tick;')
    end = ble.index('/* A connected file session owns', begin)
    profile = ble[begin:end].rsplit('#endif', 1)[0]
    names = ('void ble_process_pending(', 'static void ble_evt_handler(',
             'bool ble_mtu_diagnostic(', 'bool ble_link_diagnostic(')
    bodies = '\n\n'.join(function(ble, name) for name in names)
    bodies += '\n\n' + function(info, 'static void df_proto_handler_info_mtu_diagnostic(')
    template = (HERE / 'ble_link_diagnostic_host.c.in').read_text()
    return template.replace('/* ACTUAL_PROFILE */', profile).replace('/* ACTUAL_FUNCTIONS */', bodies)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk-root', type=Path, default=Path(os.environ.get('NRF52_SDK_ROOT') or
                        os.environ.get('NRF5_SDK_PATH') or '/opt/nRF5_SDK_17.1.0_ddde560'))
    parser.add_argument('--sanitize', action='store_true')
    parser.add_argument('--negative-controls', action='store_true')
    parser.add_argument('--report', type=Path)
    parser.add_argument('--wire-vectors', type=Path)
    args = parser.parse_args()
    header = args.sdk_root / 'components/softdevice/s112/headers'
    sdk_sha = hashlib.sha256((header/'ble_gap.h').read_bytes()).hexdigest()
    if sdk_sha != SDK_GAP_SHA256:
        raise SystemExit('Use the pinned S112 headers from nRF5 SDK 17.1.0')
    ble = (SRC / 'mod/ble/ble_main.c').read_text()
    info = (SRC / 'mod/df/df_proto_info.c').read_text()
    report = {'device_access': False, 'sanitizers': args.sanitize,
              'sdk_s112_gap_sha256': sdk_sha,
              'source_sha256': {p:hashlib.sha256((SRC/p).read_bytes()).hexdigest() for p in
                  ('mod/ble/ble_main.c','mod/ble/ble_main.h','mod/df/df_proto_info.c')},
              'limits':['Real production functions and S112 types; modeled SoftDevice/timer/GATT boundary.',
                        'Neither successful 2M use on a handset nor increased throughput is established.']}
    with tempfile.TemporaryDirectory(prefix='pixl-ble-link-') as temporary:
        temp = Path(temporary)
        (temp/'nrf.h').write_text('#pragma once\n#define __STATIC_INLINE static inline\n')
        def run(source, name):
            cfile = temp/(name+'.c'); binary = temp/name;cfile.write_text(source)
            command = ['gcc','-std=c11','-O1','-g','-Wall','-Wextra','-Werror','-Wno-unused-parameter',
                       '-Wno-unused-function','-I',str(temp),'-I',str(header),'-I',str(SRC/'mod/ble'),'-I',str(SRC/'mod/df')]
            if args.sanitize:
                command += ['-fsanitize=address,undefined','-fno-sanitize-recover=all',
                            '-fno-omit-frame-pointer','-fno-pie','-no-pie']
            build = subprocess.run(command+[str(cfile),'-o',str(binary)],capture_output=True,text=True,timeout=60)
            if build.returncode:raise RuntimeError(build.stdout+build.stderr)
            return subprocess.run([str(binary)],capture_output=True,text=True,timeout=60)
        source = build_source(ble,info)
        result = run(source,'actual')
        report.update(passed=result.returncode==0,exit_code=result.returncode,
                      output=result.stdout+result.stderr,
                      cases=[json.loads(line) for line in result.stdout.splitlines() if line.startswith('{')])
        print(report['output'],end='')
        if result.returncode:raise RuntimeError('actual link diagnostic failed')
        if args.negative_controls:
            mutants = {
                'reset_on_peer_busy': source.replace('if (err_code != NRF_SUCCESS) NRF_LOG_INFO("BLE PHY reply deferred/rejected: %lu", (unsigned long)err_code);', 'APP_ERROR_CHECK(err_code);'),
                'extra_busy_retry': source.replace('m_link_profile.attempts < 3','m_link_profile.attempts < 4'),
                'missing_connect_snapshot': source.replace('ble_link_profile_reset(&p_ble_evt->evt.gap_evt.params.connected.conn_params);','/* missing connection snapshot */'),
                'trust_failed_phy_fields': source.replace('update->status == BLE_HCI_STATUS_CODE_SUCCESS &&','true &&'),
            }
            snapshot = function(source, 'bool ble_link_diagnostic(')
            mutants['mixed_link_generation'] = source.replace(snapshot,
                snapshot.replace('CRITICAL_REGION_ENTER();','').replace('CRITICAL_REGION_EXIT();',''))
            report['negative_controls'] = {}
            for name,mutant in mutants.items():
                assert mutant!=source,name
                check=run(mutant,name)
                assert check.returncode==71 and 'CHECK' in check.stderr,(name,check.stdout,check.stderr)
                report['negative_controls'][name]={'detected':True,'assertion':check.stderr.strip()}
            print('PASS %d deliberate regressions rejected'%len(mutants))
        if args.wire_vectors:
            raw=next(line[5:] for line in result.stdout.splitlines() if line.startswith('WIRE '))
            args.wire_vectors.parent.mkdir(parents=True,exist_ok=True)
            args.wire_vectors.write_text(json.dumps({'source':'actual C serializer','device_access':False,
                'command':5,'requestHex':'01','responsePayloadHex':raw,
                'expected':{'schemaVersion':2,'effectiveAttMtu':250,'nextConnectionAttMtu':250,
                            'configuredMaxAttMtu':250,'gattValueCapacity':247,
                            'connectionIntervalUnits':16,'slaveLatency':0,'supervisionTimeoutUnits':400,
                            'rxPhy':2,'txPhy':2,'phyRequestAttempts':1,'lastPhyRequestResult':0}},indent=2)+'\n')
    if args.report:
        args.report.parent.mkdir(parents=True,exist_ok=True)
        args.report.write_text(json.dumps(report,indent=2)+'\n')


if __name__=='__main__':main()
