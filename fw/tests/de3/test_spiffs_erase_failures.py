"""Actual SPIFFS erase failures and GC cache cleanup; no device access.

PIXL_SPIFFS_ERASE_SOURCE_ROOT selects a preserved firmware fw/ directory for
negative controls. SPIFFS_SANITIZE=1 enables GCC ASan/UBSan on Linux.
"""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
FW = Path(os.environ.get('PIXL_SPIFFS_ERASE_SOURCE_ROOT', HERE.parents[1]))


class SpiffsEraseFailureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='pixl-spiffs-erase-')
        cls.addClassCleanup(cls.temp.cleanup)
        cls.exe = Path(cls.temp.name) / ('erase.exe' if os.name == 'nt' else 'erase')
        compiler = shutil.which('gcc')
        if compiler is None:
            raise RuntimeError('GCC is required')
        src = FW / 'components/spiffs/src'
        command = [compiler, '-std=c11', '-O1', '-g', '-include', 'stdint.h',
                   '-I', str(FW / 'application/src/mod/vfs'), '-I', str(src)]
        if os.environ.get('SPIFFS_SANITIZE') == '1':
            command += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all',
                        '-fno-omit-frame-pointer', '-no-pie']
        command += [str(HERE / 'spiffs_erase_failures.c')]
        command += list(map(str, sorted(src.glob('*.c'))))
        built = subprocess.run(command + ['-o', str(cls.exe)],
                               capture_output=True, text=True, timeout=60)
        if built.returncode:
            raise RuntimeError(built.stdout + built.stderr)

    def check_case(self, scenario):
        ran = subprocess.run([str(self.exe), scenario], capture_output=True,
                             text=True, timeout=20)
        self.assertEqual(ran.returncode, 0, ran.stdout + ran.stderr)
        self.assertIn('PASS', ran.stdout)

    def test_erase_failure_before_physical_change(self): self.check_case('direct_pre')
    def test_erase_failure_after_partial_sector_change(self): self.check_case('direct_partial')
    def test_second_physical_sector_failure(self): self.check_case('direct_second')
    def test_successful_device_geometry(self): self.check_case('direct_success')
    def test_successful_multiple_physical_sectors(self): self.check_case('direct_success_multi')
    def test_format_stops_on_first_erase_failure(self): self.check_case('format_failure')
    def test_gc_erase_failure_drops_only_affected_read_cache(self): self.check_case('gc_failure')
    def test_gc_partial_erase_drops_only_affected_read_cache(self): self.check_case('gc_partial')
    def test_gc_metadata_write_failure_drops_only_affected_read_cache(self): self.check_case('gc_metadata_failure')
    def test_gc_success_preserves_existing_behavior(self): self.check_case('gc_success')


if __name__ == '__main__':
    unittest.main()
