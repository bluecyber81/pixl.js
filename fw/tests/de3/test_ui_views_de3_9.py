"""Run production BLE/game view C with dirty allocator and real input sequences.

No firmware/device access. Stubs replace only SDK, canvas and UI allocation.
Negative controls selectively remove fixes and must fail the same behavior tests.
"""
from pathlib import Path
import os
import shlex
import shutil
import subprocess
import tempfile
import unittest

SRC = Path(__file__).resolve().parents[2] / "application/src"
BLE = SRC / "app/ble/view"
GAME = SRC / "app/game/view"

COMMON = r'''
#pragma once
#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include <string.h>
typedef enum { INPUT_KEY_LEFT, INPUT_KEY_CENTER, INPUT_KEY_RIGHT } input_key_t;
typedef enum { INPUT_TYPE_PRESS, INPUT_TYPE_RELEASE, INPUT_TYPE_SHORT,
               INPUT_TYPE_LONG, INPUT_TYPE_REPEAT } input_type_t;
typedef struct { input_key_t key; input_type_t type; } mui_input_event_t;
typedef struct { int unused; } mui_canvas_t;
typedef struct mui_view_s mui_view_t;
struct mui_view_s {
    void *user_data;
    void (*draw_cb)(mui_view_t *, mui_canvas_t *);
    void (*input_cb)(mui_view_t *, mui_input_event_t *);
    void (*enter_cb)(mui_view_t *);
    void (*exit_cb)(mui_view_t *);
};
enum { u8g2_font_siji_t_6x10, u8g2_font_wqy12_t_gb2312a };
void *mui_mem_malloc(size_t);
void mui_mem_free(void *);
mui_view_t *mui_view_create(void);
void mui_view_free(mui_view_t *);
void mui_canvas_set_font(mui_canvas_t *, int);
void mui_canvas_draw_glyph(mui_canvas_t *, int, int, int);
void mui_canvas_draw_utf8(mui_canvas_t *, int, int, const char *);
void *mui(void);
void mui_set_auto_update(void *, int);
'''

