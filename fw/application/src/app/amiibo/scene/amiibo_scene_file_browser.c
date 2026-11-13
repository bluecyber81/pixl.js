#include "amiibo_scene.h"
#include "app_amiibo.h"
#include "cwalk.h"
#include "mini_app_launcher.h"
#include "mini_app_registry.h"
#include "mui_list_view.h"
#include "mui_alloc.h"
#include "nrf_log.h"
#include "vfs.h"
#include "vfs_meta.h"

#include "i18n/language.h"
#include "settings.h"
#include <stdio.h>

#define ICON_FOLDER 0xe1d6
#define ICON_FILE 0xe1ed
#define ICON_BACK 0xe069
#define ICON_ERROR 0xe1bb
#define ICON_HOME 0xe1f0

#define FOLDER_LIST_PARENT 0xFFFF
#define FOLDER_LIST_PREVIOUS 0xFFFE
#define FOLDER_LIST_NEXT 0xFFFD
#define AMIIBO_BROWSER_PAGE_SIZE 24
#define ICON_PREVIOUS 0xe1ac
#define ICON_NEXT_PAGE 0xe1aa

static int amiibo_scene_file_browser_list_item_cmp(const mui_list_item_t *p_item_a, const mui_list_item_t *p_item_b) {
    uintptr_t a = (uintptr_t)p_item_a->user_data, b = (uintptr_t)p_item_b->user_data;
    if (a == b && (a == FOLDER_LIST_PARENT || a == FOLDER_LIST_PREVIOUS || a == FOLDER_LIST_NEXT)) return 0;
    if (a == FOLDER_LIST_PARENT || b == FOLDER_LIST_NEXT) return -1;
    if (b == FOLDER_LIST_PARENT || a == FOLDER_LIST_NEXT) return 1;
    if (a == FOLDER_LIST_PREVIOUS) return -1;
    if (b == FOLDER_LIST_PREVIOUS) return 1;
    if (p_item_a->icon != p_item_b->icon) {
        return p_item_a->icon - p_item_b->icon;
    } else {
        return string_cmp(p_item_a->text, p_item_b->text);
    }
}

