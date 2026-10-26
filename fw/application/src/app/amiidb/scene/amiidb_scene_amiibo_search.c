#include "amiidb_scene.h"
#include "app_amiidb.h"
#include "amiidb_api_db.h"
#include "mui_icons.h"
#include "i18n/language.h"
#include <stdio.h>

static void amiidb_scene_amiibo_search_reload(app_amiidb_t *app);
static void search_filter_reload(app_amiidb_t *app);

static void search_input_cb(mui_text_input_event_t event, mui_text_input_t *input) {
    app_amiidb_t *app = input->user_data;
    if (event == MUI_TEXT_INPUT_EVENT_CONFIRMED) {
        const char *query = mui_text_input_get_input_text(input);
        if (strlen(query) > AMIIDB_SEARCH_MAX_BYTES) {
            mui_toast_view_show(app->p_toast_view, _T(DE3_SEARCH_ERROR));
            return;
        }
        string_set_str(app->search_str, query);
        app->search_page = 0;
    }
    amiidb_scene_amiibo_search_reload(app);
}

static void search_selected(mui_list_view_event_t event, mui_list_view_t *view, mui_list_item_t *item) {
    if (event != MUI_LIST_VIEW_EVENT_SELECTED) return;
    app_amiidb_t *app = mui_list_view_get_user_data(view);
    if (app->search_filter_select) {
        if (item->icon == ICON_PREV || item->icon == ICON_NEXT) {
            if (item->icon == ICON_PREV && app->search_filter_page) app->search_filter_page--;
            if (item->icon == ICON_NEXT && (uint32_t)(app->search_filter_page + 1) * AMIIDB_RESULT_PAGE_SIZE < app->result_total)
                app->search_filter_page++;
            search_filter_reload(app);
            return;
        }
        if (item->icon == ICON_FOLDER) {
            const db_game_t *game = item->user_data;
            app->search_game_id = game ? game->game_id : 0;
            app->search_page = 0;
        } else if (item->icon != ICON_EXIT) return;
        app->search_filter_select = false;
        amiidb_scene_amiibo_search_reload(app);
        return;
    }
    switch (item->icon) {
    case ICON_EXIT:
        mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIDB_SCENE_MAIN);
        break;
    case ICON_SEARCH:
        mui_text_input_set_max_length(app->p_text_input, AMIIDB_SEARCH_MAX_BYTES);
        mui_text_input_set_input_text(app->p_text_input, string_get_cstr(app->search_str));
        mui_text_input_set_header(app->p_text_input, _T(DE3_SEARCH_QUERY));
        mui_text_input_set_event_cb(app->p_text_input, search_input_cb);
        mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIDB_VIEW_ID_INPUT);
        break;
    case ICON_SETTINGS:
        app->search_filter_select = true;
        app->search_filter_page = 0;
        search_filter_reload(app);
        break;
    case ICON_PREV:
        if (app->search_page) app->search_page--;
        amiidb_scene_amiibo_search_reload(app);
        break;
    case ICON_NEXT:
        if ((uint32_t)(app->search_page + 1) * AMIIDB_RESULT_PAGE_SIZE < app->result_total) app->search_page++;
        amiidb_scene_amiibo_search_reload(app);
        break;
    case ICON_FILE:
        app->cur_amiibo = item->user_data;
        app->cur_focus_index = mui_list_view_get_focus(view);
        app->cur_scroll_offset = mui_list_view_get_scroll_offset(view);
        app->search_restore_focus = true;
        app->prev_scene_id = AMIIDB_SCENE_AMIIBO_SEARCH;
        mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIDB_SCENE_AMIIBO_DETAIL);
        break;
    }
}

static void search_list_ready(app_amiidb_t *app) {
    mui_list_view_add_item(app->p_list_view, ICON_EXIT, _T(APP_AMIIDB_BACK), NULL);
    mui_list_view_set_selected_cb(app->p_list_view, search_selected);
    mui_list_view_set_user_data(app->p_list_view, app);
    mui_list_view_set_focus(app->p_list_view, 0);
    mui_list_view_set_scroll_offset(app->p_list_view, 0);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIDB_VIEW_ID_LIST);
}

