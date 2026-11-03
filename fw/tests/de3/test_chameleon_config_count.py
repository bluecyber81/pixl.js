"""Real config/reset/save functions: a reduced runtime count cannot corrupt the next file."""
from pathlib import Path
import os
import unittest

import test_chameleon_state_load as support


class ChameleonConfigCountTests(unittest.TestCase):
    def test_settings_reset_and_external_count_reduction_roundtrip(self):
        fw = Path(os.environ.get('PIXL_CONFIG_COUNT_FW', support.FW))
        tag_dir = fw / 'components/chameleon-ultra/firmware/application/src/rfid/nfctag'
        tag = (tag_dir / 'tag_emulation.c').read_text(encoding='utf-8')
        port = (fw / 'application/src/app/chameleon/port/fds_utils.c').read_text(encoding='utf-8')
        settings = (fw / 'application/src/mod/settings.c').read_text(encoding='utf-8')
        code = Path(__file__).with_name('chameleon_config_count.c.in').read_text(encoding='utf-8')
        for name, result in [('tag_emulation_decode_config', 'bool'), ('tag_emulation_load_config', 'int32_t'),
                             ('tag_emulation_save_config', 'bool'), ('tag_emulation_slot_set_enable', 'void'),
                             ('tag_emulation_slot_find_next', 'uint8_t'), ('tag_emulation_slot_find_prev', 'uint8_t')]:
            code = code.replace('@' + name + '@', support.definition(tag, name, result))
        for name, result in [('fds_map_file_name', 'void'), ('fds_read_config', 'int32_t'), ('fds_write_sync', 'bool')]:
            code = code.replace('@' + name + '@', support.definition(port, name, result))
        code = code.replace('@settings_reset@', support.definition(settings, 'settings_reset', 'int32_t'))
        if os.environ.get('PIXL_CONFIG_COUNT_REPRO') == '1':
            code = '#define EXPECT_OLD_CORRUPTION 1\n' + code
        support.ChameleonStateTests.compile_run(self, code)


if __name__ == '__main__':
    unittest.main()
