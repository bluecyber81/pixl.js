"""Mount record parser: all bytes/CRCs, boundary cases and one forward pass.

Extracts the real reader and path validator, with an independent bitwise CRC
oracle and a bounded byte-addressed read-only medium. Whole PackedFS/NOR fault
contracts are a separate integration suite. No device access.
"""
from pathlib import Path
import unittest
from root_host import HostTests, SRC, function
from packed_crc_source import crc_declarations, run_harness


def harness(mutant=None):
    source = (SRC / 'mod/vfs/packed_fs.c').read_text()
    reader = function(source, 'read_verified_record')
    mutations = {
        'record_crc': ('u32(stored) == ~sum ? 0 : LFS_ERR_CORRUPT', '0'),
        'header_crc': ('u32(b + 12) != ~crc(~0u, b, 12)', 'false'),
        'body_crc': ('sum = crc_pair(sum, body_crc, fs->copy, length);',
                     'sum = crc(sum, fs->copy, length);'),
        'path': ('memchr(info->path, 0, n) || valid_path(info->path, false)', 'false'),
    }
    if mutant is not None:
        before, after = mutations[mutant]
        assert reader.count(before) == 1, (mutant, 'mutation target must occur once')
        original = reader
        reader = reader.replace(before, after)
        assert reader != original, (mutant, 'negative control must alter production')
    return Path(__file__).with_name('packed_mount_stream_de341.c.in').read_text().replace(
        '@PRODUCTION@', '\n'.join((crc_declarations(source, 'crc_pair'),
                                   function(source, 'u32'), function(source, 'valid_path'), reader)))


class PackedMountStreamTests(HostTests):
    def compile_run(self, source, includes=()):
        self.assertFalse(includes)
        run = run_harness(source)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertIn('PASS', run.stdout)
        print(run.stdout.strip())

    def test_sequential_record_integrity_boundaries_errors_and_raw128(self):
        self.compile_run(harness())

    def test_negative_controls_require_header_record_body_and_path_checks(self):
        for mutant in ('record_crc', 'header_crc', 'body_crc', 'path'):
            with self.subTest(mutant=mutant):
                with self.assertRaises(AssertionError) as raised:
                    self.compile_run(harness(mutant))
                self.assertTrue(str(raised.exception).startswith('77 != 0 :'), str(raised.exception))
                print('negative_control=' + mutant + ' expected_exit=77 actual_exit=77')

    def test_mount_uses_streaming_reader(self):
        source = (SRC / 'mod/vfs/packed_fs.c').read_text()
        mount = function(source, 'pfs_mount')
        self.assertIn('read_verified_record(fs, &io, offset, SH + body, &info, &loc, &sum)', mount)
        self.assertNotIn('verify_record(', mount)
        self.assertNotIn('read_record(', mount)


if __name__ == '__main__':
    unittest.main()
