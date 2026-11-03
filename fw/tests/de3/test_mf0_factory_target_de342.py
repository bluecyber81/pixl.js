"""Actual MF0 factory must depend on requested type, never the active RF tag."""
import os
from pathlib import Path
import re
import unittest

import test_chameleon_state_load as support
from test_chameleon_factory_errors_de349 import compile_actual


class FactoryTargetTests(unittest.TestCase):
    def test_all_requested_types_independent_of_active_slot(self):
        fw = Path(os.environ.get('PIXL_FACTORY_SOURCE', support.FW))
        path = fw/'components/chameleon-ultra/firmware/application/src/rfid/nfctag/hf/nfc_mf0_ntag.c'
        text = path.read_text(encoding='utf-8')
        definitions = '\n'.join(line for line in text.splitlines() if line.startswith('#define '))
        names = [('nfc_tag_mf0_ntag_get_nr_pages_by_tag_type','int'),('get_nr_pages_by_tag_type','int'),
                 ('get_total_pages_by_tag_type','int'),('get_first_cfg_page_by_tag_type','int'),
                 ('get_version_page_by_tag_type','int'),('get_signature_page_by_tag_type','int'),
                 ('get_information_size_by_tag_type','int')]
        if 'static bool is_ntag_type(' in text:
            names += [('is_ntag_type','bool')]
        names += [('is_ntag','bool')]
        functions = '\n'.join(support.definition(text,n,r) for n,r in names)
        end = text.index('nfc_tag_mf0_ntag_information_max_t;')+len('nfc_tag_mf0_ntag_information_max_t;')
        begin = text.rfind('typedef struct ',0,end)
        factory = support.definition(text,'nfc_tag_mf0_ntag_data_factory','bool')
        code = Path(__file__).with_suffix('.c.in').read_text(encoding='utf-8')
        code = code.replace('@DEFINITIONS@',definitions).replace('@FUNCTIONS@',functions)
        code = code.replace('@MAX_TYPE@',text[begin:end]).replace('@FACTORY@',factory)
        compile_actual(self,code,path.parent.parent)


if __name__ == '__main__':
    unittest.main()
