#include "amiibo_helper.h"
#include "amiidb_api_slot.h"
#include "amiidb_scene.h"
#include "app_amiidb.h"
#include "i18n/language.h"
#include "mui_icons.h"
#include "settings.h"
#include <stdio.h>

void amiidb_scene_data_list_reload(app_amiidb_t *app);

static void save_to_slot(app_amiidb_t *app, uint8_t slot) {
    if (amiidb_api_slot_write(slot, &app->ntag) < 0) {
        mui_toast_view_show(app->p_toast_view, _T(APP_AMIIDB_SLOT_SAVE_FAILED));
        return;
    }
    mui_toast_view_show(app->p_toast_view, _T(APP_AMIIDB_SLOT_SAVE_SUCCESS));
    mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIDB_SCENE_AMIIBO_DETAIL);
}

static bool writable_slot(app_amiidb_t *app, uint16_t slot, amiidb_slot_info_t *info) {
    if (slot >= settings_get_data()->amiidb_data_slot_num || slot >= MAX_SLOT_COUNT ||
        amiidb_api_slot_info(slot, info) < 0) {
        mui_toast_view_show(app->p_toast_view, _T(DE3_STORAGE_IO_ERROR));
        return false;
    }
    if (info->is_readonly) {
        mui_toast_view_show(app->p_toast_view, _T(READ_ONLY));
        return false;
    }
    return true;
}

static void confirm_slot_replacement(mui_msg_box_event_t event, mui_msg_box_t *box) {
    app_amiidb_t *app = box->user_data;
    uint8_t slot = app->pending_save_slot;
    app->pending_save_slot = MAX_SLOT_COUNT;
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIDB_VIEW_ID_LIST);
    if (event == MUI_MSG_BOX_EVENT_SELECT_LEFT) {
        amiidb_slot_info_t info;
        if (writable_slot(app, slot, &info)) save_to_slot(app, slot);
    }
}

static void amiidb_scene_data_select_list_view_on_selected(mui_list_view_event_t event, mui_list_view_t *p_list_view,
                                                           mui_list_item_t *p_item) {
    if (event != MUI_LIST_VIEW_EVENT_SELECTED) return;
    app_amiidb_t *app = mui_list_view_get_user_data(p_list_view);
    if (p_item->icon == ICON_EXIT) {
        mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
        return;
    }
    if (p_item->icon != ICON_AMIIBO && p_item->icon != ICON_FILE) return;
    uint16_t slot = mui_list_view_get_focus(p_list_view);
    amiidb_slot_info_t info;
    if (!writable_slot(app, slot, &info)) return;
    if (info.is_empty) {
        save_to_slot(app, slot);
        return;
    }

    app->pending_save_slot = slot;
    char target[16];
    snprintf(target, sizeof(target), "Slot %02u", (unsigned)slot + 1);
    mui_msg_box_set_header(app->p_msg_box, _T(APP_AMIIDB_REPLACE_SLOT));
    mui_msg_box_set_message(app->p_msg_box, target);
    mui_msg_box_set_btn_text(app->p_msg_box, _T(CONFIRM), NULL, _T(CANCEL));
    mui_msg_box_set_btn_focus(app->p_msg_box, MUI_MSG_BOX_EVENT_SELECT_RIGHT);
    mui_msg_box_set_event_cb(app->p_msg_box, confirm_slot_replacement);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIDB_VIEW_ID_MSG_BOX);
}

static void amiidb_scene_data_select_setup(app_amiidb_t *app) {
    mui_list_view_set_selected_cb(app->p_list_view, amiidb_scene_data_select_list_view_on_selected);
    mui_list_view_set_user_data(app->p_list_view, app);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIDB_VIEW_ID_LIST);
}

void amiidb_scene_data_select_on_enter(void *user_data) {
    app_amiidb_t *app = (app_amiidb_t *)user_data;
    app->pending_save_slot = MAX_SLOT_COUNT;
    amiidb_scene_data_list_reload(app);
    amiidb_scene_data_select_setup(app);
}

void amiidb_scene_data_select_on_exit(void *user_data) {
    app_amiidb_t *app = (app_amiidb_t *)user_data;
    mui_list_view_clear_items(app->p_list_view);
}