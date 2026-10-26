#include "ntag_emu.h"
#include "app_amiibo.h"
#include "mini_app_registry.h"

#include "mui_include.h"

#include "amiibo_detail_view.h"

#include "amiibo_scene.h"

#include "mui_list_view.h"

#include "cache.h"
#include "m-string.h"
#include "settings.h"

#include "amiibo_helper.h"
#include "i18n/language.h"

_Static_assert(sizeof(app_amiibo_cache_data_t) <= CACHEDATASIZE, "amiibo retain cache overflow");

static void app_amiibo_restore_browser_cache(app_amiibo_t *app, const app_amiibo_cache_data_t *cache) {
    bool valid = cache->browser_magic == APP_AMIIBO_CACHE_PAGE_MAGIC &&
                 (cache->browser_direction == 0 || cache->browser_direction == 1 || cache->browser_direction == -1) &&
                 memchr(cache->browser_anchor, 0, sizeof(cache->browser_anchor)) &&
                 (!cache->browser_direction || (cache->browser_anchor[0] &&
                  (cache->browser_anchor_icon == 0xe1d6 || cache->browser_anchor_icon == 0xe1ed)));
    if (valid) {
        memcpy(app->browser_anchor, cache->browser_anchor, sizeof(app->browser_anchor));
        app->browser_anchor_icon = cache->browser_anchor_icon;
        app->browser_direction = cache->browser_direction;
    } else {
        /* Old firmware left this tail unversioned. Never use it as a key. */
        memset(app->browser_anchor, 0, sizeof(app->browser_anchor));
        app->browser_anchor_icon = 0;
        app->browser_direction = 0;
        app->current_focus_index = 0;
    }
}

static void app_amiibo_save_browser_cache(const app_amiibo_t *app, app_amiibo_cache_data_t *cache) {
    cache->browser_magic = APP_AMIIBO_CACHE_PAGE_MAGIC;
    memcpy(cache->browser_anchor, app->browser_anchor, sizeof(cache->browser_anchor));
    cache->browser_anchor_icon = app->browser_anchor_icon;
    cache->browser_direction = app->browser_direction;
}

static void app_amiibo_on_run(mini_app_inst_t *p_app_inst);
static void app_amiibo_on_kill(mini_app_inst_t *p_app_inst);
static void app_amiibo_on_event(mini_app_inst_t *p_app_inst, mini_app_event_t *p_event);

static void app_amiibo_try_mount_drive(app_amiibo_t *p_app_inst) {
    vfs_driver_t *p_driver = vfs_get_driver(p_app_inst->current_drive);
    if (p_driver->mounted()) {
        amiibo_helper_try_load_amiibo_keys_from_vfs();
    } else {
        int32_t err = p_driver->mount();
        amiibo_helper_try_load_amiibo_keys_from_vfs();
    }
}

