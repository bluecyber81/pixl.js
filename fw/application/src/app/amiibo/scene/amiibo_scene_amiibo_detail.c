#include "amiibo_helper.h"
#include "amiibo_scene.h"
#include "app_amiibo.h"
#include "app_timer.h"
#include "cwalk2.h"
#include "db_header.h"
#include "i18n/language.h"
#include "mui_list_view.h"
#include "mui_alloc.h"
#include "nrf_log.h"
#include "ntag_emu.h"
#include "ntag_store.h"
#include "settings.h"
#include "vfs.h"
#include "vfs_meta.h"
#include "vfs_persist.h"
#include <stdio.h>

#define NRF_ERR_NOT_AMIIBO -1000
#define NRF_ERR_READ_ERROR -1001
#define NRF_ERR_WRITE_ERROR -1002

APP_TIMER_DEF(m_amiibo_gen_delay_timer);
static uint32_t m_generate_generation;

static bool amiibo_scene_amiibo_detail_reload_files(app_amiibo_t *app);

static void amiibo_scene_amiibo_detail_msg_box_error_cb(mui_msg_box_event_t event, mui_msg_box_t *p_msg_box) {
    app_amiibo_t *app = p_msg_box->user_data;
    mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIBO_SCENE_FILE_BROWSER);
}

static void amiibo_scene_amiibo_detail_reload_error(app_amiibo_t *app, const char *path, int32_t err_code) {

    char msg[VFS_MAX_PATH_LEN + 64];
    const char *reason = err_code == NRF_ERR_NOT_AMIIBO ? getLangString(_L_NOT_AMIIBO_FILE)
                        : err_code == NRF_ERR_WRITE_ERROR ? getLangString(_L_APP_AMIIDB_SLOT_SAVE_FAILED)
                                                           : getLangString(_L_READ_FILE_FAILED);
    if (err_code == VFS_ERR_NOSPC) reason = getLangString(_L_DE3_STORAGE_FULL);
    else if (err_code == VFS_ERR_CRPT) reason = getLangString(_L_DE3_STORAGE_CORRUPT);
    else if (err_code == VFS_ERR_MAXNM) reason = getLangString(_L_DE3_PATH_TOO_LONG);
    else if (err_code == VFS_ERR_NODEV) reason = getLangString(_L_DE3_STORAGE_UNAVAILABLE);
    else if (err_code == VFS_ERR_FAIL) reason = getLangString(_L_DE3_STORAGE_IO_ERROR);
    snprintf(msg, sizeof(msg), "%s\n%s", path, reason);

    mui_msg_box_set_header(app->p_msg_box, getLangString(_L_ERR));
    mui_msg_box_set_message(app->p_msg_box, msg);
    mui_msg_box_set_btn_text(app->p_msg_box, NULL, getLangString(_L_BACK), NULL);
    mui_msg_box_set_btn_focus(app->p_msg_box, 1);
    mui_msg_box_set_event_cb(app->p_msg_box, amiibo_scene_amiibo_detail_msg_box_error_cb);

    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIBO_VIEW_ID_MSG_BOX);
}

static int32_t ntag_read(vfs_driver_t *p_vfs_driver, const char *path, ntag_t *ntag) {

    vfs_obj_t obj;
    int32_t res;

    memset(ntag, 0, sizeof(ntag_t));
    int32_t recovery = vfs_persist_recover(p_vfs_driver);
    if (recovery != VFS_OK) return recovery;
    res = p_vfs_driver->stat_file(path, &obj);
    if (res != VFS_OK) {
        return NRF_ERR_READ_ERROR;
    }

    if (obj.type != VFS_TYPE_REG || !is_valid_amiibo_ntag_by_size(obj.size)) {
        return NRF_ERR_NOT_AMIIBO;
    }

    vfs_meta_t meta;
    memset(&meta, 0, sizeof(vfs_meta_t));
    vfs_meta_decode((uint8_t *)obj.meta, sizeof(obj.meta), &meta);
    if (meta.has_notes) {
        size_t length = 0;
        while (length < sizeof(meta.notes) && length < sizeof(ntag->notes) - 1 && meta.notes[length]) length++;
        memcpy(ntag->notes, meta.notes, length);
        ntag->notes[length] = '\0';
    }

    NRF_LOG_INFO("has_flag:%d flag:%d", meta.has_flags, meta.flags);
    if (meta.has_flags && (meta.flags & VFS_OBJ_FLAG_READONLY)) {
        ntag->read_only = true;
    }

    ntag_type_t tag_type = _ntag_type(obj.size);
    ntag->type = tag_type;

    /* Preserve legacy 532-byte files and the 32-byte signature suffix in 572-byte
       files. A short read of a larger selected format is never accepted. */
    res = p_vfs_driver->read_file_data(path, ntag->data, obj.size);
    if (res != (int32_t)obj.size) {
        return NRF_ERR_READ_ERROR;
    }
    return NRF_SUCCESS;
}

