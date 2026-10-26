#include "amiidb_scene_errors.h"
#include "amiibo_helper.h"
#include "amiidb_api_fav.h"
#include "amiidb_scene.h"
#include "app_amiidb.h"
#include "mui_list_view.h"
#include "mui_alloc.h"
#include "amiidb_fav_page.h"
#include "nrf_log.h"

#include "db_header.h"
#include "mui_icons.h"
#include "settings.h"
#include "vfs.h"
#include <math.h>

static void amiidb_scene_fav_list_reload(app_amiidb_t *app);
void amiidb_scene_fav_list_item_clear_cb(mui_list_item_t *p_item);

static void amiidb_scene_fav_list_text_input_event_cb(mui_text_input_event_t event, mui_text_input_t *p_text_input) {
    app_amiidb_t *app = p_text_input->user_data;
    if (event == MUI_TEXT_INPUT_EVENT_CANCELLED ||
        (event == MUI_TEXT_INPUT_EVENT_CONFIRMED && !*mui_text_input_get_input_text(p_text_input))) {
        amiidb_scene_fav_list_reload(app);
        return;
    }
    if (event == MUI_TEXT_INPUT_EVENT_CONFIRMED) {
        const char *text = mui_text_input_get_input_text(p_text_input);
        if (strlen(text) > 0) {
            int32_t res = amiidb_api_fav_create_dir(text);
            if (res == VFS_OK) {
                string_reset(app->cur_fav_dir);
                amiidb_scene_fav_list_reload(app);
            } else {
                amiidb_fav_show_error(app, res);
            }
        }
    }
}

static void amiidb_scene_fav_list_list_view_on_selected(mui_list_view_event_t event, mui_list_view_t *p_list_view,
                                                        mui_list_item_t *p_item) {
    uint16_t icon = p_item->icon;
    app_amiidb_t *app = mui_list_view_get_user_data(p_list_view);
    if (icon == ICON_PREV || icon == ICON_NEXT) {
        if (event == MUI_LIST_VIEW_EVENT_SELECTED && amiidb_fav_page_step(app, icon))
            amiidb_scene_fav_list_reload(app);
        return;
    }
    if (event == MUI_LIST_VIEW_EVENT_SELECTED) {
        switch (icon) {
        case ICON_EXIT:
            if (string_size(app->cur_fav_dir) == 0) {
                app->in_fav_folders = true;
                mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIDB_SCENE_MAIN);
            } else {
                string_reset(app->cur_fav_dir);
                app->in_fav_folders = false;
                amiidb_scene_fav_list_reload(app);
            }
            break;

        case ICON_FILE: {
            amiidb_fav_t *p_fav_item = p_item->user_data;
            memcpy(&app->cur_fav, p_fav_item, sizeof(amiidb_fav_t));
            app->prev_scene_id = AMIIDB_SCENE_FAV_LIST;
            mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIDB_SCENE_AMIIBO_DETAIL);
        } break;

        case ICON_FOLDER: {
            if (!mui_string_try_set_str(app->cur_fav_dir, string_get_cstr(p_item->text))) {
                mui_show_memory_error(mui()); return;
            }
            amiidb_fav_page_reset(app);
            app->in_fav_folders = false;
            amiidb_scene_fav_list_reload(app);
        } break;

        case ICON_NEW: {
            mui_text_input_set_max_length(app->p_text_input, AMIIDB_FAV_NEW_FOLDER_MAX_BYTES);
            mui_text_input_clear_input_text(app->p_text_input);
            mui_text_input_set_header(app->p_text_input, getLangString(_L_APP_AMIIDB_FAV_NEW_HEAD));
            mui_text_input_set_event_cb(app->p_text_input, amiidb_scene_fav_list_text_input_event_cb);
            mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIDB_VIEW_ID_INPUT);
        } break;
        }
    } else if (event == MUI_LIST_VIEW_EVENT_LONG_SELECTED) {
        if (icon == ICON_FILE) {
            amiidb_fav_t *p_fav_item = p_item->user_data;
            memcpy(&app->cur_fav, p_fav_item, sizeof(amiidb_fav_t));
            app->in_fav_folders = false;
            mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIDB_SCENE_FAV_LIST_MENU);
        } else if (icon == ICON_FOLDER) {
            memset(&app->cur_fav, 0, sizeof(amiidb_fav_t));
            if (!mui_string_try_set_str(app->cur_fav_dir, string_get_cstr(p_item->text))) {
                mui_show_memory_error(mui()); return;
            }
            app->in_fav_folders = true;
            mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIDB_SCENE_FAV_LIST_MENU);
        }
    }
}