void app_amiibo_on_run(mini_app_inst_t *p_app_inst) {

    app_amiibo_t *p_app_handle = mui_mem_malloc(sizeof(app_amiibo_t));
    if (!p_app_handle) { p_app_inst->p_handle = NULL; return; }
    memset(p_app_handle, 0, sizeof(app_amiibo_t));
    /* Construct every owned UI object before any app activation. */
    p_app_handle->p_view_dispatcher = mui_view_dispatcher_create();
    if (!p_app_handle->p_view_dispatcher) goto startup_failed;
    p_app_handle->p_amiibo_detail_view = amiibo_detail_view_create();
    if (!p_app_handle->p_amiibo_detail_view) goto startup_failed;
    p_app_handle->p_list_view = mui_list_view_create();
    if (!p_app_handle->p_list_view) goto startup_failed;
    p_app_handle->p_text_input = mui_text_input_create();
    if (!p_app_handle->p_text_input) goto startup_failed;
    p_app_handle->p_msg_box = mui_msg_box_create();
    if (!p_app_handle->p_msg_box) goto startup_failed;
    p_app_handle->p_toast_view = mui_toast_view_create();
    if (!p_app_handle->p_toast_view) goto startup_failed;
    p_app_handle->p_scene_dispatcher = mui_scene_dispatcher_create();
    if (!p_app_handle->p_scene_dispatcher) goto startup_failed;
    p_app_handle->p_scene_dispatcher->transition_guard = ntag_emu_prepare_change;
    p_app_handle->p_view_dispatcher_toast = mui_view_dispatcher_create();
    if (!p_app_handle->p_view_dispatcher_toast) goto startup_failed;
    p_app_inst->p_handle = p_app_handle;


    p_app_handle->p_amiibo_detail_view->user_data = p_app_handle;
    mui_list_view_set_user_data(p_app_handle->p_list_view, p_app_handle);
    mui_text_input_set_user_data(p_app_handle->p_text_input, p_app_handle);
    mui_msg_box_set_user_data(p_app_handle->p_msg_box, p_app_handle);

    mui_toast_view_set_user_data(p_app_handle->p_toast_view, p_app_handle);


    string_init(p_app_handle->current_file);
    string_init(p_app_handle->current_folder);

    mui_scene_dispatcher_set_user_data(p_app_handle->p_scene_dispatcher, p_app_handle);
    mui_scene_dispatcher_set_scene_defines(p_app_handle->p_scene_dispatcher, amiibo_scene_defines, AMIIBO_SCENE_MAX);
    mui_mui_scene_dispatcher_set_default_scene_id(p_app_handle->p_scene_dispatcher, AMIIBO_SCENE_FILE_BROWSER);

    mui_view_dispatcher_add_view(p_app_handle->p_view_dispatcher, AMIIBO_VIEW_ID_LIST,
                                 mui_list_view_get_view(p_app_handle->p_list_view));
    mui_view_dispatcher_add_view(p_app_handle->p_view_dispatcher, AMIIBO_VIEW_ID_DETAIL,
                                 amiibo_detail_view_get_view(p_app_handle->p_amiibo_detail_view));
    mui_view_dispatcher_add_view(p_app_handle->p_view_dispatcher, AMIIBO_VIEW_ID_INPUT,
                                 mui_text_input_get_view(p_app_handle->p_text_input));
    mui_view_dispatcher_add_view(p_app_handle->p_view_dispatcher, AMIIBO_VIEW_ID_MSG_BOX,
                                 mui_msg_box_get_view(p_app_handle->p_msg_box));

    mui_view_dispatcher_attach(p_app_handle->p_view_dispatcher, MUI_LAYER_FULLSCREEN);

    mui_view_dispatcher_add_view(p_app_handle->p_view_dispatcher_toast, AMIIBO_VIEW_ID_TOAST,
                                 mui_toast_view_get_view(p_app_handle->p_toast_view));
    mui_view_dispatcher_attach(p_app_handle->p_view_dispatcher_toast, MUI_LAYER_TOAST);
    mui_view_dispatcher_switch_to_view(p_app_handle->p_view_dispatcher_toast, AMIIBO_VIEW_ID_TOAST);

    extern const ntag_t default_ntag215;
    APP_ERROR_CHECK(ntag_emu_init(&default_ntag215));

    settings_data_t *p_settings = settings_get_data();

    if (p_app_inst->p_retain_data) {
        app_amiibo_cache_data_t *p_cache_data = (app_amiibo_cache_data_t *)p_app_inst->p_retain_data;
        if (p_cache_data->cached_enabled) {
            p_app_handle->current_drive = p_cache_data->current_drive;
            string_set_str(p_app_handle->current_file, p_cache_data->current_file);
            string_set_str(p_app_handle->current_folder, p_cache_data->current_folder);
            p_app_handle->current_focus_index = p_cache_data->current_focus_index;
            app_amiibo_restore_browser_cache(p_app_handle, p_cache_data);
            memcpy(&(p_app_handle->ntag), &(cache_get_data()->ntag), sizeof(ntag_t));

            if (p_app_handle->current_drive == VFS_DRIVE_EXT || p_app_handle->current_drive == VFS_DRIVE_INT) {
                app_amiibo_try_mount_drive(p_app_handle);
            }

            if (p_cache_data->current_scene_id == AMIIBO_SCENE_AMIIBO_DETAIL) {
                if (string_size(p_app_handle->current_file) > 0) {
                    p_app_handle->reload_amiibo_files = true;
                    mui_scene_dispatcher_next_scene(p_app_handle->p_scene_dispatcher, AMIIBO_SCENE_AMIIBO_DETAIL);
                } else {
                    mui_scene_dispatcher_next_scene(p_app_handle->p_scene_dispatcher, AMIIBO_SCENE_FILE_BROWSER);
                }
            } else if (p_cache_data->current_scene_id == AMIIBO_SCENE_FILE_BROWSER) {
                mui_scene_dispatcher_next_scene(p_app_handle->p_scene_dispatcher, AMIIBO_SCENE_FILE_BROWSER);
            }
            return;
        }
    }

    p_app_handle->current_drive = vfs_get_default_drive();
    string_set_str(p_app_handle->current_folder, "/");
    app_amiibo_try_mount_drive(p_app_handle);
    mui_scene_dispatcher_next_scene(p_app_handle->p_scene_dispatcher, AMIIBO_SCENE_FILE_BROWSER);

    return;

startup_failed:
    mui_view_dispatcher_free(p_app_handle->p_view_dispatcher_toast);
    mui_scene_dispatcher_free(p_app_handle->p_scene_dispatcher);
    mui_toast_view_free(p_app_handle->p_toast_view);
    mui_msg_box_free(p_app_handle->p_msg_box);
    mui_text_input_free(p_app_handle->p_text_input);
    mui_list_view_free(p_app_handle->p_list_view);
    amiibo_detail_view_free(p_app_handle->p_amiibo_detail_view);
    mui_view_dispatcher_free(p_app_handle->p_view_dispatcher);
    mui_mem_free(p_app_handle);
    p_app_inst->p_handle = NULL;
}

