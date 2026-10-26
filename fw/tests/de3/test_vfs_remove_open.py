"""Real SPIFFS/VFS/DF regression for REMOVE during an owned file transfer.

Only synthetic NOR and replies are modelled. Optional --baseline uses that
immutable FW root unchanged to prove the old same-file/parent/read bug.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
from test_directory_rename_de3_11 import extract

HERE=Path(__file__).resolve().parent
FW=HERE.parents[1]

def build(fw,folder,name,sanitize=False):
    src=fw/'application/src';driver=src/'mod/vfs/vfs_driver_spiffs.c'
    source=driver.read_text(encoding='utf-8')
    nor=(HERE/'spiffs_integration.c').read_text().split('static void pattern(',1)[0]
    nor=nor.replace('static int32_t write_flash(', 'static int write_failure;\nstatic int32_t write_flash(')
    nor=nor.replace('    writes++; if (len>max_write)', '    if (write_failure) return write_failure;\n    writes++; if (len>max_write)')
    signatures=['static s32_t vfs_spiffs_map_error_code(', 'static int32_t vfs_check_file_path(',
        'static int32_t vfs_check_folder_path(', 'int32_t vfs_spiffs_stat_file(',
        'int32_t vfs_spiffs_open_file(', 'int32_t vfs_spiffs_close_file(', 'int32_t vfs_spiffs_abort_file(',
        'int32_t vfs_spiffs_read_file(', 'int32_t vfs_spiffs_write_file(',
        'int32_t vfs_spiffs_write_file_data(', 'int32_t vfs_spiffs_read_file_data(',
        'int32_t vfs_spiffs_remove_file(', 'int32_t vfs_spiffs_remove_dir(',
        'static int32_t guarded_remove(', 'static int32_t guarded_remove_dir(',
        'static int32_t guarded_open(', 'static int32_t guarded_close(', 'static int32_t guarded_abort(']
    if 'static int32_t vfs_check_namespace(' in source:
        signatures.insert(1, 'static int32_t vfs_check_namespace(')
    structure=source[source.index('typedef struct {'):source.index('} vfs_spiffs_dir_t;')+len('} vfs_spiffs_dir_t;')]
    wrappers='#define VFS_SPIFFS_FOLDER_NAME ".folder"\n'+structure+'\n'+'\n'.join(extract(source,s) for s in signatures)
    code=(HERE/'vfs_abandon_host.c').read_text().split('int main(void){',1)[0]
    code=code.replace('@@NOR@@',nor).replace('@@WRAPPERS@@',wrappers)
    for marker,path in [('@@PERSIST@@',src/'mod/vfs/vfs_persist.c'),('@@PROTOCOL@@',src/'mod/df/df_proto_vfs.c')]:
        code=code.replace(marker,'#include "'+path.as_posix()+'"')
    code+=(HERE/'vfs_remove_open_host.c').read_text()
    c=folder/(name+'.c');c.write_text(code);exe=folder/(name+'.exe');spiffs=fw/'components/spiffs/src'
    command=['gcc','-std=c11','-O1','-g','-include','stdint.h','-Wall','-Wextra',
             '-Wno-unused-function','-Wno-unused-parameter','-Wno-sign-compare','-Wno-return-type']
    if sanitize:command+=['-fsanitize=address,undefined','-fno-omit-frame-pointer','-fno-pie','-no-pie']
    for include in [folder,src/'mod/vfs',src/'mod/df',src/'mod',spiffs,fw/'components/cwalk/include']:
        command+=['-I',str(include)]
    command+=[str(c),str(src/'mod/cwalk2.c'),str(fw/'components/cwalk/src/cwalk.c')]
    command+=list(map(str,sorted(spiffs.glob('*.c'))))+['-o',str(exe)]
    built=subprocess.run(command,capture_output=True,text=True,timeout=90)
    assert built.returncode==0,built.stdout+built.stderr
    return exe

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report',type=Path)
    parser.add_argument('--baseline',type=Path)
    parser.add_argument('--sanitize',action='store_true')
    args=parser.parse_args()
    cases=[(state,target) for state in ('read','write','failed_close','abandoned') for target in ('file','parent','unrelated')]
    cases += [(state,target) for state in ('normal','io_error') for target in ('file','parent')]+[('missing','file')]
    proto=FW/'application/src/mod/df/df_proto_vfs.c'
    report={'device_access':False,'source_root':str(FW),'protocol_sha256':hashlib.sha256(proto.read_bytes()).hexdigest(),
        'sanitizers':args.sanitize,'cases':[],
        'limits':['Synthetic NOR; no physical SPI/BLE timing or power interruption.',
                  'REMOVE is deliberately refused for any path while a file transfer owns a descriptor.',
                  'A failed transfer or multi-file removal is not an atomic rollback.']}
    with tempfile.TemporaryDirectory(prefix='pixl-vfs-remove-open-') as td:
        folder=Path(td);(folder/'boards.h').write_text('')
        (folder/'nrf_log.h').write_text('#define NRF_LOG_INFO(...) ((void)0)\n')
        exe=build(FW,folder,'candidate',args.sanitize)
        for state,target in cases:
            ran=subprocess.run([str(exe),state,target],capture_output=True,text=True,timeout=60)
            report['cases'].append({'state':state,'target':target,'exit_code':ran.returncode,'output':ran.stdout+ran.stderr})
            print(ran.stdout+ran.stderr,end='',flush=True)
            if ran.returncode:break
        if args.baseline:
            baseline=args.baseline.resolve();old=build(baseline,folder,'baseline')
            report['negative_controls']=[]
            for state,target in [('write','file'),('read','file'),('write','parent')]:
                ran=subprocess.run([str(old),state,target],capture_output=True,text=True,timeout=60)
                report['negative_controls'].append({'state':state,'target':target,'exit_code':ran.returncode,'output':ran.stdout+ran.stderr})
            report['baseline_protocol_sha256']=hashlib.sha256((baseline/'application/src/mod/df/df_proto_vfs.c').read_bytes()).hexdigest()
    report['passed']=len(report['cases'])==len(cases) and all(case['exit_code']==0 for case in report['cases'])
    if args.baseline:report['passed'] &= all(case['exit_code']!=0 and 'last_reply.status==DF_STATUS_ERR' in case['output'] for case in report['negative_controls'])
    if args.report:args.report.write_text(json.dumps(report,indent=2)+'\n')
    assert report['passed'],report
    print(f'PASS {len(cases)} real SPIFFS/VFS/DF REMOVE cases, 240 rejected requests with unchanged NOR/cache/ownership'+
          ('; three preserved baseline failures' if args.baseline else ''))

if __name__=='__main__':main()