HARNESS = r'''
#include "mui_include.h"
#include <stdio.h>
#include <stdlib.h>
/* Include both real headers: their guards must not hide one another. */
#include "status_bar_view.h"
#include "ble_status_view.h"
#include "game_view.h"
#define CHECK(x) do { if (!(x)) { fprintf(stderr, "failed line %d: %s\n", __LINE__, #x); exit(1); } } while (0)
static unsigned allocations, text_draws, qr_draws, updates, disables, stopped;
static int auto_update = 1;
static game_view_t *active_game;
void *mui_mem_malloc(size_t size) {
    void *p = malloc(size); CHECK(p); memset(p, 0xa5, size); allocations++; return p;
}
void mui_mem_free(void *p) { CHECK(p && allocations); allocations--; free(p); }
mui_view_t *mui_view_create(void) { return mui_mem_malloc(sizeof(mui_view_t)); }
void mui_view_free(mui_view_t *p) { mui_mem_free(p); }
void mui_canvas_set_font(mui_canvas_t *p, int font) { (void)p; (void)font; }
void mui_canvas_draw_glyph(mui_canvas_t *p, int x, int y, int glyph) { (void)p; (void)x; (void)y; (void)glyph; }
void mui_canvas_draw_utf8(mui_canvas_t *p, int x, int y, const char *s) {
    (void)p; (void)x; (void)y; CHECK(s && strlen(s) < 100); text_draws++;
}
void draw_qrcode(mui_canvas_t *p, int x, int y, int size, const char *s) {
    (void)p; (void)x; (void)y; (void)size; CHECK(!strcmp(s, "https://pixl.amiibo.xyz")); qr_draws++;
}
const char *getLangString(int key) { (void)key; return "Bluetooth"; }
void *mui(void) { return &auto_update; }
void mui_set_auto_update(void *p, int enabled) { CHECK(p == &auto_update); auto_update = enabled; }
static void ble_event(ble_status_view_event_t event, ble_status_view_t *view) {
    CHECK(view->user_data == &updates);
    if (event == BLE_STATUS_VIEW_EVENT_UPDATE) updates++;
    else if (event == BLE_STATUS_VIEW_BLE_DISABLE) disables++;
    else CHECK(0);
}
static void send(mui_view_t *view, input_key_t key, input_type_t type) {
    mui_input_event_t event = { key, type }; view->input_cb(view, &event);
}
static void check_clear_keys(void) {
    CHECK(!game_view_key_pressed(INPUT_KEY_LEFT));
    CHECK(!game_view_key_pressed(INPUT_KEY_CENTER));
    CHECK(!game_view_key_pressed(INPUT_KEY_RIGHT));
    CHECK(game_view_center_key_repeat_cnt() == 0);
}
static void dirty_keys(mui_view_t *view) {
    send(view, INPUT_KEY_LEFT, INPUT_TYPE_PRESS);
    send(view, INPUT_KEY_CENTER, INPUT_TYPE_PRESS);
    send(view, INPUT_KEY_RIGHT, INPUT_TYPE_PRESS);
    send(view, INPUT_KEY_CENTER, INPUT_TYPE_REPEAT);
}
static int fake_game(void) {
    CHECK(auto_update == 0 && active_game->running == 1);
    dirty_keys(active_game->p_view); return 0;
}
static void game_stopped(game_view_event_t event, game_view_t *view) {
    CHECK(event == GAME_VIEW_EVENT_PLAY_STOPPED && view == active_game);
    CHECK(auto_update == 1 && view->running == 0); check_clear_keys(); stopped++;
}
static void test_ble(void) {
    status_bar_view_t compatible_header = {0}; (void)compatible_header;
    for (unsigned attempt = 0; attempt < 50; attempt++) {
        ble_status_view_t *view = ble_status_view_create();
        CHECK(view && view->p_view && view->p_view->user_data == view);
        CHECK(view->page == 0 && view->event_cb == NULL && view->user_data == NULL);
        for (unsigned i=0; i<sizeof(view->ble_addr); i++) CHECK(view->ble_addr[i] == 0);
        CHECK(view->p_view->draw_cb && view->p_view->input_cb && view->p_view->enter_cb && view->p_view->exit_cb);
        view->p_view->enter_cb(view->p_view);
        text_draws = qr_draws = 0;
        view->p_view->draw_cb(view->p_view, NULL);
        CHECK(text_draws == 4 && qr_draws == 0);
        send(view->p_view, INPUT_KEY_RIGHT, INPUT_TYPE_SHORT); /* callback is still NULL */
        CHECK(view->page == 1);
        view->p_view->draw_cb(view->p_view, NULL); CHECK(qr_draws == 1);
        ble_status_view_set_page(view, 0); CHECK(ble_status_view_get_page(view) == 0);
        ble_status_view_set_user_data(view, &updates); ble_status_view_set_event_cb(view, ble_event);
        updates = disables = 0;
        send(view->p_view, INPUT_KEY_LEFT, INPUT_TYPE_PRESS); CHECK(view->page == 0 && updates == 0);
        send(view->p_view, INPUT_KEY_LEFT, INPUT_TYPE_SHORT); CHECK(view->page == 1 && updates == 1);
        send(view->p_view, INPUT_KEY_RIGHT, INPUT_TYPE_SHORT); CHECK(view->page == 0 && updates == 2);
        send(view->p_view, INPUT_KEY_CENTER, INPUT_TYPE_SHORT); CHECK(disables == 1);
        view->p_view->exit_cb(view->p_view); ble_status_view_free(view); CHECK(allocations == 0);
    }
}
static void test_game(const char *mode) {
    game_view_t *view = game_view_create(); mui_view_t *base = game_view_get_view(view);
    active_game = view;
    if (!strcmp(mode, "enter")) {
        dirty_keys(base); base->enter_cb(base); check_clear_keys();
    } else if (!strcmp(mode, "exit")) {
        dirty_keys(base); base->exit_cb(base); check_clear_keys();
    } else if (!strcmp(mode, "hold")) {
        send(base, INPUT_KEY_CENTER, INPUT_TYPE_PRESS);
        for (int i=0; i<11; i++) send(base, INPUT_KEY_CENTER, INPUT_TYPE_REPEAT);
        CHECK(game_view_center_key_repeat_cnt() == 11); /* existing exit threshold remains >10 */
        send(base, INPUT_KEY_LEFT, INPUT_TYPE_PRESS); send(base, INPUT_KEY_LEFT, INPUT_TYPE_RELEASE);
        send(base, INPUT_KEY_RIGHT, INPUT_TYPE_PRESS); send(base, INPUT_KEY_RIGHT, INPUT_TYPE_RELEASE);
        CHECK(game_view_center_key_repeat_cnt() == 11 && game_view_key_pressed(INPUT_KEY_CENTER));
        send(base, INPUT_KEY_CENTER, INPUT_TYPE_RELEASE); check_clear_keys();
    } else if (!strcmp(mode, "saturate")) {
        send(base, INPUT_KEY_CENTER, INPUT_TYPE_PRESS);
        for (int i=0; i<512; i++) send(base, INPUT_KEY_CENTER, INPUT_TYPE_REPEAT);
        CHECK(game_view_center_key_repeat_cnt() == UINT8_MAX);
        send(base, INPUT_KEY_CENTER, INPUT_TYPE_RELEASE); check_clear_keys();
    } else if (!strcmp(mode, "bounds")) {
        dirty_keys(base); uint8_t count = game_view_center_key_repeat_cnt();
        input_key_t bad[] = { (input_key_t)-1, (input_key_t)3, (input_key_t)255 };
        for (unsigned i=0; i<sizeof(bad)/sizeof(bad[0]); i++) {
            CHECK(game_view_key_pressed(bad[i]) == 0);
            send(base, bad[i], INPUT_TYPE_PRESS); send(base, bad[i], INPUT_TYPE_RELEASE);
            send(base, bad[i], INPUT_TYPE_REPEAT);
        }
        CHECK(game_view_key_pressed(INPUT_KEY_LEFT) && game_view_key_pressed(INPUT_KEY_CENTER));
        CHECK(game_view_key_pressed(INPUT_KEY_RIGHT) && game_view_center_key_repeat_cnt() == count);
    } else if (!strcmp(mode, "return")) {
        game_view_set_game_run(view, fake_game); game_view_set_event_cb(view, game_stopped);
        base->enter_cb(base); base->draw_cb(base, NULL); CHECK(stopped == 1); check_clear_keys();
        base->draw_cb(base, NULL); CHECK(stopped == 2); check_clear_keys();
    } else CHECK(0);
    game_view_free(view); CHECK(allocations == 0);
}
int main(int argc, char **argv) {
    CHECK(argc == 2);
    if (!strcmp(argv[1], "ble")) test_ble(); else test_game(argv[1]);
    return 0;
}
'''


class ViewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cc = os.environ.get("CC") or shutil.which("gcc")
        if not cc:
            raise RuntimeError("Existing C compiler is required; tests must not silently skip")
        cls.cc = shlex.split(cc) if os.name != "nt" else [cc]

    def compile_check(self, modes, *, ble_source=None, game_source=None, expect_success=True):
        with tempfile.TemporaryDirectory(prefix="pixl-views-de39-") as directory:
            temp = Path(directory)
            files = {
                "mui_include.h": COMMON,
                "mui_core.h": '#include "mui_include.h"\n',
                "mui_qrcode_helper.h": '#include "mui_include.h"\nvoid draw_qrcode(mui_canvas_t *, int, int, int, const char *);\n',
                "i18n/language.h": 'enum { _L_APP_BLE_TITLE, _L_DE3_BLE_VISIBLE, _L_DE3_BLE_CONNECTED, _L_DE3_BLE_INACTIVE, _L_DE3_BLE_RESTART, _L_DE3_BLE_BACK, _L_DE3_BLE_QR, _L_DE3_BLE_HOST, _L_DE3_BLE_CLOSING, _L_DE3_BLE_WAIT_CLIENT };\nconst char *getLangString(int);\n',
                "ble_main.h": 'enum { BLE_LINK_INACTIVE, BLE_LINK_ADVERTISING, BLE_LINK_CONNECTED, BLE_LINK_HOST_CONNECTED, BLE_LINK_DISCONNECTING };\nstatic inline int ble_link_state_get(void) { return BLE_LINK_CONNECTED; }\n',
                "ble_status_view.h": (BLE / "ble_status_view.h").read_text(encoding="utf-8"),
                "ble_status_view.c": ble_source if ble_source is not None else (BLE / "ble_status_view.c").read_text(encoding="utf-8"),
                "status_bar_view.h": (SRC / "app/status_bar/view/status_bar_view.h").read_text(encoding="utf-8"),
                "game_view.h": (GAME / "game_view.h").read_text(encoding="utf-8"),
                "game_view.c": game_source if game_source is not None else (GAME / "game_view.c").read_text(encoding="utf-8"),
                "harness.c": HARNESS,
            }
            for name in ("vfs.h", "app_timer.h", "tiny_lander.h", "nrf_log.h", "nrf_pwr_mgmt.h"):
                files[name] = ""
            for name, text in files.items():
                path = temp / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(text, encoding="utf-8")
            exe = temp / ("views.exe" if os.name == "nt" else "views")
            command = self.cc + ["-std=c11", "-O0", "-Wall", "-Wextra", "-Werror",
                                 "-Wno-unused-parameter", "-Wno-unused-function", "-I", str(temp),
                                 str(temp / "harness.c"), str(temp / "ble_status_view.c"),
                                 str(temp / "game_view.c"), "-o", str(exe)]
            if os.environ.get("UI_SANITIZE") == "1":
                command += ["-fsanitize=address,undefined", "-fno-omit-frame-pointer", "-no-pie"]
            subprocess.run(command, check=True, timeout=60)
            for mode in modes:
                result = subprocess.run([str(exe), mode], capture_output=True, text=True, timeout=10)
                if expect_success:
                    self.assertEqual(result.returncode, 0, f"{mode}: {result.stderr}")
                else:
                    self.assertNotEqual(result.returncode, 0, f"Negative control unexpectedly passed: {mode}")

    def test_actual_views_dirty_allocator_and_input_lifecycle(self):
        self.compile_check(["ble", "enter", "exit", "hold", "saturate", "bounds", "return"])

    def test_negative_control_uninitialized_ble_status(self):
        text = (BLE / "ble_status_view.c").read_text(encoding="utf-8")
        old = "    memset(p_ble_status_view, 0, sizeof(ble_status_view_t));"
        self.assertEqual(text.count(old), 1)
        self.compile_check(["ble"], ble_source=text.replace(old, ""), expect_success=False)

    def test_negative_controls_game_lifecycle_and_center_hold(self):
        text = (GAME / "game_view.c").read_text(encoding="utf-8")
        mutants = {
            "enter": ("static void game_view_on_enter(mui_view_t *p_view) { game_view_reset_keys(); }",
                      "static void game_view_on_enter(mui_view_t *p_view) {}"),
            "exit": ("static void game_view_on_exit(mui_view_t *p_view) { game_view_reset_keys(); }",
                     "static void game_view_on_exit(mui_view_t *p_view) {}"),
            "hold": ("        if (event->key == INPUT_KEY_CENTER) {\n            key_repeat_cnt = 0;\n        }",
                     "        key_repeat_cnt = 0;"),
            "saturate": ("event->key == INPUT_KEY_CENTER && key_repeat_cnt < UINT8_MAX",
                         "event->key == INPUT_KEY_CENTER"),
            "return": ("        game_view_reset_keys();", "        key_repeat_cnt = 0;"),
        }
        for mode, (old, replacement) in mutants.items():
            with self.subTest(mode=mode):
                self.assertEqual(text.count(old), 1)
                self.compile_check([mode], game_source=text.replace(old, replacement), expect_success=False)


if __name__ == "__main__":
    unittest.main()
