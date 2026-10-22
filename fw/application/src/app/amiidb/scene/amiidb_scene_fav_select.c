#include "amiidb_scene_errors.h"
#include "amiibo_helper.h"
#include "amiidb_scene.h"
#include "app_amiidb.h"
#include "i18n/language.h"
#include "mui_icons.h"

static void amiidb_scene_fav_select_reload(app_amiidb_t *app);

static void amiidb_scene_fav_select_text_input_event_cb(mui_text_input_event_t event, mui_text_input_t *p_text_input) {
    app_amiidb_t *app = p_text_input->user_data;
    if (event == MUI_TEXT_INPUT_EVENT_CANCELLED ||
        (event == MUI_TEXT_INPUT_EVENT_CONFIRMED && !*mui_text_input_get_input_text(p_text_input))) {
        amiidb_scene_fav_select_reload(app);
        return;
    }
    if (event == MUI_TEXT_INPUT_EVENT_CONFIRMED) {
        const char *text = mui_text_input_get_input_text(p_text_input);
        if (strlen(text) > 0) {
            int32_t res = amiidb_api_fav_create_dir(text);
            if (res == VFS_OK) {
                amiidb_scene_fav_select_reload(app);
            } else {
                amiidb_fav_show_error(app, res);
            }
        }
    }
}

static void amiidb_scene_fav_select_list_view_on_selected(mui_list_view_event_t event, mui_list_view_t *p_list_view,
                                                          mui_list_item_t *p_item) {
    uint16_t icon = p_item->icon;
    app_amiidb_t *app = mui_list_view_get_user_data(p_list_view);

    switch (icon) {
    case ICON_EXIT:
        mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
        break;

    case ICON_NEW: {
        mui_text_input_set_max_length(app->p_text_input, AMIIDB_FAV_NEW_FOLDER_MAX_BYTES);
        mui_text_input_clear_input_text(app->p_text_input);
        mui_text_input_set_header(app->p_text_input, getLangString(_L_APP_AMIIDB_FAV_NEW_HEAD));
        mui_text_input_set_event_cb(app->p_text_input, amiidb_scene_fav_select_text_input_event_cb);
        mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIDB_VIEW_ID_INPUT);
    } break;

    case ICON_FOLDER: {
        uint8_t cur_game_id = app->prev_scene_id == AMIIDB_SCENE_AMIIBO_SEARCH ? app->search_game_id : app->game_id_path[app->game_id_index];
        const db_amiibo_t *p_amiibo = app->cur_amiibo;
        if (!p_amiibo) { amiidb_fav_show_error(app, VFS_ERR_FAIL); return; }
        amiidb_fav_t fav = {.game_id = cur_game_id, .amiibo_head = p_amiibo->head, .amiibo_tail = p_amiibo->tail};
        int res = amiidb_api_fav_add(string_get_cstr(p_item->text), &fav);
        if (res == VFS_OK) {
            mui_toast_view_show(app->p_toast_view, getLangString(_L_APP_AMIIDB_FAV_SUCCESS));
        } else {
            amiidb_fav_show_error(app, res);
        }
        mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIDB_SCENE_AMIIBO_DETAIL);
    } break;
    }
}

static void amiidb_scene_fav_select_read_cb(amiidb_fav_info_t *p_info, void *ctx) {
    app_amiidb_t *app = ctx;
    if (p_info->fav_type == FAV_TYPE_FOLDER) {
        mui_list_view_add_item(app->p_list_view, ICON_FOLDER, p_info->fav_data.folder_name, 0);
    }
}

static void amiidb_scene_fav_select_reload(app_amiidb_t *app) {
    // clear list view
    mui_list_view_clear_items(app->p_list_view);

    mui_list_view_add_item(app->p_list_view, ICON_NEW, getLangString(_L_APP_AMIIDB_NEW), (void *)0);

    int32_t result = amiidb_api_fav_list_dir("", amiidb_scene_fav_select_read_cb, app);
    if (result != VFS_OK) amiidb_fav_show_error(app, result);

    mui_list_view_add_item(app->p_list_view, ICON_EXIT, getLangString(_L_APP_AMIIDB_BACK), (void *)0);
    mui_list_view_set_selected_cb(app->p_list_view, amiidb_scene_fav_select_list_view_on_selected);
    mui_list_view_set_user_data(app->p_list_view, app);

    // no fav folder, first create one
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIDB_VIEW_ID_LIST);
}

void amiidb_scene_fav_select_on_enter(void *user_data) {
    app_amiidb_t *app = (app_amiidb_t *)user_data;
    amiidb_scene_fav_select_reload(app);
}

void amiidb_scene_fav_select_on_exit(void *user_data) {
    app_amiidb_t *app = (app_amiidb_t *)user_data;
    mui_list_view_clear_items(app->p_list_view);
}