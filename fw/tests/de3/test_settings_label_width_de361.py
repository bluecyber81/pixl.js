"""Check complete DE/EN settings rows at offset zero on the 128-pixel LCD."""
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from root_host import FW, SRC, function
from test_ble_status_de320 import FONT
from test_settings_return_focus_de340 import harness


class SettingsLabelWidthTests(unittest.TestCase):
    def test_complete_settings_rows_before_animation(self):
        # The scene fixture builds the same title/value rows as the firmware.
        # Replace only its language lookup and its simulated version/drive.
        prefix = '''
#include "string_id.h"
#include "version.inc.h"
extern const char *const lang_de_DE[], *const lang_en_US[];
static const char *const *strings;
#define _T(id) strings[_L_##id]
#define main previous_focus_test
'''
        layout = function((SRC / 'mui/view/mui_list_view.c').read_text(),
                          'mui_list_view_value_x')
        cases = r'''
#undef main
int main(void) {
    u8g2_t font = {0};
    u8g2_SetFont(&font, u8g2_font_wqy12_t_gb2312a);
    fixture_version = VERSION;
    mui_list_view_t list = {0};
    app_settings_t app = {.p_list_view = &list};
    unsigned rows = 0;
    for (unsigned loc = 0; loc < 2; ++loc) {
        strings = loc ? lang_en_US : lang_de_DE;
        for (unsigned on = 0; on < 2; ++on) {
            data.bat_mode = data.flip_display = data.swap_buttons = on;
            data.show_mem_usage = data.hibernate_enabled = data.no_sleep_mode = on;
            fixture_remote_enabled = on;
            data.anim_enabled = false;
            data.oled_contrast = data.lcd_backlight = on ? 100 : 0;
            for (unsigned state = 0; state < 3; ++state) {
                fixture_drive.avaliable = state != 2;
                fixture_drive.free_bytes = state ? 0 : fixture_drive.total_bytes;
                data.sleep_timeout_sec = state == 0 ? 0 : state == 1 ? 45 : 180;
                for (data.language = 0; data.language < 2; ++data.language) {
                    settings_scene_main_reload(&app);
                    for (unsigned i = 0; i < list.items->size; ++i) {
                        mui_list_item_t *row = &list.items->row[i];
                        unsigned title = u8g2_GetUTF8Width(&font, row->text);
                        unsigned value = u8g2_GetUTF8Width(&font, row->subtext);
                        unsigned column = mui_list_view_value_x(128, value);
                        /* Icon ends before x=13. Short values get their own
                         * column with a 2px gap. Leave the scrollbar clear. */
                        unsigned needed = column ? 13 + title + 2 : 13 + title + value;
                        if (!title || needed > (column ? column : 123)) {
                            fprintf(stderr, "%s | %s: title=%u value=%u column=%u\n",
                                    row->text, row->subtext, title, value, column);
                            return 1;
                        }
                        ++rows;
                    }
                }
            }
        }
    }
    printf("PASS %u settings rows, both locales, full labels and values at rest\n", rows);
}
'''
        with tempfile.TemporaryDirectory(prefix='settings-lcd-') as temp:
            folder = Path(temp)
            font_src = 'u8g2_font_wqy12_t_gb2312a.c'
            shutil.copyfile(SRC / 'mui' / font_src, folder / font_src)
            (folder / 'mui_u8g2.h').write_text('#include "u8g2.h"\n')
            source = prefix + harness() + FONT.split('int main(void)')[0] + layout + cases
            (folder / 'test.c').write_text(source, encoding='utf-8')
            u8g2 = FW / 'components/u8g2/csrc'
            binary = folder / 'test.exe'
            command = ['gcc', '-std=c11', '-O1', '-ffunction-sections', '-fdata-sections',
                       '-Wl,--gc-sections', '-I', str(folder), '-I', str(u8g2),
                       '-I', str(SRC), '-I', str(SRC / 'i18n'), str(folder / 'test.c'),
                       str(folder / font_src), str(SRC / 'i18n/de_DE.c'), str(SRC / 'i18n/en_US.c'),
                       *(str(u8g2 / f) for f in ('u8g2_font.c', 'u8x8_8x8.c', 'u8g2_kerning.c')),
                       '-o', str(binary)]
            subprocess.run(command, check=True, timeout=60)
            subprocess.run([binary], check=True, timeout=10)


if __name__ == '__main__':
    unittest.main()
