#include "amiibo_scene.h"
#include "app_amiibo.h"
#include "cwalk2.h"
#include "mui_list_view.h"
#include "mui_mem.h"
#include "nrf_log.h"
#include "ntag_def.h"
#include "ntag_store.h"
#include "vfs.h"
#include "vfs_persist.h"
#include "mui_icons.h"


#include "i18n/language.h"
#include "mini_app_launcher.h"
#include "mini_app_registry.h"


#define AMIIBO_MAX_AMIIBO_IN_BATCH 50

enum file_browser_menu_t {
    FILE_BROWSER_MENU_FILE_NAME,
    FILE_BROWSER_MENU_CREATE_FOLDER,
    FILE_BROWSER_MENU_CREATE_AMIIBO,
    FILE_BROWSER_MENU_CREATE_AMIIBO_BATCH,
    FILE_BROWSER_MENU_RENAME_FOLDER,
    FILE_BROWSER_MENU_REMOVE_FOLDER,
    FILE_BROWSER_MENU_BACK_FILE_BROWSER,
    FILE_BROWSER_MENU_BACK_MAIN_MENU
};

static void amiibo_scene_scene_file_browser_menu_msg_box_error_cb(mui_msg_box_event_t event, mui_msg_box_t *p_msg_box) {
    app_amiibo_t *app = p_msg_box->user_data;
    mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIBO_SCENE_FILE_BROWSER);
}

static void amiibo_scene_file_browser_show_messege(app_amiibo_t *app, const char *msg) {
    mui_msg_box_set_header(app->p_msg_box, getLangString(_L_ERR));
    mui_msg_box_set_message(app->p_msg_box, msg);
    mui_msg_box_set_btn_text(app->p_msg_box, NULL, getLangString(_L_BACK), NULL);
    mui_msg_box_set_btn_focus(app->p_msg_box, 1);
    mui_msg_box_set_event_cb(app->p_msg_box, amiibo_scene_scene_file_browser_menu_msg_box_error_cb);

    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIBO_VIEW_ID_MSG_BOX);
}

static void amiibo_scene_file_browser_show_error(app_amiibo_t *app, int32_t result) {
    char msg[96];
    const char *reason;
    switch (result) {
    case VFS_ERR_OBJEX: reason = _T(DE360_EXISTS); break;
    case VFS_ERR_NOMEM: reason = _T(DE360_NO_RAM); break;
    case VFS_ERR_NOSPC: reason = _T(DE3_STORAGE_FULL); break;
    case VFS_ERR_MAXNM: reason = _T(DE3_PATH_TOO_LONG); break;
    case VFS_ERR_NODEV: reason = _T(DE3_STORAGE_UNAVAILABLE); break;
    default: reason = _T(FAILED); break;
    }
    snprintf(msg, sizeof(msg), "%s\n%s: %ld", reason, _T(ERR_CODE), (long)result);
    amiibo_scene_file_browser_show_messege(app, msg);
}

static int32_t amiibo_scene_file_browser_new_path(vfs_driver_t *driver, const char *path) {
    if (!driver) return VFS_ERR_NODEV;
    vfs_obj_t obj;
    int32_t result = driver->stat_file(path, &obj);
    /* Creation never means replacing an existing figure or save. I/O errors
     * must not be mistaken for an unused name. */
    return result == VFS_ERR_NOOBJ ? VFS_OK : result == VFS_OK ? VFS_ERR_OBJEX : result;
}

static bool amiibo_scene_file_browser_batch_count(const char *text, uint32_t *count) {
    if (!text || !*text || !count) return false;
    uint32_t value = 0;
    for (; *text; ++text) {
        if (*text < '0' || *text > '9') return false;
        value = value * 10 + (uint32_t)(*text - '0');
        /* The previous iteration was at most 50, so this cannot overflow. */
        if (value > AMIIBO_MAX_AMIIBO_IN_BATCH) return false;
    }
    if (!value) return false;
    *count = value;
    return true;
}

