#include "app_chameleon.h"
#include "chameleon_scene.h"

#include "mini_app_launcher.h"
#include "mini_app_registry.h"

#include "amiibo_helper.h"
#include "nrf_log.h"
#include "nrf_log_ctrl.h"

#include "i18n/language.h"
#include "settings.h"

#include "mui_icons.h"
#include "tag_helper.h"

#include "fds_utils.h"
#include "mui_mem.h"
#include "mui_alloc.h"
#include "vfs_packed_runtime.h"
#include <stdint.h>

typedef enum {
    CHAMELEON_MENU_BACK,
    CHAMELEON_MENU_FILE,
    CHAMELEON_MENU_FOLDER,
    CHAMELEON_MENU_PARENT_DIR,
    CHAMELEON_MENU_PREVIOUS_PAGE,
    CHAMELEON_MENU_NEXT_PAGE,
} chameleon_menu_item_t;

#define CHAMELEON_BROWSER_PAGE_SIZE 24u
#define ICON_PREVIOUS_PAGE 0xe1ac
#define ICON_NEXT_PAGE 0xe1aa

// Store the current browsing directory path
static char current_dir[VFS_MAX_PATH_LEN] = {0};

static void chameleon_browser_cache_free(app_chameleon_t *app) {
    mui_mem_free(app->browser_cache);
    app->browser_cache = NULL;
}

static int chameleon_scene_menu_card_data_list_item_cmp(const mui_list_item_t *a, const mui_list_item_t *b) {
    uintptr_t ak = (uintptr_t)a->user_data, bk = (uintptr_t)b->user_data;
    int ar = ak == CHAMELEON_MENU_PARENT_DIR ? 0 : ak == CHAMELEON_MENU_PREVIOUS_PAGE ? 1 :
             ak == CHAMELEON_MENU_NEXT_PAGE ? 3 : ak == CHAMELEON_MENU_BACK ? 4 : 2;
    int br = bk == CHAMELEON_MENU_PARENT_DIR ? 0 : bk == CHAMELEON_MENU_PREVIOUS_PAGE ? 1 :
             bk == CHAMELEON_MENU_NEXT_PAGE ? 3 : bk == CHAMELEON_MENU_BACK ? 4 : 2;
    if (ar != br) return ar - br;
    if (ar != 2) return 0;
    return a->icon != b->icon ? (int)a->icon - b->icon : string_cmp(a->text, b->text);
}


static void chameleon_scene_menu_card_data_file_load_from_file(app_chameleon_t *app, const char *file_name) {
    char path[VFS_MAX_PATH_LEN];
    vfs_obj_t obj;
    int32_t err;

    /* The import staging buffer has priority over speculative directory pages. */
    chameleon_browser_cache_free(app);

    // If current_dir is empty, use CHELEMEON_DUMP_FOLDER
    int path_length = snprintf(path, sizeof(path), "%s/%s",
                               current_dir[0] ? current_dir : CHELEMEON_DUMP_FOLDER, file_name);
    vfs_driver_t *p_driver = vfs_get_default_driver();

    uint8_t *tag_buffer = tag_helper_get_active_tag_memory_data();
    size_t tag_data_size = tag_helper_get_active_tag_data_size();

    if (path_length < 0 || (size_t)path_length >= sizeof(path) || !p_driver || !p_driver->mounted() ||
        !tag_buffer || tag_data_size == 0) {
        mui_toast_view_show(app->p_toast_view, _T(APP_CHAMELEON_CARD_DATA_LOAD_FAILED));
        return;
    }

    err = p_driver->stat_file(path, &obj);
    if (err < 0) {
        mui_toast_view_show(app->p_toast_view, _T(APP_CHAMELEON_CARD_DATA_LOAD_NOT_FOUND));
        return;
    }

    if (obj.type != VFS_TYPE_REG || tag_data_size != obj.size) {
        mui_toast_view_show(app->p_toast_view, _T(APP_CHAMELEON_CARD_DATA_LOAD_SIZE_NOT_MATCH));
        return;
    }

    /* A short/failed read must not partially replace the currently active card. */
    uint8_t *loaded = mui_mem_malloc(tag_data_size);
    if (!loaded) {
        mui_toast_view_show(app->p_toast_view, _T(APP_CHAMELEON_CARD_DATA_LOAD_FAILED));
        return;
    }
    err = p_driver->read_file_data(path, loaded, tag_data_size);
    if (err < 0 || (size_t)err != tag_data_size) {
        mui_mem_free(loaded);
        mui_toast_view_show(app->p_toast_view, _T(APP_CHAMELEON_CARD_DATA_LOAD_FAILED));
        return;
    }
    memcpy(tag_buffer, loaded, tag_data_size);
    mui_mem_free(loaded);

    // update tag coll res
    tag_helper_load_coll_res_from_block0();

    // set nickname by filename
    err = tag_helper_set_nickname(file_name);
    if (err != 0) {
        mui_toast_view_show(app->p_toast_view, _T(APP_CHAMELEON_CARD_SET_NICK_FAILED));
        return;
    }

    NRF_LOG_INFO("load card data:%d", err);
    mui_toast_view_show(app->p_toast_view, _T(APP_CHAMELEON_CARD_DATA_LOAD_SUCCESS));
    mui_scene_dispatcher_back_scene(app->p_scene_dispatcher, 2);
}

