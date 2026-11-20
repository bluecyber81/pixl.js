#include "amiibo_helper.h"
#include "amiidb_scene.h"
#include "app_amiidb.h"
#include "cwalk2.h"
#include "mui_icons.h"
#include "settings.h"
#include "nrf_log.h"

#include "i18n/language.h"

static bool settings_exit_saved, settings_exit_discarded, settings_sort_pending;
static uint16_t settings_exit_target;
static settings_byte_checkpoint_t settings_sort_checkpoint;
static mui_list_item_t *settings_sort_item;

static void amiidb_scene_settings_save_error(app_amiidb_t *app);

static void amiidb_scene_settings_finish_exit(app_amiidb_t *app) {
    if (settings_exit_target == ICON_SLOT)
        mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIDB_SCENE_SETTINGS_SLOT_NUM);
    else
        mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
    settings_exit_saved = false;
    /* A foreign NFC guard may veto. A confirmed discard remains effective until
     * another sorting edit, so a later exit cannot reintroduce the save loop. */
}

static void amiidb_scene_settings_discard(mui_msg_box_event_t event, mui_msg_box_t *box) {
    app_amiidb_t *app = box->user_data;
    if (event == MUI_MSG_BOX_EVENT_SELECT_LEFT) {
        if (settings_sort_pending) {
            SETTINGS_DISCARD(amiidb_sort_column, &settings_sort_checkpoint);
            settings_sort_pending = false;
            if (settings_sort_item) {
                char txt[32];
                snprintf(txt, sizeof(txt), "[%s]", settings_get_data()->amiidb_sort_column == AMIIDB_SORT_COLUMN_DEFAULT
                    ? getLangString(_L_APP_AMIIDB_SORT_DEFAULT) : getLangString(_L_APP_AMIIDB_SORT_NAME));
                mui_list_view_item_set_sub_text(settings_sort_item, txt);
            }
        }
        settings_exit_discarded = true;
        mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIDB_VIEW_ID_LIST);
        amiidb_scene_settings_finish_exit(app);
    } else if (event == MUI_MSG_BOX_EVENT_SELECT_RIGHT) {
        amiidb_scene_settings_save_error(app);
    }
}

static void amiidb_scene_settings_save_retry(mui_msg_box_event_t event, mui_msg_box_t *box) {
    app_amiidb_t *app = box->user_data;
    if (event == MUI_MSG_BOX_EVENT_SELECT_LEFT) {
        if (settings_save() != NRF_SUCCESS) return;
        settings_sort_pending = false;
        settings_exit_saved = true;
        amiidb_scene_settings_finish_exit(app);
    } else if (event == MUI_MSG_BOX_EVENT_SELECT_CENTER) {
        mui_msg_box_set_header(box, _T(DE3_SAVE_FAILED));
        mui_msg_box_set_message(box, _T(DE3_SAVE_DISCARD_ASK));
        mui_msg_box_set_btn_text(box, _T(DE3_SAVE_YES_SHORT), NULL, _T(DE3_SAVE_NO_SHORT));
        mui_msg_box_set_btn_focus(box, 2);
        mui_msg_box_set_event_cb(box, amiidb_scene_settings_discard);
        mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIDB_VIEW_ID_MSG_BOX);
    } else if (event == MUI_MSG_BOX_EVENT_SELECT_RIGHT) {
        mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIDB_VIEW_ID_LIST);
    }
}

static void amiidb_scene_settings_save_error(app_amiidb_t *app) {
    mui_msg_box_set_header(app->p_msg_box, _T(DE3_SAVE_FAILED));
    mui_msg_box_set_message(app->p_msg_box, _T(DE3_SAVE_RAM_ONLY));
    mui_msg_box_set_btn_text(app->p_msg_box, _T(DE3_SAVE_RETRY_ACTION), _T(DE3_SAVE_DISCARD_ACTION), _T(BACK));
    mui_msg_box_set_btn_focus(app->p_msg_box, 2);
    mui_msg_box_set_event_cb(app->p_msg_box, amiidb_scene_settings_save_retry);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIDB_VIEW_ID_MSG_BOX);
}