void app_amiibo_on_kill(mini_app_inst_t *p_app_inst) {
    app_amiibo_t *p_app_handle = p_app_inst->p_handle;
    if (!p_app_handle) return;

    /* A final NFC write can rename new*.bin. Retain the resulting path, even
     * when the user leaves the app while the reader field is still present. */
    if (!ntag_emu_prepare_change()) return;

    uint32_t current_scene_id = mui_scene_dispatcher_current_scene(p_app_handle->p_scene_dispatcher);
    if (p_app_inst->p_retain_data && app_amiibo_info.hibernate_enabled &&
        (current_scene_id == AMIIBO_SCENE_AMIIBO_DETAIL || current_scene_id == AMIIBO_SCENE_FILE_BROWSER)) {
        app_amiibo_cache_data_t p_cache_data = {0};
        p_cache_data.cached_enabled = true;
        strcpy(p_cache_data.current_file, string_get_cstr(p_app_handle->current_file));
        strcpy(p_cache_data.current_folder, string_get_cstr(p_app_handle->current_folder));
        p_cache_data.current_drive = p_app_handle->current_drive;
        p_cache_data.current_scene_id = current_scene_id;
        p_cache_data.current_focus_index = current_scene_id == AMIIBO_SCENE_FILE_BROWSER
                                            ? mui_list_view_get_focus(p_app_handle->p_list_view)
                                            : p_app_handle->current_focus_index;
        app_amiibo_save_browser_cache(p_app_handle, &p_cache_data);

        memcpy(p_app_inst->p_retain_data, &p_cache_data, sizeof(app_amiibo_cache_data_t));
    } else {
        if (p_app_inst->p_retain_data) memset(p_app_inst->p_retain_data, 0, CACHEDATASIZE);
        memset(&(cache_get_data()->ntag), 0, sizeof(ntag_t));
    }

    /* Stop scene-owned timers/callbacks while all views and app data are alive. */
    mui_scene_dispatcher_exit(p_app_handle->p_scene_dispatcher);

    mui_view_dispatcher_detach(p_app_handle->p_view_dispatcher, MUI_LAYER_FULLSCREEN);
    mui_view_dispatcher_free(p_app_handle->p_view_dispatcher);
    mui_list_view_free(p_app_handle->p_list_view);
    mui_text_input_free(p_app_handle->p_text_input);
    mui_msg_box_free(p_app_handle->p_msg_box);
    mui_scene_dispatcher_free(p_app_handle->p_scene_dispatcher);
    amiibo_detail_view_free(p_app_handle->p_amiibo_detail_view);

    mui_view_dispatcher_detach(p_app_handle->p_view_dispatcher_toast, MUI_LAYER_TOAST);
    mui_view_dispatcher_free(p_app_handle->p_view_dispatcher_toast);
    mui_toast_view_free(p_app_handle->p_toast_view);

    string_clear(p_app_handle->current_file);
    string_clear(p_app_handle->current_folder);

    mui_mem_free(p_app_handle);

    p_app_inst->p_handle = NULL;
}

void app_amiibo_on_event(mini_app_inst_t *p_app_inst, mini_app_event_t *p_event) {}

mini_app_t app_amiibo_info = {.id = MINI_APP_ID_AMIIBO,
                              .name = "Amiibo模拟器",
                              .name_i18n_key = _L_APP_AMIIBO,
                              .icon = 0xe082,
                              .sys = false,
                              .deamon = false,
                              .hibernate_enabled = true,
                              .icon_32x32 = &app_amiibo_emulator_32x32,
                              .run_cb = app_amiibo_on_run,
                              .kill_cb = app_amiibo_on_kill,
                              .on_event_cb = app_amiibo_on_event};
