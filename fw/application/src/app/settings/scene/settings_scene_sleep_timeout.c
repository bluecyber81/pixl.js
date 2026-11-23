#include "app_settings.h"
#include "mini_app_launcher.h"
#include "ble_main.h"
#include "settings.h"
#include "settings_scene.h"
#include "utils2.h"
#include "version2.h"
#include "i18n/language.h"

enum settings_sleep_timeout_menu_t {
    SETTINGS_SLEEP_TIMEOUT_MENU_OFF,
    SETTINGS_SLEEP_TIMEOUT_MENU_15S,
    SETTINGS_SLEEP_TIMEOUT_MENU_30S,
    SETTINGS_SLEEP_TIMEOUT_MENU_45S,
    SETTINGS_SLEEP_TIMEOUT_MENU_1MIN,
    SETTINGS_SLEEP_TIMEOUT_MENU_2MIN,
    SETTINGS_SLEEP_TIMEOUT_MENU_3MIN,
    SETTINGS_SLEEP_TIMEOUT_MENU_EXIT
};

static const uint8_t timeout_seconds[] = {0, 15, 30, 45, 60, 120, 180};

static void settings_scene_sleep_timeout_list_view_on_selected(mui_list_view_event_t event,
                                                               mui_list_view_t *p_list_view, mui_list_item_t *p_item) {
    app_settings_t *app = p_list_view->user_data;
    uint32_t selection = (uint32_t)p_item->user_data;
    if (selection < sizeof(timeout_seconds)) {
        SETTINGS_SET(sleep_timeout_sec, timeout_seconds[selection]);
        APP_SETTINGS_CHANGED(app, sleep_timeout_sec);
        ble_set_standby_timeout(timeout_seconds[selection]);
    }
    mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
}

void settings_scene_sleep_timeout_on_enter(void *user_data) {

    app_settings_t *app = user_data;
    static const uint16_t labels[] = {_L_OFF, _L_15S, _L_30S, _L_45S, _L_1MIN, _L_2MIN, _L_3MIN};
    uint8_t current = settings_get_data()->sleep_timeout_sec;
    uint16_t focus = 0;
    for (uint8_t row = 0; row < SETTINGS_SLEEP_TIMEOUT_MENU_EXIT; row++) {
        mui_list_view_add_item(app->p_list_view, 0xe105, getLangString(labels[row]), (void *)(uintptr_t)row);
        if (current == timeout_seconds[row]) focus = row;
    }
    mui_list_view_add_item(app->p_list_view, 0xe069, getLangString(_L_BACK), (void *)SETTINGS_SLEEP_TIMEOUT_MENU_EXIT);
    mui_list_view_set_focus(app->p_list_view, focus);
    mui_list_view_set_selected_cb(app->p_list_view, settings_scene_sleep_timeout_list_view_on_selected);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, SETTINGS_VIEW_ID_MAIN);
}

void settings_scene_sleep_timeout_on_exit(void *user_data) {
    app_settings_t *app = user_data;
    mui_list_view_clear_items(app->p_list_view);
    mui_list_view_set_selected_cb(app->p_list_view, NULL);
}