static void chameleon_scene_menu_card_data_file_load_uncached(app_chameleon_t *app) {
    vfs_dir_t dir;
    vfs_obj_t obj;
    mui_list_view_t *list = app->p_list_view;
    mui_list_view_clear_items(list);
    vfs_driver_t *driver = vfs_get_default_driver();
    const char *browse_dir = current_dir[0] ? current_dir : CHELEMEON_DUMP_FOLDER;
    uint32_t eligible = 0, excluded = 0;
    bool complete = true;
    int32_t res = driver && driver->mounted() ? driver->open_dir(browse_dir, &dir) : VFS_ERR_NODEV;
    if (res == VFS_OK) {
        while ((res = driver->read_dir(&dir, &obj)) == VFS_OK) {
            if (obj.type != VFS_TYPE_DIR && obj.type != VFS_TYPE_REG) continue;
            if (!memchr(obj.name, 0, sizeof(obj.name))) { res = VFS_ERR_CRPT; break; }
            uint16_t icon = obj.type == VFS_TYPE_DIR ? ICON_FOLDER : ICON_FILE;
            int cmp = icon != app->browser_anchor_icon ? (int)icon - app->browser_anchor_icon :
                                                        strcmp(obj.name, app->browser_anchor);
            if (app->browser_direction && (app->browser_direction > 0 ? cmp <= 0 : cmp >= 0)) {
                excluded++;
                continue;
            }
            eligible++;
            size_t count = mui_list_item_array_size(list->items);
            if (count < CHAMELEON_BROWSER_PAGE_SIZE) {
                if (!mui_list_view_try_add_item_ext(list, icon, obj.name, NULL,
                        (void *)(uintptr_t)(obj.type == VFS_TYPE_DIR ? CHAMELEON_MENU_FOLDER : CHAMELEON_MENU_FILE))) {
                    complete = false;
                    break;
                }
            } else {
                mui_list_item_t *worst = mui_list_item_array_get(list->items,
                                         app->browser_direction < 0 ? 0 : count - 1);
                cmp = icon != worst->icon ? (int)icon - worst->icon : strcmp(obj.name, string_get_cstr(worst->text));
                if (app->browser_direction < 0 ? cmp <= 0 : cmp >= 0) continue;
                if (!mui_string_try_set_str(worst->text, obj.name)) { complete = false; break; }
                worst->icon = icon;
                worst->user_data = (void *)(uintptr_t)(obj.type == VFS_TYPE_DIR ? CHAMELEON_MENU_FOLDER : CHAMELEON_MENU_FILE);
            }
            mui_list_view_sort(list, chameleon_scene_menu_card_data_list_item_cmp);
        }
        int32_t close_res = driver->close_dir(&dir);
        if (res == VFS_ERR_EOF) res = close_res;
    } else {
        current_dir[0] = '\0';
        app->browser_direction = 0;
    }
    if (complete && res == VFS_OK && !eligible && excluded) {
        /* A page can disappear after an external deletion; recover to page one. */
        app->browser_direction = 0;
        chameleon_scene_menu_card_data_file_load_uncached(app);
        return;
    }
    if (res != VFS_OK) mui_list_view_clear_items(list);
    complete = complete && mui_list_view_try_add_item_ext(list, ICON_BACK, _T(MAIN_RETURN), NULL,
                                                          (void *)(uintptr_t)CHAMELEON_MENU_BACK);
    if (complete && current_dir[0])
        complete = mui_list_view_try_add_item_ext(list, ICON_HOME, "..", NULL, (void *)(uintptr_t)CHAMELEON_MENU_PARENT_DIR);
    if (complete && res == VFS_OK) {
        bool previous = app->browser_direction < 0 ? eligible > CHAMELEON_BROWSER_PAGE_SIZE : excluded > 0;
        bool next = app->browser_direction < 0 ? excluded > 0 : eligible > CHAMELEON_BROWSER_PAGE_SIZE;
        if (previous) complete = mui_list_view_try_add_item_ext(list, ICON_PREVIOUS_PAGE, _T(DE3_PREVIOUS_PAGE), NULL,
                                                               (void *)(uintptr_t)CHAMELEON_MENU_PREVIOUS_PAGE);
        if (complete && next) complete = mui_list_view_try_add_item_ext(list, ICON_NEXT_PAGE, _T(DE3_NEXT_PAGE), NULL,
                                                                       (void *)(uintptr_t)CHAMELEON_MENU_NEXT_PAGE);
    }
    if (!complete) {
        mui_list_view_clear_items(list);
        mui_show_memory_error(mui());
        return;
    }
    if (res != VFS_OK) mui_toast_view_show(app->p_toast_view, _T(OPEN_FOLDER_FAILED));
    mui_list_view_sort(list, chameleon_scene_menu_card_data_list_item_cmp);
    mui_list_view_set_focus(list, 0);
    mui_list_view_set_scroll_offset(list, 0);
}

