"""Actual C app setting callbacks: failure, save retry, back and scene exits.

Persistence fault injection covers a negative VFS error and a positive Nordic
error. No firmware build, device, Bluetooth, NFC keys or tag data are used.
The sorting test also executes the actual scene dispatcher: its void on_exit
callback cannot veto navigation, so the save must happen before transition.
"""
from pathlib import Path
import re
import unittest

from test_app_startup_allocations import compile_run, function

SRC = Path(__file__).resolve().parents[2] / "application/src"
FIXTURE = Path(__file__).with_name("app_settings_save_ui.c.in").read_text()
NAVIGATION = r'''
static void mui_scene_dispatcher_previous_scene(void *d) { (void)d; previous++; shown = -1; }
static void mui_scene_dispatcher_next_scene(void *d, unsigned id) { (void)d; next_scene = id; }
'''


def functions(source, *names):
    return '\n\n'.join(function(source, name) for name in names)


class AppSettingsSaveUiTests(unittest.TestCase):
    def test_amiibolink_mode_failure_retry_back_and_success(self):
        source = (SRC / 'app/amiibolink/scene/amiibolink_scene_menu_mode.c').read_text()
        code = functions(source, 'amiibolink_scene_menu_mode_save_retry',
                         'amiibolink_scene_menu_mode_save_error', 'amiibolink_scene_menu_mode_on_event')
        compile_run(FIXTURE + NAVIGATION + code + r'''
int main(void) {
  const int failures[] = {-91, 8};
  test_app_t app; mui_list_view_t list; mui_msg_box_t box;
  mui_list_item_t item = {ICON_MODE, (void *)(uintptr_t)3, {0}};
  for (unsigned i = 0; i < 2; i++) {
    reset_fixture(&app, &list, &box, AMIIBOLINK_VIEW_ID_LIST);
    save_result = failures[i];
    amiibolink_scene_menu_mode_on_event(MUI_LIST_VIEW_EVENT_SELECTED, &list, &item);
    check_save_error(&box, AMIIBOLINK_VIEW_ID_MSG_BOX);
    assert(saves == 1 && ram.amiibolink_mode == 3 && app.amiibolink_mode == 3);
    assert(disk.amiibolink_mode == 0 && saved_logs == 0 && list.rows == 8);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER, &box);
    assert(saves == 1 && previous == 0);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
    assert(saves == 2 && previous == 0 && shown == AMIIBOLINK_VIEW_ID_MSG_BOX);
    assert(ram.amiibolink_mode == 3 && disk.amiibolink_mode == 0 && saved_logs == 0);
    save_result = 0;
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
    assert(saves == 3 && previous == 1 && saved_logs == 1 && disk.amiibolink_mode == 3);

    reset_fixture(&app, &list, &box, AMIIBOLINK_VIEW_ID_LIST);
    save_result = failures[i];
    amiibolink_scene_menu_mode_on_event(MUI_LIST_VIEW_EVENT_SELECTED, &list, &item);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_RIGHT, &box);
    assert(saves == 1 && previous == 0 && shown == AMIIBOLINK_VIEW_ID_LIST);
    assert(ram.amiibolink_mode == 3 && app.amiibolink_mode == 3 && disk.amiibolink_mode == 0);
    save_result = 0;
    amiibolink_scene_menu_mode_on_event(MUI_LIST_VIEW_EVENT_SELECTED, &list, &item);
    assert(saves == 2 && previous == 1 && disk.amiibolink_mode == 3);
  }
  reset_fixture(&app, &list, &box, AMIIBOLINK_VIEW_ID_LIST);
  amiibolink_scene_menu_mode_on_event(MUI_LIST_VIEW_EVENT_LONG_SELECTED, &list, &item);
  assert(saves == 0 && previous == 0 && ram.amiibolink_mode == 0);
  amiibolink_scene_menu_mode_on_event(MUI_LIST_VIEW_EVENT_SELECTED, &list, &item);
  assert(saves == 1 && previous == 1 && saved_logs == 1 && disk.amiibolink_mode == 3);
  item.icon = ICON_BACK;
  amiibolink_scene_menu_mode_on_event(MUI_LIST_VIEW_EVENT_SELECTED, &list, &item);
  assert(saves == 1 && previous == 2);
  puts("PASS actual AmiiboLink mode: both errors, repeated retry, back, success and no false Saved log");
}
''')

    def test_amiibo_auto_uid_retry_does_not_toggle_again(self):
        source = (SRC / 'app/amiibo/scene/amiibo_scene_amiibo_detail_menu.c').read_text()
        enumeration = re.search(r'enum amiibo_detail_menu_t\s*\{.*?\};', source, re.S)[0]
        code = functions(source, 'amiibo_scene_settings_save_retry', 'amiibo_scene_settings_save_error',
                         'amiibo_scene_amiibo_detail_menu_on_selected')
        compile_run(FIXTURE + NAVIGATION + enumeration + code + r'''
int main(void) {
  const int failures[] = {-91, 8};
  test_app_t app; mui_list_view_t list; mui_msg_box_t box;
  mui_list_item_t item = {0, (void *)(uintptr_t)AMIIBO_DETAIL_MENU_AUTO_RAND_UID, {0}};
  for (unsigned i = 0; i < 2; i++) {
    reset_fixture(&app, &list, &box, AMIIBO_VIEW_ID_LIST);
    save_result = failures[i];
    amiibo_scene_amiibo_detail_menu_on_selected(0, &list, &item);
    check_save_error(&box, AMIIBO_VIEW_ID_MSG_BOX);
    assert(saves == 1 && ram.auto_gen_amiibo && !disk.auto_gen_amiibo);
    assert(!strcmp(item.sub_text, "_L_ON_F") && list.rows == 8);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER, &box);
    assert(saves == 1);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
    assert(saves == 2 && ram.auto_gen_amiibo && !disk.auto_gen_amiibo && shown == AMIIBO_VIEW_ID_MSG_BOX);
    save_result = 0;
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
    assert(saves == 3 && ram.auto_gen_amiibo && disk.auto_gen_amiibo);
    assert(previous == 0 && shown == AMIIBO_VIEW_ID_LIST);
    /* A subsequent deliberate toggle is separate from saving the pending value. */
    amiibo_scene_amiibo_detail_menu_on_selected(0, &list, &item);
    assert(saves == 4 && !ram.auto_gen_amiibo && !disk.auto_gen_amiibo);
    assert(!strcmp(item.sub_text, "_L_OFF_F"));

    reset_fixture(&app, &list, &box, AMIIBO_VIEW_ID_LIST);
    save_result = failures[i];
    amiibo_scene_amiibo_detail_menu_on_selected(0, &list, &item);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_RIGHT, &box);
    assert(saves == 1 && previous == 0 && shown == AMIIBO_VIEW_ID_LIST);
    assert(ram.auto_gen_amiibo && !disk.auto_gen_amiibo && !strcmp(item.sub_text, "_L_ON_F"));
  }
  reset_fixture(&app, &list, &box, AMIIBO_VIEW_ID_LIST);
  key_loaded = false;
  amiibo_scene_amiibo_detail_menu_on_selected(0, &list, &item);
  assert(no_key == 1 && saves == 0 && !ram.auto_gen_amiibo);
  key_loaded = true;
  amiibo_scene_amiibo_detail_menu_on_selected(0, &list, &item);
  assert(saves == 1 && disk.auto_gen_amiibo && previous == 0 && shown == AMIIBO_VIEW_ID_LIST);
  puts("PASS actual Amiibo auto UID: both errors, unchanged-value retry, back, key guard and success");
}
''')

    def test_amiidb_auto_uid_and_qr_retry_back_and_success(self):
        source = (SRC / 'app/amiidb/scene/amiidb_scene_amiibo_detail_menu.c').read_text()
        enumeration = re.search(r'enum amiidb_detail_menu_t\s*\{.*?\};', source, re.S)[0]
        code = functions(source, 'amiidb_scene_detail_settings_save_retry', 'amiidb_scene_detail_settings_save',
                         'amiidb_scene_amiibo_detail_menu_on_selected')
        compile_run(FIXTURE + NAVIGATION + enumeration + code + r'''
int main(void) {
  const int failures[] = {-91, 8};
  const unsigned selections[] = {AMIIDB_DETAIL_MENU_AUTO_RAND_UID, AMIIDB_DETAIL_MENU_SHOW_QRCODE};
  test_app_t app; mui_list_view_t list; mui_msg_box_t box;
  for (unsigned which = 0; which < 2; which++) for (unsigned i = 0; i < 2; i++) {
    mui_list_item_t item = {0, (void *)(uintptr_t)selections[which], {0}};
    reset_fixture(&app, &list, &box, AMIIDB_VIEW_ID_LIST);
    bool *live = which ? &ram.qrcode_enabled : &ram.auto_gen_amiibo;
    bool *saved = which ? &disk.qrcode_enabled : &disk.auto_gen_amiibo;
    save_result = failures[i];
    amiidb_scene_amiibo_detail_menu_on_selected(0, &list, &item);
    check_save_error(&box, AMIIDB_VIEW_ID_MSG_BOX);
    assert(saves == 1 && *live && !*saved && !strcmp(item.sub_text, "_L_ON_F") && list.rows == 8);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER, &box);
    assert(saves == 1);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
    assert(saves == 2 && *live && !*saved && previous == 0 && shown == AMIIDB_VIEW_ID_MSG_BOX);
    save_result = 0;
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
    assert(saves == 3 && *live && *saved && previous == 1);

    reset_fixture(&app, &list, &box, AMIIDB_VIEW_ID_LIST);
    save_result = failures[i];
    amiidb_scene_amiibo_detail_menu_on_selected(0, &list, &item);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_RIGHT, &box);
    assert(saves == 1 && previous == 0 && shown == AMIIDB_VIEW_ID_LIST && *live && !*saved);
    save_result = 0;
    amiidb_scene_amiibo_detail_menu_on_selected(0, &list, &item);
    assert(saves == 2 && previous == 1 && !*live && !*saved && !strcmp(item.sub_text, "_L_OFF_F"));
  }
  mui_list_item_t item = {0, (void *)(uintptr_t)AMIIDB_DETAIL_MENU_AUTO_RAND_UID, {0}};
  reset_fixture(&app, &list, &box, AMIIDB_VIEW_ID_LIST);
  key_loaded = false;
  amiidb_scene_amiibo_detail_menu_on_selected(0, &list, &item);
  assert(no_key == 1 && saves == 0 && !ram.auto_gen_amiibo);
  key_loaded = true;
  amiidb_scene_amiibo_detail_menu_on_selected(0, &list, &item);
  assert(saves == 1 && disk.auto_gen_amiibo && previous == 1);
  reset_fixture(&app, &list, &box, AMIIDB_VIEW_ID_LIST);
  item.user_data = (void *)(uintptr_t)AMIIDB_DETAIL_MENU_SHOW_QRCODE;
  key_loaded = false;
  amiidb_scene_amiibo_detail_menu_on_selected(0, &list, &item);
  assert(no_key == 0 && saves == 1 && disk.qrcode_enabled && previous == 1);
  puts("PASS actual AmiiboDB UID and QR: both errors, unchanged-value retry, back, success and key separation");
}
''')

    def test_amiidb_sort_saves_before_real_dispatcher_exit(self):
        source = (SRC / 'app/amiidb/scene/amiidb_scene_settings.c').read_text()
        dispatcher = (SRC / 'mui/mui_scene_dispatcher.c').read_text()
        header = (SRC / 'mui/mui_scene_dispatcher.h').read_text()
        types = header[header.index('typedef void (*mui_scene_enter_cb_t)'):
                       header.index('mui_scene_dispatcher_t;') + len('mui_scene_dispatcher_t;')]
        navigation = functions(dispatcher, 'mui_scene_dispatcher_exit', 'mui_scene_dispatcher_next_scene',
                               'mui_scene_dispatcher_back_scene', 'mui_scene_dispatcher_previous_scene')
        state = re.search(r'static bool settings_exit_saved;', source)[0]
        callbacks = functions(source, 'amiidb_scene_settings_prepare_exit', 'amiidb_scene_settings_on_selected',
                              'amiidb_scene_settings_on_enter', 'amiidb_scene_settings_on_exit')
        compile_run(FIXTURE + types + navigation + state + callbacks + r'''
static int home_entries, slot_entries;
static bool allow_transition = true;
static bool guard(void) { return allow_transition; }
static void home_enter(void *p) { (void)p; home_entries++; }
static void slot_enter(void *p) { (void)p; slot_entries++; }
static const mui_scene_t scenes[] = {
  {0, home_enter, NULL},
  {1, amiidb_scene_settings_on_enter, amiidb_scene_settings_on_exit},
  {2, slot_enter, NULL}
};
static void start(test_app_t *app, mui_list_view_t *list, mui_msg_box_t *box, mui_scene_dispatcher_t *d) {
  reset_fixture(app, list, box, AMIIDB_VIEW_ID_LIST);
  memset(d, 0, sizeof(*d)); d->user_data = app; d->p_scene_defines = scenes; d->scene_num = 3;
  d->scene_id_stack[0] = 0; d->scene_id_stack[1] = 1; d->scene_depth = 2; d->transition_guard = guard;
  app->p_scene_dispatcher = d;
  home_entries = slot_entries = 0; allow_transition = true;
  amiidb_scene_settings_on_enter(app);
}
int main(void) {
  const int failures[] = {-91, 8};
  const int navigation_icons[] = {ICON_EXIT, ICON_SLOT};
  test_app_t app; mui_list_view_t list; mui_msg_box_t box; mui_scene_dispatcher_t d;
  mui_list_item_t sort = {ICON_SETTINGS, NULL, {0}};
  for (unsigned direction = 0; direction < 2; direction++) for (unsigned i = 0; i < 2; i++) {
    start(&app, &list, &box, &d);
    mui_list_item_t navigation_item = {navigation_icons[direction], NULL, {0}};
    amiidb_scene_settings_on_selected(0, &list, &sort);
    assert(ram.amiidb_sort_column == 1 && disk.amiidb_sort_column == 0 && saves == 0);
    save_result = failures[i];
    amiidb_scene_settings_on_selected(0, &list, &navigation_item);
    assert(saves == 1 && toasts == 1 && d.scene_depth == 2 && list.rows == 4 && clears == 1);
    assert(!home_entries && !slot_entries && !settings_exit_saved && !disk.amiidb_sort_column);
    amiidb_scene_settings_on_selected(0, &list, &navigation_item);
    assert(saves == 2 && toasts == 2 && d.scene_depth == 2 && list.rows == 4);
    save_result = 0;
    amiidb_scene_settings_on_selected(0, &list, &navigation_item);
    assert(saves == 3 && disk.amiidb_sort_column == 1 && clears == 2 && list.rows == 0);
    assert(!settings_exit_saved && !warnings);
    assert(direction ? (d.scene_depth == 3 && slot_entries == 1 && !home_entries)
                     : (d.scene_depth == 1 && home_entries == 1 && !slot_entries));

    /* A forced exit cannot be vetoed by on_exit, but still tries and logs. */
    start(&app, &list, &box, &d);
    amiidb_scene_settings_on_selected(0, &list, &sort);
    save_result = failures[i];
    mui_scene_dispatcher_exit(&d);
    assert(d.scene_depth == 0 && saves == 1 && warnings == 1 && clears == 2);
    assert(ram.amiidb_sort_column == 1 && disk.amiidb_sort_column == 0);
  }
  /* Returning from a vetoed transition must not leave a stale save exemption. */
  start(&app, &list, &box, &d);
  mui_list_item_t back = {ICON_EXIT, NULL, {0}};
  amiidb_scene_settings_on_selected(0, &list, &sort);
  allow_transition = false;
  amiidb_scene_settings_on_selected(0, &list, &back);
  assert(saves == 1 && d.scene_depth == 2 && !settings_exit_saved);
  save_result = -91;
  mui_scene_dispatcher_exit(&d);
  assert(saves == 2 && warnings == 1);
  /* Cancel the pending value deliberately by toggling back; no hidden rollback. */
  start(&app, &list, &box, &d);
  amiidb_scene_settings_on_selected(0, &list, &sort);
  save_result = 8;
  amiidb_scene_settings_on_selected(0, &list, &back);
  amiidb_scene_settings_on_selected(0, &list, &sort);
  assert(!ram.amiidb_sort_column && saves == 1 && d.scene_depth == 2);
  save_result = 0;
  amiidb_scene_settings_on_selected(0, &list, &back);
  assert(saves == 2 && !disk.amiidb_sort_column && d.scene_depth == 1);
  puts("PASS actual AmiiboDB sorting and dispatcher: no failed exit, retry, one save per navigation, forced-exit log");
}
''')


if __name__ == '__main__':
    unittest.main()
