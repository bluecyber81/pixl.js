#include "amiibo_helper.h"
#include "amiibo_scene.h"
#include "app_amiibo.h"
#include "app_error.h"
#include "cwalk2.h"
#include "mui_list_view.h"
#include "mui_alloc.h"
#include "nrf_log.h"
#include "settings.h"
#include "vfs.h"
#include "vfs_meta.h"
#include "vfs_persist.h"

#include "ntag_emu.h"
#include "ntag_store.h"

#include "db_header.h"
#include "i18n/language.h"
#include "mini_app_launcher.h"
#include "mini_app_registry.h"

enum amiibo_detail_menu_t {
    AMIIBO_DETAIL_MENU_FIGURE_INFO,
    AMIIBO_DETAIL_MENU_RAND_UID,
    AMIIBO_DETAIL_MENU_AUTO_RAND_UID,
    AMIIBO_DETAIL_MENU_READ_ONLY,
    AMIIBO_DETAIL_MENU_SET_CUSTOM_UID,
    AMIIBO_DETAIL_MENU_REMOVE_AMIIBO,
    AMIIBO_DETAIL_MENU_BACK_AMIIBO_DETAIL,
    AMIIBO_DETAIL_MENU_BACK_FILE_BROWSER,
    AMIIBO_DETAIL_MENU_BACK_MAIN_MENU,
};

static ret_code_t amiibo_scene_amiibo_detail_set_readonly(app_amiibo_t *app, bool readonly) {
    char path[VFS_MAX_PATH_LEN];
    vfs_meta_t meta;
    vfs_obj_t obj;
    uint8_t meta_buf[VFS_MAX_META_LEN];

    if (!cwalk_append_segment(path, string_get_cstr(app->current_folder), string_get_cstr(app->current_file))) {
        return NRF_ERROR_INVALID_PARAM;
    }

    vfs_driver_t *p_vfs_driver = vfs_get_driver(VFS_DRIVE_EXT);
    int32_t res = p_vfs_driver->stat_file(path, &obj);
    if (res < 0) {
        return -1;
    }

    memset(&meta, 0, sizeof(vfs_meta_t));
    vfs_meta_decode(obj.meta, sizeof(obj.meta), &meta);

    meta.has_flags = true;
    if (readonly) {
        meta.flags |= VFS_OBJ_FLAG_READONLY;
    } else {
        meta.flags &= ~VFS_OBJ_FLAG_READONLY;
    }

    vfs_meta_encode(meta_buf, sizeof(meta_buf), &meta);
    if (p_vfs_driver->update_file_meta(path, meta_buf, sizeof(meta_buf)) == VFS_OK) {
        return NRF_SUCCESS;
    } else {
        return -1;
    }
}

static void amiibo_scene_amiibo_detail_menu_msg_box_no_key_cb(mui_msg_box_event_t event, mui_msg_box_t *p_msg_box) {
    app_amiibo_t *app = p_msg_box->user_data;
    if (event == MUI_MSG_BOX_EVENT_SELECT_CENTER) {
        mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
    }
}

static void amiibo_scene_amiibo_detail_no_key_msg(app_amiibo_t *app) {
    mui_msg_box_set_header(app->p_msg_box, getLangString(_L_AMIIBO_KEY_UNLOADED));
    mui_msg_box_set_message(app->p_msg_box, getLangString(_L_UPLOAD_KEY_RETAIL_BIN));
    mui_msg_box_set_btn_text(app->p_msg_box, NULL, getLangString(_L_KNOW), NULL);
    mui_msg_box_set_btn_focus(app->p_msg_box, 1);
    mui_msg_box_set_event_cb(app->p_msg_box, amiibo_scene_amiibo_detail_menu_msg_box_no_key_cb);

    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIBO_VIEW_ID_MSG_BOX);
}

