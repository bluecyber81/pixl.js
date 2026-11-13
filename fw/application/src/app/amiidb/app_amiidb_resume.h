#ifndef APP_AMIIDB_RESUME_H
#define APP_AMIIDB_RESUME_H

#include "amiidb_api_slot.h"
#include "mui_alloc.h"
#include "mui_icons.h"

_Static_assert(sizeof(app_amiidb_cache_data_t) <= CACHEDATASIZE, "App3 retain budget exceeded");

static bool app_amiidb_resume_origin(uint8_t scene) {
    return scene == AMIIDB_SCENE_GAME_LIST || scene == AMIIDB_SCENE_AMIIBO_SEARCH ||
           scene == AMIIDB_SCENE_FAV_LIST || scene == AMIIDB_SCENE_DATA_LIST || scene == AMIIDB_SCENE_RECENT;
}

static uint8_t app_amiidb_resume_target(uint32_t scene) {
    switch (scene) {
    case AMIIDB_SCENE_AMIIBO_DETAIL_MENU:
    case AMIIDB_SCENE_FAV_SELECT:
    case AMIIDB_SCENE_DATA_SELECT: return AMIIDB_SCENE_AMIIBO_DETAIL;
    case AMIIDB_SCENE_FAV_LIST_MENU: return AMIIDB_SCENE_FAV_LIST;
    case AMIIDB_SCENE_DATA_LIST_MENU: return AMIIDB_SCENE_DATA_LIST;
    case AMIIDB_SCENE_SETTINGS_SLOT_NUM: return AMIIDB_SCENE_SETTINGS;
    default: return scene < AMIIDB_SCENE_MAX ? scene : AMIIDB_SCENE_MAIN;
    }
}

static bool app_amiidb_resume_game(uint16_t id, uint16_t parent, bool check_parent) {
    if (!id) return !check_parent;
    for (const db_game_t *game = game_list; game->game_id; game++)
        if (game->game_id == id) return !check_parent || game->parent_game_id == parent;
    return false;
}

static void app_amiidb_save_cache(app_amiidb_t *app, uint8_t *retain, uint32_t scene) {
    app_amiidb_cache_data_t data = {0};
    memset(retain, 0, CACHEDATASIZE);
    /* Invalid internal state or an overlong external folder is never truncated. */
    if (app->game_id_index >= 8 || string_size(app->search_str) >= sizeof(data.search_str) ||
        string_size(app->cur_fav_dir) >= sizeof(data.fav_dir)) return;
    data.magic = APP_AMIIDB_RESUME_MAGIC;
    data.size = sizeof(data);
    data.version = APP_AMIIDB_RESUME_VERSION;
    data.target_scene = app_amiidb_resume_target(scene);
    data.origin_scene = app->prev_scene_id;
    if (data.target_scene == AMIIDB_SCENE_AMIIBO_DETAIL && !app_amiidb_resume_origin(data.origin_scene))
        data.target_scene = AMIIDB_SCENE_MAIN;
    if (app->cur_amiibo) {
        data.selected_head = app->cur_amiibo->head;
        data.selected_tail = app->cur_amiibo->tail;
    }
    data.current_fav = app->cur_fav;
    data.fav_page_anchor = app->fav_page_anchor;
    memcpy(data.game_id_path, app->game_id_path, sizeof(data.game_id_path));
    memcpy(data.game_page_path, app->game_page_path, sizeof(data.game_page_path));
    memcpy(data.game_scroll_path, app->game_scroll_path, sizeof(data.game_scroll_path));
    memcpy(data.game_focus_path, app->game_focus_path, sizeof(data.game_focus_path));
    data.search_page = app->search_page;
    data.game_page = app->game_page;
    data.game_id_index = app->game_id_index;
    data.search_game_id = app->search_game_id;
    data.focus_index = app->cur_focus_index;
    data.scroll_offset = app->cur_scroll_offset;
    data.slot_index = app->cur_slot_index;
    data.fav_page_focus = app->fav_page_focus;
    data.fav_page_mode = app->fav_page_mode;
    data.in_fav_folders = app->in_fav_folders;
    data.fav_page_direction = app->fav_page_direction;
    if (scene == data.target_scene && scene != AMIIDB_SCENE_AMIIBO_DETAIL) {
        data.focus_index = mui_list_view_get_focus(app->p_list_view);
        data.scroll_offset = mui_list_view_get_scroll_offset(app->p_list_view);
    } else if (data.origin_scene == AMIIDB_SCENE_GAME_LIST) {
        data.focus_index = app->game_focus_path[app->game_id_index];
        data.scroll_offset = app->game_scroll_path[app->game_id_index];
    } else if (data.target_scene == AMIIDB_SCENE_FAV_LIST || data.origin_scene == AMIIDB_SCENE_FAV_LIST) {
        data.focus_index = app->fav_page_focus;
    }
    if (data.target_scene == AMIIDB_SCENE_AMIIBO_DETAIL && data.origin_scene == AMIIDB_SCENE_DATA_LIST)
        data.slot_index = amiibo_view_get_focus(app->p_amiibo_view);
    if (scene == AMIIDB_SCENE_DATA_LIST_MENU) data.focus_index = data.slot_index;
    if (scene == AMIIDB_SCENE_SETTINGS_SLOT_NUM) { data.focus_index = 1; data.scroll_offset = 0; }
    memcpy(data.search_str, string_get_cstr(app->search_str), string_size(app->search_str) + 1);
    memcpy(data.fav_dir, string_get_cstr(app->cur_fav_dir), string_size(app->cur_fav_dir) + 1);
    /* A folder's context menu represents the parent directory, not that folder. */
    if (scene == AMIIDB_SCENE_FAV_LIST_MENU && data.in_fav_folders) data.fav_dir[0] = 0;
    const db_amiibo_t *recent[AMIIDB_RECENT_LIMIT];
    data.recent_count = amiidb_recent_copy(recent);
    for (uint8_t i = 0; i < data.recent_count; i++) {
        data.recent[i].amiibo_head = recent[i]->head;
        data.recent[i].amiibo_tail = recent[i]->tail;
        data.recent[i].game_id = amiidb_recent_game(recent[i]);
    }
    memcpy(retain, &data, sizeof(data));
}

