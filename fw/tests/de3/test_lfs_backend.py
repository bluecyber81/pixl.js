"""Complete LittleFS/VFS/journal against a deterministic synchronous RAM flash."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import tempfile

FW = Path(__file__).resolve().parents[2]
FILES = ['application/src/mod/vfs/vfs_driver_lfs.c', 'application/src/mod/vfs/vfs_persist.c',
         'application/src/mod/vfs/vfs.h', 'application/src/mod/cwalk2.c',
         'components/littlefs/lfs.c', 'components/littlefs/lfs.h',
         'components/littlefs/lfs_util.c', 'components/littlefs/lfs_util.h',
         'tests/de3/lfs_backend_host.c', 'tests/de3/test_lfs_backend.py']

def hashes(): return {p: hashlib.sha256((FW/p).read_bytes()).hexdigest() for p in FILES}

def run(sanitize, baseline_root=None):
    results = []
    with tempfile.TemporaryDirectory(prefix='pixl-real-lfs-') as td:
        temp = Path(td)
        headers = {
          'boards.h': '#define VFS_LFS_ENABLE\n',
          'm-string.h': '/* Legacy driver includes this but uses no Mlib API. */\n',
          'nrf_log.h': '#define NRF_LOG_INFO(...) ((void)0)\n#define NRF_LOG_WARNING(...) ((void)0)\n#define nrf_log_push(x) (x)\n',
          'mui_mem.h': '#include <stddef.h>\nvoid *mui_mem_malloc(size_t);\nvoid mui_mem_free(void*);\n',
          'hal_spi_flash.h': '#ifndef TEST_FLASH_H\n#define TEST_FLASH_H\n#include <stdint.h>\n#include <stddef.h>\n#define NRF_SUCCESS 0\ntypedef int ret_code_t;\ntypedef struct{uint32_t block_size,block_count,page_size;}flash_info_t;\nret_code_t hal_spi_flash_init(void);\nret_code_t hal_spi_flash_info(flash_info_t*);\nret_code_t hal_spi_flash_read(uint32_t,void*,size_t);\nret_code_t hal_spi_flash_prog(uint32_t,const void*,size_t);\nret_code_t hal_spi_flash_erase(uint32_t);\n#endif\n',
        }
        for name, content in headers.items(): (temp/name).write_text(content, encoding='utf-8', newline='\n')
        cmd = shlex.split(os.environ.get('CC', 'gcc')) + ['-std=c11', '-O1', '-g', '-Wall', '-Wextra',
            '-Wno-unused-parameter', '-Wno-sign-compare', '-DLFS_NO_DEBUG', '-DLFS_NO_WARN', '-DLFS_NO_ERROR']
        if baseline_root is None: cmd += ['-Werror', '-DLFS_NO_MALLOC']
        if sanitize: cmd += ['-fsanitize=address,undefined', '-fno-omit-frame-pointer', '-fno-pie', '-no-pie']
        source_root = baseline_root or FW
        for include in [temp, source_root/'application/src/mod/vfs', FW/'application/src/mod',
                        FW/'components/littlefs', FW/'components/cwalk/include']:
            cmd += ['-I', str(include)]
        sources = [FW/'tests/de3/lfs_backend_host.c', FW/'application/src/mod/vfs/vfs_persist.c',
                   FW/'application/src/mod/cwalk2.c', FW/'components/cwalk/src/cwalk.c',
                   FW/'components/littlefs/lfs.c', FW/'components/littlefs/lfs_util.c']
        binary = temp/('probe.exe' if os.name=='nt' else 'probe')
        built = subprocess.run(cmd + list(map(str,sources)) + ['-o',str(binary)],capture_output=True,text=True,timeout=120)
        assert built.returncode == 0, built.stdout+built.stderr
        for case in [0] if baseline_root else range(19):
            result = subprocess.run([str(binary),str(case)],capture_output=True,text=True,timeout=30)
            expected = 71 if baseline_root else 0
            assert result.returncode == expected, (case,result.returncode,result.stdout,result.stderr)
            assert 'runtime error:' not in result.stderr and 'AddressSanitizer' not in result.stderr
            if baseline_root:
                assert 'mount=0' in result.stderr and 'prog=0' not in result.stderr and 'erase=0' not in result.stderr
            print(result.stderr.strip() if baseline_root else result.stdout.strip())
            results.append({'case':case,'returncode':result.returncode,'stdout':result.stdout,'stderr':result.stderr})
    return results

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--sanitize',action='store_true');p.add_argument('--output',type=Path)
    p.add_argument('--baseline-root',type=Path);args=p.parse_args()
    before=hashes();report={'source_sha256':before,'sanitize':args.sanitize,'cases':run(args.sanitize)}
    if args.baseline_root:
        report['negative_control']=run(args.sanitize,args.baseline_root)
        report['negative_source_sha256']=hashlib.sha256((args.baseline_root/'application/src/mod/vfs/vfs_driver_lfs.c').read_bytes()).hexdigest()
    report['source_sha256_after']=hashes();assert before==report['source_sha256_after'];report['passed']=True
    if args.output:
        args.output.mkdir(parents=True,exist_ok=True)
        (args.output/'RESULTS.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
    print('PASS actual LittleFS + VFS + journal; no hardware actions')