static void search_filter_reload(app_amiidb_t *app) {
    const db_game_t *games[AMIIDB_RESULT_PAGE_SIZE];
    char text[96];
    amiidb_api_db_game_window(0, true, true, 0, 0, games, &app->result_total);
    uint16_t last = app->result_total ? (app->result_total - 1) / AMIIDB_RESULT_PAGE_SIZE : 0;
    if (app->search_filter_page > last) app->search_filter_page = last;
    int32_t count = amiidb_api_db_game_window(0, true, true,
        (uint32_t)app->search_filter_page * AMIIDB_RESULT_PAGE_SIZE,
        AMIIDB_RESULT_PAGE_SIZE, games, &app->result_total);
    mui_list_view_clear_items(app->p_list_view);
    for (int32_t i = 0; i < count; i++)
        mui_list_view_add_item(app->p_list_view, ICON_FOLDER,
                              isChineseLanguage() ? games[i]->name_cn : games[i]->name_en, (void *)games[i]);
    mui_list_view_add_item(app->p_list_view, ICON_FOLDER, _T(DE3_SEARCH_ALL), NULL);
    snprintf(text, sizeof(text), _T(DE3_SEARCH_PAGE), (unsigned)(app->search_filter_page + 1),
             (unsigned)(last + 1), (unsigned)app->result_total);
    mui_list_view_add_item(app->p_list_view, ICON_PAGE, text, NULL);
    if (app->search_filter_page) mui_list_view_add_item(app->p_list_view, ICON_PREV, _T(DE3_PREVIOUS_PAGE), NULL);
    if (app->search_filter_page < last) mui_list_view_add_item(app->p_list_view, ICON_NEXT, _T(DE3_NEXT_PAGE), NULL);
    search_list_ready(app);
}

static void amiidb_scene_amiibo_search_reload(app_amiidb_t *app) {
    char text[128];
    mui_list_view_clear_items(app->p_list_view);
    int32_t count = amiidb_api_db_search_page(string_get_cstr(app->search_str), app->search_game_id,
                                             app->search_page, app->result_items, &app->result_total);
    app->result_count = count > 0 ? count : 0;
    if (app->result_total) {
        uint16_t last = (app->result_total - 1) / AMIIDB_RESULT_PAGE_SIZE;
        if (app->search_page > last) app->search_page = last;
    } else app->search_page = 0;
    snprintf(text, sizeof(text), "%s: %s", _T(APP_AMIIDB_SEARCH_HEAD), string_get_cstr(app->search_str));
    mui_list_view_add_item(app->p_list_view, ICON_SEARCH, text, NULL);
    const char *game_name = _T(DE3_SEARCH_ALL);
    for (const db_game_t *game = game_list; game->game_id; game++)
        if (game->game_id == app->search_game_id) game_name = isChineseLanguage() ? game->name_cn : game->name_en;
    snprintf(text, sizeof(text), "%s: %s", _T(DE3_SEARCH_GAME), game_name);
    mui_list_view_add_item(app->p_list_view, ICON_SETTINGS, text, NULL);
    snprintf(text, sizeof(text), _T(DE3_SEARCH_PAGE), (unsigned)(app->search_page + 1),
             (unsigned)(app->result_total ? (app->result_total - 1) / AMIIDB_RESULT_PAGE_SIZE + 1 : 1),
             (unsigned)app->result_total);
    mui_list_view_add_item(app->p_list_view, ICON_PAGE, text, NULL);
    for (uint16_t i = 0; i < app->result_count; i++)
        mui_list_view_add_item(app->p_list_view, ICON_FILE, get_amiibo_display_name(app->result_items[i]),
                              (void *)app->result_items[i]);
    if (count <= 0) mui_list_view_add_item(app->p_list_view, ICON_ERROR,
                                         count < 0 ? _T(DE3_SEARCH_ERROR) : _T(DE3_SEARCH_EMPTY), NULL);
    if (app->search_page) mui_list_view_add_item(app->p_list_view, ICON_PREV, _T(DE3_PREVIOUS_PAGE), NULL);
    if ((uint32_t)(app->search_page + 1) * AMIIDB_RESULT_PAGE_SIZE < app->result_total)
        mui_list_view_add_item(app->p_list_view, ICON_NEXT, _T(DE3_NEXT_PAGE), NULL);
    search_list_ready(app);
}

void amiidb_scene_amiibo_search_on_enter(void *user_data) {
    app_amiidb_t *app = user_data;
    app->search_filter_select = false;
    amiidb_scene_amiibo_search_reload(app);
    if (app->search_restore_focus) {
        mui_list_view_set_focus(app->p_list_view, app->cur_focus_index);
        mui_list_view_set_scroll_offset(app->p_list_view, app->cur_scroll_offset);
        app->search_restore_focus = false;
    }
}

void amiidb_scene_amiibo_search_on_exit(void *user_data) {
    app_amiidb_t *app = user_data;
    mui_list_view_clear_items(app->p_list_view);
}