/* Keep this shared comparator out of line: saves flash in both callers. */
static __attribute__((noinline)) int fav_record_compare(const amiidb_fav_t *a, const amiidb_fav_t *b) {
    if (a->amiibo_head != b->amiibo_head) return a->amiibo_head < b->amiibo_head ? -1 : 1;
    if (a->amiibo_tail != b->amiibo_tail) return a->amiibo_tail < b->amiibo_tail ? -1 : 1;
    return (int)a->game_id - (int)b->game_id;
}

static int amiidb_scene_fav_list_list_view_sort_cb(const mui_list_item_t *p_item_a, const mui_list_item_t *p_item_b) {
    /* This sorter runs before controls are appended: only folders and files. */
    if (p_item_a->icon != p_item_b->icon) return (int)p_item_a->icon - (int)p_item_b->icon;
    if (p_item_a->icon == ICON_FOLDER) return string_cmp(p_item_a->text, p_item_b->text);
    return fav_record_compare(p_item_a->user_data, p_item_b->user_data);
}


#define FAV_PAGE_SIZE 24u
typedef struct {
    app_amiidb_t *app;
    uint32_t eligible, excluded;
    int32_t result;
    bool folders_only;
} fav_page_context_t;

static void fav_item_key(const mui_list_item_t *item, amiidb_fav_info_t *key) {
    key->fav_type = item->icon == ICON_FOLDER ? FAV_TYPE_FOLDER : FAV_TYPE_FAV;
    if (key->fav_type == FAV_TYPE_FOLDER)
        snprintf(key->fav_data.folder_name, sizeof(key->fav_data.folder_name), "%s", string_get_cstr(item->text));
    else key->fav_data.fav = *(amiidb_fav_t *)item->user_data;
}

static int fav_key_compare(const amiidb_fav_info_t *a, const amiidb_fav_info_t *b) {
    if (a->fav_type != b->fav_type) return (int)a->fav_type - (int)b->fav_type;
    if (a->fav_type == FAV_TYPE_FOLDER) return strcmp(a->fav_data.folder_name, b->fav_data.folder_name);
    return fav_record_compare(&a->fav_data.fav, &b->fav_data.fav);
}

void amiidb_fav_page_reset(app_amiidb_t *app) {
    app->fav_page_direction = 0;
    app->fav_page_focus = 0;
}

bool amiidb_fav_page_step(app_amiidb_t *app, uint16_t icon) {
    mui_list_item_t *anchor = NULL;
    for (size_t i = 0; i < mui_list_view_item_size(app->p_list_view); i++) {
        mui_list_item_t *item = mui_list_item_array_get(app->p_list_view->items, i);
        if (item->icon != ICON_FILE && item->icon != ICON_FOLDER) continue;
        anchor = item;
        if (icon == ICON_PREV) break;
    }
    if (!anchor) return false;
    fav_item_key(anchor, &app->fav_page_anchor);
    app->fav_page_direction = icon == ICON_PREV ? -1 : 1;
    app->fav_page_focus = 0;
    return true;
}

static void amiidb_scene_fav_list_read_cb(amiidb_fav_info_t *info, void *ctx) {
    fav_page_context_t *page = ctx;
    app_amiidb_t *app = page->app;
    if (page->result != VFS_OK || (page->folders_only && info->fav_type != FAV_TYPE_FOLDER)) return;
    int comparison = fav_key_compare(info, &app->fav_page_anchor);
    if (app->fav_page_direction && (app->fav_page_direction > 0 ? comparison <= 0 : comparison >= 0)) {
        page->excluded++; return;
    }
    page->eligible++;
    mui_list_item_t *replace = NULL;
    size_t count = mui_list_view_item_size(app->p_list_view);
    if (count == FAV_PAGE_SIZE) {
        replace = mui_list_item_array_get(app->p_list_view->items, app->fav_page_direction < 0 ? 0 : count - 1);
        amiidb_fav_info_t worst;
        fav_item_key(replace, &worst);
        comparison = fav_key_compare(info, &worst);
        if (app->fav_page_direction < 0 ? comparison <= 0 : comparison >= 0) return;
    }
    amiidb_fav_t *favorite = NULL;
    const char *text = info->fav_data.folder_name;
    char unknown[32];
    uint16_t icon = ICON_FOLDER;
    if (info->fav_type == FAV_TYPE_FAV) {
        favorite = mui_mem_malloc(sizeof(*favorite));
        if (!favorite) { page->result = VFS_ERR_NOMEM; return; }
        *favorite = info->fav_data.fav;
        const db_amiibo_t *figure = get_amiibo_by_id(favorite->amiibo_head, favorite->amiibo_tail);
        snprintf(unknown, sizeof(unknown), "Amiibo[%08x:%08x]", favorite->amiibo_head, favorite->amiibo_tail);
        text = figure ? get_amiibo_display_name(figure) : unknown;
        icon = ICON_FILE;
    }
    bool added = replace ? mui_string_try_set_str(replace->text, text)
                         : mui_list_view_try_add_item_ext(app->p_list_view, icon, text, NULL, favorite);
    if (!added) { mui_mem_free(favorite); page->result = VFS_ERR_NOMEM; return; }
    if (replace) {
        amiidb_scene_fav_list_item_clear_cb(replace);
        replace->icon = icon;
        replace->user_data = favorite;
    }
    mui_list_view_sort(app->p_list_view, amiidb_scene_fav_list_list_view_sort_cb);
}