#ifdef VFS_PACKED_LFS_ENABLE
#define CHAMELEON_BROWSER_CACHE_SIZE (2u * CHAMELEON_BROWSER_PAGE_SIZE)
typedef struct {
    char name[VFS_MAX_NAME_LEN];
    uint16_t icon;
} chameleon_browser_entry_t;

struct chameleon_browser_cache_s {
    uint64_t revision;
    const vfs_driver_t *driver;
    uint8_t count, offset, split;
    bool previous, next;
    chameleon_browser_entry_t entries[CHAMELEON_BROWSER_CACHE_SIZE];
};

static uint64_t chameleon_browser_revision(const vfs_driver_t *driver) {
    return driver && driver == vfs_get_driver(VFS_DRIVE_EXT) && driver->mounted()
               ? vfs_packed_revision() : 0;
}

static bool chameleon_browser_cache_show(app_chameleon_t *app) {
    struct chameleon_browser_cache_s *cache = app->browser_cache;
    mui_list_view_t *list = app->p_list_view;
    mui_list_view_clear_items(list);
    unsigned end = cache->offset ? cache->count : cache->split;
    for (unsigned i = cache->offset; i < end; i++) {
        chameleon_browser_entry_t *entry = &cache->entries[i];
        if (!mui_list_view_try_add_item_ext(list, entry->icon, entry->name, NULL,
                (void *)(uintptr_t)(entry->icon == ICON_FOLDER ? CHAMELEON_MENU_FOLDER : CHAMELEON_MENU_FILE))) return false;
    }
    if (!mui_list_view_try_add_item_ext(list, ICON_BACK, _T(MAIN_RETURN), NULL,
            (void *)(uintptr_t)CHAMELEON_MENU_BACK)) return false;
    if (current_dir[0] && !mui_list_view_try_add_item_ext(list, ICON_HOME, "..", NULL,
            (void *)(uintptr_t)CHAMELEON_MENU_PARENT_DIR)) return false;
    if ((cache->offset || cache->previous) && !mui_list_view_try_add_item_ext(list, ICON_PREVIOUS_PAGE,
            _T(DE3_PREVIOUS_PAGE), NULL, (void *)(uintptr_t)CHAMELEON_MENU_PREVIOUS_PAGE)) return false;
    if ((end < cache->count || cache->next) && !mui_list_view_try_add_item_ext(list, ICON_NEXT_PAGE,
            _T(DE3_NEXT_PAGE), NULL, (void *)(uintptr_t)CHAMELEON_MENU_NEXT_PAGE)) return false;
    mui_list_view_sort(list, chameleon_scene_menu_card_data_list_item_cmp);
    mui_list_view_set_focus(list, 0);
    mui_list_view_set_scroll_offset(list, 0);
    return true;
}

