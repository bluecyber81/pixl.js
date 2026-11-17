#include "app_game.h"
#include "game_scene.h"
#include "game_view.h"
#include "vfs.h"
#include "vfs_meta.h"

#include "mini_app_launcher.h"
#include "mini_app_registry.h"

#include "nrf_log.h"
#include "nrf_log_ctrl.h"

#include "tiny_arkanoid.h"
#include "tiny_invaders.h"
#include "tiny_lander.h"
#include "tiny_tris.h"
#include "i18n/language.h"

#define ICON_FOLDER 0xe1d6
#define ICON_FILE 0xe1ed
#define ICON_BACK 0xe069
#define ICON_ERROR 0xe1bb
#define ICON_HOME 0xe1f0
#define ICON_HELP 0xe0ae

static void game_scene_game_list_on_selected(mui_list_view_event_t event, mui_list_view_t *p_list_view,
                                             mui_list_item_t *p_item) {
    app_game_t *app = p_list_view->user_data;
    if (event == MUI_LIST_VIEW_EVENT_SELECTED) {
        if (p_item->icon == ICON_FILE) {
            game_view_set_game_run(app->p_game_view, p_item->user_data);
            mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, GAME_SCENE_PLAY);
        } else if (p_item->icon == ICON_HELP) {
            mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, GAME_SCENE_CONTROLS);
        } else {
            mini_app_launcher_kill(mini_app_launcher(), MINI_APP_ID_GAME);
        }
    } else {
    }
}

static int game_scene_game_list_list_item_cmp(const mui_list_item_t *p_item_a, const mui_list_item_t *p_item_b) {
    if (p_item_a->icon != p_item_b->icon) {
        return p_item_a->icon - p_item_b->icon;
    } else {
        return string_cmp(p_item_a->text, p_item_b->text);
    }
}

static void game_scene_game_list_reload_folders(app_game_t *app) {
    mui_list_view_clear_items(app->p_list_view);
    mui_list_view_add_item(app->p_list_view, ICON_HOME, _T(MAIN_MENU), (void *)-1);
    mui_list_view_add_item(app->p_list_view, ICON_FILE, _T(APP_GAME_TINY_LANDER), tiny_lander_run);
    mui_list_view_add_item(app->p_list_view, ICON_FILE, _T(APP_GAME_TINY_INVADERS) , tiny_invaders_run);
    mui_list_view_add_item(app->p_list_view, ICON_FILE, _T(APP_GAME_TINY_ARKANOID), tiny_arkanoid_run);
    mui_list_view_add_item(app->p_list_view, ICON_FILE, _T(APP_GAME_TINY_TRIS), tiny_tris_run);
    mui_list_view_add_item(app->p_list_view, ICON_HELP, getLanguage() == LANGUAGE_DE_DE ? "Spielsteuerung" : "Game controls", NULL);
}

void game_scene_game_list_on_enter(void *user_data) {
    app_game_t *app = user_data;
    game_scene_game_list_reload_folders(app);
    mui_list_view_set_selected_cb(app->p_list_view, game_scene_game_list_on_selected);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, GAME_VIEW_ID_LIST);
}

void game_scene_game_list_on_exit(void *user_data) { app_game_t *app = user_data; }

static void game_controls_back(mui_list_view_event_t event, mui_list_view_t *list, mui_list_item_t *item) {
    (void)event;
    (void)item;
    app_game_t *app = list->user_data;
    mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
}

void game_scene_controls_on_enter(void *user_data) {
    app_game_t *app = user_data;
    mui_list_view_t *list = app->p_list_view;
    bool de = getLanguage() == LANGUAGE_DE_DE;
    mui_list_view_clear_items(list);
    mui_list_view_add_item(list, ICON_BACK, _T(BACK), NULL);
    mui_list_view_add_item_ext(list, ICON_HELP, de ? "Seitentasten" : "Side keys", de ? "Steuern" : "Steer", NULL);
    mui_list_view_add_item_ext(list, ICON_HELP, de ? "Mitte halten" : "Hold center", de ? "Beenden" : "Exit", NULL);
    mui_list_view_add_item(list, ICON_HELP, de ? "Mitte im Spiel" : "Center in game", NULL);
    mui_list_view_add_item_ext(list, ICON_FILE, "Lander", de ? "Schub" : "Thrust", NULL);
    mui_list_view_add_item_ext(list, ICON_FILE, "Invaders", de ? "Feuern" : "Fire", NULL);
    mui_list_view_add_item_ext(list, ICON_FILE, "Arkanoid", de ? "Ball starten" : "Launch ball", NULL);
    mui_list_view_add_item_ext(list, ICON_FILE, "Tris", de ? "Drehen" : "Rotate", NULL);
    mui_list_view_set_selected_cb(list, game_controls_back);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, GAME_VIEW_ID_LIST);
}

void game_scene_controls_on_exit(void *user_data) { (void)user_data; }
