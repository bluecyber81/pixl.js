"""Chameleon exit guard with real app, MF1/FDS persistence and failing storage.

PIXL_CHAMELEON_EXIT_SOURCE may point at an immutable fw/ baseline: the same
semantic assertion then fails because its original kill path destroys the app
after NOSPC. Backend I/O, hardware and GUI services are deterministic mocks;
production function bodies are not patched in the generated harness.
"""
from pathlib import Path
import os
import re
import unittest

from root_host import FW
from test_chameleon_state_load import definition
from test_chameleon_factory_errors_de349 import compile_actual


def without_includes(text):
    return re.sub(r'^\s*#include[^\n]*\n', '', text, flags=re.M)


def build_harness(fw):
    src = fw / 'application/src'
    tag_dir = fw / 'components/chameleon-ultra/firmware/application/src/rfid/nfctag'
    tag = (tag_dir / 'tag_emulation.c').read_text(encoding='utf8')
    mf = (tag_dir / 'hf/nfc_mf1.c').read_text(encoding='utf8')
    port = (src / 'app/chameleon/port/fds_utils.c').read_text(encoding='utf8')
    app = (src / 'app/chameleon/app_chameleon.c').read_text(encoding='utf8')
    menu = (src / 'app/chameleon/scene/chameleon_scene_menu.c').read_text(encoding='utf8')
    has_guard = 'app_chameleon_prepare_exit' in app
    code = Path(__file__).with_suffix('.c.in').read_text(encoding='utf8')
    header = (tag_dir / 'hf/nfc_mf1.h').read_text(encoding='utf8')
    header = header.replace('#include "netdata.h"', '').replace('"nfc_14a.h"', '"hf/nfc_14a.h"')
    # The error screen iterates the real localization enum. Symbolic labels make
    # control-flow assertions independent of the selected display language.
    ids = sorted(set(re.findall(r'\b_L_(\w+)', app)))
    labels = ', '.join(f'[_L_{key}]="{key}"' for key in ids)
    language = (src / 'i18n/string_id.h').read_text(encoding='utf8')
    language += '\nstatic const char *getLangString(L_StringID id) { static const char *const labels[] = {' + labels + '}; return labels[id]; }'
    code = code.replace('@LANGUAGE@', language)
    code = code.replace('@MF1_HEADER@', header)
    code = code.replace('@VFS_HEADER@', without_includes((src / 'mod/vfs/vfs.h').read_text(encoding='utf8')))
    code = code.replace('@VIEW_HEADER@', without_includes((src / 'mui/mui_view.h').read_text(encoding='utf8')))
    core = without_includes((src / 'core/mini_app_defines.h').read_text(encoding='utf8'))
    if not has_guard:
        core += '\ntypedef enum { MINI_APP_EXIT_SWITCH, MINI_APP_EXIT_SLEEP, MINI_APP_EXIT_RESET } mini_app_exit_reason_t;\n'
    code = code.replace('@CORE_HEADER@', core)
    code = code.replace('@APP_HEADER@', without_includes((src / 'app/chameleon/app_chameleon.h').read_text(encoding='utf8')))
    code = code.replace('@HAS_GUARD@', str(int(has_guard)))
    modal = 'mui_fence_input_after_frame' in app
    code = code.replace('@HAS_MODAL@', str(int(modal)))
    modal_types = ''
    modal_model = ''
    if modal:
        core_ui = (src / 'mui/mui_core.c').read_text()
        from root_host import function
        modal_types = without_includes((src / 'mui/mui_event.h').read_text())
        modal_types += '\n' + without_includes((src / 'mod/bsp_btn.h').read_text())
        modal_model = Path(__file__).with_name('chameleon_modal_frame.c.in').read_text()
        modal_model = modal_model.replace('@EVENT_QUEUE@', without_includes((src / 'mui/mui_event.c').read_text()))
        physical = without_includes((src / 'mui/mui_input.c').read_text()).split('void mui_input_init()')[0]
        modal_model = modal_model.replace('@PHYSICAL@', physical)
        # Include the same post-transfer barrier and stale-event check as the LCD.
        for name in ('mui_fence_input_after_frame', 'mui_buffer_flush', 'mui_process_input'):
            modal_model = modal_model.replace('@' + name + '@', function(core_ui, name))
    code = code.replace('@MODAL_TYPES@', modal_types).replace('@MODAL_MODEL@', modal_model)
    code = code.replace('@CRC@', without_includes((tag_dir.parent / 'crc_utils.c').read_text(encoding='utf8')))
    parts = []
    has_issue = 'chameleon_last_save_issue' in port
    if has_issue:
        port_header = (src / 'app/chameleon/port/fds_utils.h').read_text(encoding='utf8')
        parts.append(port_header[port_header.index('typedef enum {'):port_header.index('void chameleon_save_begin')])
        parts.append(port[port.index('static chameleon_save_issue_t m_save_issue;'):port.index('static void fds_map_file_name')])
    code = code.replace('@HAS_SAVE_ISSUE@', str(int(has_issue)))
    for text, name, result in [
        (port, 'fds_map_file_name', 'void'), (port, 'fds_read_sync', 'bool'),
        (port, 'fds_write_sync', 'bool'), (port, 'fds_compare_sync', 'int32_t'),
        (mf, 'get_block_max_by_tag_type', 'int'), (mf, 'get_information_size_by_tag_type', 'int'),
        (mf, 'nfc_tag_mf1_data_savecb', 'int'),
        (tag, 'tag_emulation_get_slot', 'uint8_t'), (tag, 'tag_emulation_set_slot', 'void'),
        (tag, 'tag_emulation_load_by_buffer', 'bool'), (tag, 'load_data_by_tag_type', 'void'),
        (tag, 'tag_emulation_load_data', 'void'), (tag, 'tag_emulation_init', 'bool'),
        (tag, 'tag_emulation_active_data_ready', 'bool'), (tag, 'tag_emulation_sense_run', 'void'),
        (tag, 'tag_emulation_sense_end', 'void'), (tag, 'save_data_by_tag_type', 'bool'),
        (tag, 'tag_emulation_save_data', 'bool' if has_guard else 'void'),
        (tag, 'tag_emulation_save_config', 'bool'),
        (tag, 'tag_emulation_save', 'bool' if has_guard else 'void'),
        (tag, 'tag_emulation_change_slot', 'bool' if 'bool tag_emulation_change_slot(' in tag else 'void'),
    ]:
        parts.append(definition(text, name, result))
    has_discard = 'void tag_emulation_discard(' in tag
    if has_discard:
        parts.append(definition(tag, 'tag_emulation_discard', 'void'))
    code = code.replace('@HAS_DISCARD@', str(int(has_discard)))
    if has_guard:
        parts.append(definition(tag, 'tag_emulation_save_for_exit', 'bool'))
    count_scene = ''
    has_count_retry = 'retry_slot_count' in app
    if has_count_retry:
        helper = (src / 'app/chameleon/port/tag_helper.c').read_text(encoding='utf8')
        scene = (src / 'app/chameleon/scene/chameleon_scene_menu_card_slot_num_select.c').read_text(encoding='utf8')
        parts.extend([definition(tag, 'tag_emulation_prepare_slot_count', 'bool'),
                      definition(tag, 'tag_emulation_slot_set_enable', 'void'),
                      definition(helper.replace('    bool tag_helper_set_slot_num','bool tag_helper_set_slot_num'),
                                 'tag_helper_set_slot_num','bool')])
        count_scene = definition(scene, 'chameleon_scene_menu_card_slot_num_select_on_event','void')
    code = code.replace('@COUNT_SCENE@', count_scene).replace('@HAS_COUNT_RETRY@', str(int(has_count_retry)))
    code = code.replace('@PERSISTENCE@', '\n\n'.join(parts))
    code = code.replace('@MENU_EXIT@', definition(menu, 'chameleon_scene_menu_on_exit', 'void'))
    code = code.replace('@APP_SOURCE@', without_includes(app))
    assert not re.search(r'@[A-Z_]+@', code)
    return code, tag_dir


class ChameleonExitGuardTests(unittest.TestCase):
    def test_real_card_and_app_exit_failure_retry_default_shadow_cancel(self):
        fw = Path(os.environ.get('PIXL_CHAMELEON_EXIT_SOURCE', FW))
        code, tag_dir = build_harness(fw)
        if 'PIXL_CHAMELEON_EXIT_SOURCE' not in os.environ:
            self.assertIn('#define HAS_COUNT_RETRY 1', code)
        compile_actual(self, code, tag_dir)


if __name__ == '__main__':
    unittest.main()
