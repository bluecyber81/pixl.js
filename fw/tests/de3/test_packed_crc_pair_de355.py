"""Production paired CRC, independent bitwise/LittleFS oracles and mutations.

PIXL_SANITIZE=1 selects ASan/UBSan; PIXL_ARM32=1 selects ARM32/QEMU.
These modes prove arithmetic and memory behavior, not physical device timing.
"""
from pathlib import Path
import json
import unittest
from root_host import SRC
from packed_crc_source import crc_declarations, run_harness


def harness(mutant=None):
    source = (SRC / 'mod/vfs/packed_fs.c').read_text(encoding='utf8')
    production = crc_declarations(source, 'crc', 'crc_pair')
    if mutant:
        before, after = {
            'record': ('c = (c >> 8) ^ table[(c ^ b) & 255u];', '(void)b;'),
            'shard': ('*second = d;', '(void)d;'),
        }[mutant]
        assert production.count(before) == 1, 'Mutation must replace one real statement'
        original = production
        production = production.replace(before, after)
        assert production != original
    return Path(__file__).with_name('packed_crc_pair_de355.c.in').read_text(encoding='utf8').replace(
        '@PRODUCTION@', production)


class PackedCrcPairTests(unittest.TestCase):
    def test_pair_outputs_seeds_alignment_streaming_and_independent_oracles(self):
        run = run_harness(harness())
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertIn('PASS', run.stdout)
        result = json.loads(run.stdout.splitlines()[0])
        self.assertTrue(result['passed'])
        self.assertEqual(result['cases'], 18575)
        self.assertEqual(result['streamed_records'], 384)
        print(run.stdout.strip())

    def test_negative_controls_require_both_crc_outputs(self):
        for mutant in ('record', 'shard'):
            with self.subTest(mutant=mutant):
                run = run_harness(harness(mutant))
                self.assertEqual(run.returncode, 77, run.stdout + run.stderr)
                self.assertIn('FAIL', run.stderr)
                print('negative_control=' + mutant + ' expected_exit=77 actual_exit=77')


if __name__ == '__main__':
    unittest.main()