static int32_t ntag_write(vfs_driver_t *driver, const char *path, ntag_t *ntag) {
    int32_t recovery = vfs_persist_recover(driver);
    if (recovery != VFS_OK) return recovery;
    vfs_obj_t obj;
    if (driver->stat_file(path, &obj) != VFS_OK || obj.type != VFS_TYPE_REG ||
        !is_valid_amiibo_ntag_by_size(obj.size) || _ntag_type(obj.size) != ntag->type) {
        return NRF_ERR_WRITE_ERROR;
    }
    int32_t result = vfs_persist_write(driver, path, ntag->data, obj.size);
    return result == (int32_t)obj.size ? NRF_SUCCESS : result < 0 ? result : NRF_ERR_WRITE_ERROR;
}

static void ntag_gen(void *p_context) {
    ret_code_t err_code;
    app_amiibo_t *app = p_context;
    ntag_t *ntag_current = &app->ntag;

    ntag_emu_prepare_change();
    err_code = amiibo_helper_rand_amiibo_uuid(ntag_current);
    if (err_code == NRF_SUCCESS) {
        ntag_emu_set_tag(&app->ntag);
        mui_update(mui());
    } else {
        ntag_emu_set_tag(&app->ntag);
    }
}

static void ntag_gen_timer(void *context) { ntag_emu_request_action(ntag_gen, context, m_generate_generation); }

static void ntag_update(app_amiibo_t *app, ntag_t *p_ntag) {
    amiibo_detail_view_t *p_amiibo_detail_view = app->p_amiibo_detail_view;
    memcpy(p_amiibo_detail_view->ntag, p_ntag, sizeof(ntag_t));

    vfs_driver_t *p_driver = vfs_get_driver(app->current_drive);

    char path[VFS_MAX_PATH_LEN];
    if (!cwalk_append_segment(path, string_get_cstr(app->current_folder), string_get_cstr(app->current_file))) {
        amiibo_scene_amiibo_detail_reload_error(app, string_get_cstr(app->current_file), NRF_ERR_WRITE_ERROR);
        return;
    }

    // save to fs
    int32_t res = ntag_write(p_driver, path, p_ntag);
    if (res == NRF_SUCCESS) {
        uint32_t head = to_little_endian_int32(&p_ntag->data[84]);
        uint32_t tail = to_little_endian_int32(&p_ntag->data[88]);

        const db_amiibo_t *amd = get_amiibo_by_id(head, tail);

        if (amd && strncmp(string_get_cstr(app->current_file), "new", 3) == 0) {
            char new_path[VFS_MAX_PATH_LEN];
            char new_name[VFS_MAX_NAME_LEN];
            snprintf(new_name, sizeof(new_name), "%s.bin", amd->name_en);
            if (!cwalk_append_segment(new_path, string_get_cstr(app->current_folder), new_name)) {
                mui_toast_view_show(app->p_toast_view, _T(FAILED));
                mui_update(mui());
                return;
            }
            res = p_driver->rename_file(path, new_path);

            if (res == VFS_OK) {
                // todo ..
                if (!mui_string_try_set_str(app->current_file, new_name) ||
                    !mui_string_try_set_str(p_amiibo_detail_view->file_name, new_name)) {
                    mui_show_memory_error(mui());
                    return;
                }
                amiibo_scene_amiibo_detail_reload_files(app);
            }
        }
    } else {
        amiibo_scene_amiibo_detail_reload_error(app, string_get_cstr(app->current_file), res);
    }

    mui_update(mui());
}

static void ntag_update_cb(ntag_event_type_t type, void *context, ntag_t *p_ntag) {

    app_amiibo_t *app = context;

    if (type == NTAG_EVENT_TYPE_WRITTEN) {
        app_timer_stop(m_amiibo_gen_delay_timer);
        ntag_update(app, p_ntag);
    } else if (type == NTAG_EVENT_TYPE_READ) {
        settings_data_t *p_settings = settings_get_data();
        if (p_settings->auto_gen_amiibo) {
            app_timer_stop(m_amiibo_gen_delay_timer);
            m_generate_generation = ntag_emu_get_generation();
            app_timer_start(m_amiibo_gen_delay_timer, APP_TIMER_TICKS(1000), app);
        }
    }
}

static bool amiibo_scene_amiibo_detail_reload_ntag(app_amiibo_t *app, const char *file_name) {
    char path[VFS_MAX_PATH_LEN];
    char selected_name[VFS_MAX_NAME_LEN];

    if (strlen(file_name) == 0 || strlen(file_name) >= sizeof(selected_name)) {
        return false;
    }
    /* Saving a newly written tag can rename it and rebuild the file list. */
    memcpy(selected_name, file_name, strlen(file_name) + 1);
    file_name = selected_name;

    /* Flush A before reading B into the shared app tag or changing its path. */
    ntag_emu_prepare_change();

    if (!cwalk_append_segment(path, string_get_cstr(app->current_folder), file_name)) {
        amiibo_scene_amiibo_detail_reload_error(app, file_name, NRF_ERR_READ_ERROR);
        string_set_str(app->current_file, "");
        return false;
    }

    vfs_driver_t *p_vfs_driver = vfs_get_driver(app->current_drive);
    int32_t err = ntag_read(p_vfs_driver, path, &app->ntag);
    if (err != NRF_SUCCESS) {
        amiibo_scene_amiibo_detail_reload_error(app, file_name, err);
        string_set_str(app->current_file, "");
        return false;
    }
    if (!mui_string_try_set_str(app->current_file, file_name) ||
        !mui_string_try_set_str(app->p_amiibo_detail_view->file_name, file_name)) {
        mui_show_memory_error(mui());
        return false;
    }
    amiibo_detail_view_set_ntag(app->p_amiibo_detail_view, &app->ntag);
    ntag_emu_set_tag(app->p_amiibo_detail_view->ntag);

    return true;
}

