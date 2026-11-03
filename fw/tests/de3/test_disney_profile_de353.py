"""Explicit Mini profile: actual identity helper, storage commit and UI callbacks.

Peripheral/file operations are deterministic mocks; no Disney dump is distributed.
PIXL_SANITIZE=1 runs ASan/UBSan; PIXL_ARM32=1 runs the same cases in qemu-arm.
"""
from pathlib import Path
import csv
import os
import re
import unittest

from root_host import FW
from test_chameleon_state_load import definition
from test_chameleon_factory_errors_de349 import compile_actual


class DisneyProfileTests(unittest.TestCase):
    def test_profile_identity_commit_cancel_and_failure_preservation(self):
        src = FW / 'application/src/app/chameleon'
        tag_dir = FW / 'components/chameleon-ultra/firmware/application/src/rfid/nfctag'
        helper = (src/'port/tag_helper.c').read_text(encoding='utf8')
        mf1 = (tag_dir/'hf/nfc_mf1.c').read_text(encoding='utf8').replace('*get_mifare_coll_res(', '* get_mifare_coll_res(')
        tag = (tag_dir/'tag_emulation.c').read_text(encoding='utf8')
        crc = (tag_dir.parent/'crc_utils.c').read_text(encoding='utf8').replace('#include "crc_utils.h"', '')
        ui = (src/'scene/chameleon_scene_menu.c').read_text(encoding='utf8')
        code = Path(__file__).with_suffix('.c.in').read_text(encoding='utf8')
        # The production data definitions are used verbatim. netdata.h is an
        # unrelated unused transport include; peripheral SDK headers are mocked.
        mf1_header = (tag_dir/'hf/nfc_mf1.h').read_text(encoding='utf8')
        mf1_header = mf1_header.replace('#include "netdata.h"', '').replace('"nfc_14a.h"', '"hf/nfc_14a.h"')
        code = code.replace('#include "hf/nfc_mf1.h"', mf1_header)
        code = code.replace('@ENUM@', re.search(r'typedef enum \{.*?\} chameleon_menu_item_t;', ui, re.S).group())
        code = code.replace('@ACTUAL_CRC@', crc)
        parts = [
            ('GROUP', helper, 'tag_helper_get_tag_group_type', 'tag_group_type_t'),
            ('GET_COLL', mf1, 'get_mifare_coll_res', r'nfc_tag_14a_coll_res_reference_t \*'),
            ('LOAD_COLL', helper, 'tag_helper_load_coll_res_from_block0', 'void'),
            ('SAVE', tag, 'save_data_by_tag_type', 'bool'),
            ('COMMIT', tag, 'tag_emulation_save_active_data', 'bool'),
            ('PROFILE', helper, 'tag_helper_apply_disney_profile', 'bool'),
            ('CONFIRM', ui, 'chameleon_scene_disney_profile_confirm', 'void'),
            ('CALLBACK', ui, 'chameleon_scene_disney_profile_cb', 'void'),
        ]
        for mark, text, name, ret in parts:
            code = code.replace('@'+mark+'@', definition(text, name, ret))
        # Negative controls mutate only the temporary harness, never firmware.
        mutant = os.environ.get('PIXL_PROFILE_MUTANT')
        changes = {
            'wrong-order': ('data->res_coll.size = NFC_TAG_14A_UID_DOUBLE_SIZE;\n    tag_helper_load_coll_res_from_block0();',
                            'tag_helper_load_coll_res_from_block0();\n    data->res_coll.size = NFC_TAG_14A_UID_DOUBLE_SIZE;'),
            'no-rollback': ('memcpy(&data->res_coll, old_identity, sizeof(old_identity));', '(void)old_identity;'),
            'confirm-default': ('mui_msg_box_set_btn_focus(app->p_msg_box, 2);', 'mui_msg_box_set_btn_focus(app->p_msg_box, 0);'),
            'no-shadow-guard': ('if (data->config.mode_block_write >= NFC_TAG_MF1_WRITE_SHADOW) return false;', ''),
            'crc-only-save': (definition(tag, 'tag_emulation_save_active_data', 'bool'),
                             '''bool tag_emulation_save_active_data(void) {
                                 uint8_t slot = tag_emulation_get_slot();
                                 tag_specific_type_t type = slotConfig.slots[slot].tag_hf;
                                 tag_data_buffer_t *b = get_buffer_by_tag_type(type);
                                 int n = get_data_savecb_from_tag_type(type)(type, b);
                                 uint16_t crc; calc_14a_crc_lut(b->buffer, n, (uint8_t*)&crc);
                                 if (crc == *b->crc) return true;
                                 return save_data_by_tag_type(slot, type);
                             }'''),
            'always-save': ('memcmp(old_identity, &data->res_coll, sizeof(old_identity)) == 0) return true;',
                            'memcmp(old_identity, &data->res_coll, sizeof(old_identity)) == 0) { /* deliberate negative control */ }'),
        }
        if mutant:
            self.assertIn(mutant, changes)
            before, after = changes[mutant]
            self.assertEqual(code.count(before), 1)
            code = code.replace(before, after)
        compile_actual(self, code, tag_dir)

    def test_profile_is_explicit_menu_action_and_existing_strings_stay_stable(self):
        src = (FW/'application/src/app/chameleon/scene/chameleon_scene_menu.c').read_text(encoding='utf8')
        event = definition(src, 'chameleon_scene_menu_on_event', 'void')
        enter = definition(src, 'chameleon_scene_menu_on_enter', 'void')
        self.assertRegex(event, r'case CHAMELEON_MENU_DISNEY_PROFILE:\s*chameleon_scene_disney_profile_confirm\(app\);\s*break;')
        self.assertIn('(void *)CHAMELEON_MENU_DISNEY_PROFILE', enter)
        self.assertNotIn('tag_helper_apply_disney_profile', enter)
        with (FW/'data/i18n.csv').open(encoding='utf8', newline='') as file:
            rows = list(csv.DictReader(file))
        names = [r['CODE'] for r in rows]
        self.assertEqual(len(names), len(set(names)))
        for r in rows:
            if r['CODE'].startswith('_L_APP_CHAMELEON_DISNEY_'):
                for lang in ['de_DE', 'en_US']:
                    self.assertTrue(r[lang])
                    self.assertTrue(r[lang].isascii())
        self.assertEqual(sum(r['CODE'].startswith('_L_APP_CHAMELEON_DISNEY_') for r in rows), 4)


if __name__ == '__main__':
    unittest.main()