static void amiibo_scene_file_browser_text_input_create_folder_event_cb(mui_text_input_event_t event,
                                                                        mui_text_input_t *p_text_input) {
    app_amiibo_t *app = p_text_input->user_data;
    if (event == MUI_TEXT_INPUT_EVENT_CONFIRMED) {
        const char *input_text = mui_text_input_get_input_text(p_text_input);
        if (strlen(input_text) > 0) {
            vfs_driver_t *p_driver = vfs_get_driver(app->current_drive);
            char path[VFS_MAX_PATH_LEN];
            if (!cwalk_append_segment(path, string_get_cstr(app->current_folder), input_text)) {
                amiibo_scene_file_browser_show_messege(app, _T(INVALID_INPUT));
                return;
            }
            int32_t res = p_driver ? p_driver->create_dir(path) : VFS_ERR_NODEV;
            if (res == VFS_OK) {
                mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIBO_SCENE_FILE_BROWSER);
            } else {
                amiibo_scene_file_browser_show_error(app, res);
            }
        } else {
            mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
        }
    } else {
        mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
    }
}

static void amiibo_scene_file_browser_text_input_create_amiibo_event_cb(mui_text_input_event_t event,
                                                                        mui_text_input_t *p_text_input) {
    app_amiibo_t *app = p_text_input->user_data;
    if (event == MUI_TEXT_INPUT_EVENT_CONFIRMED) {
        const char *input_text = mui_text_input_get_input_text(p_text_input);
        if (strlen(input_text) > 0) {
            vfs_driver_t *p_driver = vfs_get_driver(app->current_drive);
            char path[VFS_MAX_PATH_LEN];
            if (!cwalk_append_segment(path, string_get_cstr(app->current_folder), input_text)) {
                amiibo_scene_file_browser_show_messege(app, _T(INVALID_INPUT));
                return;
            }

            /* Recover before checking the name: an interrupted journal may
             * restore a target which initially appears to be absent. */
            int32_t res = vfs_persist_recover(p_driver);
            if (res == VFS_OK) res = amiibo_scene_file_browser_new_path(p_driver, path);
            if (res != VFS_OK) {
                amiibo_scene_file_browser_show_error(app, res);
                return;
            }
            /* Packed filesystem commits have a deeper call chain. Keep the
             * largest supported tag off the shared application/IRQ stack. */
            ntag_t *ntag = mui_mem_malloc(sizeof(*ntag));
            if (!ntag) {
                amiibo_scene_file_browser_show_error(app, VFS_ERR_NOMEM);
                return;
            }
            ntag_store_new_rand(ntag);
            size_t tag_size = _ntag_data_size(ntag);
            res = vfs_persist_write(p_driver, path, ntag->data, tag_size);
            mui_mem_free(ntag);
            if (res == (int32_t)tag_size) {
                mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIBO_SCENE_FILE_BROWSER);
            } else {
                amiibo_scene_file_browser_show_error(app, res < 0 ? res : VFS_ERR_FAIL);
            }
        } else {
            mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
        }
    } else {
        mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
    }
}

/* Only the active file-browser scene owns a batch. Scene exit also runs
 * when the launcher kills/suspends the app. */
static app_amiibo_t *batch_owner;
static ntag_t *batch_tag;
static uint8_t batch_done, batch_total;

static void amiibo_batch_release(void) {
    if (batch_tag) mui_mem_free(batch_tag);
    batch_tag = NULL;
    batch_owner = NULL;
}

static void amiibo_batch_cancel(mui_msg_box_event_t event, mui_msg_box_t *box) {
    app_amiibo_t *app = box->user_data;
    if (app != batch_owner || event != MUI_MSG_BOX_EVENT_SELECT_CENTER) return;
    amiibo_batch_release();
    mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIBO_SCENE_FILE_BROWSER);
}

bool amiibo_batch_step(void) {
    app_amiibo_t *app = batch_owner;
    if (!app) return false;

    char file_name[16], path[VFS_MAX_PATH_LEN], msg[48];
    unsigned index = batch_done + 1;
    snprintf(file_name, sizeof(file_name), "new_%02u.bin", index);
    snprintf(msg, sizeof(msg), "%u/%u  %s", index, (unsigned)batch_total, file_name);
    mui_msg_box_set_message(app->p_msg_box, msg);
    mui_update_now(mui());

    vfs_driver_t *driver = vfs_get_driver(app->current_drive);
    int32_t res = VFS_ERR_MAXNM;
    if (cwalk_append_segment(path, string_get_cstr(app->current_folder), file_name)) {
        /* The main loop processed other clients since preflight. Recheck this
         * specific target immediately before its atomic creation. */
        res = amiibo_scene_file_browser_new_path(driver, path);
        if (res == VFS_OK) {
            ntag_store_new_rand(batch_tag);
            size_t size = _ntag_data_size(batch_tag);
            res = vfs_persist_write(driver, path, batch_tag->data, size);
            if (res >= 0) res = res == (int32_t)size ? VFS_OK : VFS_ERR_FAIL;
        }
    }
    if (res != VFS_OK) {
        amiibo_batch_release();
        amiibo_scene_file_browser_show_error(app, res);
    } else if (++batch_done == batch_total) {
        amiibo_batch_release();
        mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIBO_SCENE_FILE_BROWSER);
    }
    return batch_owner != NULL;
}