/* Collect two bounded pages in one complete, revision-checked directory scan.
 * No cached entry is published until EOF and close both succeed. */
static int32_t chameleon_browser_cache_scan(app_chameleon_t *app, const vfs_driver_t *driver, uint64_t revision) {
    struct chameleon_browser_cache_s *cache = app->browser_cache;
    cache->revision = 0;
    cache->count = 0;
    cache->driver = driver;
    vfs_dir_t dir;
    vfs_obj_t obj;
    int32_t res = driver->open_dir(current_dir[0] ? current_dir : CHELEMEON_DUMP_FOLDER, &dir);
    if (res != VFS_OK) { current_dir[0] = 0; app->browser_direction = 0; return res; }
    uint32_t eligible = 0, excluded = 0;
    while ((res = driver->read_dir(&dir, &obj)) == VFS_OK) {
        if (obj.type != VFS_TYPE_DIR && obj.type != VFS_TYPE_REG) continue;
        if (!memchr(obj.name, 0, sizeof(obj.name))) { res = VFS_ERR_CRPT; break; }
        uint16_t icon = obj.type == VFS_TYPE_DIR ? ICON_FOLDER : ICON_FILE;
        int cmp = icon != app->browser_anchor_icon ? (int)icon - app->browser_anchor_icon :
                                                   strcmp(obj.name, app->browser_anchor);
        if (app->browser_direction && (app->browser_direction > 0 ? cmp <= 0 : cmp >= 0)) { excluded++; continue; }
        eligible++;
        unsigned at = 0;
        while (at < cache->count) {
            chameleon_browser_entry_t *entry = &cache->entries[at];
            cmp = icon != entry->icon ? (int)icon - entry->icon : strcmp(obj.name, entry->name);
            if (cmp < 0) break;
            at++;
        }
        if (cache->count == CHAMELEON_BROWSER_CACHE_SIZE) {
            if (app->browser_direction < 0) {
                if (!at) continue;
                memmove(cache->entries, cache->entries + 1, (--at) * sizeof(cache->entries[0]));
            } else {
                if (at == cache->count) continue;
                memmove(cache->entries + at + 1, cache->entries + at,
                        (cache->count - at - 1) * sizeof(cache->entries[0]));
            }
        } else {
            memmove(cache->entries + at + 1, cache->entries + at,
                    (cache->count - at) * sizeof(cache->entries[0]));
            cache->count++;
        }
        snprintf(cache->entries[at].name, sizeof(cache->entries[at].name), "%s", obj.name);
        cache->entries[at].icon = icon;
    }
    int32_t closed = driver->close_dir(&dir);
    if (res == VFS_ERR_EOF) res = closed;
    if (res != VFS_OK) return res;
    if (revision != chameleon_browser_revision(driver)) return VFS_ERR_FAIL;
    if (!eligible && excluded) {
        app->browser_direction = 0;
        return chameleon_browser_cache_scan(app, driver, revision);
    }
    cache->previous = app->browser_direction < 0 ? eligible > CHAMELEON_BROWSER_CACHE_SIZE : excluded > 0;
    cache->next = app->browser_direction < 0 ? excluded > 0 : eligible > CHAMELEON_BROWSER_CACHE_SIZE;
    cache->split = cache->count > CHAMELEON_BROWSER_PAGE_SIZE
                       ? (app->browser_direction < 0 ? cache->count - CHAMELEON_BROWSER_PAGE_SIZE : CHAMELEON_BROWSER_PAGE_SIZE)
                       : cache->count;
    cache->offset = app->browser_direction < 0 && cache->count > CHAMELEON_BROWSER_PAGE_SIZE ? cache->split : 0;
    cache->revision = revision;
    return VFS_OK;
}

