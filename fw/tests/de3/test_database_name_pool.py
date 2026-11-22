"""ROM name offsets preserve the complete App672 catalog, without device I/O."""
import hashlib
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from types import SimpleNamespace
import unittest

FW = Path(__file__).resolve().parents[2]
SRC = FW / 'application/src/amiidb'
spec = importlib.util.spec_from_file_location('name_pool_generator', FW / 'scripts/amiibo_db_gen.py')
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)

# Semantic dump of the actual pointer-based tables at the qualified App672 head
# 96cc712f67b8d1376b1f86b30034da1209f82e0e. Includes every figure EN/CN name,
# game/group name and field, link target and EN/CN/IT usage note.
APP672_CONTENT_SHA256 = 'dfd75d895550fa1de930d18de0584b1b31a53fe1ab49460f572b9bf585bf0008'


class NamePoolTests(unittest.TestCase):
    def test_complete_compiled_catalog_matches_app672_semantics(self):
        compiler = shutil.which('gcc')
        self.assertIsNotNone(compiler)
        with tempfile.TemporaryDirectory(prefix='pixl-name-pool-') as temp:
            binary = Path(temp) / 'catalog.exe'
            command = [compiler, '-std=c11', '-Wall', '-Wextra', '-Werror',
                       '-Wno-missing-field-initializers', '-I', str(SRC)]
            if os.environ.get('PIXL_SANITIZE') == '1':
                command += ['-O1', '-g', '-fsanitize=address,undefined', '-fno-omit-frame-pointer']
            command += [str(Path(__file__).with_name('catalog_name_pool_dump.c')), '-o', str(binary)]
            built = subprocess.run(command, capture_output=True, text=True, timeout=60)
            self.assertEqual(built.returncode, 0, built.stdout + built.stderr)
            ran = subprocess.run([str(binary)], capture_output=True, timeout=60)
            self.assertEqual(ran.returncode, 0, ran.stderr.decode(errors='replace'))
            self.assertEqual(len(ran.stdout), 157131)
            self.assertEqual(hashlib.sha256(ran.stdout).hexdigest(), APP672_CONTENT_SHA256)
            self.assertEqual({tag: sum(line.startswith(tag + b' ') for line in ran.stdout.splitlines())
                              for tag in (b'A', b'G', b'L')},
                             {b'A': 956, b'G': 83, b'L': 1348})

    def test_pool_is_deterministic_and_preserves_utf8_suffixes_and_empty_names(self):
        names = ['', 'Name', 'Long Name', '名', '長い名', 'Name', 'quote " slash \\ tab\t\n']
        pool, offsets = generator.build_name_pool(names)
        self.assertEqual((pool, offsets), generator.build_name_pool(reversed(names)))
        self.assertEqual(offsets[''], 0)
        self.assertEqual(offsets['Name'], offsets['Long Name'] + len('Long '.encode()))
        self.assertEqual(offsets['名'], offsets['長い名'] + len('長い'.encode('utf8')))
        for name in names:
            offset = offsets[name]
            self.assertEqual(pool[offset:pool.index(b'\0', offset)].decode('utf8'), name)

    def test_uint16_limit_includes_the_last_terminator_and_rejects_overflow(self):
        pool, offsets = generator.build_name_pool(['A' * 65532, 'x'])
        self.assertEqual(len(pool), 65536)
        self.assertEqual(offsets['x'], 65534)
        self.assertEqual(pool[65534:], b'x\0')
        for names in (['A' * 65533, 'x'], ['A' * 65535], ['é' * 32768]):
            with self.subTest(lengths=list(map(len, names))):
                with self.assertRaisesRegex(ValueError, 'uint16'):
                    generator.build_name_pool(names)

    def test_pool_rejects_unrepresentable_text(self):
        for name in ('before\0after', '\ud800', None):
            with self.subTest(name=repr(name)):
                with self.assertRaises(ValueError):
                    generator.build_name_pool([name])

    def test_overflow_does_not_publish_half_a_table_or_pool(self):
        prior = generator.get_prorject_directory
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / 'application/src/amiidb/db_amiibo.c'
            target.parent.mkdir(parents=True)
            target.write_bytes(b'previous table and its pool')
            generator.get_prorject_directory = lambda: temp
            try:
                figure = SimpleNamespace(id='0000000000000001', name_en='A' * 65535, name_cn='')
                with self.assertRaisesRegex(ValueError, 'uint16'):
                    generator.gen_amiibo_data_c_file([figure])
                self.assertEqual(target.read_bytes(), b'previous table and its pool')
            finally:
                generator.get_prorject_directory = prior


if __name__ == '__main__':
    unittest.main()
