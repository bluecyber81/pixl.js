"""Packed CRC table preserves bitwise and pinned-LittleFS CRC semantics.

PIXL_SANITIZE=1 enables Linux ASan/UBSan; PIXL_ARM32=1 uses ARM32/QEMU.
Neither mode measures physical Cortex-M4 latency or accesses hardware.
"""
from pathlib import Path
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from root_host import FW, SRC, function
from packed_crc_source import crc_declarations


class PackedCrcTests(unittest.TestCase):
    def test_crc_seeds_lengths_alignment_and_streaming_match_independent_oracles(self):
        production=crc_declarations((SRC/'mod/vfs/packed_fs.c').read_text(encoding='utf8'), 'crc')
        harness=Path(__file__).with_name('packed_crc_de345.c.in').read_text().replace('@PRODUCTION@',production)
        arm=os.environ.get('PIXL_ARM32')=='1'
        sanitize=os.environ.get('PIXL_SANITIZE')=='1' and not arm
        compiler=shutil.which('arm-linux-gnueabihf-gcc' if arm else 'gcc')
        self.assertIsNotNone(compiler)
        with tempfile.TemporaryDirectory(prefix='packed-crc-de345-') as tmp:
            folder=Path(tmp);source=folder/'crc.c';source.write_text(harness)
            exe=folder/'crc-test.exe'
            command=[compiler,'-std=c11','-O2','-Wall','-Wextra','-Werror','-I',str(FW/'components/littlefs'),str(source),'-o',str(exe)]
            if arm:command+=['-static']
            elif sanitize:command+=['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer','-fno-pie','-no-pie']
            built=subprocess.run(command,capture_output=True,text=True,timeout=60)
            self.assertEqual(built.returncode,0,built.stdout+built.stderr)
            run=subprocess.run((['qemu-arm'] if arm else [])+[str(exe)],capture_output=True,text=True,timeout=60)
            self.assertEqual(run.returncode,0,run.stdout+run.stderr)
            self.assertIn('PASS',run.stdout)
            result=json.loads(run.stdout.splitlines()[0]);self.assertTrue(result['passed'])
            self.assertEqual(result['cases'],6281)
            print(run.stdout.strip())


if __name__=='__main__':unittest.main()