static void amiidb_scene_settings_prepare_exit(app_amiidb_t *app) {
    if (!settings_exit_discarded) {
        if (settings_save() != NRF_SUCCESS) {
            amiidb_scene_settings_save_error(app);
            return;
        }
        settings_sort_pending = false;
        settings_exit_saved = true;
    }
    amiidb_scene_settings_finish_exit(app);
}

static void amiidb_scene_settings_on_selected(mui_list_view_event_t event, mui_list_view_t *p_list_view,
                                              mui_list_item_t *p_item) {
    app_amiidb_t *app = p_list_view->user_data;

    switch (p_item->icon) {
    case ICON_EXIT:
    case ICON_SLOT:
        settings_exit_target = p_item->icon;
        amiidb_scene_settings_prepare_exit(app);
        break;

    case ICON_SETTINGS: {
        settings_data_t *p_settings = settings_get_data();
        if (!settings_sort_pending) {
            SETTINGS_CHECKPOINT(amiidb_sort_column, &settings_sort_checkpoint);
            settings_sort_pending = true;
        }
        settings_sort_item = p_item;
        SETTINGS_SET(amiidb_sort_column, (p_settings->amiidb_sort_column + 1) % 2);
        settings_exit_saved = settings_exit_discarded = false;
        char txt[32];
        sprintf(txt, "[%s]",(p_settings->amiidb_sort_column == AMIIDB_SORT_COLUMN_DEFAULT ? getLangString(_L_APP_AMIIDB_SORT_DEFAULT) : getLangString(_L_APP_AMIIDB_SORT_NAME)));
        mui_list_view_item_set_sub_text(p_item, txt);
    } break;
    }
}

void amiidb_scene_settings_on_enter(void *user_data) {
    app_amiidb_t *app = user_data;
    settings_exit_saved = settings_exit_discarded = settings_sort_pending = false;
    settings_exit_target = ICON_EXIT;
    settings_sort_item = NULL;

    char txt[32];
    settings_data_t *p_settings = settings_get_data();
    mui_list_view_clear_items(app->p_list_view);

    sprintf(txt, "%s [%s]", getLangString(_L_APP_AMIIDB_SETTINGS_AMIIBO_KEY),
            (amiibo_helper_is_key_loaded() ? getLangString(_L_APP_AMIIDB_SETTINGS_AMIIBO_KEY_LOADED)
                                           : getLangString(_L_APP_AMIIDB_SETTINGS_AMIIBO_KEY_NOT_LOADED)));
    mui_list_view_add_item(app->p_list_view, ICON_KEY, txt, (void *)0);
    sprintf(txt, "%s [%d]", getLangString(_L_APP_AMIIDB_SETTINGS_SLOT_NUM), p_settings->amiidb_data_slot_num);
    mui_list_view_add_item(app->p_list_view, ICON_SLOT, txt, (void *)0);
    sprintf(txt, "[%s]",(p_settings->amiidb_sort_column == AMIIDB_SORT_COLUMN_DEFAULT ? getLangString(_L_APP_AMIIDB_SORT_DEFAULT) : getLangString(_L_APP_AMIIDB_SORT_NAME)));
    mui_list_view_add_item_ext(app->p_list_view, ICON_SETTINGS, getLangString(_L_APP_AMIIDB_SORT_FIELD), txt, (void *)0);
    mui_list_view_add_item(app->p_list_view, ICON_EXIT, getLangString(_L_APP_AMIIDB_BACK), (void *)0);

    mui_list_view_set_selected_cb(app->p_list_view, amiidb_scene_settings_on_selected);
    mui_list_view_set_user_data(app->p_list_view, app);

    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIDB_VIEW_ID_LIST);
}

void amiidb_scene_settings_on_exit(void *user_data) {
    app_amiidb_t *app = user_data;
    /* Normal navigation is saved before the dispatcher starts its void exit
     * callback. Forced exits cannot be vetoed here, but still report a failure. */
    if (!settings_exit_saved && !settings_exit_discarded && settings_save() != NRF_SUCCESS)
        NRF_LOG_WARNING("AmiiboDB settings save failed on forced exit");
    settings_exit_saved = settings_exit_discarded = settings_sort_pending = false;
    settings_sort_item = NULL;
    mui_list_view_set_selected_cb(app->p_list_view, NULL);
    mui_list_view_clear_items(app->p_list_view);
}
