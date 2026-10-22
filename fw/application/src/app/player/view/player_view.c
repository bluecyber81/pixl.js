#include "player_view.h"
#include "i18n/language.h"
#include "nrf_log.h"
#include "nrf_pwr_mgmt.h"
#include <stdio.h>

static void player_view_finished(player_view_t *p_view) {
    player_view_stop(p_view);
    if (p_view->event_cb) p_view->event_cb(PLAYER_VIEW_EVENT_PLAY_STOPPED, p_view);
}

static void player_view_on_draw(mui_view_t *p_view, mui_canvas_t *p_canvas) {
    player_view_t *player = p_view->user_data;
    if (!player->is_playing) {
        mui_canvas_draw_utf8(p_canvas, 0, 10, player->play_error ? _T(READ_FILE_FAILED) : _T(NOT_PLAYING));
        return;
    }
    if (player->header.width > mui_canvas_get_width(p_canvas) ||
        player->header.height > mui_canvas_get_height(p_canvas)) {
        player->play_error = true;
        player_view_finished(player);
        return;
    }
    if (player->frame_due) {
        player->frame_due = false;
        if (player->played_frames >= player->header.frame_count) {
            player_view_finished(player);
            return;
        }
        int32_t read = player->p_dirver->read_file(&player->fd, player->frame_buffer, player->frame_buffer_size);
        if (read != (int32_t)player->frame_buffer_size) {
            player->play_error = true;
            player_view_finished(player);
            return;
        }
        player->played_frames++;
        player->frame_valid = true;
    }
    /* UI redraws must redraw the current frame, not advance playback. */
    if (player->frame_valid) {
        uint8_t x = (mui_canvas_get_width(p_canvas) - player->header.width) / 2;
        uint8_t y = (mui_canvas_get_height(p_canvas) - player->header.height) / 2;
        mui_canvas_draw_xbm(p_canvas, x, y, player->header.width, player->header.height, player->frame_buffer);
        char txt[10];
        snprintf(txt, sizeof(txt), "%u", (unsigned)player->played_frames);
        mui_canvas_set_draw_color(p_canvas, 0);
        mui_canvas_draw_box(p_canvas, 0, 0, mui_canvas_get_utf8_width(p_canvas, txt), 12);
        mui_canvas_set_draw_color(p_canvas, 1);
        mui_canvas_draw_utf8(p_canvas, 0, 10, txt);
    }
}

static void player_view_on_input(mui_view_t *p_view, mui_input_event_t *event) {
    /* Keep PRESS/RELEASE in this view. Returning on PRESS would deliver the
     * same gesture's SHORT to the browser's newly focused Hauptmenue row. */
    if (event->type != INPUT_TYPE_SHORT && event->type != INPUT_TYPE_LONG) return;
    player_view_t *player = p_view->user_data;
    if (player->event_cb) player->event_cb(PLAYER_VIEW_EVENT_KEY_PRESSED, player);
}
static void player_view_on_enter(mui_view_t *p_view) {}
static void player_view_on_exit(mui_view_t *p_view) { player_view_stop(p_view->user_data); }

static void player_view_on_frame_tick(void *p_context) {
    player_view_t *p_view = p_context;
    if (p_view->is_playing) {
        p_view->frame_due = true;
        nrf_pwr_mgmt_feed();
        mui_update(mui());
    }
}

player_view_t *player_view_create() {
    player_view_t *player = mui_mem_malloc(sizeof(player_view_t));
    if (!player) return NULL;
    memset(player, 0, sizeof(player_view_t));
    player->p_view = mui_view_create();
    if (!player->p_view) { mui_mem_free(player); return NULL; }
    player->p_view->user_data = player;
    player->p_view->draw_cb = player_view_on_draw;
    player->p_view->input_cb = player_view_on_input;
    player->p_view->enter_cb = player_view_on_enter;
    player->p_view->exit_cb = player_view_on_exit;
    player->frame_tick_timer_id = &player->frame_tick_timer_data;
    int32_t err = app_timer_create(&player->frame_tick_timer_id, APP_TIMER_MODE_REPEATED, player_view_on_frame_tick);
    if (err != NRF_SUCCESS) {
        mui_view_free(player->p_view);
        mui_mem_free(player);
        return NULL;
    }
    return player;
}
void player_view_free(player_view_t *p_view) {
    if (!p_view) return;
    player_view_stop(p_view);
    mui_view_free(p_view->p_view);
    mui_mem_free(p_view);
}
mui_view_t *player_view_get_view(player_view_t *p_view) { return p_view->p_view; }

bool player_view_play(player_view_t *p_view, vfs_drive_t drive, const char *path) {
    player_view_stop(p_view);
    p_view->play_error = true;
    p_view->played_frames = 0;
    vfs_driver_t *driver = vfs_get_driver(drive);
    vfs_obj_t obj;
    uint8_t raw[PLAYER_HEADER_BYTES];
    if (!driver || !path || driver->stat_file(path, &obj) != VFS_OK || obj.type != VFS_TYPE_REG) return false;
    if (driver->open_file(path, &p_view->fd, VFS_MODE_READONLY) != VFS_OK) return false;
    p_view->p_dirver = driver;
    p_view->file_open = true;
    int32_t read = driver->read_file(&p_view->fd, raw, sizeof(raw));
    if (read != (int32_t)sizeof(raw) || !player_parse_header(raw, sizeof(raw), obj.size, SCREEN_WIDTH, SCREEN_HEIGHT,
                                                          &p_view->header, &p_view->frame_buffer_size)) {
        player_view_stop(p_view);
        return false;
    }
    p_view->frame_buffer = mui_mem_malloc(p_view->frame_buffer_size);
    if (!p_view->frame_buffer) {
        player_view_stop(p_view);
        return false;
    }
    p_view->is_playing = true;
    p_view->frame_due = true;
    uint32_t interval = (1000u + p_view->header.fps / 2u) / p_view->header.fps;
    int32_t err = app_timer_start(p_view->frame_tick_timer_id, APP_TIMER_TICKS(interval), p_view);
    if (err != NRF_SUCCESS) {
        player_view_stop(p_view);
        return false;
    }
    p_view->play_error = false;
    mui_update(mui());
    return true;
}

void player_view_stop(player_view_t *p_view) {
    if (p_view->is_playing) {
        p_view->is_playing = false;
        app_timer_stop(p_view->frame_tick_timer_id);
    }
    p_view->frame_due = false;
    p_view->frame_valid = false;
    if (p_view->frame_buffer) {
        mui_mem_free(p_view->frame_buffer);
        p_view->frame_buffer = NULL;
    }
    p_view->frame_buffer_size = 0;
    if (p_view->file_open) {
        p_view->file_open = false;
        p_view->p_dirver->close_file(&p_view->fd);
    }
    p_view->p_dirver = NULL;
}
