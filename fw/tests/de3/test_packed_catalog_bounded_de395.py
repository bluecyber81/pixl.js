"""Bounded catalogue collision/transaction tests on real PackedFS and LittleFS.

Set PIXL_CATALOG_BASELINE to an immutable prior packed_fs.c for a measured
comparison, PIXL_CATALOG_REPORT for JSON, PIXL_SANITIZE=1 for ASan/UBSan.
No test accesses a physical device or changes the input source files.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
FW = HERE.parents[1]


class BoundedCatalogueTests(unittest.TestCase):
    def test_collision_search_and_transaction_headers(self):
        core = FW / 'application/src/mod/vfs'
        lfs = FW / 'components/littlefs'
        arm = os.environ.get('PIXL_ARM32') == '1'
        sanitize = os.environ.get('PIXL_SANITIZE') == '1' and not arm
        compiler = shutil.which('arm-linux-gnueabihf-gcc' if arm else 'gcc')
        self.assertIsNotNone(compiler)
        production = core / 'packed_fs.c'
        sources = [production, core / 'packed_fs.h', core / 'vfs_driver_packed.c',
                   lfs / 'lfs.c', lfs / 'lfs.h', lfs / 'lfs_util.c', lfs / 'lfs_util.h']
        sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
        before = {str(p.relative_to(FW)): sha(p) for p in sources}
        with tempfile.TemporaryDirectory(prefix='packed-catalogue-de395-') as tmp:
            folder = Path(tmp)
            (folder / 'boards.h').write_text('#pragma once\n#define VFS_PACKED_LFS_ENABLE 1\n')
            (folder / 'mui_mem.h').write_bytes((HERE / 'packed_test_mui_mem.h').read_bytes())
            (folder / 'hal_spi_flash.h').write_text('''#pragma once
#include <stdint.h>
#include <stddef.h>
#define NRF_SUCCESS 0
typedef struct { uint32_t block_size,block_count,page_size; } flash_info_t;
uint32_t hal_spi_flash_init(void);uint32_t hal_spi_flash_info(flash_info_t*);
uint32_t hal_spi_flash_read(uint32_t,void*,size_t);uint32_t hal_spi_flash_prog(uint32_t,const void*,size_t);
uint32_t hal_spi_flash_erase(uint32_t);
''')

            def run(source, label):
                exe = folder / label
                command = [compiler, '-std=c11', '-O1', '-g', '-Wall', '-Wextra', '-Werror',
                           '-Wno-misleading-indentation', '-Wno-sign-compare',
                           '-DLFS_NO_MALLOC', '-DLFS_NO_DEBUG', '-DLFS_NO_WARN', '-DLFS_NO_ERROR',
                           '-DVFS_PACKED_LFS_ENABLE', '-DSTORE_CORE="' + str(source) + '"',
                           '-DSTORE_ADAPTER="' + str(core / 'vfs_driver_packed.c') + '"',
                           '-DCONTRACT="' + str(HERE / 'packed_vfs_persistence_de344.c') + '"']
                for path in [folder, core, lfs, HERE]:
                    command += ['-I', str(path)]
                command += [str(HERE / 'packed_catalog_bounded_de395.c'),
                            str(HERE / 'packed_vfs_nor_de344.c'), str(core / 'vfs_persist.c'),
                            str(lfs / 'lfs.c'), str(lfs / 'lfs_util.c'), '-o', str(exe)]
                if arm:
                    command += ['-static']
                elif sanitize:
                    command += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all',
                                '-fno-omit-frame-pointer', '-fno-pie', '-no-pie']
                built = subprocess.run(command, text=True, capture_output=True, timeout=60)
                self.assertEqual(built.returncode, 0, built.stdout + built.stderr)
                ran = subprocess.run((['qemu-arm'] if arm else []) + [str(exe)],
                                     text=True, capture_output=True, timeout=180)
                self.assertEqual(ran.returncode, 0, ran.stdout + ran.stderr)
                observations = [json.loads(line) for line in ran.stdout.splitlines() if line.startswith('{')]
                self.assertEqual(len(observations), 6)
                self.assertTrue(observations[-1]['passed'])
                self.assertGreater(observations[-1]['readFaultCases'], 0)
                self.assertEqual(observations[-1]['corruptionCases'], 5)
                self.assertEqual(observations[-1]['liveAtEnd'], 0)
                self.assertEqual(observations[-1]['pointerBytes'], 4 if arm else struct.calcsize('P'))
                self.assertEqual([x['groups'] for x in observations[:-1]], [28, 32, 33, 54, 64])
                print(label, ran.stdout.strip())
                return dict(sourceSha256=sha(source), observations=observations)

            current = run(production, 'current')
            # Fixed legal fixtures, pinned LittleFS 2.8 and cold physical-read
            # cache: guard the measured collision regression without requiring
            # a historical source checkout during normal CI. Generous ceilings
            # remain below the unchanged App667 scan counts (52/1726/2284).
            ceilings = {33: 40, 54: 1400, 64: 1800}
            for observation in current['observations'][:-1]:
                if observation['groups'] in ceilings:
                    self.assertLessEqual(observation['absentRepeatReads'],
                                         ceilings[observation['groups']])
            baseline = None
            if os.environ.get('PIXL_CATALOG_BASELINE'):
                baseline = run(Path(os.environ['PIXL_CATALOG_BASELINE']).resolve(), 'baseline')
                for a, b in zip(current['observations'][:-1], baseline['observations'][:-1]):
                    self.assertEqual(a['pfsBytes'], b['pfsBytes'])
                    self.assertEqual(a['steadyRequestedHeap'], b['steadyRequestedHeap'])
                    for metric in ['absentFirstReads', 'absentRepeatReads', 'lateFirstReads',
                                   'lateRepeatReads', 'earlyReads', 'setattrReads', 'subtreeRemoveReads']:
                        self.assertLessEqual(a[metric], b[metric], (a['groups'], metric))
                    if a['groups'] > 32:
                        self.assertLess(a['absentRepeatReads'], b['absentRepeatReads'])
            self.assertEqual(before, {str(p.relative_to(FW)): sha(p) for p in sources})
            if os.environ.get('PIXL_CATALOG_REPORT'):
                Path(os.environ['PIXL_CATALOG_REPORT']).write_text(json.dumps(dict(
                    passed=True, arm32=arm, sanitize=sanitize, sourceHashes=before,
                    current=current, baseline=baseline,
                    limitations=['Synthetic legal PFS1 groups on a 2-MiB NOR model.',
                                 'Read counts are host operations, not device time or Bluetooth throughput.',
                                 'Heap count covers requested PackedFS allocations, not a whole-firmware RAM watermark.',
                                 'Lookup verifies the immutable mounted groups and each visited entry; not every unrelated index entry on every query.']),
                    indent=2) + '\n')


if __name__ == '__main__':
    unittest.main()
