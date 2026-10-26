"""Actual SPIFFS + VFS/DF/persistence close and final-abandon lifecycle, synthetic NOR only."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
from test_directory_rename_de3_11 import extract

HERE=Path(__file__).resolve().parent
FW=HERE.parents[1]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report',type=Path)
    parser.add_argument('--baseline',type=Path,help='Preserved FW root for old DF-cleanup negative control')
    args=parser.parse_args()
    src=FW/'application/src'; driver=src/'mod/vfs/vfs_driver_spiffs.c'
    source=driver.read_text(encoding='utf-8')
    nor=(HERE/'spiffs_integration.c').read_text().split('static void pattern(',1)[0]
    nor=nor.replace('static int32_t write_flash(', 'static int write_failure;\nstatic int32_t write_flash(')
    nor=nor.replace('    writes++; if (len>max_write)', '    if (write_failure) return write_failure;\n    writes++; if (len>max_write)')
    signatures=['static s32_t vfs_spiffs_map_error_code(', 'static int32_t vfs_check_file_path(',
        'int32_t vfs_spiffs_open_file(', 'int32_t vfs_spiffs_close_file(', 'int32_t vfs_spiffs_abort_file(',
        'int32_t vfs_spiffs_read_file(', 'int32_t vfs_spiffs_write_file(',
        'int32_t vfs_spiffs_write_file_data(', 'int32_t vfs_spiffs_read_file_data(',
        'static int32_t guarded_open(', 'static int32_t guarded_close(', 'static int32_t guarded_abort(']
    if 'static int32_t vfs_check_namespace(' in source:
        signatures.insert(1, 'static int32_t vfs_check_namespace(')
    code=(HERE/'vfs_abandon_host.c').read_text().replace('@@NOR@@',nor)
    code=code.replace('@@WRAPPERS@@','\n'.join(extract(source,s) for s in signatures))
    for marker,path in [('@@PERSIST@@',src/'mod/vfs/vfs_persist.c'),('@@PROTOCOL@@',src/'mod/df/df_proto_vfs.c')]:
        code=code.replace(marker,'#include "'+path.as_posix()+'"')
    with tempfile.TemporaryDirectory(prefix='pixl-vfs-abandon-') as td:
        folder=Path(td);(folder/'boards.h').write_text('')
        (folder/'nrf_log.h').write_text('#define NRF_LOG_INFO(...) ((void)0)\n')
        c=folder/'test.c';c.write_text(code);exe=folder/'test.exe'
        spiffs=FW/'components/spiffs/src'
        command=['gcc','-std=c11','-O1','-g','-include','stdint.h','-Wall','-Wextra',
            '-Wno-unused-function','-Wno-unused-parameter','-Wno-sign-compare','-Wno-return-type']
        for include in [folder,src/'mod/vfs',src/'mod/df',src/'mod',spiffs,FW/'components/cwalk/include']:
            command+=['-I',str(include)]
        command+=[str(c),str(src/'mod/cwalk2.c'),str(FW/'components/cwalk/src/cwalk.c')]
        command+=list(map(str,sorted(spiffs.glob('*.c'))))+['-o',str(exe)]
        compiled=subprocess.run(command,capture_output=True,text=True,timeout=90)
        assert compiled.returncode==0,compiled.stdout+compiled.stderr
        run=subprocess.run([str(exe)],capture_output=True,text=True,timeout=60)
        report={'device_access':False,'source_root':str(FW),'driver_sha256':hashlib.sha256(driver.read_bytes()).hexdigest(),
            'exit_code':run.returncode,'output':run.stdout+run.stderr,
            'limits':['Host synthetic NOR; no physical SPI timing or power interruption.',
                      'Abort discards uncommitted cache; a failed transfer is not an atomic rollback.']}
        if args.baseline:
            current=src/'mod/df/df_proto_vfs.c'
            old=(args.baseline/'application/src/mod/df/df_proto_vfs.c').read_text()
            signature='void df_proto_vfs_cleanup('
            control=current.read_text().replace(extract(current.read_text(),signature),extract(old,signature))
            negative=code.replace('#include "'+current.as_posix()+'"',control)
            c.write_text(negative)
            control_compile=subprocess.run(command,capture_output=True,text=True,timeout=90)
            assert control_compile.returncode==0,control_compile.stdout+control_compile.stderr
            control_run=subprocess.run([str(exe)],capture_output=True,text=True,timeout=60)
            report['negative_control']={'scope':'Only unchanged DE3.10 DF cleanup against fixed cache backend',
                'exit_code':control_run.returncode,'output':control_run.stdout+control_run.stderr}
            assert control_run.returncode!=0,'Old cleanup unexpectedly passed the resource-release assertion'
            print('PASS old DF cleanup negative control fails descriptor/resource-release assertion')
        if args.report:args.report.write_text(json.dumps(report,indent=2)+'\n')
        print(report['output'],end='');assert run.returncode==0,report

if __name__=='__main__':main()