typedef struct { const amiidb_fav_t *wanted; bool found; } amiidb_resume_fav_check_t;
static void app_amiidb_resume_fav_cb(amiidb_fav_info_t *info, void *context) {
    amiidb_resume_fav_check_t *check = context;
    const amiidb_fav_t *wanted = check->wanted, *entry = &info->fav_data.fav;
    if (info->fav_type == FAV_TYPE_FAV && entry->game_id == wanted->game_id &&
        entry->amiibo_head == wanted->amiibo_head && entry->amiibo_tail == wanted->amiibo_tail) check->found = true;
}

static bool app_amiidb_restore_cache(app_amiidb_t *app, const uint8_t *retain) {
    if (!retain) return false;
    app_amiidb_cache_data_t data;
    memcpy(&data, retain, sizeof(data));
    if (data.magic != APP_AMIIDB_RESUME_MAGIC || data.version != APP_AMIIDB_RESUME_VERSION ||
        data.size != sizeof(data) || data.target_scene >= AMIIDB_SCENE_MAX ||
        app_amiidb_resume_target(data.target_scene) != data.target_scene ||
        (data.target_scene == AMIIDB_SCENE_AMIIBO_DETAIL && !app_amiidb_resume_origin(data.origin_scene)) ||
        data.game_id_index >= 8 || data.game_id_path[0] || data.recent_count > AMIIDB_RECENT_LIMIT ||
        data.in_fav_folders > 1 || data.fav_page_mode > 3 || data.fav_page_direction < -1 || data.fav_page_direction > 1 ||
        data.fav_page_anchor.fav_type > FAV_TYPE_FAV ||
        (data.fav_page_anchor.fav_type == FAV_TYPE_FOLDER &&
         !memchr(data.fav_page_anchor.fav_data.folder_name, 0, sizeof(data.fav_page_anchor.fav_data.folder_name))) ||
        !memchr(data.search_str, 0, sizeof(data.search_str)) || !memchr(data.fav_dir, 0, sizeof(data.fav_dir)) ||
        !app_amiidb_resume_game(data.search_game_id, 0, false)) return false;
    for (uint8_t i = 1; i <= data.game_id_index; i++)
        if (!app_amiidb_resume_game(data.game_id_path[i], data.game_id_path[i - 1], true)) return false;
    if (!mui_string_try_set_str(app->search_str, data.search_str) ||
        !mui_string_try_set_str(app->cur_fav_dir, data.fav_dir)) {
        string_reset(app->search_str);
        string_reset(app->cur_fav_dir);
        mui_show_memory_error(mui());
        return false;
    }
    memcpy(app->game_id_path, data.game_id_path, sizeof(data.game_id_path));
    memcpy(app->game_page_path, data.game_page_path, sizeof(data.game_page_path));
    memcpy(app->game_scroll_path, data.game_scroll_path, sizeof(data.game_scroll_path));
    memcpy(app->game_focus_path, data.game_focus_path, sizeof(data.game_focus_path));
    app->game_id_index = data.game_id_index;
    app->search_game_id = data.search_game_id;
    app->search_page = data.search_page;
    app->game_page = data.game_page;
    app->cur_focus_index = data.focus_index;
    app->cur_scroll_offset = data.scroll_offset;
    app->cur_slot_index = data.slot_index;
    app->cur_fav = data.current_fav;
    app->fav_page_anchor = data.fav_page_anchor;
    app->fav_page_direction = data.fav_page_direction;
    app->fav_page_focus = data.fav_page_focus;
    app->fav_page_mode = data.fav_page_mode;
    app->in_fav_folders = data.in_fav_folders;
    app->prev_scene_id = data.origin_scene;
    amiidb_recent_clear();
    for (uint8_t i = data.recent_count; i > 0; i--) {
        const amiidb_fav_t *entry = &data.recent[i - 1];
        amiidb_recent_note(get_amiibo_by_id(entry->amiibo_head, entry->amiibo_tail), entry->game_id);
    }
    bool detail = data.target_scene == AMIIDB_SCENE_AMIIBO_DETAIL;
    uint8_t parent = detail ? data.origin_scene : data.target_scene;
    /* Rebuild the scene stack and the bounded result page from current storage.
     * No retained pointer, old list object or in-progress dialog is reused. */
    mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIDB_SCENE_MAIN);
    if (parent != AMIIDB_SCENE_MAIN) mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, parent);
    if (mui_scene_dispatcher_current_scene(app->p_scene_dispatcher) != parent) return true;
    mui_list_view_set_focus(app->p_list_view, data.focus_index);
    if (data.scroll_offset <= mui_list_view_get_scroll_offset(app->p_list_view))
        mui_list_view_set_scroll_offset(app->p_list_view, data.scroll_offset);
    if (!detail) return true;
    bool found = false;
    if (parent == AMIIDB_SCENE_DATA_LIST) {
        amiidb_slot_info_t slot;
        found = data.slot_index < settings_get_data()->amiidb_data_slot_num &&
                amiidb_api_slot_info(data.slot_index, &slot) == VFS_OK && !slot.is_empty;
        mui_list_view_set_focus(app->p_list_view, data.slot_index);
    } else if (parent == AMIIDB_SCENE_FAV_LIST) {
        amiidb_resume_fav_check_t check = { .wanted = &app->cur_fav };
        app->cur_amiibo = get_amiibo_by_id(app->cur_fav.amiibo_head, app->cur_fav.amiibo_tail);
        found = app->cur_amiibo && amiidb_api_fav_list_dir(string_get_cstr(app->cur_fav_dir),
                    app_amiidb_resume_fav_cb, &check) == VFS_OK && check.found;
    } else {
        app->cur_amiibo = get_amiibo_by_id(data.selected_head, data.selected_tail);
        for (uint16_t i = 0; app->cur_amiibo && i < app->result_count && i < AMIIDB_RESULT_PAGE_SIZE; i++)
            if (app->result_items[i] == app->cur_amiibo) found = true;
    }
    if (found) {
        app->search_restore_focus = parent == AMIIDB_SCENE_AMIIBO_SEARCH;
        mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIDB_SCENE_AMIIBO_DETAIL);
    }
    return true;
}

#endif
