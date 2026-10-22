"""Compile actual extracted C functions with deterministic peripheral mocks."""
from pathlib import Path
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

FW = Path(__file__).resolve().parents[2]
SRC = FW / 'application/src'
sys.path.insert(0, str(FW / 'tests/de2'))
from test_player_v3 import function


class HostTests(unittest.TestCase):
    def compile_run(self, source, includes=()):
        compiler = shutil.which('gcc')
        self.assertIsNotNone(compiler)
        with tempfile.TemporaryDirectory(prefix='pixl-de3-host-') as temp:
            folder = Path(temp)
            path = folder / 'test.c'
            path.write_text(source, encoding='utf-8')
            binary = folder / 'test.exe'
            command = [compiler, '-std=c11', '-Wall', '-Wextra', '-Werror',
                       '-Wno-unused-parameter', '-Wno-unused-function']
            if os.environ.get('PIXL_SANITIZE') == '1':
                command += ['-g', '-O1', '-fsanitize=address,undefined', '-fno-omit-frame-pointer']
            for include in includes:
                command += ['-I', str(include)]
            built = subprocess.run(command + [str(path), '-o', str(binary)], capture_output=True,
                                   text=True, timeout=60)
            self.assertEqual(built.returncode, 0, built.stdout + built.stderr)
            ran = subprocess.run([str(binary)], capture_output=True, text=True, timeout=60)
            self.assertEqual(ran.returncode, 0, ran.stdout + ran.stderr)
            self.assertIn('PASS', ran.stdout)

