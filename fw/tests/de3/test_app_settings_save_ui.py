"""Actual option callbacks, dispatcher and field checkpoints under save faults.

The real C scene lifecycle and checkpoint/restore code run unchanged. Persistence
outcomes, recovered record contents and visual containers are modeled. Tests do
not claim physical input/display, flash or NFC behavior; the transition guard
models a foreign NFC veto and is never bypassed.
"""
from pathlib import Path
import re
import unittest

from test_app_startup_allocations import compile_run, function

SRC = Path(__file__).resolve().parents[2] / "application/src"
FIXTURE = Path(__file__).with_name("app_settings_save_ui.c.in").read_text()


def functions(source, *names):
    return '\n\n'.join(function(source, name) for name in names)


def fixture():
    source = (SRC / 'mod/settings.c').read_text()
    header = (SRC / 'mod/settings.h').read_text()
    checkpoint_type = re.search(
        r'typedef struct \{\s*uint32_t save_generation;\s*uint8_t value;\s*bool edited;'
        r'\s*\} settings_byte_checkpoint_t;', header)[0]
    checkpoint_code = functions(source, 'settings_set_byte', 'settings_toggle_byte',
                                'settings_byte_edited', 'settings_checkpoint_byte',
                                'settings_restore_byte', 'settings_discard_notify',
                                'settings_discard_byte')
    result = FIXTURE.replace('/* SETTINGS_CHECKPOINT_TYPES */', checkpoint_type)
    result = result.replace('/* SETTINGS_CHECKPOINT_FUNCTIONS */', checkpoint_code)
    source = (SRC / 'mui/mui_scene_dispatcher.c').read_text()
    header = (SRC / 'mui/mui_scene_dispatcher.h').read_text()
    types = header[header.index('typedef void (*mui_scene_enter_cb_t)'):
                   header.index('mui_scene_dispatcher_t;') + len('mui_scene_dispatcher_t;')]
    navigation = functions(source, 'mui_scene_dispatcher_exit', 'mui_scene_dispatcher_next_scene',
                           'mui_scene_dispatcher_back_scene', 'mui_scene_dispatcher_previous_scene')
    return result + types + navigation


def lifecycle(source, enter, exit):
    return functions(source, enter, exit) + r'''
static bool allow_transition;
static unsigned guard_calls;
static bool guard(void) { guard_calls++; return allow_transition; }
static void parent_enter(void *p) { (void)p; previous++; shown = 99; }
static void slot_enter(void *p) { (void)p; next_scene++; shown = 98; }
static const mui_scene_t scenes[] = {
  {0, parent_enter, NULL},
  {1, ENTER, EXIT},
  {2, slot_enter, NULL}
};
static void start(test_app_t *app, mui_list_view_t *list, mui_msg_box_t *box, mui_scene_dispatcher_t *d) {
  reset_fixture(app, list, box, 0);
  memset(d, 0, sizeof(*d)); d->user_data = app; d->p_scene_defines = scenes; d->scene_num = 3;
  d->scene_id_stack[0] = 0; d->scene_id_stack[1] = 1; d->scene_depth = 2; d->transition_guard = guard;
  app->p_scene_dispatcher = d; list->rows = 0;
  allow_transition = true; guard_calls = 0;
  ENTER(app);
}
'''.replace('ENTER', enter).replace('EXIT', exit)


