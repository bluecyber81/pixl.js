"""Actual MF1 factory: deterministic complete images and bounded scratch lifetime.

PIXL_FACTORY_SOURCE may point at an older tree for the regression witness.
The compiler's auto-var pattern and poisoned malloc make missing initialization
deterministic; neither supplies zero initialization for production code.
"""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from root_host import FW
from test_chameleon_state_load import definition


class Mf1FactoryTests(unittest.TestCase):
    def test_factory_serialized_bytes_all_slots_sizes_and_failures(self):
        fw = Path(os.environ.get('PIXL_FACTORY_SOURCE', FW))
        tag = fw/'components/chameleon-ultra/firmware/application/src/rfid/nfctag'
        text = (tag/'hf/nfc_mf1.c').read_text(encoding='utf-8')
        functions = '\n'.join(definition(text, n, t) for n, t in [
            ('get_block_max_by_tag_type', 'int'),
            ('get_information_size_by_tag_type', 'int'),
            ('nfc_tag_mf1_data_factory', 'bool')])
        code = Path(__file__).with_name('mf1_factory_de342.c.in').read_text(encoding='utf-8')
        code = code.replace('@FUNCTIONS@', functions)
        arm = os.environ.get('PIXL_ARM32') == '1'
        # Persisted Chameleon structures explicitly require the production
        # -fshort-enums ABI (tag_emulation.h checks their sizes).
        for short_enums in (True,):
            with self.subTest(arm32=arm, short_enums=short_enums), tempfile.TemporaryDirectory(prefix='mf1-factory-') as temp:
                folder = Path(temp)
                (folder/'app_util.h').write_text('#define PACKED __attribute__((packed))\n#define STATIC_ASSERT(x) _Static_assert(x,#x)\n')
                (folder/'utils.h').write_text('')
                c = folder/'factory.c'; exe = folder/'factory'; c.write_text(code, encoding='utf-8')
                compiler = shutil.which('arm-linux-gnueabihf-gcc' if arm else 'gcc')
                self.assertIsNotNone(compiler)
                command = [compiler, '-std=c11', '-O1', '-g', '-Wall', '-Wextra', '-Werror',
                           '-Wno-unused-function', '-ftrivial-auto-var-init=pattern', '-fstack-usage',
                           '-I', str(folder), '-I', str(tag), '-I', str(tag/'hf'),
                           '-I', str(tag.parents[1]/'utils')]
                if not arm:
                    command += ['-mno-ms-bitfields']
                if short_enums:
                    command += ['-fshort-enums']
                if os.environ.get('PIXL_SANITIZE') == '1' and not arm:
                    command += ['-fsanitize=address,undefined', '-fno-omit-frame-pointer', '-no-pie']
                built = subprocess.run(command+[str(c), '-o', str(exe)], capture_output=True, text=True, timeout=60)
                self.assertEqual(built.returncode, 0, built.stdout+built.stderr)
                run = ['qemu-arm', '-L', '/usr/arm-linux-gnueabihf', str(exe)] if arm else [str(exe)]
                ran = subprocess.run(run, capture_output=True, text=True, timeout=60)
                self.assertEqual(ran.returncode, 0, ran.stdout+ran.stderr)
                self.assertIn('PASS', ran.stdout)
                print(('ARM32' if arm else 'native')+f' short-enums={short_enums}: '+ran.stdout.strip())
                for usage in folder.glob('*.su'):
                    for line in usage.read_text().splitlines():
                        if 'nfc_tag_mf1_data_factory' in line:
                            print('STACK_USAGE '+line)


if __name__ == '__main__':
    unittest.main()
