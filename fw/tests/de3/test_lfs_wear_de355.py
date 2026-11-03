"""Real NOR wear expansion, near-full guard and interrupted transaction checks.

PIXL_SANITIZE=1: native ASan/UBSan. PIXL_ARM32=1: static ARM32/QEMU.
The old variant reverses only the upstream threshold, keeping both backports.
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
OLD = 'if ((lfs_size_t)size < lfs->block_count/2) {'
NEW = 'if (lfs->block_count - size > lfs->block_count/8) {'


class LittleFSWearTests(unittest.TestCase):
    def test_actual_wear_and_power_loss(self):
        lfs = FW / 'components/littlefs'
        sources = [HERE / name for name in ['lfs_wear_de355.c', 'test_lfs_wear_de355.py',
                   'packed_vfs_nor_de344.c', 'packed_vfs_nor_de344.h']]
        sources += [lfs / name for name in ['lfs.c', 'lfs.h', 'lfs_util.c', 'lfs_util.h']]
        sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
        before = {p.relative_to(FW).as_posix(): sha(p) for p in sources}
        core = (lfs / 'lfs.c').read_text(encoding='utf-8')
        self.assertEqual(core.count(NEW), 1)
        self.assertNotIn(OLD, core)
        old = core.replace(NEW, OLD)
        self.assertNotEqual(old, core)
        arm = os.environ.get('PIXL_ARM32') == '1'
        sanitize = os.environ.get('PIXL_SANITIZE') == '1' and not arm
        compiler = shutil.which('arm-linux-gnueabihf-gcc' if arm else 'gcc')
        self.assertIsNotNone(compiler)
        observations = []
        negative_control = None
        with tempfile.TemporaryDirectory(prefix='lfs-wear-de355-') as tmp:
            root = Path(tmp)
            for variant in ['old-threshold', 'candidate']:
                cfile = root / (variant + '.c')
                cfile.write_text(old if variant == 'old-threshold' else core, encoding='utf-8')
                exe = root / (variant + '.exe')
                command = [compiler, '-std=c11', '-O1', '-g', '-Wall', '-Wextra', '-Werror',
                           '-DLFS_NO_MALLOC', '-DLFS_NO_DEBUG', '-DLFS_NO_WARN', '-DLFS_NO_ERROR',
                           '-I' + str(lfs), '-I' + str(HERE), str(HERE / 'lfs_wear_de355.c'),
                           str(HERE / 'packed_vfs_nor_de344.c'), str(cfile),
                           str(lfs / 'lfs_util.c'), '-o', str(exe)]
                if arm:
                    command += ['-static']
                elif sanitize:
                    command += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all',
                                '-fno-omit-frame-pointer', '-fno-pie', '-no-pie']
                built = subprocess.run(command, capture_output=True, text=True, timeout=90)
                self.assertEqual(built.returncode, 0, built.stdout + built.stderr)
                prefix = (['qemu-arm'] if arm else []) + [str(exe)]
                for percent, cycles, rounds in [(60, 2, 256), (90, 2, 256), (60, 500, 10000)]:
                    expected = variant == 'candidate' and percent == 60
                    run = subprocess.run(prefix + list(map(str, [percent, cycles, rounds, int(expected)])),
                                         capture_output=True, text=True, timeout=100)
                    self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
                    row = json.loads(run.stdout)
                    row['variant'] = variant
                    self.assertTrue(row['passed'])
                    self.assertEqual(row['pointerBytes'], 4 if arm else __import__('struct').calcsize('P'))
                    if expected:
                        self.assertGreater(row['faultCases'], 0)
                        self.assertEqual(row['faultCases'], 3 * row['expansionEvents'])
                        self.assertGreater(row['eraseBlocks'], 2)
                    else:
                        self.assertEqual(row['rootMoves'], 0)
                    observations.append(row)
                    print(json.dumps(row), flush=True)
                if variant == 'old-threshold':
                    # The candidate's real relocation invariant must reject
                    # the old core semantically, not fail to build or crash.
                    negative = subprocess.run(prefix + ['60', '2', '256', '1'],
                                              capture_output=True, text=True, timeout=100)
                    self.assertEqual(negative.returncode, 71, negative.stdout + negative.stderr)
                    self.assertIn('expect_move ? moves>0 : moves==0', negative.stderr)
                    negative_control = dict(exitCode=negative.returncode, stdout=negative.stdout,
                                            stderr=negative.stderr, expectedInvariantRejected=True)
            for cycles in [2, 500]:
                pair = [x for x in observations if x['percent'] == 60 and x['blockCycles'] == cycles]
                self.assertLess(pair[1]['maxErases'], pair[0]['maxErases'])
                self.assertEqual(pair[1]['finalBlocks'] - pair[0]['finalBlocks'], 2)
        self.assertEqual(before, {p.relative_to(FW).as_posix(): sha(p) for p in sources})
        report = dict(passed=True, deviceAccess=False, arm32=arm, sanitize=sanitize,
                      sourceHashes=before, sourcesUnchanged=True, oldPredicateRejected=True,
                      negativeControl=negative_control,
                      observations=observations,
                      limits=['Synthetic NOR, not physical wear or power-failure measurement.',
                              '500 cycles is production; 2 cycles accelerates branch coverage.',
                              '60% and 90% synthetic ballast; not a fresh user collection read.',
                              'Expansion consumes two permanent blocks (8192 bytes) in these cases.',
                              'ARM32/QEMU checks ABI, not Cortex-M4 timing.'])
        if os.environ.get('PIXL_WEAR_REPORT'):
            Path(os.environ['PIXL_WEAR_REPORT']).write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')


if __name__ == '__main__':
    unittest.main()
