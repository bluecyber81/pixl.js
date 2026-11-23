"""Exact PFS/LittleFS pinned-group cleanup, including final deferred work.

PIXL_GC_PINNED_BASELINE_FW optionally selects the immutable prior fw/ tree.
PIXL_GC_PINNED_REPORT writes source-bound measurements; PIXL_SANITIZE=1 enables
ASan/UBSan. This is a synthetic 2-MiB NOR test, never a device/battery test.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
FW = HERE.parents[1]


class PinnedGcTests(unittest.TestCase):
    def test_same_final_storage_with_fewer_scans(self):
        compiler = shutil.which('gcc')
        self.assertIsNotNone(compiler)
        sanitize = os.environ.get('PIXL_SANITIZE') == '1'
        sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
        template = HERE / 'packed_gc_pinned_de399.c.in'
        catalogue = HERE / 'packed_catalog_bounded_de395.c'
        generated = template.read_text().replace(
            '/* CATALOGUE_FIXTURE */', catalogue.read_text().split('static void compare_case(')[0])
        with tempfile.TemporaryDirectory(prefix='packed-gc-pinned-de399-') as tmp:
            folder = Path(tmp)
            unit = folder / 'gc_pinned.c'
            unit.write_text(generated)
            (folder / 'boards.h').write_text('#pragma once\n#define VFS_PACKED_LFS_ENABLE 1\n')
            (folder / 'app_util_platform.h').write_text('#define CRITICAL_REGION_ENTER() do {\n#define CRITICAL_REGION_EXIT() } while(0)\n')
            (folder / 'app_timer.h').write_text('''#pragma once
#include <stdint.h>
#define APP_TIMER_CONFIG_RTC_FREQUENCY 0
#define APP_TIMER_CLOCK_FREQ 32768u
static inline uint32_t app_timer_cnt_get(void) { return 0; }
static inline uint32_t app_timer_cnt_diff_compute(uint32_t a, uint32_t b) { return (a-b)&0xffffffu; }
''')
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

            def run(tree, label, optimized):
                core = tree / 'application/src/mod/vfs'
                lfs = tree / 'components/littlefs'
                tests = tree / 'tests/de3'
                sources = [core / n for n in ['packed_fs.c', 'packed_fs.h', 'vfs_driver_packed.c', 'vfs_persist.c']]
                sources += [core.parent / 'runtime_diag.c', core.parent / 'runtime_diag.h']
                sources += [lfs / n for n in ['lfs.c', 'lfs.h', 'lfs_util.c', 'lfs_util.h']]
                sources += [tests / n for n in ['packed_vfs_persistence_de344.c', 'packed_vfs_nor_de344.c']]
                before = {str(p.relative_to(tree)): sha(p) for p in sources}
                exe = folder / label
                command = [compiler, '-std=c11', '-O1', '-g', '-Wall', '-Wextra', '-Werror',
                           '-Wno-misleading-indentation', '-Wno-sign-compare', '-Wno-unused-function',
                           '-DLFS_NO_MALLOC', '-DLFS_NO_DEBUG', '-DLFS_NO_WARN', '-DLFS_NO_ERROR',
                           '-DVFS_PACKED_LFS_ENABLE', '-DBOARD_LCD=1', '-DPIXL_RUNTIME_DIAGNOSTICS=1',
                           '-DEXPECTED_OPTIMIZED=' + str(int(optimized)),
                           '-DSTORE_CORE="' + str(core / 'packed_fs.c') + '"',
                           '-DSTORE_ADAPTER="' + str(core / 'vfs_driver_packed.c') + '"',
                           '-DCONTRACT="' + str(tests / 'packed_vfs_persistence_de344.c') + '"']
                for path in [folder, core, lfs, tests, core.parent]:
                    command += ['-I', str(path)]
                command += [str(unit), str(tests / 'packed_vfs_nor_de344.c'),
                            str(core / 'vfs_persist.c'), str(core.parent / 'runtime_diag.c'),
                            str(lfs / 'lfs.c'), str(lfs / 'lfs_util.c'), '-o', str(exe)]
                if sanitize:
                    command += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all',
                                '-fno-omit-frame-pointer', '-fno-pie', '-no-pie']
                built = subprocess.run(command, text=True, capture_output=True, timeout=60)
                self.assertEqual(built.returncode, 0, built.stdout + built.stderr)
                environment = dict(os.environ, PIXL_GC_PINNED_IMAGE_PREFIX=str(folder / label))
                ran = subprocess.run([str(exe)], text=True, capture_output=True, timeout=180, env=environment)
                self.assertEqual(ran.returncode, 0, ran.stdout + ran.stderr)
                observations = [json.loads(line) for line in ran.stdout.splitlines() if line.startswith('{')]
                self.assertEqual(len(observations), 6)
                self.assertTrue(observations[-1]['passed'])
                self.assertEqual(observations[-1]['errorInvalidationCases'], 2)
                self.assertEqual(observations[-1]['liveAtEnd'], 0)
                self.assertEqual(before, {str(p.relative_to(tree)): sha(p) for p in sources})
                print(label, ran.stdout.strip())
                images = {str(n): sha(folder / f'{label}-{n}.nor') for n in [28, 32, 33, 54, 64]}
                return dict(sourceHashes=before, observations=observations, norEndImagesSha256=images)

            current = run(FW, 'current', True)
            baseline = None
            if os.environ.get('PIXL_GC_PINNED_BASELINE_FW'):
                baseline = run(Path(os.environ['PIXL_GC_PINNED_BASELINE_FW']).resolve(), 'baseline', False)
                for newer, older in zip(current['observations'][:-1], baseline['observations'][:-1]):
                    for field in ['groups', 'recordsPerGroup', 'totalPrograms', 'totalErases',
                                  'pfsBytes', 'steadyRequestedHeap', 'peakRequestedHeap',
                                  'finalGeneration', 'finalFreeBytes', 'finalDiskCrc32', 'finalObsoleteGroups']:
                        self.assertEqual(newer[field], older[field], (newer['groups'], field))
                    self.assertLess(newer['totalRootScans'], older['totalRootScans'])
                    self.assertLess(newer['totalReads'], older['totalReads'])
                    self.assertLess(newer['sixRepeatedEditReads'], older['sixRepeatedEditReads'])
                    self.assertLess(newer['abortReads'], older['abortReads'])
                    self.assertLess(newer['commitReads'], older['commitReads'])
                    group = newer['groups']
                    self.assertEqual((folder / f'current-{group}.nor').read_bytes(),
                                     (folder / f'baseline-{group}.nor').read_bytes())
            if os.environ.get('PIXL_GC_PINNED_REPORT'):
                Path(os.environ['PIXL_GC_PINNED_REPORT']).write_text(json.dumps(dict(
                    passed=True, sanitize=sanitize, templateSha256=sha(template), catalogueFixtureSha256=sha(catalogue),
                    current=current, baseline=baseline, endImagesByteEqual=True if baseline else None,
                    measuredSequence='Initial edit, six further edits, writer abort, writer commit, explicit GC, '
                                     'old data/metadata traversal and nonfinal closes, final retaining close, explicit GC.',
                    limitations=['Synthetic legal groups on a 2-MiB NOR with the actual PFS and LittleFS sources.',
                                 'Read counts are backend operations, not device timing, current draw or battery life.',
                                 'Correctness verification of every object after remount is outside the operation counters.',
                                 'Requested heap/struct size are native test values, not the whole ARM firmware watermark.']),
                    indent=2) + '\n')


if __name__ == '__main__':
    unittest.main()
