"""Factory write, reload and config failures must reach both actual UI paths.

PIXL_FACTORY_SOURCE permits the same assertions against the immutable baseline.
The peripheral outcomes are deterministic mocks; production functions are extracted.
"""
from pathlib import Path
import os
import re
import shutil
import subprocess
import tempfile
import unittest

from root_host import FW
from test_chameleon_state_load import definition


def compile_actual(test, code, tag_dir=None):
    arm = os.environ.get('PIXL_ARM32') == '1'
    with tempfile.TemporaryDirectory(prefix='chameleon-factory-result-') as temp:
        folder = Path(temp)
        (folder/'app_util.h').write_text('#define PACKED __attribute__((packed))\n#define STATIC_ASSERT(x) _Static_assert(x,#x)\n')
        (folder/'utils.h').write_text('')
        c=folder/'factory.c'; exe=folder/'factory'; c.write_text(code,encoding='utf-8')
        compiler=shutil.which('arm-linux-gnueabihf-gcc' if arm else 'gcc')
        test.assertIsNotNone(compiler)
        cmd=[compiler,'-std=c11','-O1','-g','-Wall','-Wextra','-Werror','-fshort-enums',
             '-Wno-unused-parameter','-Wno-unused-function','-Wno-unused-variable','-fstack-usage','-I',str(folder)]
        if tag_dir: cmd+=['-I',str(tag_dir)]
        if not arm: cmd+=['-mno-ms-bitfields']
        if os.environ.get('PIXL_SANITIZE')=='1' and not arm:
            cmd+=['-fsanitize=address,undefined','-fno-omit-frame-pointer','-no-pie']
        built=subprocess.run(cmd+[str(c),'-o',str(exe)],capture_output=True,text=True,timeout=60)
        test.assertEqual(built.returncode,0,built.stdout+built.stderr)
        run=['qemu-arm','-L','/usr/arm-linux-gnueabihf',str(exe)] if arm else [str(exe)]
        ran=subprocess.run(run,capture_output=True,text=True,timeout=60)
        test.assertEqual(ran.returncode,0,ran.stdout+ran.stderr)
        test.assertIn('PASS',ran.stdout)
        print(('ARM32 ' if arm else 'native ')+ran.stdout.strip())
        for usage in folder.glob('*.su'):
            for line in usage.read_text().splitlines():
                if any(name in line for name in ('factory_data', 'data_factory', 'fds_compare_sync',
                                                'save_data_by_tag_type', 'tag_emulation_save_config')):
                    print('STACK_USAGE '+line)


class FactoryErrorsTests(unittest.TestCase):
    def test_ui_only_accepts_complete_factory_operation(self):
        fw=Path(os.environ.get('PIXL_FACTORY_SOURCE',FW))
        tag=fw/'components/chameleon-ultra/firmware/application/src/rfid/nfctag/tag_emulation.c'
        src=fw/'application/src/app/chameleon'
        helper=(src/'port/tag_helper.c').read_text(encoding='utf-8')
        helper_result='bool' if re.search(r'^bool tag_helper_factory_data',helper,re.M) else 'void'
        code=Path(__file__).with_suffix('.c.in').read_text(encoding='utf-8')
        for marker,path,name,ret in [
            ('FACTORY',tag,'tag_emulation_factory_data','bool'),
            ('HELPER',src/'port/tag_helper.c','tag_helper_factory_data',helper_result),
            ('DATA_UI',src/'scene/chameleon_scene_menu_card_data.c','chameleon_scene_menu_card_data_on_event','void'),
            ('TYPE_UI',src/'scene/chameleon_scene_menu_card_type.c','chameleon_scene_menu_card_type_factory_cb','void'),
        ]:
            code=code.replace('@'+marker+'@',definition(path.read_text(encoding='utf-8'),name,ret))
        compile_actual(self,code)


if __name__=='__main__':unittest.main()