static bool chameleon_browser_cached_page(app_chameleon_t *app, bool previous) {
    struct chameleon_browser_cache_s *cache = app->browser_cache;
    if (!cache || !cache->revision || cache->driver != vfs_get_default_driver() ||
        cache->revision != chameleon_browser_revision(cache->driver)) return false;
    if (previous) {
        if (!cache->offset) return false;
        cache->offset = 0;
    } else {
        if (cache->offset || cache->split >= cache->count) return false;
        cache->offset = cache->split;
    }
    return chameleon_browser_cache_show(app);
}
#endif

static void chameleon_scene_menu_card_data_file_load_reload(app_chameleon_t *app) {
#ifdef VFS_PACKED_LFS_ENABLE
    const vfs_driver_t *driver = vfs_get_default_driver();
    uint64_t revision = chameleon_browser_revision(driver);
    if (revision) {
        mui_list_view_clear_items(app->p_list_view);
        if (!app->browser_cache) {
            mui_mem_monitor_t memory;
            mui_mem_monitor(&memory);
            /* Leave room for the displayed list and other application work.
             * Allocation/render failures fall back to the original one-page scan. */
            if (memory.free_size >= sizeof(*app->browser_cache) + 6144u)
                app->browser_cache = mui_mem_malloc(sizeof(*app->browser_cache));
        }
        if (app->browser_cache) {
            int32_t res = chameleon_browser_cache_scan(app, driver, revision);
            if (res == VFS_OK && chameleon_browser_cache_show(app)) {
                /* A one-page directory has nothing useful to prefetch. */
                if (app->browser_cache->count <= CHAMELEON_BROWSER_PAGE_SIZE &&
                    !app->browser_cache->previous && !app->browser_cache->next)
                    chameleon_browser_cache_free(app);
                return;
            }
            chameleon_browser_cache_free(app);
            if (res != VFS_OK) {
                mui_list_view_clear_items(app->p_list_view);
                bool complete = mui_list_view_try_add_item_ext(app->p_list_view, ICON_BACK, _T(MAIN_RETURN), NULL,
                        (void *)(uintptr_t)CHAMELEON_MENU_BACK);
                if (complete && current_dir[0]) complete = mui_list_view_try_add_item_ext(app->p_list_view, ICON_HOME,
                        "..", NULL, (void *)(uintptr_t)CHAMELEON_MENU_PARENT_DIR);
                if (!complete) { mui_list_view_clear_items(app->p_list_view); mui_show_memory_error(mui()); }
                else {
                    mui_toast_view_show(app->p_toast_view, _T(OPEN_FOLDER_FAILED));
                    mui_list_view_sort(app->p_list_view, chameleon_scene_menu_card_data_list_item_cmp);
                }
                mui_list_view_set_focus(app->p_list_view, 0);
                mui_list_view_set_scroll_offset(app->p_list_view, 0);
                return;
            }
        }
    }
#endif
    chameleon_browser_cache_free(app);
    chameleon_scene_menu_card_data_file_load_uncached(app);
}

/** Move current directory to parent. No-op if already at root. */
void update_current_directory_to_parent(void) {
    char *last_slash = strrchr(current_dir, '/');
    if (last_slash) {
        *last_slash = '\0';
        if (strlen(current_dir) == 0 || strcmp(current_dir, CHELEMEON_DUMP_FOLDER) == 0) {
            current_dir[0] = '\0';
        }
    } else {
        current_dir[0] = '\0';
    }
}