class AppSettingsSaveUiTests(unittest.TestCase):
    def test_amiibolink_mode_failure_retry_back_and_discard_exit(self):
        source = (SRC / 'app/amiibolink/scene/amiibolink_scene_menu_mode.c').read_text()
        code = source[source.index('static settings_byte_checkpoint_t'):
                      source.index('void amiibolink_scene_menu_mode_on_enter')]
        code += lifecycle(source, 'amiibolink_scene_menu_mode_on_enter', 'amiibolink_scene_menu_mode_on_exit')
        compile_run(fixture() + code + r'''
int main(void) {
  const int failures[] = {-91, 8};
  test_app_t app; mui_list_view_t list; mui_msg_box_t box; mui_scene_dispatcher_t d;
  mui_list_item_t item = {ICON_MODE, (void *)(uintptr_t)3, {0}};
  for (unsigned i = 0; i < 2; i++) {
    start(&app, &list, &box, &d); app.amiibolink_mode = 1;
    SETTINGS_SET(unrelated, 73); save_result = failures[i];
    amiibolink_scene_menu_mode_on_event(MUI_LIST_VIEW_EVENT_SELECTED, &list, &item);
    check_save_error(&box, AMIIBOLINK_VIEW_ID_MSG_BOX);
    assert(saves == 1 && ram.amiibolink_mode == 3 && app.amiibolink_mode == 3);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
    assert(saves == 3 && d.scene_depth == 2 && !saved_logs && ram.amiibolink_mode == 3);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER, &box);
    check_discard_question(&box, AMIIBOLINK_VIEW_ID_MSG_BOX);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER, &box); /* no center action in consent */
    assert(ram.amiibolink_mode == 3 && saves == 3 && d.scene_depth == 2);
    box.event_cb(box.focus, &box); /* default No */
    check_save_error(&box, AMIIBOLINK_VIEW_ID_MSG_BOX);
    assert(ram.amiibolink_mode == 3 && saves == 3);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER, &box);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box); /* explicit Yes */
    assert(d.scene_depth == 1 && previous == 1 && guard_calls == 1 && list.rows == 0);
    assert(saves == 3 && !saved_logs && !ram.amiibolink_mode && app.amiibolink_mode == 1);
    assert(!disk.amiibolink_mode && ram.unrelated == 73);
    assert(!(edited_fields & SETTINGS_FIELD_MASK(amiibolink_mode)));
    assert(edited_fields & SETTINGS_FIELD_MASK(unrelated));

    start(&app, &list, &box, &d); save_result = failures[i];
    amiibolink_scene_menu_mode_on_event(0, &list, &item);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_RIGHT, &box); /* Back retains the selected mode */
    assert(saves == 1 && !previous && ram.amiibolink_mode == 3 && shown == AMIIBOLINK_VIEW_ID_LIST);
    amiibolink_scene_menu_mode_on_event(0, &list, &item);
    save_result = 0;
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
    assert(saves == 3 && previous == 1 && saved_logs == 1 && disk.amiibolink_mode == 3);
  }
  /* A pending preference from before this scene remains pending after discard. */
  start(&app, &list, &box, &d);
  SETTINGS_SET(amiibolink_mode, 2); app.amiibolink_mode = 2; save_result = -91;
  amiibolink_scene_menu_mode_on_event(0, &list, &item);
  box.event_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER, &box);
  box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
  assert(ram.amiibolink_mode == 2 && app.amiibolink_mode == 2 && !disk.amiibolink_mode);
  assert(edited_fields & SETTINGS_FIELD_MASK(amiibolink_mode));
  /* A valid record recovered after entry overrides clean startup defaults. */
  start(&app, &list, &box, &d); app.amiibolink_mode = 1; save_result = 8;
  amiibolink_scene_menu_mode_on_event(0, &list, &item);
  discard_base.amiibolink_mode = 2;
  box.event_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER, &box);
  box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
  assert(ram.amiibolink_mode == 2 && app.amiibolink_mode == 2 && saves == 1);
  assert(!(edited_fields & SETTINGS_FIELD_MASK(amiibolink_mode)));
  /* Discard does not bypass a foreign transition guard. */
  start(&app, &list, &box, &d); app.amiibolink_mode = 1; save_result = -91;
  amiibolink_scene_menu_mode_on_event(0, &list, &item);
  allow_transition = false;
  box.event_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER, &box);
  box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
  assert(d.scene_depth == 2 && !previous && guard_calls == 1 && !ram.amiibolink_mode);
  assert(shown == AMIIBOLINK_VIEW_ID_LIST && saves == 1);
  allow_transition = true;
  mui_list_item_t back = {ICON_BACK, NULL, {0}};
  amiibolink_scene_menu_mode_on_event(0, &list, &back);
  assert(d.scene_depth == 1 && previous == 1 && guard_calls == 2 && saves == 1);
  start(&app, &list, &box, &d);
  amiibolink_scene_menu_mode_on_event(MUI_LIST_VIEW_EVENT_LONG_SELECTED, &list, &item);
  assert(!saves && !previous && !ram.amiibolink_mode);
  amiibolink_scene_menu_mode_on_event(0, &list, &item);
  assert(saves == 1 && previous == 1 && saved_logs == 1 && disk.amiibolink_mode == 3);
  puts("PASS mode: persistent errors, repeat/no/yes/back, real exit, prior pending, late record and foreign veto");
}
''')

    def test_amiibo_auto_uid_retry_and_confirmed_discard_exit(self):
        source = (SRC / 'app/amiibo/scene/amiibo_scene_amiibo_detail_menu.c').read_text()
        code = re.search(r'enum amiibo_detail_menu_t\s*\{.*?\};', source, re.S)[0]
        code += source[source.index('static settings_byte_checkpoint_t'):
                       source.index('static ret_code_t amiibo_scene_amiibo_detail_set_readonly')]
        code += function(source, 'amiibo_scene_amiibo_detail_menu_on_selected')
        code += lifecycle(source, 'amiibo_scene_amiibo_detail_menu_on_enter', 'amiibo_scene_amiibo_detail_menu_on_exit')
        compile_run(fixture() + code + r'''
int main(void) {
  const int failures[] = {-91, 8};
  test_app_t app; mui_list_view_t list; mui_msg_box_t box; mui_scene_dispatcher_t d;
  mui_list_item_t item = {0, (void *)(uintptr_t)AMIIBO_DETAIL_MENU_AUTO_RAND_UID, {0}};
  for (unsigned i = 0; i < 2; i++) {
    start(&app, &list, &box, &d); SETTINGS_SET(unrelated, 73); save_result = failures[i];
    amiibo_scene_amiibo_detail_menu_on_selected(0, &list, &item);
    check_save_error(&box, AMIIBO_VIEW_ID_MSG_BOX);
    assert(saves == 1 && ram.auto_gen_amiibo && !disk.auto_gen_amiibo);
    assert(!strcmp(item.sub_text, "_L_ON_F"));
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
    assert(saves == 3 && ram.auto_gen_amiibo && d.scene_depth == 2);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER, &box);
    check_discard_question(&box, AMIIBO_VIEW_ID_MSG_BOX);
    box.event_cb(box.focus, &box);
    check_save_error(&box, AMIIBO_VIEW_ID_MSG_BOX);
    assert(saves == 3 && ram.auto_gen_amiibo);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER, &box);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
    assert(d.scene_depth == 1 && previous == 1 && saves == 3 && list.rows == 0);
    assert(!ram.auto_gen_amiibo && !disk.auto_gen_amiibo && !strcmp(item.sub_text, "_L_OFF_F"));
    assert(ram.unrelated == 73 && (edited_fields & SETTINGS_FIELD_MASK(unrelated)));
    assert(!(edited_fields & SETTINGS_FIELD_MASK(auto_gen_amiibo)));

    start(&app, &list, &box, &d); save_result = failures[i];
    amiibo_scene_amiibo_detail_menu_on_selected(0, &list, &item);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_RIGHT, &box);
    assert(ram.auto_gen_amiibo && !disk.auto_gen_amiibo && shown == AMIIBO_VIEW_ID_LIST && saves == 1);
    /* Returning to the error never toggles the pending choice again. */
    amiibo_scene_settings_save_error(&app);
    save_result = 0;
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
    assert(saves == 2 && ram.auto_gen_amiibo && disk.auto_gen_amiibo && d.scene_depth == 2);
    assert(!auto_uid_pending && shown == AMIIBO_VIEW_ID_LIST);
    amiibo_scene_amiibo_detail_menu_on_selected(0, &list, &item);
    assert(saves == 3 && !ram.auto_gen_amiibo && !disk.auto_gen_amiibo);
  }
  start(&app, &list, &box, &d); SETTINGS_SET(auto_gen_amiibo, true); save_result = -91;
  amiibo_scene_amiibo_detail_menu_on_selected(0, &list, &item);
  assert(!ram.auto_gen_amiibo);
  box.event_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER, &box);
  box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
  assert(ram.auto_gen_amiibo && !disk.auto_gen_amiibo && (edited_fields & SETTINGS_FIELD_MASK(auto_gen_amiibo)));
  /* Successful intervening persistence invalidates an older pending checkpoint. */
  start(&app, &list, &box, &d); SETTINGS_SET(auto_gen_amiibo, true); save_result = -91;
  amiibo_scene_amiibo_detail_menu_on_selected(0, &list, &item); /* pending false */
  save_result = 0; assert(settings_save() == 0); /* accepted false */
  save_result = 8;
  box.event_cb(MUI_MSG_BOX_EVENT_SELECT_RIGHT, &box);
  amiibo_scene_amiibo_detail_menu_on_selected(0, &list, &item); /* pending true */
  box.event_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER, &box);
  box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
  assert(!ram.auto_gen_amiibo && !disk.auto_gen_amiibo && saves == 3);
  assert(!(edited_fields & SETTINGS_FIELD_MASK(auto_gen_amiibo)));
  /* Ambiguous storage completion is never described or implemented as disk rollback. */
  start(&app, &list, &box, &d); save_result = 8; commit_before_error = true;
  amiibo_scene_amiibo_detail_menu_on_selected(0, &list, &item);
  assert(disk.auto_gen_amiibo && ram.auto_gen_amiibo);
  box.event_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER, &box);
  box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
  assert(!ram.auto_gen_amiibo && disk.auto_gen_amiibo && saves == 1);
  /* Foreign pending NFC data still owns its guard; the option is already restored. */
  start(&app, &list, &box, &d); save_result = -91;
  amiibo_scene_amiibo_detail_menu_on_selected(0, &list, &item); allow_transition = false;
  box.event_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER, &box);
  box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
  assert(d.scene_depth == 2 && guard_calls == 1 && !ram.auto_gen_amiibo && !auto_uid_pending);
  assert(shown == AMIIBO_VIEW_ID_LIST && !strcmp(item.sub_text, "_L_OFF_F"));
  allow_transition = true; mui_scene_dispatcher_previous_scene(&d);
  assert(d.scene_depth == 1 && saves == 1 && previous == 1);
  start(&app, &list, &box, &d); key_loaded = false;
  amiibo_scene_amiibo_detail_menu_on_selected(0, &list, &item);
  assert(no_key == 1 && !saves && !auto_uid_pending && !ram.auto_gen_amiibo);
  puts("PASS file auto UID: both errors, retry/no/yes/back, real exit, checkpoint generation and partial commit");
}
''')

    def test_amiidb_auto_uid_and_qr_discard_only_selected_option(self):
        source = (SRC / 'app/amiidb/scene/amiidb_scene_amiibo_detail_menu.c').read_text()
        code = re.search(r'enum amiidb_detail_menu_t\s*\{.*?\};', source, re.S)[0]
        code += source[source.index('static settings_byte_checkpoint_t'):
                       source.index('static void amiidb_scene_amiibo_detail_menu_msg_box_no_key_cb')]
        code += function(source, 'amiidb_scene_amiibo_detail_menu_on_selected')
        code += lifecycle(source, 'amiidb_scene_amiibo_detail_menu_on_enter', 'amiidb_scene_amiibo_detail_menu_on_exit')
        compile_run(fixture() + code + r'''
int main(void) {
  const int failures[] = {-91, 8};
  const unsigned selections[] = {AMIIDB_DETAIL_MENU_AUTO_RAND_UID, AMIIDB_DETAIL_MENU_SHOW_QRCODE};
  test_app_t app; mui_list_view_t list; mui_msg_box_t box; mui_scene_dispatcher_t d;
  for (unsigned which = 0; which < 2; which++) for (unsigned i = 0; i < 2; i++) {
    mui_list_item_t item = {0, (void *)(uintptr_t)selections[which], {0}};
    bool *live = which ? &ram.qrcode_enabled : &ram.auto_gen_amiibo;
    bool *saved = which ? &disk.qrcode_enabled : &disk.auto_gen_amiibo;
    uint32_t bit = which ? SETTINGS_FIELD_MASK(qrcode_enabled) : SETTINGS_FIELD_MASK(auto_gen_amiibo);
    start(&app, &list, &box, &d); SETTINGS_SET(unrelated, 73); save_result = failures[i];
    amiidb_scene_amiibo_detail_menu_on_selected(0, &list, &item);
    check_save_error(&box, AMIIDB_VIEW_ID_MSG_BOX);
    assert(saves == 1 && *live && !*saved && !strcmp(item.sub_text, "_L_ON_F"));
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
    assert(saves == 3 && *live && !*saved && d.scene_depth == 2);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER, &box);
    check_discard_question(&box, AMIIDB_VIEW_ID_MSG_BOX);
    box.event_cb(box.focus, &box);
    check_save_error(&box, AMIIDB_VIEW_ID_MSG_BOX);
    assert(saves == 3 && *live);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER, &box);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
    assert(d.scene_depth == 1 && previous == 1 && saves == 3 && list.rows == 0);
    assert(!*live && !*saved && !(edited_fields & bit) && !strcmp(item.sub_text, "_L_OFF_F"));
    assert(ram.unrelated == 73 && (edited_fields & SETTINGS_FIELD_MASK(unrelated)));

    start(&app, &list, &box, &d); save_result = failures[i];
    amiidb_scene_amiibo_detail_menu_on_selected(0, &list, &item);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_RIGHT, &box);
    assert(*live && !*saved && shown == AMIIDB_VIEW_ID_LIST && saves == 1);
    amiidb_scene_detail_settings_save_error(&app);
    save_result = 0; box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
    assert(saves == 2 && *live && *saved && previous == 1 && d.scene_depth == 1);

    start(&app, &list, &box, &d); *live = true; edited_fields |= bit; save_result = failures[i];
    amiidb_scene_amiibo_detail_menu_on_selected(0, &list, &item);
    assert(!*live);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER, &box);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
    assert(*live && !*saved && (edited_fields & bit) && saves == 1);

    start(&app, &list, &box, &d); save_result = failures[i];
    amiidb_scene_amiibo_detail_menu_on_selected(0, &list, &item);
    if (which) discard_base.qrcode_enabled = true; else discard_base.auto_gen_amiibo = true;
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER, &box);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
    assert(*live && !(edited_fields & bit) && saves == 1);
  }
  /* Keeping an older UID edit via Back must not let a later QR discard destroy it. */
  mui_list_item_t uid = {0, (void *)(uintptr_t)AMIIDB_DETAIL_MENU_AUTO_RAND_UID, {0}};
  mui_list_item_t qr = {0, (void *)(uintptr_t)AMIIDB_DETAIL_MENU_SHOW_QRCODE, {0}};
  start(&app, &list, &box, &d); save_result = -91;
  amiidb_scene_amiibo_detail_menu_on_selected(0, &list, &uid);
  box.event_cb(MUI_MSG_BOX_EVENT_SELECT_RIGHT, &box);
  amiidb_scene_amiibo_detail_menu_on_selected(0, &list, &qr);
  box.event_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER, &box);
  box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
  assert(ram.auto_gen_amiibo && !ram.qrcode_enabled && saves == 2 && previous == 1);
  assert((edited_fields & SETTINGS_FIELD_MASK(auto_gen_amiibo)) && !(edited_fields & SETTINGS_FIELD_MASK(qrcode_enabled)));
  start(&app, &list, &box, &d); save_result = 8;
  amiidb_scene_amiibo_detail_menu_on_selected(0, &list, &uid); allow_transition = false;
  box.event_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER, &box);
  box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
  assert(d.scene_depth == 2 && guard_calls == 1 && !ram.auto_gen_amiibo && shown == AMIIDB_VIEW_ID_LIST);
  allow_transition = true; mui_scene_dispatcher_previous_scene(&d);
  assert(d.scene_depth == 1 && saves == 1);
  start(&app, &list, &box, &d); key_loaded = false;
  amiidb_scene_amiibo_detail_menu_on_selected(0, &list, &uid);
  assert(no_key == 1 && !saves && !detail_uid_pending);
  amiidb_scene_amiibo_detail_menu_on_selected(0, &list, &qr);
  assert(no_key == 1 && saves == 1 && disk.qrcode_enabled && previous == 1);
  puts("PASS DB UID/QR: repeated faults, no/yes/back, real exit, per-field ownership and late recovery");
}
''')

    def test_amiidb_sort_discard_exits_without_hidden_save_after_guard(self):
        source = (SRC / 'app/amiidb/scene/amiidb_scene_settings.c').read_text()
        code = source[source.index('static bool settings_exit_saved,'):
                      source.index('void amiidb_scene_settings_on_enter')]
        code += lifecycle(source, 'amiidb_scene_settings_on_enter', 'amiidb_scene_settings_on_exit')
        compile_run(fixture() + code + r'''
int main(void) {
  const int failures[] = {-91, 8};
  const int navigation_icons[] = {ICON_EXIT, ICON_SLOT};
  test_app_t app; mui_list_view_t list; mui_msg_box_t box; mui_scene_dispatcher_t d;
  mui_list_item_t sort = {ICON_SETTINGS, NULL, {0}}, back = {ICON_EXIT, NULL, {0}};
  for (unsigned direction = 0; direction < 2; direction++) for (unsigned i = 0; i < 2; i++) {
    mui_list_item_t navigation_item = {navigation_icons[direction], NULL, {0}};
    start(&app, &list, &box, &d); SETTINGS_SET(unrelated, 73);
    amiidb_scene_settings_on_selected(0, &list, &sort);
    assert(ram.amiidb_sort_column == 1 && !saves);
    save_result = failures[i];
    amiidb_scene_settings_on_selected(0, &list, &navigation_item);
    check_save_error(&box, AMIIDB_VIEW_ID_MSG_BOX);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
    assert(saves == 3 && d.scene_depth == 2 && list.rows == 4 && !guard_calls);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER, &box);
    check_discard_question(&box, AMIIDB_VIEW_ID_MSG_BOX);
    box.event_cb(box.focus, &box);
    check_save_error(&box, AMIIDB_VIEW_ID_MSG_BOX);
    assert(ram.amiidb_sort_column == 1 && saves == 3 && d.scene_depth == 2);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER, &box);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
    assert(saves == 3 && !ram.amiidb_sort_column && !disk.amiidb_sort_column && !warnings);
    assert(!settings_exit_saved && !settings_exit_discarded && !settings_sort_pending && list.rows == 0);
    assert(direction ? (d.scene_depth == 3 && next_scene == 1 && !previous)
                     : (d.scene_depth == 1 && previous == 1 && !next_scene));
    assert(ram.unrelated == 73 && (edited_fields & SETTINGS_FIELD_MASK(unrelated)));
    assert(!(edited_fields & SETTINGS_FIELD_MASK(amiidb_sort_column)));

    /* Retry succeeds once: on_exit must not save a second time. */
    start(&app, &list, &box, &d);
    amiidb_scene_settings_on_selected(0, &list, &sort); save_result = failures[i];
    amiidb_scene_settings_on_selected(0, &list, &navigation_item);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_RIGHT, &box);
    assert(ram.amiidb_sort_column == 1 && shown == AMIIDB_VIEW_ID_LIST && saves == 1);
    amiidb_scene_settings_on_selected(0, &list, &navigation_item);
    save_result = 0; box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
    assert(saves == 3 && disk.amiidb_sort_column == 1 && !warnings && list.rows == 0);
    assert(direction ? (d.scene_depth == 3 && next_scene == 1) : (d.scene_depth == 1 && previous == 1));

    /* Even when a foreign guard vetoes, confirmed discard prevents later Save. */
    start(&app, &list, &box, &d);
    amiidb_scene_settings_on_selected(0, &list, &sort); save_result = failures[i];
    amiidb_scene_settings_on_selected(0, &list, &navigation_item); allow_transition = false;
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER, &box);
    box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
    assert(d.scene_depth == 2 && guard_calls == 1 && settings_exit_discarded && !settings_exit_saved);
    assert(!ram.amiidb_sort_column && saves == 1 && shown == AMIIDB_VIEW_ID_LIST);
    allow_transition = true;
    amiidb_scene_settings_on_selected(0, &list, &navigation_item);
    assert(saves == 1 && guard_calls == 2 && !warnings && list.rows == 0);
    assert(direction ? (d.scene_depth == 3 && next_scene == 1) : (d.scene_depth == 1 && previous == 1));

    /* A forced exit cannot veto, but unconfirmed changes still attempt/log Save. */
    start(&app, &list, &box, &d);
    amiidb_scene_settings_on_selected(0, &list, &sort); save_result = failures[i];
    mui_scene_dispatcher_exit(&d);
    assert(d.scene_depth == 0 && saves == 1 && warnings == 1 && ram.amiidb_sort_column == 1);
  }
  /* Never discard someone else's pending sort choice when this scene did not edit it. */
  start(&app, &list, &box, &d); SETTINGS_SET(amiidb_sort_column, 1); save_result = -91;
  amiidb_scene_settings_on_selected(0, &list, &back);
  box.event_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER, &box);
  box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
  assert(ram.amiidb_sort_column == 1 && (edited_fields & SETTINGS_FIELD_MASK(amiidb_sort_column)));
  assert(saves == 1 && d.scene_depth == 1);
  /* A fresh edit after a vetoed discard cancels its old no-save exemption. */
  start(&app, &list, &box, &d);
  amiidb_scene_settings_on_selected(0, &list, &sort); save_result = 8;
  amiidb_scene_settings_on_selected(0, &list, &back); allow_transition = false;
  box.event_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER, &box);
  box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
  assert(settings_exit_discarded && saves == 1);
  amiidb_scene_settings_on_selected(0, &list, &sort);
  assert(!settings_exit_discarded && ram.amiidb_sort_column == 1);
  amiidb_scene_settings_on_selected(0, &list, &back);
  assert(saves == 2 && d.scene_depth == 2);
  allow_transition = true;
  box.event_cb(MUI_MSG_BOX_EVENT_SELECT_CENTER, &box);
  box.event_cb(MUI_MSG_BOX_EVENT_SELECT_LEFT, &box);
  assert(saves == 2 && d.scene_depth == 1 && !ram.amiidb_sort_column);
  /* A successful save followed by veto must not exempt an unrelated forced exit. */
  start(&app, &list, &box, &d);
  amiidb_scene_settings_on_selected(0, &list, &sort); allow_transition = false;
  amiidb_scene_settings_on_selected(0, &list, &back);
  assert(saves == 1 && d.scene_depth == 2 && !settings_exit_saved);
  save_result = -91; mui_scene_dispatcher_exit(&d);
  assert(saves == 2 && warnings == 1 && d.scene_depth == 0);
  puts("PASS sort: both destinations, persistent faults, explicit no/yes, actual exit, veto and no hidden Save");
}
''')


if __name__ == '__main__':
    unittest.main()