static void amiibo_scene_file_browser_text_input_create_amiibo_batch_event_cb(mui_text_input_event_t event,
                                                                              mui_text_input_t *p_text_input) {
    app_amiibo_t *app = p_text_input->user_data;
    if (event == MUI_TEXT_INPUT_EVENT_CONFIRMED) {
        const char *input_text = mui_text_input_get_input_text(p_text_input);
        uint32_t num_amiibo = 0;

        if (strlen(input_text) == 0) {
            mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
            return;
        }

        if (!amiibo_scene_file_browser_batch_count(input_text, &num_amiibo)) {
            amiibo_scene_file_browser_show_messege(app, _T(INVALID_INPUT));
            return;
        }

        vfs_driver_t *p_driver = vfs_get_driver(app->current_drive);
        char path[VFS_MAX_PATH_LEN];
        char file_name[VFS_MAX_NAME_LEN];

        int32_t preparation = vfs_persist_recover(p_driver);
        if (preparation != VFS_OK) {
            amiibo_scene_file_browser_show_error(app, preparation);
            return;
        }
        /* Check every target before writing the first one. A collision at
         * new_50.bin must not overwrite or partially create this batch. */
        for (uint8_t i = 0; i < num_amiibo; i++) {
            snprintf(file_name, sizeof(file_name), "new_%02u.bin", (unsigned)i + 1);
            if (!cwalk_append_segment(path, string_get_cstr(app->current_folder), file_name)) {
                amiibo_scene_file_browser_show_messege(app, _T(INVALID_INPUT));
                return;
            }
            preparation = amiibo_scene_file_browser_new_path(p_driver, path);
            if (preparation != VFS_OK) {
                amiibo_scene_file_browser_show_error(app, preparation);
                return;
            }
        }

        /* One reusable buffer for the whole batch; no files are created if
         * allocation fails after the read-only collision preflight. */
        ntag_t *ntag = mui_mem_malloc(sizeof(*ntag));
        if (!ntag) {
            amiibo_scene_file_browser_show_error(app, VFS_ERR_NOMEM);
            return;
        }

        batch_owner = app;
        batch_tag = ntag;
        batch_total = (uint8_t)num_amiibo;
        batch_done = 0;
        mui_msg_box_set_header(app->p_msg_box, _T(CREATING_TAG_BATCH));
        mui_msg_box_set_message(app->p_msg_box, "");
        mui_msg_box_set_btn_text(app->p_msg_box, NULL, _T(CANCEL), NULL);
        mui_msg_box_set_btn_focus(app->p_msg_box, 1);
        mui_msg_box_set_event_cb(app->p_msg_box, amiibo_batch_cancel);
        mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIBO_VIEW_ID_MSG_BOX);
    } else {
        mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
    }
}

