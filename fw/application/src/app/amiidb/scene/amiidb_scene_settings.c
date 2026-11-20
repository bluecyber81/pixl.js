#include "amiibo_helper.h"
#include "amiidb_scene.h"
#include "app_amiidb.h"
#include "cwalk2.h"
#include "mui_icons.h"
#include "settings.h"
#include "nrf_log.h"

#include "i18n/language.h"

static bool settings_exit_saved;

static bool amiidb_scene_settings_prepare_exit(app_amiidb_t *app) {
    if (settings_save() != NRF_SUCCESS) {
        mui_toast_view_show(app->p_toast_view, _T(DE3_STORAGE_IO_ERROR));
        return false;
    }
    settings_exit_saved = true;
    return true;
}

static void amiidb_scene_settings_on_selected(mui_list_view_event_t event, mui_list_view_t *p_list_view,
                                              mui_list_item_t *p_item) {
    app_amiidb_t *app = p_list_view->user_data;

    switch (p_item->icon) {
    case ICON_EXIT:
        if (!amiidb_scene_settings_prepare_exit(app)) return;
        mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
        settings_exit_saved = false;
        break;

    case ICON_SLOT: {
        if (!amiidb_scene_settings_prepare_exit(app)) return;
        mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIDB_SCENE_SETTINGS_SLOT_NUM);
        settings_exit_saved = false;
    } break;

    case ICON_SETTINGS: {
        settings_data_t *p_settings = settings_get_data();
        SETTINGS_SET(amiidb_sort_column, (p_settings->amiidb_sort_column + 1) % 2);
        settings_exit_saved = false;
        char txt[32];
        sprintf(txt, "[%s]",(p_settings->amiidb_sort_column == AMIIDB_SORT_COLUMN_DEFAULT ? getLangString(_L_APP_AMIIDB_SORT_DEFAULT) : getLangString(_L_APP_AMIIDB_SORT_NAME)));
        mui_list_view_item_set_sub_text(p_item, txt);
    } break;
    }
}

void amiidb_scene_settings_on_enter(void *user_data) {
    app_amiidb_t *app = user_data;
    settings_exit_saved = false;

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
    if (!settings_exit_saved && settings_save() != NRF_SUCCESS)
        NRF_LOG_WARNING("AmiiboDB settings save failed on forced exit");
    settings_exit_saved = false;
    mui_list_view_set_selected_cb(app->p_list_view, NULL);
    mui_list_view_clear_items(app->p_list_view);
}