static void amiibo_scene_file_browser_reload_folders(app_amiibo_t *app) {
    /* Cwalk's segment.begin follows the parent separator. Remove that
     * separator before opening PackedFS, including retained older paths. */
    size_t folder_length = string_size(app->current_folder);
    const char *folder_path = string_get_cstr(app->current_folder);
    while (folder_length > 1 && folder_path[folder_length - 1] == '/') folder_length--;
    string_left(app->current_folder, folder_length);
    vfs_driver_t *driver = vfs_get_driver(app->current_drive);
    vfs_dir_t dir;
    vfs_obj_t obj;
    mui_list_view_t *list = app->p_list_view;
    mui_list_view_clear_items(list);
    bool complete = true;
    const char *target = app->focus_detail_file ? string_get_cstr(app->current_file) : NULL;
    char predecessor[VFS_MAX_NAME_LEN] = {0};
    uint16_t predecessor_icon = 0;
    bool found = false;
    uint32_t eligible = 0, excluded = 0;
    mui_list_item_t *boundary = NULL;
    int32_t res = driver ? driver->open_dir(string_get_cstr(app->current_folder), &dir) : VFS_ERR_NODEV;
    if (res == VFS_OK) {
        while ((res = driver->read_dir(&dir, &obj)) == VFS_OK) {
            vfs_meta_t meta = {0};
            vfs_meta_decode(obj.meta, sizeof(obj.meta), &meta);
            if (meta.has_flags && (meta.flags & VFS_OBJ_FLAG_HIDDEN)) continue;
            if (!memchr(obj.name, 0, sizeof(obj.name))) { res = VFS_ERR_CRPT; break; }
            uint16_t icon = obj.type == VFS_TYPE_DIR ? ICON_FOLDER : ICON_FILE;
            if (target) {
                int cmp = icon == ICON_FILE ? strcmp(obj.name, target) : -1;
                if (cmp == 0) found = true;
                if (cmp < 0 && (icon > predecessor_icon ||
                    (icon == predecessor_icon && strcmp(obj.name, predecessor) > 0))) {
                    predecessor_icon = icon;
                    memcpy(predecessor, obj.name, sizeof(predecessor));
                }
            }
            if (app->browser_direction) {
                int cmp = icon != app->browser_anchor_icon ? (int)icon - app->browser_anchor_icon
                                                           : strcmp(obj.name, app->browser_anchor);
                if (app->browser_direction > 0 ? cmp <= 0 : cmp >= 0) {
                    excluded++; continue;
                }
            }
            eligible++;
            size_t count = mui_list_item_array_size(list->items);
            if (count < AMIIBO_BROWSER_PAGE_SIZE) {
                if (!mui_list_view_try_add_item_ext(list, icon, obj.name, NULL, (void *)-1)) {
                    complete = false; break;
                }
            } else {
                /* Keep only the nearest 24 names. Backwards traversal retains
                 * the greatest keys below its anchor; both pages display ASC. */
                if (!boundary) {
                    boundary = mui_list_item_array_get(list->items, 0);
                    for (size_t i = 1; i < count; ++i) {
                        mui_list_item_t *item = mui_list_item_array_get(list->items, i);
                        int order = amiibo_scene_file_browser_list_item_cmp(item, boundary);
                        if (app->browser_direction < 0 ? order < 0 : order > 0) boundary = item;
                    }
                }
                int cmp = icon != boundary->icon ? (int)icon - (int)boundary->icon
                                                  : strcmp(obj.name, string_get_cstr(boundary->text));
                if (app->browser_direction < 0 ? cmp <= 0 : cmp >= 0) continue;
                if (!mui_string_try_set_str(boundary->text, obj.name)) { complete = false; break; }
                boundary->icon = icon;
                boundary = NULL;
            }
        }
        int32_t close_res = driver->close_dir(&dir);
        if (res == VFS_ERR_EOF) res = close_res;
    }
    if (complete && res == VFS_OK && !eligible && excluded) {
        /* The last page may disappear after deletion. Reopen the first page,
         * never leave an inaccessible directory or present a partial scan. */
        app->browser_direction = 0;
        amiibo_scene_file_browser_reload_folders(app);
        return;
    }
    if (res != VFS_OK) mui_list_view_clear_items(list);
    bool root = string_cmp_str(app->current_folder, "/") == 0;
    complete = complete && mui_list_view_try_add_item_ext(list, root ? ICON_HOME : ICON_BACK,
                  root ? _T(MAIN_MENU) : "..", NULL, (void *)FOLDER_LIST_PARENT);
    if (complete && res != VFS_OK)
        complete = mui_list_view_try_add_item_ext(list, ICON_ERROR, getLangString(_L_OPEN_FOLDER_FAILED), NULL, (void *)-1);
    if (complete && res == VFS_OK) {
        bool previous = app->browser_direction < 0 ? eligible > AMIIBO_BROWSER_PAGE_SIZE : excluded > 0;
        bool next = app->browser_direction < 0 ? excluded > 0 : eligible > AMIIBO_BROWSER_PAGE_SIZE;
        if (previous) complete = mui_list_view_try_add_item_ext(list, ICON_PREVIOUS, _T(DE3_PREVIOUS_PAGE), NULL, (void *)FOLDER_LIST_PREVIOUS);
        if (complete && next) complete = mui_list_view_try_add_item_ext(list, ICON_NEXT_PAGE, _T(DE3_NEXT_PAGE), NULL, (void *)FOLDER_LIST_NEXT);
    }
    if (!complete) {
        mui_list_view_clear_items(list);
        mui_show_memory_error(mui());
        return;
    }
    mui_list_view_sort(list, amiibo_scene_file_browser_list_item_cmp);
    mui_list_view_set_focus(list, 0);
    mui_list_view_set_scroll_offset(list, 0);
    if (target && found && res == VFS_OK) {
        size_t i, count = mui_list_item_array_size(list->items);
        for (i = 0; i < count; i++) {
            mui_list_item_t *row = mui_list_item_array_get(list->items, i);
            if (row->icon == ICON_FILE && string_cmp_str(row->text, target) == 0) break;
        }
        if (i < count) {
            app->current_focus_index = i;
        } else {
            /* Reopen at the real predecessor. This ordinary exclusive anchor
             * remains valid when saving and restoring the browser state. */
            memcpy(app->browser_anchor, predecessor, sizeof(predecessor));
            app->browser_anchor_icon = predecessor_icon;
            app->browser_direction = predecessor_icon ? 1 : 0;
            amiibo_scene_file_browser_reload_folders(app);
            return;
        }
    }
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIBO_VIEW_ID_LIST);
}