static void amiibo_scene_file_browser_menu_text_input_rename_folder_event_cb(mui_text_input_event_t event,
                                                                             mui_text_input_t *p_text_input) {
    app_amiibo_t *app = p_text_input->user_data;
    bool renamed = false;
    int32_t res;
    if (event == MUI_TEXT_INPUT_EVENT_CONFIRMED) {
        const char *input_text = mui_text_input_get_input_text(p_text_input);
        if (strlen(input_text) > 0 && strcmp(input_text, string_get_cstr(app->current_file)) != 0) {
            vfs_driver_t *p_driver = vfs_get_driver(app->current_drive);
            char path[VFS_MAX_PATH_LEN];
            char path2[VFS_MAX_PATH_LEN];
            vfs_obj_t obj;
            if (!cwalk_append_segment(path, string_get_cstr(app->current_folder), string_get_cstr(app->current_file)) ||
                !cwalk_append_segment(path2, string_get_cstr(app->current_folder), input_text)) {
                amiibo_scene_file_browser_show_messege(app, _T(INVALID_INPUT));
                return;
            }

            res = p_driver ? p_driver->stat_file(path, &obj) : VFS_ERR_NODEV;
            if (res == VFS_OK) {
                if (obj.type == VFS_TYPE_DIR) {
                    res = p_driver->rename_dir(path, path2);
                } else {
                    res = p_driver->rename_file(path, path2);
                }
            }

            if (res == VFS_OK) {
                renamed = true;
            }
        } else {
            // ignore error
            renamed = true;
        }

        if (renamed) {
            mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIBO_SCENE_FILE_BROWSER);
        } else {
            char msg[96];
            snprintf(msg, sizeof(msg), "%s\n%s:%d", getLangString(_L_RENAME_FAILED), getLangString(_L_ERR_CODE), res);
            mui_msg_box_set_header(app->p_msg_box, getLangString(_L_ERR));
            mui_msg_box_set_message(app->p_msg_box, msg);
            mui_msg_box_set_btn_text(app->p_msg_box, NULL, getLangString(_L_BACK), NULL);
            mui_msg_box_set_btn_focus(app->p_msg_box, 1);
            mui_msg_box_set_event_cb(app->p_msg_box, amiibo_scene_scene_file_browser_menu_msg_box_error_cb);

            mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIBO_VIEW_ID_MSG_BOX);
        }
    } else {
        mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
    }
}

static void amiibo_scene_file_browser_menu_msg_box_remove_folder_event_cb(mui_msg_box_event_t event,
                                                                          mui_msg_box_t *p_msg_box) {
    app_amiibo_t *app = p_msg_box->user_data;
    vfs_driver_t *p_driver = vfs_get_driver(app->current_drive);

    char path[VFS_MAX_PATH_LEN];
    vfs_obj_t obj;
    if (event == MUI_MSG_BOX_EVENT_SELECT_LEFT) {
        if (!cwalk_append_segment(path, string_get_cstr(app->current_folder), string_get_cstr(app->current_file))) {
            amiibo_scene_file_browser_show_messege(app, _T(INVALID_INPUT));
            return;
        }

        int32_t res = p_driver ? p_driver->stat_file(path, &obj) : VFS_ERR_NODEV;
        if (res == VFS_OK) {
            if (obj.type == VFS_TYPE_DIR) {
                res = p_driver->remove_dir(path);
            } else {
                res = p_driver->remove_file(path);
            }
        }

        if (res == VFS_OK) {
            mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
        } else {
            amiibo_scene_file_browser_show_error(app, res);
        }

    } else {
        // cancel, return to menu
        mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIBO_VIEW_ID_LIST);
    }
}

