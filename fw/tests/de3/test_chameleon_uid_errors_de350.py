"""Actual random-UID helper and UI: failure preservation, UID/BCC consistency."""
from pathlib import Path
import os,re,unittest
from root_host import FW
from test_chameleon_state_load import definition
from test_chameleon_factory_errors_de349 import compile_actual

class UidErrorTests(unittest.TestCase):
    def test_random_failure_reaches_ui_and_preserves_card(self):
        fw=Path(os.environ.get('PIXL_FACTORY_SOURCE',FW))
        src=fw/'application/src/app/chameleon'
        helper=(src/'port/tag_helper.c').read_text()
        helper=re.sub(r'^    (bool|void) tag_helper_generate_uid',r'\1 tag_helper_generate_uid',helper,flags=re.M)
        baseline='bool tag_helper_generate_uid' not in helper
        ui=(src/'scene/chameleon_scene_menu_card_advanced.c').read_text()
        enum=re.search(r'typedef enum \{.*?\} chameleon_menu_item_t;',ui,re.S).group()
        body=definition(helper,'tag_helper_generate_uid','void' if baseline else 'bool')
        group=definition(helper,'tag_helper_get_tag_group_type','tag_group_type_t')
        code=Path(__file__).with_suffix('.c.in').read_text().replace('@BASELINE@',str(int(baseline)))
        code=code.replace('@HELPER@',body).replace('@GROUP@',group).replace('@ENUM@',enum)
        code=code.replace('@UI@',definition(ui,'chameleon_scene_menu_card_advanced_on_event','void'))
        compile_actual(self,code,fw/'components/chameleon-ultra/firmware/application/src/rfid/nfctag')

if __name__=='__main__':unittest.main()