void amiidb_fav_page_load(app_amiidb_t *app, bool folders_only) {
    uint8_t mode = folders_only ? 1 : string_empty_p(app->cur_fav_dir) ? 2 : 3;
    if (mode != app->fav_page_mode) { amiidb_fav_page_reset(app); app->fav_page_mode = mode; }
    mui_list_view_clear_items_with_cb(app->p_list_view, amiidb_scene_fav_list_item_clear_cb);
    fav_page_context_t page = {.app = app, .folders_only = folders_only};
    int32_t result = amiidb_api_fav_list_dir(folders_only ? "" : string_get_cstr(app->cur_fav_dir), amiidb_scene_fav_list_read_cb, &page);
    if (result == VFS_OK) result = page.result;
    if (result == VFS_OK && !page.eligible && page.excluded) {
        amiidb_fav_page_reset(app);
        amiidb_fav_page_load(app, folders_only);
        return;
    }
    if (result != VFS_OK) {
        /* A failed traversal is never presented as the complete directory. */
        mui_list_view_clear_items_with_cb(app->p_list_view, amiidb_scene_fav_list_item_clear_cb);
        if (result == VFS_ERR_NOMEM) { mui_show_memory_error(mui()); return; }
        amiidb_fav_show_error(app, result);
    } else {
        if (folders_only || (!page.eligible && string_empty_p(app->cur_fav_dir)))
            mui_list_view_add_item(app->p_list_view, ICON_NEW, _T(APP_AMIIDB_NEW), NULL);
        bool previous = app->fav_page_direction < 0 ? page.eligible > FAV_PAGE_SIZE : page.excluded > 0;
        bool next = app->fav_page_direction < 0 ? page.excluded > 0 : page.eligible > FAV_PAGE_SIZE;
        if (previous) mui_list_view_add_item(app->p_list_view, ICON_PREV, _T(DE3_PREVIOUS_PAGE), NULL);
        if (next) mui_list_view_add_item(app->p_list_view, ICON_NEXT, _T(DE3_NEXT_PAGE), NULL);
    }
    mui_list_view_add_item(app->p_list_view, ICON_EXIT, _T(APP_AMIIDB_BACK), NULL);
    mui_list_view_set_focus(app->p_list_view, app->fav_page_focus);
}

static void amiidb_scene_fav_list_reload(app_amiidb_t *app) {
    amiidb_fav_page_load(app, false);
    mui_list_view_set_selected_cb(app->p_list_view, amiidb_scene_fav_list_list_view_on_selected);
    mui_list_view_set_user_data(app->p_list_view, app);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIDB_VIEW_ID_LIST);
}

void amiidb_scene_fav_list_item_clear_cb(mui_list_item_t *p_item) {
    if (p_item->icon == ICON_FILE) {
        amiidb_fav_t *p_fav_item = (amiidb_fav_t *)p_item->user_data;
        mui_mem_free(p_fav_item);
    }
}

void amiidb_scene_fav_list_on_enter(void *user_data) {
    app_amiidb_t *app = (app_amiidb_t *)user_data;
    amiidb_scene_fav_list_reload(app);
}

void amiidb_scene_fav_list_on_exit(void *user_data) {
    app_amiidb_t *app = (app_amiidb_t *)user_data;
    app->fav_page_focus = mui_list_view_get_focus(app->p_list_view);
    mui_list_view_set_selected_cb(app->p_list_view, NULL);
    mui_list_view_clear_items_with_cb(app->p_list_view, amiidb_scene_fav_list_item_clear_cb);
}