static void amiibo_scene_file_browser_menu_on_selected(mui_list_view_event_t event, mui_list_view_t *p_list_view,
                                                       mui_list_item_t *p_item) {
    app_amiibo_t *app = p_list_view->user_data;
    uint32_t index = (uint32_t)p_item->user_data;
    vfs_driver_t *p_driver = vfs_get_driver(app->current_drive);
    switch (index) {
    case FILE_BROWSER_MENU_CREATE_FOLDER: {
        mui_text_input_set_header(app->p_text_input, getLangString(_L_INPUT_FOLDER_NAME));
        mui_text_input_set_input_text(app->p_text_input, "");
        mui_text_input_set_event_cb(app->p_text_input, amiibo_scene_file_browser_text_input_create_folder_event_cb);

        mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIBO_VIEW_ID_INPUT);
        break;
    }

    case FILE_BROWSER_MENU_CREATE_AMIIBO: {
        mui_text_input_set_header(app->p_text_input, getLangString(_L_INPUT_AMIIBO_NAME));
        mui_text_input_set_input_text(app->p_text_input, "new.bin");
        mui_text_input_set_event_cb(app->p_text_input, amiibo_scene_file_browser_text_input_create_amiibo_event_cb);
        mui_text_input_set_focus_key(app->p_text_input, ENTER_KEY);

        mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIBO_VIEW_ID_INPUT);
        break;
    }

    case FILE_BROWSER_MENU_CREATE_AMIIBO_BATCH: {
        mui_text_input_set_header(app->p_text_input, _T(INPUT_TAG_NUM));
        mui_text_input_set_input_text(app->p_text_input, "1");
        mui_text_input_set_event_cb(app->p_text_input,
                                    amiibo_scene_file_browser_text_input_create_amiibo_batch_event_cb);
        mui_text_input_set_focus_key(app->p_text_input, ENTER_KEY);

        mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIBO_VIEW_ID_INPUT);

        break;
    }

    case FILE_BROWSER_MENU_REMOVE_FOLDER: {
        char msg[64];
        snprintf(msg, sizeof(msg), _T(DELETE_FILE), string_get_cstr(app->current_file));
        mui_msg_box_set_header(app->p_msg_box, getLangString(_L_TIPS));
        mui_msg_box_set_message(app->p_msg_box, msg);
        mui_msg_box_set_btn_text(app->p_msg_box, getLangString(_L_CONFIRM), NULL, getLangString(_L_CANCEL));
        mui_msg_box_set_btn_focus(app->p_msg_box, 2);
        mui_msg_box_set_event_cb(app->p_msg_box, amiibo_scene_file_browser_menu_msg_box_remove_folder_event_cb);

        mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIBO_VIEW_ID_MSG_BOX);

    } break;

    case FILE_BROWSER_MENU_RENAME_FOLDER: {
        mui_text_input_set_header(app->p_text_input, getLangString(_L_INPUT_NEW_NAME));
        mui_text_input_set_input_text(app->p_text_input, string_get_cstr(app->current_file));
        mui_text_input_set_event_cb(app->p_text_input,
                                    amiibo_scene_file_browser_menu_text_input_rename_folder_event_cb);

        mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIBO_VIEW_ID_INPUT);
    } break;

    case FILE_BROWSER_MENU_BACK_FILE_BROWSER:
        mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
        break;

    case FILE_BROWSER_MENU_BACK_MAIN_MENU:
        mini_app_launcher_kill(mini_app_launcher(), MINI_APP_ID_AMIIBO);
        break;
    }
}

void amiibo_scene_file_browser_menu_on_enter(void *user_data) {
    app_amiibo_t *app = user_data;

    mui_list_view_add_item(app->p_list_view, ICON_FILE, string_get_cstr(app->current_file), FILE_BROWSER_MENU_FILE_NAME);

    mui_list_view_add_item(app->p_list_view, ICON_NEW, getLangString(_L_CREATE_NEW_FOLDER),
                           (void *)FILE_BROWSER_MENU_CREATE_FOLDER);
    mui_list_view_add_item(app->p_list_view, ICON_NEW, getLangString(_L_CREATE_NEW_TAG),
                           (void *)FILE_BROWSER_MENU_CREATE_AMIIBO);
    mui_list_view_add_item(app->p_list_view, ICON_NEW, getLangString(_L_CREATE_NEW_TAG_BATCH),
                           (void *)FILE_BROWSER_MENU_CREATE_AMIIBO_BATCH);
    if (string_cmp_str(app->current_file, "..") != 0) {
        char txt[32];
        snprintf(txt, sizeof(txt), "%s", getLangString(_L_RENAME));
        mui_list_view_add_item(app->p_list_view, ICON_EMPTY, txt, (void *)FILE_BROWSER_MENU_RENAME_FOLDER);
        snprintf(txt, sizeof(txt), "%s", getLangString(_L_DELETE));
        mui_list_view_add_item(app->p_list_view, ICON_DELETE, txt, (void *)FILE_BROWSER_MENU_REMOVE_FOLDER);
    }
    mui_list_view_add_item(app->p_list_view, ICON_BACK, getLangString(_L_BACK_TO_FILE_LIST),
                           (void *)FILE_BROWSER_MENU_BACK_FILE_BROWSER);
    mui_list_view_add_item(app->p_list_view, ICON_BACK, getLangString(_L_BACK_TO_MAIN_MENU),
                           (void *)FILE_BROWSER_MENU_BACK_MAIN_MENU);

    mui_list_view_set_selected_cb(app->p_list_view, amiibo_scene_file_browser_menu_on_selected);
    mui_list_view_set_user_data(app->p_list_view, app);

    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIBO_VIEW_ID_LIST);
}

void amiibo_scene_file_browser_menu_on_exit(void *user_data) {
    app_amiibo_t *app = user_data;
    if (app == batch_owner) amiibo_batch_release();
    mui_list_view_set_selected_cb(app->p_list_view, NULL);
    mui_list_view_set_user_data(app->p_list_view, NULL);
    mui_list_view_clear_items(app->p_list_view);
}