/** Set current directory to the given subdirectory (name only, not full path). */
bool update_current_directory(const char *subdir_name) {
    char temp[VFS_MAX_PATH_LEN];
    int length = snprintf(temp, sizeof(temp), "%s/%s",
                          current_dir[0] ? current_dir : CHELEMEON_DUMP_FOLDER, subdir_name);
    if (length < 0 || (size_t)length >= sizeof(temp)) {
        return false;
    }
    strcpy(current_dir, temp);
    return true;
}


static void chameleon_scene_menu_card_data_file_load_on_event(mui_list_view_event_t event, mui_list_view_t *p_list_view,
                                                       mui_list_item_t *p_item) {
    app_chameleon_t *app = p_list_view->user_data;
    chameleon_menu_item_t item = (chameleon_menu_item_t)p_item->user_data;
    
    switch (item) {
    case CHAMELEON_MENU_PREVIOUS_PAGE:
    case CHAMELEON_MENU_NEXT_PAGE: {
        if (event != MUI_LIST_VIEW_EVENT_SELECTED) return;
        bool previous = item == CHAMELEON_MENU_PREVIOUS_PAGE;
        mui_list_item_t *anchor = NULL;
        for (size_t i = 0; i < mui_list_item_array_size(p_list_view->items); i++) {
            mui_list_item_t *entry = mui_list_item_array_get(p_list_view->items, i);
            uintptr_t key = (uintptr_t)entry->user_data;
            if (key != CHAMELEON_MENU_FILE && key != CHAMELEON_MENU_FOLDER) continue;
            anchor = entry;
            if (previous) break;
        }
        if (!anchor) return;
        snprintf(app->browser_anchor, sizeof(app->browser_anchor), "%s", string_get_cstr(anchor->text));
        app->browser_anchor_icon = anchor->icon;
        app->browser_direction = previous ? -1 : 1;
#ifdef VFS_PACKED_LFS_ENABLE
        if (chameleon_browser_cached_page(app, previous)) break;
#endif
        chameleon_scene_menu_card_data_file_load_reload(app);
    } break;

    case CHAMELEON_MENU_FILE: {
        chameleon_scene_menu_card_data_file_load_from_file(app, string_get_cstr(p_item->text));
    } break;
    
    case CHAMELEON_MENU_FOLDER: {
        // Enter subdirectory
        if (update_current_directory(string_get_cstr(p_item->text))) {
            app->browser_direction = 0;
            chameleon_scene_menu_card_data_file_load_reload(app);
        } else {
            mui_toast_view_show(app->p_toast_view, _T(OPEN_FOLDER_FAILED));
        }
    } break;
    
    case CHAMELEON_MENU_PARENT_DIR: {
        update_current_directory_to_parent();
        app->browser_direction = 0;
        chameleon_scene_menu_card_data_file_load_reload(app);
    } break;

    case CHAMELEON_MENU_BACK:
        mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
        break;
    }
}

void chameleon_scene_menu_card_data_file_load_on_enter(void *user_data) {
    app_chameleon_t *app = user_data;

    // Initialize current directory as empty (root directory)
    chameleon_browser_cache_free(app);
    strcpy(current_dir, "");
    app->browser_direction = 0;
    app->browser_anchor[0] = '\0';
    app->browser_anchor_icon = 0;
    
    // Load file list (the reload function will now add a return button)
    chameleon_scene_menu_card_data_file_load_reload(app);
    
    mui_list_view_set_selected_cb(app->p_list_view, chameleon_scene_menu_card_data_file_load_on_event);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, CHAMELEON_VIEW_ID_LIST);
}

void chameleon_scene_menu_card_data_file_load_on_exit(void *user_data) {
    app_chameleon_t *app = user_data;
    
    // Clean up list items
    chameleon_browser_cache_free(app);
    mui_list_view_clear_items(app->p_list_view);
    
    // Clean up current directory path
    strcpy(current_dir, "");
}
