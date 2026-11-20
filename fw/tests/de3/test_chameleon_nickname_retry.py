"""Actual Chameleon nickname callbacks keep edited text after a failed write."""
from pathlib import Path
import unittest

from test_app_startup_allocations import compile_run, function

SRC = Path(__file__).resolve().parents[2] / 'application/src'


class ChameleonNicknameRetryTests(unittest.TestCase):
    def test_failure_retry_success_cancel_and_empty_input(self):
        source = (SRC / 'app/chameleon/scene/chameleon_scene_menu_card_set_name.c').read_text()
        callbacks = '\n'.join(function(source, name) for name in (
            'chameleon_scene_menu_card_set_name_text_input_event_cb',
            'chameleon_scene_menu_card_set_name_on_enter', 'chameleon_scene_menu_card_set_name_on_exit'))
        compile_run(r'''
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#define MUI_TEXT_INPUT_EVENT_CONFIRMED 0
#define MUI_TEXT_INPUT_EVENT_CANCELLED 1
#define VFS_META_MAX_NOTES_SIZE 96
#define CHAMELEON_VIEW_ID_TEXT_INPUT 3
#define _T(x) #x
typedef int mui_text_input_event_t;
typedef struct mui_text_input {
  void *user_data; char text[96]; size_t max_length;
  void (*event_cb)(mui_text_input_event_t, struct mui_text_input *);
} mui_text_input_t;
typedef struct {
  void *p_toast_view, *p_scene_dispatcher, *p_view_dispatcher, *p_list_view;
  mui_text_input_t *p_text_input;
} app_chameleon_t;
static int save_result, saves, previous, failure_toasts, success_toasts, cleared;
static char persisted[96];
static const char *mui_text_input_get_input_text(mui_text_input_t *input) { return input->text; }
static int32_t tag_helper_set_nickname(const char *text) { saves++; if (!save_result) strcpy(persisted, text); return save_result; }
static void tag_helper_get_nickname(char *out, size_t size) { snprintf(out, size, "%s", persisted); }
static void mui_toast_view_show(void *toast, const char *message) { (void)toast; if (strstr(message, "FAILED")) failure_toasts++; else success_toasts++; }
static void mui_scene_dispatcher_previous_scene(void *dispatcher) { (void)dispatcher; previous++; }
static void mui_text_input_set_max_length(mui_text_input_t *input, size_t limit) { input->max_length = limit; }
static void mui_text_input_set_header(mui_text_input_t *input, const char *header) { (void)input; (void)header; }
static void mui_text_input_set_input_text(mui_text_input_t *input, const char *text) { snprintf(input->text, sizeof(input->text), "%s", text); }
static void mui_text_input_set_event_cb(mui_text_input_t *input, void (*callback)(mui_text_input_event_t, mui_text_input_t *)) { input->event_cb = callback; }
static void mui_view_dispatcher_switch_to_view(void *dispatcher, int view) { (void)dispatcher; assert(view == CHAMELEON_VIEW_ID_TEXT_INPUT); }
static void mui_list_view_clear_items(void *list) { (void)list; cleared++; }
''' + callbacks + r'''
static void start(app_chameleon_t *app, mui_text_input_t *input) {
  strcpy(persisted, "Bisheriger Name");
  saves = previous = failure_toasts = success_toasts = cleared = 0;
  memset(app, 0, sizeof(*app)); memset(input, 0, sizeof(*input));
  app->p_text_input = input; input->user_data = app;
  chameleon_scene_menu_card_set_name_on_enter(app);
  assert(!strcmp(input->text, persisted) && input->max_length == sizeof(input->text) - 1 && input->event_cb);
}
int main(void) {
  const int failures[] = {-91, 8};
  app_chameleon_t app; mui_text_input_t input;
  for (unsigned i = 0; i < 2; i++) {
    start(&app, &input);
    strcpy(input.text, "Muehsam eingegebener neuer Name"); save_result = failures[i];
    input.event_cb(MUI_TEXT_INPUT_EVENT_CONFIRMED, &input);
    assert(saves == 1 && failure_toasts == 1 && previous == 0 && !cleared);
    assert(!strcmp(input.text, "Muehsam eingegebener neuer Name") && !strcmp(persisted, "Bisheriger Name"));
    assert(input.max_length == sizeof(input.text) - 1);
    input.event_cb(MUI_TEXT_INPUT_EVENT_CONFIRMED, &input);
    assert(saves == 2 && failure_toasts == 2 && previous == 0 && !success_toasts);
    save_result = 0;
    input.event_cb(MUI_TEXT_INPUT_EVENT_CONFIRMED, &input);
    assert(saves == 3 && success_toasts == 1 && previous == 1 && !strcmp(persisted, input.text));
    chameleon_scene_menu_card_set_name_on_exit(&app);
    assert(input.max_length == 0 && cleared == 1);
    chameleon_scene_menu_card_set_name_on_enter(&app);
    assert(!strcmp(input.text, "Muehsam eingegebener neuer Name"));

    start(&app, &input);
    strcpy(input.text, "Danach abbrechen"); save_result = failures[i];
    input.event_cb(MUI_TEXT_INPUT_EVENT_CONFIRMED, &input);
    input.event_cb(MUI_TEXT_INPUT_EVENT_CANCELLED, &input);
    assert(saves == 1 && previous == 1 && !success_toasts && !strcmp(persisted, "Bisheriger Name"));
    chameleon_scene_menu_card_set_name_on_exit(&app);
    chameleon_scene_menu_card_set_name_on_enter(&app);
    assert(!strcmp(input.text, "Bisheriger Name"));
  }
  start(&app, &input); save_result = 0;
  strcpy(input.text, "Erfolgreich");
  input.event_cb(MUI_TEXT_INPUT_EVENT_CONFIRMED, &input);
  assert(saves == 1 && previous == 1 && success_toasts == 1 && !failure_toasts && !strcmp(persisted, "Erfolgreich"));
  start(&app, &input);
  input.text[0] = 0;
  input.event_cb(MUI_TEXT_INPUT_EVENT_CONFIRMED, &input);
  assert(!saves && previous == 1 && !success_toasts && !failure_toasts && !strcmp(persisted, "Bisheriger Name"));
  puts("PASS actual Chameleon nickname: both errors preserve editor/text; retry, success, explicit cancel and empty input");
}
''')


if __name__ == '__main__':
    unittest.main()
