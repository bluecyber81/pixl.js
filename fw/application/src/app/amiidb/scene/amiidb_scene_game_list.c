#include "amiibo_helper.h"
#include "amiidb_scene.h"
#include "app_amiidb.h"
#include "mui_list_view.h"
#include "nrf_log.h"

#include "db_header.h"
#include "mui_icons.h"
#include "settings.h"
#include "amiidb_api_db.h"
#include <math.h>

static void amiidb_scene_game_list_reload(app_amiidb_t *app);

static void amiidb_scene_game_list_list_view_on_selected(mui_list_view_event_t event, mui_list_view_t *p_list_view,
                                                         mui_list_item_t *p_item) {
    if (event != MUI_LIST_VIEW_EVENT_SELECTED) return;
    uint16_t icon = p_item->icon;
    app_amiidb_t *app = mui_list_view_get_user_data(p_list_view);
    switch (icon) {
    case ICON_EXIT:
        if (app->game_id_index <= 0) {
            mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIDB_SCENE_MAIN);
        } else {
            app->game_id_index--;
            app->game_page = app->game_page_path[app->game_id_index];
            amiidb_scene_game_list_reload(app);
            mui_list_view_set_focus(p_list_view, app->game_focus_path[app->game_id_index]);
            mui_list_view_set_scroll_offset(p_list_view, app->game_scroll_path[app->game_id_index]);
        }
        break;

    case ICON_FOLDER: {
        const db_game_t *p_game = p_item->user_data;
        if (!p_game || app->game_id_index + 1 >= sizeof(app->game_id_path) / sizeof(app->game_id_path[0])) {
            mui_toast_view_show(app->p_toast_view, _T(FAILED));
            break;
        }
        app->game_page_path[app->game_id_index] = app->game_page;
        app->game_focus_path[app->game_id_index] = mui_list_view_get_focus(p_list_view);
        app->game_scroll_path[app->game_id_index] = mui_list_view_get_scroll_offset(p_list_view);
        app->game_id_path[++app->game_id_index] = p_game->game_id;
        app->game_focus_path[app->game_id_index] = 0;
        app->game_scroll_path[app->game_id_index] = 0;
        app->game_page = 0;
        amiidb_scene_game_list_reload(app);
    } break;
    case ICON_PREV:
        if (app->game_page) app->game_page--;
        app->game_focus_path[app->game_id_index] = 0;
        app->game_scroll_path[app->game_id_index] = 0;
        amiidb_scene_game_list_reload(app);
        break;
    case ICON_NEXT:
        if ((uint32_t)(app->game_page + 1) * AMIIDB_RESULT_PAGE_SIZE < app->result_total) app->game_page++;
        app->game_focus_path[app->game_id_index] = 0;
        app->game_scroll_path[app->game_id_index] = 0;
        amiidb_scene_game_list_reload(app);
        break;

    case ICON_FILE: {
        const db_amiibo_t *p_amiibo = p_item->user_data;

        if (!p_amiibo) {
            mui_toast_view_show(app->p_toast_view, _T(FAILED));
        } else if(is_valid_amiibo_v3(p_amiibo->head, p_amiibo->tail)){
            mui_toast_view_show(app->p_toast_view, _T(APP_AMIIDB_NOT_SUPPORT_V3));
        }else{
            app->cur_amiibo = p_amiibo;
            app->game_focus_path[app->game_id_index] = mui_list_view_get_focus(p_list_view);
            app->game_scroll_path[app->game_id_index] = mui_list_view_get_scroll_offset(p_list_view);
            app->prev_scene_id = AMIIDB_SCENE_GAME_LIST;
            mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIDB_SCENE_AMIIBO_DETAIL);
        }
    } break;
    }
}