static void amiibo_scene_file_browser_on_selected(mui_list_view_event_t event, mui_list_view_t *p_list_view,
                                                  mui_list_item_t *p_item) {
    app_amiibo_t *app = p_list_view->user_data;
    /* The error row describes the folder; it is not a selectable file. */
    if (p_item->icon == ICON_ERROR) return;
    uint32_t idx = (uintptr_t)p_item->user_data;
    if (idx == FOLDER_LIST_PREVIOUS || idx == FOLDER_LIST_NEXT) {
        if (event != MUI_LIST_VIEW_EVENT_SELECTED) return;
        bool previous = idx == FOLDER_LIST_PREVIOUS;
        mui_list_item_t *anchor = NULL;
        for (size_t i = 0; i < mui_list_item_array_size(p_list_view->items); i++) {
            mui_list_item_t *item = mui_list_item_array_get(p_list_view->items, i);
            if (item->icon != ICON_FILE && item->icon != ICON_FOLDER) continue;
            anchor = item;
            if (previous) break;
        }
        if (!anchor) return;
        snprintf(app->browser_anchor, sizeof(app->browser_anchor), "%s", string_get_cstr(anchor->text));
        app->browser_anchor_icon = anchor->icon;
        app->browser_direction = previous ? -1 : 1;
        app->current_focus_index = 0;
        amiibo_scene_file_browser_reload_folders(app);
        return;
    }

    if (!mui_string_try_set_str(app->current_file, string_get_cstr(p_item->text))) {
        mui_show_memory_error(mui());
        return;
    }

    if (event == MUI_LIST_VIEW_EVENT_SELECTED) {
        if (idx == FOLDER_LIST_PARENT) {
            if (string_cmp_str(app->current_folder, "/") == 0) {
                mini_app_launcher_kill(mini_app_launcher(), MINI_APP_ID_AMIIBO);
            } else {
                struct cwk_segment segment;
                const char *folder_cstr = string_get_cstr(app->current_folder);
                cwk_path_get_last_segment(folder_cstr, &segment);
                string_left(app->current_folder, segment.begin - folder_cstr);
                if (string_size(app->current_folder) == 0) {
                    string_cat_str(app->current_folder, "/");
                }
                app->browser_direction = 0;
                app->current_focus_index = 0;
                amiibo_scene_file_browser_reload_folders(app);
            }
        } else {
            if (p_item->icon == ICON_FOLDER) {
                char next_folder[VFS_MAX_PATH_LEN];
                const char *folder = string_get_cstr(app->current_folder);
                const char *separator = string_end_with_str_p(app->current_folder, "/") ? "" : "/";
                int length = snprintf(next_folder, sizeof(next_folder), "%s%s%s", folder, separator,
                                      string_get_cstr(p_item->text));
                if (length < 0 || (size_t)length >= sizeof(next_folder) ||
                    !mui_string_try_set_str(app->current_folder, next_folder)) {
                    mui_show_memory_error(mui());
                    return;
                }
                app->browser_direction = 0;
                app->current_focus_index = 0;
                amiibo_scene_file_browser_reload_folders(app);
            } else if (p_item->icon == ICON_HOME) {
                mini_app_launcher_kill(mini_app_launcher(), MINI_APP_ID_AMIIBO);
            } else {
                app->reload_amiibo_files = true;
                mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIBO_SCENE_AMIIBO_DETAIL);
            }
        }
    } else {
        mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIBO_SCENE_FILE_BROWSER_MENU);
    }
}

void amiibo_scene_file_browser_on_enter(void *user_data) {
    app_amiibo_t *app = user_data;
    NRF_LOG_INFO("%X", app);
    mui_list_view_set_selected_cb(app->p_list_view, amiibo_scene_file_browser_on_selected);
    mui_list_view_set_user_data(app->p_list_view, app);

    amiibo_scene_file_browser_reload_folders(app);

    mui_list_view_set_focus(app->p_list_view, app->current_focus_index);

    NRF_LOG_INFO("%X", app);
}

void amiibo_scene_file_browser_on_exit(void *user_data) {
    app_amiibo_t *app = user_data;
    app->current_focus_index = mui_list_view_get_focus(app->p_list_view);
    mui_list_view_set_selected_cb(app->p_list_view, NULL);
    mui_list_view_set_user_data(app->p_list_view, NULL);
    mui_list_view_clear_items(app->p_list_view);
}