static void amiibo_scene_amiibo_detail_delete_tag_confirmed(mui_msg_box_event_t event, mui_msg_box_t *p_msg_box) {
    char path[VFS_MAX_PATH_LEN];
    app_amiibo_t *app = p_msg_box->user_data;

    if (event == MUI_MSG_BOX_EVENT_SELECT_LEFT) {

        vfs_driver_t *p_vfs_driver = vfs_get_driver(app->current_drive);
        if (!cwalk_append_segment(path, string_get_cstr(app->current_folder), string_get_cstr(app->current_file))) {
            mui_toast_view_show(app->p_toast_view, _T(FAILED));
            return;
        }
        int res = p_vfs_driver ? p_vfs_driver->remove_file(path) : VFS_ERR_NODEV;
        if (res != VFS_OK) {
            mui_toast_view_show(app->p_toast_view, _T(FAILED));
            return;
        }

        char next[VFS_MAX_NAME_LEN];
        uint16_t focus, total;
        /* The removed name is still our anchor; prefer the previous tag,
         * or the first successor when the first tag was deleted. */
        int8_t direction = amiibo_detail_view_get_focus(app->p_amiibo_detail_view) ? -1 : 1;
        int32_t scan = app_amiibo_file_neighbor(app, direction, next, &focus, &total);
        bool reload = scan == VFS_OK && total;
        if (reload && !mui_string_try_set_str(app->current_file, next)) {
            mui_show_memory_error(mui());
            return;
        }
        if (reload) {
            app->reload_amiibo_files = true;
            mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
        } else {
            string_reset(app->current_file);
            mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIBO_SCENE_FILE_BROWSER);
        }
    } else {
        mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
    }
}

static bool amiibo_scene_parse_uid(const char *text, uint8_t uid[7]) {
    if (!text || !uid || strlen(text) != 20) return false;
    uint8_t parsed[7] = {0};
    for (size_t i = 0; i < 7; i++) {
        if (i < 6 && text[i * 3 + 2] != '.') return false;
        for (size_t j = 0; j < 2; j++) {
            char c = text[i * 3 + j];
            uint8_t value;
            if (c >= '0' && c <= '9') value = c - '0';
            else if (c >= 'a' && c <= 'f') value = c - 'a' + 10;
            else if (c >= 'A' && c <= 'F') value = c - 'A' + 10;
            else return false;
            parsed[i] = (parsed[i] << 4) | value;
        }
    }
    memcpy(uid, parsed, sizeof(parsed));
    return true;
}

static void amiibo_scene_amiibo_detail_menu_text_input_set_id_event_cb(mui_text_input_event_t event,
                                                                       mui_text_input_t *p_text_input) {
    app_amiibo_t *app = p_text_input->user_data;
    const char *input_text = mui_text_input_get_input_text(p_text_input);
    if (event == MUI_TEXT_INPUT_EVENT_CONFIRMED && strlen(input_text) > 0) {

        uint8_t uid[7];
        ret_code_t err_code;
        char path[VFS_MAX_PATH_LEN];

        ntag_t *ntag = &app->ntag;

        if (!cwalk_append_segment(path, string_get_cstr(app->current_folder), string_get_cstr(app->current_file))) {
            mui_toast_view_show(app->p_toast_view, _T(FAILED));
            return;
        }

        // read uid from input
        if (!amiibo_scene_parse_uid(input_text, uid)) {
            mui_toast_view_show(app->p_toast_view, _T(INAVLID_ID));
            return;
        }

        // same uid as current tag
        uint8_t cur_uid[7];
        ntag_store_get_uuid(ntag, cur_uid);
        if (memcmp(cur_uid, uid, 7) == 0) {
            mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
            return;
        }

        // Validate the original file before preparing a changed copy.
        vfs_driver_t *p_driver = vfs_get_driver(app->current_drive);
        vfs_obj_t obj;
        if (!p_driver || p_driver->stat_file(path, &obj) != VFS_OK || obj.type != VFS_TYPE_REG ||
            !is_valid_amiibo_ntag_by_size(obj.size) || _ntag_type(obj.size) != ntag->type) {
            mui_toast_view_show(app->p_toast_view, _T(FAILED));
            return;
        }

        ntag_t *updated = mui_mem_malloc(sizeof(ntag_t));
        if (!updated) {
            mui_toast_view_show(app->p_toast_view, _T(FAILED));
            return;
        }
        memcpy(updated, ntag, sizeof(ntag_t));
        err_code = amiibo_helper_set_amiibo_uuid(updated, uid);
        if (err_code != NRF_SUCCESS) {
            mui_mem_free(updated);
            mui_toast_view_show(app->p_toast_view, _T(FAILED));
            return;
        }

        int32_t res = vfs_persist_write(p_driver, path, updated->data, obj.size);
        if (res != (int32_t)obj.size) {
            mui_mem_free(updated);
            mui_toast_view_show(app->p_toast_view, _T(FAILED));
            return;
        }

        // Commit RAM and NFC state only after the complete write succeeds.
        memcpy(ntag, updated, sizeof(ntag_t));
        mui_mem_free(updated);
        ntag_emu_set_tag(&app->ntag);

        mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
    } else {
        mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
    }
}

