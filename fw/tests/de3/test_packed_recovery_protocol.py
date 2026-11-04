"""Actual C protocol and recovery runtime, with storage/BLE boundaries mocked."""
import argparse, hashlib, json, subprocess, tempfile
from pathlib import Path
HERE=Path(__file__).resolve().parent
FW=HERE.parents[1]
SRC=FW/'application/src'

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--sanitize',action='store_true')
    ap.add_argument('--report',type=Path)
    args=ap.parse_args()
    sources=[SRC/'mod/df/df_proto_vfs.c',SRC/'mod/vfs/vfs_packed_runtime.c',SRC/'mod/vfs/vfs_packed_runtime.h',
             SRC/'mod/vfs/packed_fs.h',SRC/'mod/vfs/vfs_packed_identity.h']
    hashes=lambda:{p.relative_to(FW).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    report=dict(device_access=False,sanitize=args.sanitize,source_sha256=hashes(),cases=[])
    with tempfile.TemporaryDirectory(prefix='packed-recovery-') as temp:
        folder=Path(temp)
        for name,body in {'boards.h':'','nrf_log.h':'#define NRF_LOG_INFO(...) ((void)0)\n',
                          'ble_main.h':'void ble_disable(void);\n','utils2.h':'#pragma once\n#include <stdbool.h>\nbool enter_dfu(void);\nbool system_reboot(void);\nbool system_prepare_reset(void);\nbool system_reset_prepared(void);\nvoid system_cancel_reset(void);\n'}.items():
            (folder/name).write_text(body)
        module=(SRC/'mod/df/df_proto_vfs.c').read_text().replace('#include "../runtime_diag.h"',
               '#include "'+(SRC/'mod/runtime_diag.h').as_posix()+'"')
        (folder/'module.c').write_text(module)
        prefix=(HERE/'storage_metadata_protocol.c.in').read_text().split('int main(')[0]
        prefix=prefix.replace('@PROTOCOL@','#include "'+(folder/'module.c').as_posix()+'"')
        extra=(HERE/'packed_recovery_protocol.c.in').read_text().replace('@RUNTIME@',
               '#include "'+(SRC/'mod/vfs/vfs_packed_runtime.c').as_posix()+'"')
        (folder/'test.c').write_text(prefix+extra)
        exe=folder/'test.exe'
        cmd=['gcc','-std=c11','-O1','-g','-Wall','-Wextra','-Werror','-Wno-unused-parameter','-Wno-unused-function',
             '-Wno-sign-compare','-Wno-misleading-indentation','-DPIXL_RUNTIME_DIAGNOSTICS=1','-DVFS_LFS_ENABLE=1','-DVFS_PACKED_LFS_ENABLE=1']
        for inc in (folder,SRC/'mod/df',SRC/'mod/vfs',FW/'components/littlefs'):cmd+=['-I',str(inc)]
        if args.sanitize:cmd+=['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer','-fno-pie','-no-pie']
        built=subprocess.run(cmd+[str(folder/'test.c'),'-o',str(exe)],capture_output=True,text=True,timeout=60)
        assert built.returncode==0,built.stdout+built.stderr
        for scenario in range(20):
            run=subprocess.run([str(exe),str(scenario)],capture_output=True,text=True,timeout=20)
            row=dict(scenario=scenario,exit_code=run.returncode,output=run.stdout+run.stderr)
            report['cases'].append(row);assert run.returncode==0,row
    assert hashes()==report['source_sha256']
    report['passed']=True
    if args.report:args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,indent=2)+'\n')
    print('PASS 20 actual C recovery protocol/runtime scenarios; no device writes')

if __name__=='__main__':main()
