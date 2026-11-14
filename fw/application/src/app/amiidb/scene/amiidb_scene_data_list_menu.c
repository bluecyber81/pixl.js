#include "amiibo_helper.h"
#include "amiidb_scene.h"
#include "app_amiidb.h"
#include "app_error.h"
#include "cwalk2.h"
#include "mui_list_view.h"
#include "nrf_log.h"
#include "settings.h"
#include "vfs.h"

#include "amiidb_api_slot.h"
#include "mui_icons.h"
#include "ntag_emu.h"
#include "ntag_store.h"

#include "db_header.h"
#include "i18n/language.h"
#include "mini_app_launcher.h"
#include "mini_app_registry.h"
#include <stdio.h>

static void amiidb_slot_delete_confirmed(mui_msg_box_event_t event, mui_msg_box_t *box) {
    app_amiidb_t *app = box->user_data;
    if (event == MUI_MSG_BOX_EVENT_SELECT_LEFT) {
        if (app->cur_slot_index < settings_get_data()->amiidb_data_slot_num &&
            amiidb_api_slot_remove(app->cur_slot_index) == VFS_OK) {
            mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
            return;
        }
        mui_toast_view_show(app->p_toast_view, _T(DE3_STORAGE_IO_ERROR));
    }
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIDB_VIEW_ID_LIST);
}

static void amiidb_scene_data_list_menu_on_selected(mui_list_view_event_t event, mui_list_view_t *p_list_view,
                                                    mui_list_item_t *p_item) {
    if (event != MUI_LIST_VIEW_EVENT_SELECTED) return;
    app_amiidb_t *app = p_list_view->user_data;
    switch (p_item->icon) {
    case ICON_EXIT:
        mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
        break;

    case ICON_DELETE: {
        char target[16];
        snprintf(target, sizeof(target), "Slot %02u?", (unsigned)app->cur_slot_index + 1);
        mui_msg_box_set_header(app->p_msg_box, _T(APP_AMIIDB_SLOT_DELETE));
        mui_msg_box_set_message(app->p_msg_box, target);
        mui_msg_box_set_btn_text(app->p_msg_box, _T(CONFIRM), NULL, _T(CANCEL));
        mui_msg_box_set_btn_focus(app->p_msg_box, MUI_MSG_BOX_EVENT_SELECT_RIGHT);
        mui_msg_box_set_event_cb(app->p_msg_box, amiidb_slot_delete_confirmed);
        mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIDB_VIEW_ID_MSG_BOX);
    } break;
    }
}

void amiidb_scene_data_list_menu_on_enter(void *user_data) {
    app_amiidb_t *app = user_data;
    mui_list_view_clear_items(app->p_list_view);
    mui_list_view_add_item(app->p_list_view, ICON_DELETE, getLangString(_L_APP_AMIIDB_SLOT_DELETE), (void *)0);
    mui_list_view_add_item(app->p_list_view, ICON_EXIT, getLangString(_L_APP_AMIIDB_BACK), (void *)0);

    mui_list_view_set_selected_cb(app->p_list_view, amiidb_scene_data_list_menu_on_selected);
    mui_list_view_set_user_data(app->p_list_view, app);

    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIDB_VIEW_ID_LIST);
}

void amiidb_scene_data_list_menu_on_exit(void *user_data) {
    app_amiidb_t *app = user_data;
    mui_list_view_set_selected_cb(app->p_list_view, NULL);
    mui_list_view_clear_items(app->p_list_view);
}