static void amiibo_scene_figure_info_back(amiibo_detail_view_event_t event, amiibo_detail_view_t *view) {
    if (event != AMIIBO_DETAIL_VIEW_EVENT_MENU) return;
    app_amiibo_t *app = view->user_data;
    view->info_page = 0;
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIBO_VIEW_ID_LIST);
}

static void amiibo_scene_amiibo_detail_menu_on_selected(mui_list_view_event_t event, mui_list_view_t *p_list_view,
                                                        mui_list_item_t *p_item) {
    app_amiibo_t *app = p_list_view->user_data;

    uint32_t selection = (uint32_t)p_item->user_data;
    char msg[VFS_MAX_PATH_LEN + 64];

    switch (selection) {
    case AMIIBO_DETAIL_MENU_FIGURE_INFO:
        app->p_amiibo_detail_view->info_page = 1;
        amiibo_detail_view_set_event_cb(app->p_amiibo_detail_view, amiibo_scene_figure_info_back);
        mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIBO_VIEW_ID_DETAIL);
        break;
    case AMIIBO_DETAIL_MENU_BACK_FILE_BROWSER:
        mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIBO_SCENE_FILE_BROWSER);
        break;
    case AMIIBO_DETAIL_MENU_RAND_UID: {
        ret_code_t err_code;
        ntag_t *ntag_current = &app->ntag;
        uint32_t head = to_little_endian_int32(&ntag_current->data[84]);
        uint32_t tail = to_little_endian_int32(&ntag_current->data[88]);

        const db_amiibo_t *amd = get_amiibo_by_id(head, tail);
        if (amd == NULL) {
            NRF_LOG_WARNING("amiibo not found:[%08x:%08x]", head, tail);
            return;
        }

        if (!amiibo_helper_is_key_loaded()) {
            amiibo_scene_amiibo_detail_no_key_msg(app);
            return;
        }

        err_code = amiibo_helper_rand_amiibo_uuid(ntag_current);
        APP_ERROR_CHECK(err_code);
        if (err_code == NRF_SUCCESS) {
            ntag_emu_set_tag(&app->ntag);
            mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
        }

        break;
    }

    case AMIIBO_DETAIL_MENU_BACK_AMIIBO_DETAIL: {
        mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
        break;
    }

    case AMIIBO_DETAIL_MENU_AUTO_RAND_UID: {
        if (!amiibo_helper_is_key_loaded()) {
            amiibo_scene_amiibo_detail_no_key_msg(app);
            return;
        }
        settings_data_t *p_settings = settings_get_data();
        p_settings->auto_gen_amiibo = !p_settings->auto_gen_amiibo;
        settings_save();

        mui_list_view_item_set_sub_text(
            p_item, (p_settings->auto_gen_amiibo ? getLangString(_L_ON_F) : getLangString(_L_OFF_F)));
    } break;

    case AMIIBO_DETAIL_MENU_SET_CUSTOM_UID: {
        char id_text[32];
        uint8_t id[7];
        ntag_t *ntag = &app->ntag;

        if (!amiibo_helper_is_key_loaded()) {
            amiibo_scene_amiibo_detail_no_key_msg(app);
            return;
        }

        ntag_store_get_uuid(ntag, id);

        sprintf(id_text, "%02x.%02x.%02x.%02x.%02x.%02x.%02x", id[0], id[1], id[2], id[3], id[4], id[5], id[6]);

        mui_text_input_set_header(app->p_text_input, getLangString(_L_INPUT_ID));
        mui_text_input_set_input_text(app->p_text_input, id_text);
        mui_text_input_set_event_cb(app->p_text_input, amiibo_scene_amiibo_detail_menu_text_input_set_id_event_cb);

        mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIBO_VIEW_ID_INPUT);
    } break;

    case AMIIBO_DETAIL_MENU_READ_ONLY: {
        ret_code_t err_code = amiibo_scene_amiibo_detail_set_readonly(app, !app->ntag.read_only);
        if (err_code == NRF_SUCCESS) {
            app->ntag.read_only = !app->ntag.read_only;
            ntag_emu_set_tag(&app->ntag);
            mui_list_view_item_set_sub_text(p_item,
                                            app->ntag.read_only ? getLangString(_L_ON_F) : getLangString(_L_OFF_F));
        }
    } break;

    case AMIIBO_DETAIL_MENU_REMOVE_AMIIBO: {
        mui_msg_box_set_header(app->p_msg_box, _T(DELETE_TAG));
        snprintf(msg, sizeof(msg), _T(DELETE_TAG_CONFIRM), string_get_cstr(app->current_file));
        mui_msg_box_set_message(app->p_msg_box, msg);
        mui_msg_box_set_btn_text(app->p_msg_box, _T(CONFIRM), NULL, _T(CANCEL));
        mui_msg_box_set_btn_focus(app->p_msg_box, 2);
        mui_msg_box_set_event_cb(app->p_msg_box, amiibo_scene_amiibo_detail_delete_tag_confirmed);

        mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIBO_VIEW_ID_MSG_BOX);
        break;
    }

    case AMIIBO_DETAIL_MENU_BACK_MAIN_MENU:
        mini_app_launcher_kill(mini_app_launcher(), MINI_APP_ID_AMIIBO);
        break;
    }
}

