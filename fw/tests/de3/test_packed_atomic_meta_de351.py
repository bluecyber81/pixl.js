"""Exclusive writer collection optimization: snapshot lifetime and reserve fallback.

Set PIXL_SANITIZE=1 under Linux for ASan/UBSan, or PIXL_ARM32=1 for 32-bit
ARM/QEMU. Neither mode touches a physical device or a user's backup.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

HERE=Path(__file__).resolve().parent
FW=HERE.parents[1]


class PackedAtomicMetaTests(unittest.TestCase):
    def test_atomic_raw128_and_snapshot_identity(self):
        core=FW/'application/src/mod/vfs'
        lfs=FW/'components/littlefs'
        arm=os.environ.get('PIXL_ARM32')=='1'
        sanitize=os.environ.get('PIXL_SANITIZE')=='1' and not arm
        source=[core/name for name in ['packed_fs.c','packed_fs.h','vfs_driver_packed.c',
                'vfs_persist.c','vfs_persist.h','vfs.h']]
        source += list((HERE/'packed_de350_fixture').glob('*'))+[HERE/'packed_compat_de351.c']
        source += [FW/'application/src/mod/df/df_proto_vfs.c']
        source += [lfs/name for name in ['lfs.c','lfs.h','lfs_util.c','lfs_util.h']]
        source += [HERE/name for name in ['packed_vfs_persistence_de344.c',
                   'packed_vfs_nor_de344.c','packed_vfs_nor_de344.h','packed_atomic_meta_de351.c']]
        sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
        before={p.relative_to(FW).as_posix():sha(p) for p in source}
        compiler=shutil.which('arm-linux-gnueabihf-gcc' if arm else 'gcc')
        self.assertIsNotNone(compiler)
        with tempfile.TemporaryDirectory(prefix='packed-vfs-de344-') as tmp:
            folder=Path(tmp)
            (folder/'nrf_log.h').write_text('#define NRF_LOG_INFO(...) ((void)0)\n')
            (folder/'ble_main.h').write_text('void ble_disable(void);\n')
            (folder/'utils2.h').write_text('void system_reboot(void);\n')
            (folder/'boards.h').write_text('#pragma once\n#define VFS_PACKED_LFS_ENABLE 1\n')
            (folder/'mui_mem.h').write_text('#include <stddef.h>\nvoid *mui_mem_malloc(size_t);\nvoid mui_mem_free(void*);\n')
            (folder/'hal_spi_flash.h').write_text('''#pragma once
#include <stdint.h>
#include <stddef.h>
#define NRF_SUCCESS 0
typedef struct { uint32_t block_size,block_count,page_size; } flash_info_t;
uint32_t hal_spi_flash_init(void);uint32_t hal_spi_flash_info(flash_info_t*);
uint32_t hal_spi_flash_read(uint32_t,void*,size_t);uint32_t hal_spi_flash_prog(uint32_t,const void*,size_t);
uint32_t hal_spi_flash_erase(uint32_t);
''')
            exe=folder/'contract.exe'
            command=[compiler,'-std=c11','-O1','-g','-Wall','-Wextra','-Werror',
                     '-Wno-misleading-indentation','-Wno-sign-compare',
                     '-DLFS_NO_MALLOC','-DLFS_NO_DEBUG','-DLFS_NO_WARN','-DLFS_NO_ERROR',
                     '-DPIXL_RUNTIME_DIAGNOSTICS=1','-DVFS_PACKED_LFS_ENABLE','-DPROTOCOL="'+(FW/'application/src/mod/df/df_proto_vfs.c').as_posix()+'"','-DSTORE_CORE="'+(core/'packed_fs.c').as_posix()+'"',
                     '-DSTORE_ADAPTER="'+(core/'vfs_driver_packed.c').as_posix()+'"',
                     '-DCONTRACT="'+(HERE/'packed_vfs_persistence_de344.c').as_posix()+'"']
            for path in [folder,core,lfs,HERE,FW/'application/src/mod/df']:command += ['-I',str(path)]
            command += [str(HERE/'packed_atomic_meta_de351.c'),str(HERE/'packed_vfs_nor_de344.c'),
                        str(core/'vfs_persist.c'),str(lfs/'lfs.c'),str(lfs/'lfs_util.c'),'-o',str(exe)]
            if arm:command+=['-static']
            elif sanitize:command+=['-fsanitize=address,undefined','-fno-sanitize-recover=all',
                                    '-fno-omit-frame-pointer','-fno-pie','-no-pie']
            built=subprocess.run(command,capture_output=True,text=True,timeout=60)
            self.assertEqual(built.returncode,0,built.stdout+built.stderr)
            ran=subprocess.run((['qemu-arm'] if arm else [])+[str(exe),str(folder/'compat.img')],capture_output=True,text=True,timeout=60)
            self.assertEqual(ran.returncode,0,ran.stdout+ran.stderr)
            self.assertIn('PASS',ran.stdout)
            # Exact old core remains a test fixture, never linked into firmware.
            old=HERE/'packed_de350_fixture'
            self.assertEqual(sha(old/'packed_fs.c'),'e7f6992c0ba3814ebac6f29ea25a510f79f223e50ea072e59488e1e9eaaf4f20')
            self.assertEqual(sha(old/'packed_fs.h'),'436e5027720a585a952f50098e349c4f5d2aced72d860e7aa60b8afddfe176ed')
            for phase,engine in [(1,old),(2,core)]:
                compat=folder/('compat'+str(phase)+'.exe')
                flags=['-static'] if arm else ['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-pie','-no-pie'] if sanitize else []
                cmd=[compiler,'-std=c11','-O1','-DLFS_NO_MALLOC','-DLFS_NO_DEBUG','-DLFS_NO_WARN','-DLFS_NO_ERROR',*flags,
                    '-I'+str(engine),'-I'+str(lfs),'-I'+str(HERE),str(HERE/'packed_compat_de351.c'),
                    str(HERE/'packed_vfs_nor_de344.c'),str(engine/'packed_fs.c'),str(lfs/'lfs.c'),str(lfs/'lfs_util.c'),'-o',str(compat)]
                built_compat=subprocess.run(cmd,capture_output=True,text=True,timeout=60)
                self.assertEqual(built_compat.returncode,0,built_compat.stdout+built_compat.stderr)
                readback=subprocess.run((['qemu-arm'] if arm else [])+[str(compat),str(folder/'compat.img'),str(phase)],capture_output=True,text=True,timeout=60)
                self.assertEqual(readback.returncode,0,readback.stdout+readback.stderr)

            observations=[json.loads(line) for line in ran.stdout.splitlines() if line.startswith('{')]
            self.assertEqual(len(observations),1)
            self.assertTrue(observations[0]['passed'])
            self.assertGreater(observations[0]['interruptedCases'],10)
            self.assertEqual(observations[0]['pointerBytes'],4 if arm else __import__('struct').calcsize('P'))
            self.assertEqual(observations[0]['liveAtEnd'],0)
            self.assertEqual(before,{p.relative_to(FW).as_posix():sha(p) for p in source})
            print(ran.stdout.strip())
            destination=os.environ.get('PIXL_ATOMIC_META_REPORT')
            if destination:
                report=dict(passed=True,deviceAccess=False,arm32=arm,sanitize=sanitize,
                            sourceHashes=before,sourcesUnchanged=True,observations=observations,
                            limitations=['Synthetic NOR and malloc; no physical SPI, BLE/NFC or power test.',
                              'Requested allocations bounded to18KiB; not real TLSF overhead or a whole-firmware RAM watermark.',
                              'Reserve-space pressure is injected at lfs_fs_size; not a physical-full-flash test.',
                              'ARM32 QEMU verifies32-bit ABI, not Cortex-M4 timing.'])
                Path(destination).write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')


if __name__=='__main__':
    unittest.main()
