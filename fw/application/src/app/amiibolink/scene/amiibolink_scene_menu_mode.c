#include "amiibolink_scene.h"
#include "app_amiibolink.h"

#include "mini_app_launcher.h"
#include "mini_app_registry.h"

#include "nrf_log.h"
#include "nrf_log_ctrl.h"
#include "i18n/language.h"
#include "settings.h"

#define ICON_MODE 0xe1ed
#define ICON_BACK 0xe069

static void amiibolink_scene_menu_mode_save_retry(mui_msg_box_event_t event, mui_msg_box_t *box) {
    app_amiibolink_t *app = box->user_data;
    if (event == MUI_MSG_BOX_EVENT_SELECT_LEFT) {
        /* Retry the pending mode without changing the user's selection. */
        if (settings_save() != NRF_SUCCESS) return;
        NRF_LOG_INFO("Saved amiibolink_mode: %d", app->amiibolink_mode);
        mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
    } else if (event == MUI_MSG_BOX_EVENT_SELECT_RIGHT) {
        /* Back dismisses the error; the unsaved RAM preference is retained. */
        mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIBOLINK_VIEW_ID_LIST);
    }
}

static void amiibolink_scene_menu_mode_save_error(app_amiibolink_t *app) {
    mui_msg_box_set_header(app->p_msg_box, _T(DE3_SAVE_FAILED));
    mui_msg_box_set_message(app->p_msg_box, _T(DE3_SAVE_RAM_ONLY));
    mui_msg_box_set_btn_text(app->p_msg_box, _T(APP_CHAMELEON_CARD_DATA_SAVE), NULL, _T(BACK));
    mui_msg_box_set_btn_focus(app->p_msg_box, 0);
    mui_msg_box_set_event_cb(app->p_msg_box, amiibolink_scene_menu_mode_save_retry);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIBOLINK_VIEW_ID_MSG_BOX);
}

void amiibolink_scene_menu_mode_on_event(mui_list_view_event_t event, mui_list_view_t *p_list_view,
                                         mui_list_item_t *p_item) {
    app_amiibolink_t *app = p_list_view->user_data;
    if (event == MUI_LIST_VIEW_EVENT_SELECTED) {
        if (p_item->icon == ICON_MODE) {
            app->amiibolink_mode = (ble_amiibolink_mode_t) p_item->user_data;
            // Save the user's preferred mode to settings
            SETTINGS_SET(amiibolink_mode, app->amiibolink_mode);
            if (settings_save() != NRF_SUCCESS) {
                amiibolink_scene_menu_mode_save_error(app);
                return;
            }
            NRF_LOG_INFO("Saved amiibolink_mode: %d", app->amiibolink_mode);
            mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
        } else if (p_item->icon == ICON_BACK) {
            mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
        }
    }
}

void amiibolink_scene_menu_mode_on_enter(void *user_data) {
    app_amiibolink_t *app = user_data;


    mui_list_view_add_item(app->p_list_view, ICON_MODE, getLangString(_L_RANDOM_MODE_MANUAL), (void *)BLE_AMIIBOLINK_MODE_RANDOM);
    mui_list_view_add_item(app->p_list_view, ICON_MODE, getLangString(_L_RANDOM_MODE_AUTO), (void *)BLE_AMIIBOLINK_MODE_RANDOM_AUTO_GEN);
    mui_list_view_add_item(app->p_list_view, ICON_MODE, getLangString(_L_SEQUENCE_MODE), (void *)BLE_AMIIBOLINK_MODE_CYCLE);
    mui_list_view_add_item(app->p_list_view, ICON_MODE, getLangString(_L_READ_WRITE_MODE), (void *)BLE_AMIIBOLINK_MODE_NTAG);

    mui_list_view_add_item(app->p_list_view, ICON_BACK, getLangString(_L_MAIN_RETURN), (void *)-1);

    mui_list_view_set_selected_cb(app->p_list_view, amiibolink_scene_menu_mode_on_event);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIBOLINK_VIEW_ID_LIST);
}

void amiibolink_scene_menu_mode_on_exit(void *user_data) {
    app_amiibolink_t *app = user_data;
    mui_list_view_clear_items(app->p_list_view);
}