static int amiibo_scene_amiibo_detail_list_item_cmp(const string_t *a, const string_t *b) { return string_cmp(*a, *b); }

static bool amiibo_scene_amiibo_detail_reload_files(app_amiibo_t *app) {
    vfs_dir_t dir;
    vfs_obj_t obj;
    uint32_t focus = 0;
    bool complete = true;

    // query amiibo list
    string_array_reset(app->amiibo_files);
    vfs_driver_t *p_vfs_driver = vfs_get_driver(app->current_drive);

    int32_t res = p_vfs_driver->open_dir(string_get_cstr(app->current_folder), &dir);
    if (res == VFS_OK) {
        while ((res = p_vfs_driver->read_dir(&dir, &obj)) == VFS_OK) {
            vfs_meta_t meta;
            memset(&meta, 0, sizeof(vfs_meta_t));
            vfs_meta_decode(obj.meta, sizeof(obj.meta), &meta);
            if (obj.type == VFS_TYPE_REG && is_valid_amiibo_ntag_by_size(obj.size)
                 && (!meta.has_flags || !(meta.flags & VFS_OBJ_FLAG_HIDDEN))) {
                if (string_array_size(app->amiibo_files) >= UINT8_MAX ||
                    !mui_string_array_try_push_str(app->amiibo_files, obj.name)) {
                    complete = false;
                    break;
                }
            }
        }
        p_vfs_driver->close_dir(&dir);
    }

    if (!complete) {
        string_array_reset(app->amiibo_files);
        amiibo_detail_view_set_focus(app->p_amiibo_detail_view, 0);
        amiibo_detail_view_set_max_ntags(app->p_amiibo_detail_view, 0);
        mui_show_memory_error(mui());
        return false;
    }

    string_array_special_sort(app->amiibo_files, amiibo_scene_amiibo_detail_list_item_cmp);

    // load amiibo detail
    string_array_it_t it;
    string_array_it(it, app->amiibo_files);
    while (!string_array_end_p(it)) {
        string_t *item = string_array_ref(it);
        if (string_cmp(*item, app->current_file) == 0) {
            amiibo_detail_view_set_focus(app->p_amiibo_detail_view, focus);
            break;
        }
        focus++;
        string_array_next(it);
    }

    if (focus >= string_array_size(app->amiibo_files)) {
        amiibo_detail_view_set_focus(app->p_amiibo_detail_view, 0);
    }

    amiibo_detail_view_set_max_ntags(app->p_amiibo_detail_view, string_array_size(app->amiibo_files));
    return true;
}

static void app_amiibo_detail_view_on_event(amiibo_detail_view_event_t event, amiibo_detail_view_t *p_view) {
    app_amiibo_t *app = p_view->user_data;
    if (event == AMIIBO_DETAIL_VIEW_EVENT_MENU) {
        mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIBO_SCENE_AMIIBO_DETAIL_MENU);
    } else if (event == AMIIBO_DETAIL_VIEW_EVENT_UPDATE) {
        uint8_t focus = amiibo_detail_view_get_focus(app->p_amiibo_detail_view);
        if (focus >= string_array_size(app->amiibo_files)) return;
        amiibo_scene_amiibo_detail_reload_ntag(app, string_get_cstr(*string_array_get(app->amiibo_files, focus)));
    }
}

void amiibo_scene_amiibo_detail_on_enter(void *user_data) {
    app_amiibo_t *app = user_data;
    app->p_amiibo_detail_view->ntag = &app->ntag;
    app->p_amiibo_detail_view->event_cb = app_amiibo_detail_view_on_event;
    amiibo_detail_view_set_event_cb(app->p_amiibo_detail_view, app_amiibo_detail_view_on_event);

    if (app->reload_amiibo_files) {
        if (!amiibo_scene_amiibo_detail_reload_ntag(app, string_get_cstr(app->current_file))) {
            return;
        }
        if (!amiibo_scene_amiibo_detail_reload_files(app)) return;
        app->reload_amiibo_files = false;
    }

    ntag_emu_set_update_cb(ntag_update_cb, app);

    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIBO_VIEW_ID_DETAIL);

    int32_t err_code = app_timer_create(&m_amiibo_gen_delay_timer, APP_TIMER_MODE_SINGLE_SHOT, ntag_gen_timer);
    APP_ERROR_CHECK(err_code);
}

void amiibo_scene_amiibo_detail_on_exit(void *user_data) {
    ntag_emu_set_update_cb(NULL, NULL);
    app_timer_stop(m_amiibo_gen_delay_timer);
}