void amiibo_scene_amiibo_detail_menu_on_enter(void *user_data) {
    app_amiibo_t *app = user_data;

    mui_list_view_add_item(app->p_list_view, 0xe0ae, _T(DE3_FIGURE_INFO),
                           (void *)AMIIBO_DETAIL_MENU_FIGURE_INFO);

    mui_list_view_add_item(app->p_list_view, 0xe1c5, getLangString(_L_RANDOM_GENERATION),
                           (void *)AMIIBO_DETAIL_MENU_RAND_UID);
    settings_data_t *p_settings = settings_get_data();

    mui_list_view_add_item_ext(app->p_list_view, 0xe1c6, getLangString(_L_AUTO_RANDOM_GENERATION),
                               (p_settings->auto_gen_amiibo ? getLangString(_L_ON_F) : getLangString(_L_OFF_F)),
                               (void *)AMIIBO_DETAIL_MENU_AUTO_RAND_UID);

    mui_list_view_add_item(app->p_list_view, 0xe1c8, getLangString(_L_SET_CUSTOM_ID),
                           (void *)AMIIBO_DETAIL_MENU_SET_CUSTOM_UID);

    mui_list_view_add_item_ext(app->p_list_view, 0xe007, getLangString(_L_READ_ONLY),
                               app->ntag.read_only ? getLangString(_L_ON_F) : getLangString(_L_OFF_F),
                               (void *)AMIIBO_DETAIL_MENU_READ_ONLY);

    mui_list_view_add_item(app->p_list_view, 0xe1c7, getLangString(_L_DELETE_TAG),
                           (void *)AMIIBO_DETAIL_MENU_REMOVE_AMIIBO);
    mui_list_view_add_item(app->p_list_view, 0xe068, getLangString(_L_BACK_TO_DETAILS),
                           (void *)AMIIBO_DETAIL_MENU_BACK_AMIIBO_DETAIL);
    mui_list_view_add_item(app->p_list_view, 0xe069, getLangString(_L_BACK_TO_FILE_LIST),
                           (void *)AMIIBO_DETAIL_MENU_BACK_FILE_BROWSER);
    mui_list_view_add_item(app->p_list_view, 0xe1c8, getLangString(_L_BACK_TO_MAIN_MENU),
                           (void *)AMIIBO_DETAIL_MENU_BACK_MAIN_MENU);

    mui_list_view_set_selected_cb(app->p_list_view, amiibo_scene_amiibo_detail_menu_on_selected);
    mui_list_view_set_user_data(app->p_list_view, app);

    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIBO_VIEW_ID_LIST);
}

void amiibo_scene_amiibo_detail_menu_on_exit(void *user_data) {
    app_amiibo_t *app = user_data;
    app->p_amiibo_detail_view->info_page = 0;
    amiibo_detail_view_set_event_cb(app->p_amiibo_detail_view, NULL);
    mui_list_view_set_selected_cb(app->p_list_view, NULL);
    mui_list_view_set_user_data(app->p_list_view, NULL);
    mui_list_view_clear_items(app->p_list_view);
}
