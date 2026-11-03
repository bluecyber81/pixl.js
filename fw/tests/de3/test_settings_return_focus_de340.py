"""Production settings scenes and dispatcher: session focus without setting writes.

The list model stores visible rows; focus positioning uses the production setter.
No device access. Negative controls remove each new behavior and must fail.
"""
from pathlib import Path
import re
import unittest

from root_host import HostTests, SRC, function


def harness(mutant=None):
    scene = SRC / 'app/settings/scene'
    main = (scene / 'settings_scene_main.c').read_text()
    sleep = (scene / 'settings_scene_sleep_timeout.c').read_text()
    language = (scene / 'settings_scene_language.c').read_text()
    if mutant == 'return':
        main = main.replace('uint16_t focus = app->main_focus;', 'uint16_t focus = 0;')
    elif mutant == 'scroll':
        main = main.replace('mui_list_view_set_scroll_offset(app->p_list_view, app->main_scroll);', '(void)0;')
    elif mutant == 'sleep':
        sleep = sleep.replace('mui_list_view_set_focus(app->p_list_view, focus);', '(void)focus;')
    elif mutant == 'language':
        language = language.replace('language < LANGUAGE_COUNT ? language : 0', '0')
    app = re.search(r'typedef struct \{.*?\} app_settings_t;',
                    (SRC / 'app/settings/app_settings.h').read_text(), re.S).group()
    dispatcher = (SRC / 'mui/mui_scene_dispatcher.c').read_text()
    dispatch_header = (SRC / 'mui/mui_scene_dispatcher.h').read_text()
    dispatch_types = dispatch_header[dispatch_header.index('typedef void (*mui_scene_enter_cb_t)'):
                                    dispatch_header.index('mui_scene_dispatcher_t* mui_scene_dispatcher_create')]
    list_source = (SRC / 'mui/view/mui_list_view.c').read_text()
    pieces = [function(list_source[list_source.rfind('\nvoid mui_list_view_set_focus('):],
                       'mui_list_view_set_focus')]
    pieces += [function(dispatcher, name) for name in ('mui_scene_dispatcher_next_scene',
                'mui_scene_dispatcher_back_scene', 'mui_scene_dispatcher_previous_scene')]
    for text, enumeration in ((main, 'settings_main_menu_t'), (sleep, 'settings_sleep_timeout_menu_t')):
        start = text.index('enum ' + enumeration)
        pieces.append(text[start:text.index('};', start) + 2])
    pieces += [function(main, name) for name in ('settings_reset_default',
        'settings_scene_main_msg_box_reset_settings_cb', 'settings_scene_main_list_view_on_selected')]
    # Skip the forward declaration when extracting the reload body.
    pieces.append(function(main[main.rfind('\nstatic void settings_scene_main_reload('):],
                           'settings_scene_main_reload'))
    pieces += [function(main, name) for name in ('settings_scene_main_on_enter', 'settings_scene_main_on_exit')]
    pieces += [function(sleep, name) for name in ('settings_scene_sleep_timeout_list_view_on_selected',
        'settings_scene_sleep_timeout_on_enter', 'settings_scene_sleep_timeout_on_exit')]
    pieces += [function(language, name) for name in ('settings_scene_language_list_view_on_selected',
        'settings_scene_language_on_enter', 'settings_scene_language_on_exit')]
    template = Path(__file__).with_name('settings_return_focus_de340.c.in').read_text()
    return template.replace('@APP_STRUCT@', app).replace('@DISPATCH_TYPES@', dispatch_types).replace(
        '@PRODUCTION@', '\n'.join(pieces))


class SettingsReturnFocusTests(HostTests):
    def test_real_scene_roundtrips_active_values_bounds_and_no_writes(self):
        self.compile_run(harness())

    def test_negative_controls_catch_each_missing_behavior(self):
        for mutant in ('return', 'scroll', 'sleep', 'language'):
            with self.subTest(mutant=mutant):
                with self.assertRaises(AssertionError) as raised:
                    self.compile_run(harness(mutant))
                self.assertTrue(str(raised.exception).startswith('77 != 0 : Assertion failed:'),
                                str(raised.exception))


if __name__ == '__main__':
    unittest.main()
