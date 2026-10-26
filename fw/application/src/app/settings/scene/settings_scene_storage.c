
#include "app_settings.h"
#include "mui_list_view.h"
#include "nrf_log.h"
#include "vfs.h"
#include <stdint.h>
#include <stdio.h>

#include "i18n/language.h"

#define ICON_HOME 0xe1f0

enum storage_list_menu_t { STORAGE_LIST_MENU_MOUNT, STORAGE_LIST_MENU_FORMAT, STORAGE_LIST_MENU_BACK };

void settings_scene_storage_on_enter(void *user_data);

static const char *storage_error_message(int32_t result) {
    switch (result) {
    case VFS_ERR_NOSPC: return getLangString(_L_DE3_STORAGE_FULL);
    case VFS_ERR_MAXNM: return getLangString(_L_DE3_PATH_TOO_LONG);
    case VFS_ERR_NODEV: return getLangString(_L_DE3_STORAGE_UNAVAILABLE);
    case VFS_ERR_CRPT: return getLangString(_L_DE3_STORAGE_CORRUPT);
    default: return getLangString(_L_DE3_STORAGE_IO_ERROR);
    }
}

/* Return to a refreshed storage list, without popping the settings scene stack. */
static void settings_scene_storage_result_cb(mui_msg_box_event_t event, mui_msg_box_t *p_msg_box) {
    if (event == MUI_MSG_BOX_EVENT_SELECT_CENTER) {
        settings_scene_storage_on_enter(p_msg_box->user_data);
    }
}

static void storage_show_result(app_settings_t *app, const char *message) {
    mui_msg_box_set_message(app->p_msg_box, message);
    mui_msg_box_set_btn_text(app->p_msg_box, NULL, getLangString(_L_BACK), NULL);
    mui_msg_box_set_btn_focus(app->p_msg_box, MUI_MSG_BOX_EVENT_SELECT_CENTER);
    mui_msg_box_set_event_cb(app->p_msg_box, settings_scene_storage_result_cb);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, SETTINGS_VIEW_ID_MSG_BOX);
}

static void storage_show_busy(app_settings_t *app) {
    /* No action callback while formatting/mounting, even for queued button events. */
    mui_msg_box_set_event_cb(app->p_msg_box, NULL);
    mui_msg_box_set_message(app->p_msg_box, getLangString(_L_DE3_STORAGE_WORKING));
    mui_msg_box_set_btn_text(app->p_msg_box, NULL, NULL, NULL);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, SETTINGS_VIEW_ID_MSG_BOX);
    mui_update_now(mui());
}

static void settings_scene_storage_msg_box_format_cb(mui_msg_box_event_t event, mui_msg_box_t *p_msg_box) {
    app_settings_t *app = p_msg_box->user_data;
    vfs_driver_t *p_driver = vfs_get_default_driver();
    if (event == MUI_MSG_BOX_EVENT_SELECT_LEFT) {
        storage_show_busy(app);
        settings_storage_snapshot_invalidate(&app->storage_snapshot);
        int32_t res = p_driver && p_driver->format ? p_driver->format() : VFS_ERR_NODEV;
        if (res == VFS_OK) {
            res = p_driver->mount ? p_driver->mount() : VFS_ERR_NODEV;
        }
        storage_show_result(app, res == VFS_OK ? getLangString(_L_DE3_STORAGE_FORMAT_DONE)
                                              : storage_error_message(res));
    } else if (event == MUI_MSG_BOX_EVENT_SELECT_RIGHT) {
        settings_scene_storage_on_enter(app);
    }
}