static void amiidb_scene_game_list_reload(app_amiidb_t *app) {
    char txt[128];
    const db_game_t *games[AMIIDB_RESULT_PAGE_SIZE];
    uint8_t game = app->game_id_path[app->game_id_index];
    uint16_t folders = 0, figures = 0;
    bool by_name = settings_get_data()->amiidb_sort_column == AMIIDB_SORT_COLUMN_NAME;
    /* Count before choosing the combined page. Folders remain first, sorted as
     * before; only one bounded page of folder names and figures reaches the UI. */
    amiidb_api_db_game_window(game, false, by_name, 0, 0, games, &folders);
    if (game) amiidb_api_db_search_window("", game, 0, 0, app->result_items, &figures);
    app->result_total = folders + figures;
    uint16_t last = app->result_total ? (app->result_total - 1) / AMIIDB_RESULT_PAGE_SIZE : 0;
    if (app->game_page > last) app->game_page = last;
    uint32_t offset = (uint32_t)app->game_page * AMIIDB_RESULT_PAGE_SIZE;
    int32_t count = amiidb_api_db_game_window(game, false, by_name, offset,
                                            AMIIDB_RESULT_PAGE_SIZE, games, &folders);
    mui_list_view_clear_items(app->p_list_view);
    for (int32_t i = 0; i < count; i++) {
        snprintf(txt, sizeof(txt), "%s (%d)", isChineseLanguage() ? games[i]->name_cn : games[i]->name_en,
                 games[i]->link_cnt);
        mui_list_view_add_item(app->p_list_view, ICON_FOLDER, txt, (void *)games[i]);
    }
    app->result_count = 0;
    if (game && count >= 0 && count < AMIIDB_RESULT_PAGE_SIZE) {
        int32_t found = amiidb_api_db_search_window("", game, offset > folders ? offset - folders : 0,
                            AMIIDB_RESULT_PAGE_SIZE - count, app->result_items, &figures);
        if (found < 0) count = -1;
        else app->result_count = found;
        for (uint16_t i = 0; i < app->result_count; i++)
            mui_list_view_add_item(app->p_list_view, ICON_FILE, get_amiibo_display_name(app->result_items[i]),
                                  (void *)app->result_items[i]);
    }
    if (count < 0) mui_list_view_add_item(app->p_list_view, ICON_ERROR, _T(DE3_SEARCH_ERROR), NULL);
    snprintf(txt, sizeof(txt), _T(DE3_SEARCH_PAGE), (unsigned)(app->game_page + 1),
             (unsigned)(last + 1), (unsigned)app->result_total);
    mui_list_view_add_item(app->p_list_view, ICON_PAGE, txt, NULL);
    if (app->game_page) mui_list_view_add_item(app->p_list_view, ICON_PREV, _T(DE3_PREVIOUS_PAGE), NULL);
    if (app->game_page < last) mui_list_view_add_item(app->p_list_view, ICON_NEXT, _T(DE3_NEXT_PAGE), NULL);
    mui_list_view_add_item(app->p_list_view, ICON_EXIT, getLangString(_L_APP_AMIIDB_BACK), NULL);
    mui_list_view_set_selected_cb(app->p_list_view, amiidb_scene_game_list_list_view_on_selected);
    mui_list_view_set_user_data(app->p_list_view, app);
    mui_list_view_set_focus(app->p_list_view, 0);
    mui_list_view_set_scroll_offset(app->p_list_view, 0);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIDB_VIEW_ID_LIST);
}

void amiidb_scene_game_list_on_enter(void *user_data) {
    app_amiidb_t *app = (app_amiidb_t *)user_data;
    amiidb_scene_game_list_reload(app);

    // restore states
    mui_list_view_set_focus(app->p_list_view, app->game_focus_path[app->game_id_index]);
    mui_list_view_set_scroll_offset(app->p_list_view, app->game_scroll_path[app->game_id_index]);
}

void amiidb_scene_game_list_on_exit(void *user_data) {
    app_amiidb_t *app = (app_amiidb_t *)user_data;
    mui_list_view_clear_items(app->p_list_view);
}
