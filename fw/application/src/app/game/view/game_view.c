#include "game_view.h"
#include "nrf_log.h"
#include "nrf_pwr_mgmt.h"

#include "mui_core.h"

static uint8_t key_state[3] = {0};
static uint8_t key_repeat_cnt = 0;

uint8_t game_view_key_pressed(input_key_t key) {
    return (unsigned int)key < sizeof(key_state) / sizeof(key_state[0]) ? key_state[key] : 0;
}

static void game_view_reset_keys(void) {
    memset(key_state, 0, sizeof(key_state));
    key_repeat_cnt = 0;
}

uint8_t game_view_center_key_repeat_cnt(){
    return key_repeat_cnt;
}

static void game_view_on_draw(mui_view_t *p_view, mui_canvas_t *p_canvas) {
    game_view_t *p_game_view = p_view->user_data;
    if (p_game_view->running == 0) {
        p_game_view->running = 1;
        mui_set_auto_update(mui(), 0);
        p_game_view->game_run();
        p_game_view->running = 0;
        game_view_reset_keys();
        mui_set_auto_update(mui(), 1);
        
         if (p_game_view->event_cb) {
            p_game_view->event_cb(GAME_VIEW_EVENT_PLAY_STOPPED, p_game_view);
        }
    }
}

static void game_view_on_input(mui_view_t *p_view, mui_input_event_t *event) {
    if ((unsigned int)event->key >= sizeof(key_state) / sizeof(key_state[0])) {
        return;
    }

    if (event->type == INPUT_TYPE_PRESS) {
        key_state[event->key] = 1;
    } else if (event->type == INPUT_TYPE_RELEASE) {
        key_state[event->key] = 0;
        if (event->key == INPUT_KEY_CENTER) {
            key_repeat_cnt = 0;
        }
    } else if (event->type == INPUT_TYPE_REPEAT) {
        if (event->key == INPUT_KEY_CENTER && key_repeat_cnt < UINT8_MAX) {
            key_repeat_cnt++;
        }
    }
}

static void game_view_on_enter(mui_view_t *p_view) { game_view_reset_keys(); }

static void game_view_on_exit(mui_view_t *p_view) { game_view_reset_keys(); }

game_view_t *game_view_create() {
    game_view_t *p_game_view = mui_mem_malloc(sizeof(game_view_t));
    if (!p_game_view) return NULL;
    memset(p_game_view, 0, sizeof(game_view_t));

    mui_view_t *p_view = mui_view_create();
    if (!p_view) { mui_mem_free(p_game_view); return NULL; }
    p_view->user_data = p_game_view;
    p_view->draw_cb = game_view_on_draw;
    p_view->input_cb = game_view_on_input;
    p_view->enter_cb = game_view_on_enter;
    p_view->exit_cb = game_view_on_exit;

    p_game_view->p_view = p_view;

    return p_game_view;
}
void game_view_free(game_view_t *p_view) {
    if (!p_view) return;
    mui_view_free(p_view->p_view);
    mui_mem_free(p_view);
}
mui_view_t *game_view_get_view(game_view_t *p_view) { return p_view->p_view; }