static void settings_scene_storage_on_selected(mui_list_view_event_t event, mui_list_view_t *p_list_view,
                                               mui_list_item_t *p_item) {
    app_settings_t *app = p_list_view->user_data;
    uintptr_t index = (uintptr_t)p_item->user_data;
    vfs_driver_t *p_driver = vfs_get_default_driver();
    switch (index) {

    case STORAGE_LIST_MENU_MOUNT: {
        mui_msg_box_set_header(app->p_msg_box, getLangString(_L_DE3_STORAGE_RETRY_MOUNT));
        storage_show_busy(app);
        settings_storage_snapshot_invalidate(&app->storage_snapshot);
        int32_t res = p_driver && p_driver->mount ? p_driver->mount() : VFS_ERR_NODEV;
        storage_show_result(app, res == VFS_OK ? getLangString(_L_DE3_STORAGE_MOUNT_DONE)
                                              : storage_error_message(res));
    } break;

    case STORAGE_LIST_MENU_FORMAT: {

        mui_msg_box_set_header(app->p_msg_box, getLangString(_L_FORMAT_STORAGE));
        mui_msg_box_set_message(app->p_msg_box, getLangString(_L_DELETE_ALL_DATA));
        mui_msg_box_set_btn_text(app->p_msg_box, getLangString(_L_CONFIRM), NULL, getLangString(_L_CANCEL));
        mui_msg_box_set_btn_focus(app->p_msg_box, 2);
        mui_msg_box_set_event_cb(app->p_msg_box, settings_scene_storage_msg_box_format_cb);

        mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, SETTINGS_VIEW_ID_MSG_BOX);
    } break;

    case STORAGE_LIST_MENU_BACK:
        mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
        break;
    }
}

void settings_scene_storage_on_enter(void *user_data) {
    app_settings_t *app = user_data;

    mui_msg_box_set_event_cb(app->p_msg_box, NULL);
    mui_list_view_clear_items(app->p_list_view);

    vfs_driver_t *p_driver = vfs_get_default_driver();
    vfs_stat_t stat = {0};
    /* The explicit storage page is the refresh point for the session snapshot. */
    settings_storage_snapshot_invalidate(&app->storage_snapshot);
    int32_t res = settings_storage_snapshot_read(&app->storage_snapshot, p_driver, &stat);
    char txt[64];
    if (res == VFS_OK) {
#ifdef VFS_LFS_ENABLE
#define mount_str getLangString(_L_MOUNTED_LFS)
#else
#define mount_str getLangString(_L_MOUNTED_FFS)
#endif
        mui_list_view_add_item(app->p_list_view, 0xe1ca, stat.avaliable ? mount_str : getLangString(_L_NOT_MOUNTED),
                               (void *)-1);
        if (stat.avaliable) {
            snprintf(txt, sizeof(txt), "[%lu kB]", (unsigned long)(stat.total_bytes / 1024));
            mui_list_view_add_item_ext(app->p_list_view, 0xe1cb, getLangString(_L_TOTAL_SPACE), txt, (void *)-1);
            snprintf(txt, sizeof(txt), "[%lu kB]", (unsigned long)(stat.free_bytes / 1024));
            mui_list_view_add_item_ext(app->p_list_view, 0xe1cc, getLangString(_L_AVAILABLE_SPACE), txt, (void *)-1);
            if (stat.free_bytes == 0) {
                mui_list_view_add_item(app->p_list_view, 0xe1ca, getLangString(_L_DE3_STORAGE_FULL), (void *)-1);
            }
        }
    } else {
        mui_list_view_add_item(app->p_list_view, 0xe1ca, storage_error_message(res), (void *)-1);
    }

    if ((res != VFS_OK || !stat.avaliable) && p_driver && p_driver->mount) {
        mui_list_view_add_item(app->p_list_view, 0xe1ca, getLangString(_L_DE3_STORAGE_RETRY_MOUNT),
                              (void *)STORAGE_LIST_MENU_MOUNT);
    }
    if (p_driver && p_driver->format) {
        mui_list_view_add_item(app->p_list_view, 0xe1cd, getLangString(_L_FORMAT), (void *)STORAGE_LIST_MENU_FORMAT);
    }

    mui_list_view_add_item(app->p_list_view, 0xe069, getLangString(_L_BACK), (void *)STORAGE_LIST_MENU_BACK);

    mui_list_view_set_selected_cb(app->p_list_view, settings_scene_storage_on_selected);

    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, SETTINGS_VIEW_ID_MAIN);
}

void settings_scene_storage_on_exit(void *user_data) {
    app_settings_t *app = user_data;
    mui_msg_box_set_event_cb(app->p_msg_box, NULL);
    mui_list_view_set_selected_cb(app->p_list_view, NULL);
    mui_list_view_clear_items(app->p_list_view);
}
