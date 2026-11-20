"""Late settings read via Chameleon or Save: real settings, language, standby and LCD policy."""
from pathlib import Path
import os
import re
import subprocess
import tempfile
import unittest

from root_host import FW
from test_hardware_de3_3 import function

SRC = FW / 'application/src'


class LateSettingsRuntime(unittest.TestCase):
    def test_runtime_after_verified_recovery(self):
        # Reuse the same settings-file VFS and fault controls as the persistence tests.
        storage = (FW / 'tests/de2/test_settings.py').read_text()
        fixture = storage.split("    program = r'''", 1)[1].split('int main(void) {', 1)[0]
        fixture = fixture.replace('SOURCE_FILE', str(SRC / 'mod/settings.c'))
        power = (SRC / 'sdk/pwr_mgmt/nrf_pwr_mgmt.c').read_text()
        display = (SRC / 'mui/mui_u8g2.c').read_text()
        main = (SRC / 'main.c').read_text()
        ble = (SRC / 'mod/ble/ble_main.c').read_text()
        code = Path(__file__).with_suffix('.c.in').read_text()
        code = code.replace('@STORE@', fixture)
        code = code.replace('@POWER@', '\n'.join(function(power, name) for name in (
            'nrf_pwr_mgmt_set_timeout', 'nrf_pwr_mgmt_get_timeout', 'pwr_mgmt_standby_timeout_check',
            'nrf_pwr_mgmt_dim_window')))
        code = code.replace('@BLE@', function(ble, 'ble_set_standby_timeout'))
        connect = re.search(r'if \(!m_remote_mode\) \{\s*(m_previous_pwr_mgmt_sleep_timeout.*?m_timeout_overridden = true;)', ble, re.S)
        disconnect = re.search(r'if \(m_timeout_overridden\) nrf_pwr_mgmt_set_timeout\(m_previous_pwr_mgmt_sleep_timeout\);\s*m_timeout_overridden = false;', ble)
        code = code.replace('@CONNECT@', connect[1]).replace('@DISCONNECT@', disconnect[0])
        code = code.replace('@DISPLAY@', '\n'.join(function(display, name) for name in (
            'mui_u8g2_set_contrast_level', 'mui_u8g2_set_flip_display', 'mui_u8g2_backlight_preview',
            'mui_u8g2_backlight_restore', 'mui_u8g2_poll_dim', 'mui_u8g2_recover_levels',
            'mui_u8g2_settings_slider')))
        code = code.replace('@APPLICATION@', function(main, 'mui_settings_recovered'))
        self.assertLess(main.index('mui_init(p_mui);'), main.index('settings_on_recovered(mui_settings_recovered);'))
        scene = (SRC / 'app/settings/scene/settings_scene_main.c').read_text()
        menu_enum = re.search(r'enum settings_main_menu_t \{[^}]+\};', scene)
        code = code.replace('@MENU_ENUM@', menu_enum[0])
        code = code.replace('@MENU@', '\n'.join(function(scene, name) for name in (
            'settings_scene_main_reload', 'settings_scene_main_close_error', 'settings_scene_main_save_error')))
        leave = scene[scene.index('    case SETTINGS_MAIN_MENU_EXIT:'):scene.index('    case SETTINGS_MAIN_MENU_REBOOT:')]
        code = code.replace('@SAVE_AND_EXIT@', leave)
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            stubs = {
                'boards.h': '', 'tag_helper.h': '', 'app_amiibolink.h': '#include "ble_amiibolink.h"',
                'nrf_log.h': '#define NRF_LOG_INFO(...)\n#define NRF_LOG_WARNING(...)',
                'nrf_error.h': '#define NRF_SUCCESS 0\n#define NRF_ERROR_NOT_SUPPORTED 1\n#define NRF_ERROR_INVALID_STATE 2',
            }
            for path, content in stubs.items():
                (root / path).write_text(content + '\n')
            cfile = root / 'test.c'
            cfile.write_text(code)
            flags = []
            if os.environ.get('PIXL_SANITIZE') == '1':
                flags += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all', '-fno-omit-frame-pointer', '-no-pie']
            exe = root / 'test'
            subprocess.run(['gcc', '-std=c11', '-O1', '-g', '-fshort-enums', '-DLCD_SCREEN', *flags,
                            '-I', str(root), '-I', str(SRC), '-I', str(SRC / 'mod/vfs'), '-I', str(SRC / 'mod/ble'),
                            str(cfile), *(str(SRC / 'i18n' / name) for name in ('language.c', 'de_DE.c', 'en_US.c')),
                            '-o', str(exe)], check=True)
            subprocess.run([exe], check=True)


if __name__ == '__main__':
    unittest.main()
