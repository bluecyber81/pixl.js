#include "app_settings.h"
#include "i18n/language.h"
#include "mini_app_launcher.h"
#include "nrf_pwr_mgmt.h"
#include "settings.h"
#include "settings_scene.h"
#include "utils2.h"
#include "version2.h"
#include "vfs.h"
#include "mui_nav_diag.h"
#include "mui_contrast.h"
#include "ble_remote.h"
#include <stddef.h>
#include "ble_main.h"

enum settings_main_menu_t {
    SETTINGS_MAIN_MENU_VERSION,
    SETTINGS_MAIN_MENU_BACK_LIGHT,
    SETTINGS_MAIN_MENU_OLED_CONTRAST,
    SETTINGS_MAIN_MENU_LI_MODE,
    SETTINGS_MAIN_MENU_ENABLE_HIBERNATE,
    SETTINGS_MAIN_MENU_STORAGE,
    SETTINGS_MAIN_MENU_LANGUAGE,
    SETTINGS_MAIN_MENU_SHOW_MEM_USAGE,
    SETTINGS_MAIN_MENU_SLEEP_TIMEOUT,
    SETTINGS_MAIN_MENU_NO_SLEEP,
    SETTINGS_MAIN_MENU_ANIM_ENABLED,
    SETTINGS_MAIN_MENU_FLIP_DISPLAY,
    SETTINGS_MAIN_MENU_SWAP_BUTTONS,
    SETTINGS_MAIN_MENU_GO_SLEEP,
    SETTINGS_MAIN_MENU_DFU,
    SETTINGS_MAIN_MENU_REBOOT,
    SETTINGS_MAIN_MENU_RESET_DEFAULT,
    SETTINGS_MAIN_MENU_ABOUT,
    SETTINGS_MAIN_MENU_APP_MANAGEMENT,
    SETTINGS_MAIN_MENU_EXIT,
    SETTINGS_MAIN_MENU_REMOTE,
    SETTINGS_MAIN_MENU_DEVICE_TEST,
    SETTINGS_MAIN_MENU_LCD_DIM,
    SETTINGS_MAIN_MENU_LOAD_STATE
};

static void settings_scene_main_reload(void *user_data);
static void settings_reset_default(void *user_data) {
    app_settings_t *app = user_data;
    settings_data_t *p_settings = settings_get_data();
    mui_u8g2_set_contrast_level(p_settings->oled_contrast);
    mui_u8g2_set_flip_display(p_settings->flip_display);
    uint32_t backlight_result = NRF_SUCCESS;
#ifdef LCD_SCREEN
    backlight_result = mui_u8g2_set_backlight_level(p_settings->lcd_backlight);
#endif
    ble_set_standby_timeout(p_settings->sleep_timeout_sec);
    setLanguage(p_settings->language);

    mui_toast_view_show(app->p_toast_view,
                       backlight_result == NRF_SUCCESS ? _T(APP_SET_RESET_DEFAULT_SUCCESS) : _T(ERR));
}

static void settings_scene_main_close_error(mui_msg_box_event_t event, mui_msg_box_t *box) {
    (void)event; /* The dialog offers only the centre button. */
    app_settings_t *app = box->user_data;
    settings_scene_main_reload(app);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, SETTINGS_VIEW_ID_MAIN);
}

static void settings_scene_main_save_error(app_settings_t *app) {
    mui_msg_box_set_error(app->p_msg_box, _T(DE3_STORAGE_IO_ERROR), settings_scene_main_close_error);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, SETTINGS_VIEW_ID_MSG_BOX);
}

/* Only the Home/Exit save failure offers a confirmed discard. A failed reset,
 * reboot or DFU request must not turn into an implicit destructive action. */
static void settings_scene_main_exit_choice(mui_msg_box_event_t event, mui_msg_box_t *box);
static void settings_scene_main_exit_error(app_settings_t *app) {
    app->confirm_discard = false;
    mui_msg_box_set_header(app->p_msg_box, _T(DE3_SAVE_FAILED));
    mui_msg_box_set_message(app->p_msg_box, _T(DE3_STORAGE_IO_ERROR));
    mui_msg_box_set_btn_text(app->p_msg_box, _T(DE3_SAVE_RETRY_ACTION),
                             _T(DE3_SAVE_DISCARD_ACTION), _T(BACK));
    mui_msg_box_set_btn_focus(app->p_msg_box, MUI_MSG_BOX_EVENT_SELECT_RIGHT);
    mui_msg_box_set_event_cb(app->p_msg_box, settings_scene_main_exit_choice);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, SETTINGS_VIEW_ID_MSG_BOX);
}

static void settings_scene_main_request_exit(app_settings_t *app, bool discard) {
    app->exit_discard = discard;
    app->exit_saved = !discard;
    mini_app_launcher_kill(mini_app_launcher(), MINI_APP_ID_SETTINGS);
    /* The handle may already have been freed. A veto cancels this request,
     * including its authorization to skip a future save. */
    app = mini_app_launcher_get_app_handle(mini_app_launcher(), MINI_APP_ID_SETTINGS);
    if (!app) return;
    app->exit_discard = false;
    app->exit_saved = false;
    if (discard) settings_scene_main_exit_error(app);
    else settings_scene_main_close_error(MUI_MSG_BOX_EVENT_SELECT_RIGHT, app->p_msg_box);
}

static void settings_scene_main_try_exit(app_settings_t *app, uint8_t diag_type) {
    mui_msg_box_set_event_cb(app->p_msg_box, NULL);
    mui_msg_box_set_header(app->p_msg_box, _T(APP_SET));
    mui_msg_box_set_message(app->p_msg_box, _T(DE3_STORAGE_WORKING));
    mui_msg_box_set_btn_text(app->p_msg_box, NULL, NULL, NULL);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, SETTINGS_VIEW_ID_MSG_BOX);
    mui_update_now(mui());
    mui_nav_diag_save_begin(diag_type);
    settings_storage_snapshot_invalidate(&app->storage_snapshot);
    int32_t save_result = settings_save();
    mui_nav_diag_save_result(diag_type, save_result);
    if (save_result != NRF_SUCCESS) {
        settings_scene_main_exit_error(app);
        return;
    }
    settings_scene_main_request_exit(app, false);
    mui_nav_diag_exit_returned(diag_type);
}

static void settings_scene_main_exit_choice(mui_msg_box_event_t event, mui_msg_box_t *box) {
    app_settings_t *app = box->user_data;
    if (app->confirm_discard) {
        app->confirm_discard = false;
        if (event == MUI_MSG_BOX_EVENT_SELECT_LEFT) settings_scene_main_request_exit(app, true);
        else settings_scene_main_exit_error(app);
    } else if (event == MUI_MSG_BOX_EVENT_SELECT_LEFT) {
        settings_scene_main_try_exit(app, INPUT_TYPE_SHORT);
    } else if (event == MUI_MSG_BOX_EVENT_SELECT_CENTER) {
        app->confirm_discard = true;
        mui_msg_box_set_header(box, _T(MAIN_MENU));
        mui_msg_box_set_message(box, _T(DE3_SAVE_DISCARD_ASK));
        mui_msg_box_set_btn_text(box, _T(DE3_SAVE_YES_SHORT), NULL, _T(DE3_SAVE_NO_SHORT));
        mui_msg_box_set_btn_focus(box, MUI_MSG_BOX_EVENT_SELECT_RIGHT);
        mui_msg_box_set_event_cb(box, settings_scene_main_exit_choice);
    } else {
        settings_scene_main_close_error(event, box);
    }
}

static void settings_scene_main_msg_box_reset_settings_cb(mui_msg_box_event_t event, mui_msg_box_t *p_msg_box) {
    app_settings_t *app = p_msg_box->user_data;
    if (event == MUI_MSG_BOX_EVENT_SELECT_LEFT) {
        settings_storage_snapshot_invalidate(&app->storage_snapshot);
        if (settings_reset() != NRF_SUCCESS) {
            settings_scene_main_save_error(app);
            return;
        } else {
            settings_reset_default(app);
            settings_scene_main_reload(app);
        }
    }
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, SETTINGS_VIEW_ID_MAIN);
}

static void settings_scene_main_list_view_on_selected(mui_list_view_event_t event, mui_list_view_t *p_list_view,
                                                      mui_list_item_t *p_item) {
    app_settings_t *app = p_list_view->user_data;

    settings_data_t *p_settings = settings_get_data();

    uint32_t selection = (uint32_t)p_item->user_data;
    if (selection == SETTINGS_MAIN_MENU_LOAD_STATE) return; /* Read-only provenance row. */
    uint8_t diag_type = event == MUI_LIST_VIEW_EVENT_SELECTED ? INPUT_TYPE_SHORT : INPUT_TYPE_LONG;
    mui_nav_diag_settings(diag_type, selection);
    switch (selection) {
#ifdef LCD_SCREEN
    case SETTINGS_MAIN_MENU_LCD_DIM:
        settings_cycle_lcd_dim();
        APP_SETTINGS_CHANGED(app, backlight);
        settings_scene_main_reload(app);
        break;
    case SETTINGS_MAIN_MENU_BACK_LIGHT:
        mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, SETTINGS_SCENE_LCD_BACKLIGHT);
        break;
#endif
#if defined(BOARD_LCD) && defined(PIXL_RUNTIME_DIAGNOSTICS)
    case SETTINGS_MAIN_MENU_DEVICE_TEST:
        settings_device_test_open(app);
        break;
#endif

    case SETTINGS_MAIN_MENU_OLED_CONTRAST:
        mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, SETTINGS_SCENE_OLED_CONTRAST);
        break;

    case SETTINGS_MAIN_MENU_VERSION:
        mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, SETTINGS_SCENE_VERSION);
        break;

    case SETTINGS_MAIN_MENU_SLEEP_TIMEOUT:
        mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, SETTINGS_SCENE_SLEEP_TIMEOUT);
        break;

    case SETTINGS_MAIN_MENU_LANGUAGE:
        mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, SETTINGS_SCENE_LANGUAGE);
        break;

    case SETTINGS_MAIN_MENU_GO_SLEEP:
        go_sleep();
        break;

    case SETTINGS_MAIN_MENU_DFU:
        settings_storage_snapshot_invalidate(&app->storage_snapshot);
        if (settings_save() != NRF_SUCCESS) {
            settings_scene_main_save_error(app);
            break;
        }
        if (!enter_dfu()) mui_toast_view_show(app->p_toast_view, _T(ERR));
        break;

    case SETTINGS_MAIN_MENU_STORAGE:
        mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, SETTINGS_SCENE_STORAGE);
        break;

    case SETTINGS_MAIN_MENU_LI_MODE:
        SETTINGS_TOGGLE(bat_mode);
        APP_SETTINGS_CHANGED(app, bat_mode);
        settings_scene_main_reload(app);
        break;

    case SETTINGS_MAIN_MENU_SHOW_MEM_USAGE:
        SETTINGS_TOGGLE(show_mem_usage);
        APP_SETTINGS_CHANGED(app, show_mem_usage);
        settings_scene_main_reload(app);
        break;

    case SETTINGS_MAIN_MENU_ENABLE_HIBERNATE:
        SETTINGS_TOGGLE(hibernate_enabled);
        APP_SETTINGS_CHANGED(app, hibernate_enabled);
        settings_scene_main_reload(app);
        break;

    case SETTINGS_MAIN_MENU_ANIM_ENABLED:
        SETTINGS_TOGGLE(anim_enabled);
        APP_SETTINGS_CHANGED(app, anim_enabled);
        settings_scene_main_reload(app);
        break;

    case SETTINGS_MAIN_MENU_REMOTE:
        if (!ble_remote_set_enabled(!ble_remote_enabled()))
            mui_toast_view_show(app->p_toast_view, _T(ERR));
        settings_scene_main_reload(app);
        break;

    case SETTINGS_MAIN_MENU_NO_SLEEP:
        SETTINGS_TOGGLE(no_sleep_mode);
        APP_SETTINGS_CHANGED(app, no_sleep_mode);
        settings_scene_main_reload(app);
        break;

    case SETTINGS_MAIN_MENU_FLIP_DISPLAY:
        SETTINGS_TOGGLE(flip_display);
        APP_SETTINGS_CHANGED(app, flip_display);
        mui_u8g2_set_flip_display(p_settings->flip_display);
        settings_scene_main_reload(app);
        break;

    case SETTINGS_MAIN_MENU_SWAP_BUTTONS:
        SETTINGS_TOGGLE(swap_buttons);
        APP_SETTINGS_CHANGED(app, swap_buttons);
        settings_scene_main_reload(app);
        break;

    case SETTINGS_MAIN_MENU_APP_MANAGEMENT:
        mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, SETTINGS_SCENE_APP_MANAGEMENT);
        break;

    case SETTINGS_MAIN_MENU_EXIT:
        settings_scene_main_try_exit(app, diag_type);
        break;

    case SETTINGS_MAIN_MENU_REBOOT:
        settings_storage_snapshot_invalidate(&app->storage_snapshot);
        if (settings_save() != NRF_SUCCESS) {
            settings_scene_main_save_error(app);
            break;
        }
        if (!system_reboot()) mui_toast_view_show(app->p_toast_view, _T(ERR));
        break;

    case SETTINGS_MAIN_MENU_RESET_DEFAULT: {
        mui_msg_box_set_header(app->p_msg_box, _T(APP_SET_RESET_DEFAULT));
        mui_msg_box_set_message(app->p_msg_box, _T(APP_SET_RESET_DEFAULT_CONFIRM));
        mui_msg_box_set_btn_text(app->p_msg_box, _T(CONFIRM), NULL, _T(CANCEL));
        mui_msg_box_set_btn_focus(app->p_msg_box, 2);
        mui_msg_box_set_event_cb(app->p_msg_box, settings_scene_main_msg_box_reset_settings_cb);

        mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, SETTINGS_VIEW_ID_MSG_BOX);
    } break;

    case SETTINGS_MAIN_MENU_ABOUT: {
        mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, SETTINGS_SCENE_ABOUT);
    } break;
    }
}

static void settings_scene_main_reload(void *user_data) {

    app_settings_t *app = user_data;
    settings_data_t *p_settings = settings_get_data();
    char txt[64];

    uint16_t scroll_offset = mui_list_view_get_scroll_offset(app->p_list_view);
    uint16_t foucs_index = mui_list_view_get_focus(app->p_list_view);

    mui_list_view_clear_items(app->p_list_view);

    mui_list_view_add_item_ext(app->p_list_view, 0xe1c7, _T(APP_SET_VERSION), version_get_version(version_get()),
                               (void *)SETTINGS_MAIN_MENU_VERSION);

    mui_list_view_add_item_ext(app->p_list_view, 0xe26d, _T(APP_SET_LANGUAGE), getLangDesc(p_settings->language),
                               (void *)SETTINGS_MAIN_MENU_LANGUAGE);

    vfs_driver_t *p_driver = vfs_get_default_driver();
    const vfs_stat_t *stat = settings_storage_snapshot_peek(&app->storage_snapshot, p_driver);
    /* Until the storage page has measured this session, leave the value blank.
     * An unmeasured drive is not an unmounted drive. Never perform stat I/O
     * here: this path is also used after a failed save or a confirmed discard. */
    const char *storage_value = stat && !stat->avaliable ? _T(NOT_MOUNTED) : "";
    if (stat && stat->avaliable && stat->total_bytes && stat->free_bytes <= stat->total_bytes) {
        snprintf(txt, sizeof(txt), "%s %d%%", _T(APP_SET_STORAGE_USED),
                 (uint8_t)(((uint64_t)(stat->total_bytes - stat->free_bytes) * 100u) / stat->total_bytes));
        storage_value = txt;
    }
    mui_list_view_add_item_ext(app->p_list_view, 0xe146, _T(APP_SET_STORAGE), storage_value,
                               (void *)SETTINGS_MAIN_MENU_STORAGE);

    snprintf(txt, sizeof(txt), "%d%%", mui_contrast_percent(p_settings->oled_contrast));
#ifdef OLED_SCREEN
    mui_list_view_add_item_ext(app->p_list_view, 0xe1c8, _T(APP_SET_BRIGHTNESS), txt,
                               (void *)SETTINGS_MAIN_MENU_OLED_CONTRAST);
#else
    mui_list_view_add_item_ext(app->p_list_view, 0xe1c8, _T(APP_SET_OLED_CONTRAST), txt,
                               (void *)SETTINGS_MAIN_MENU_OLED_CONTRAST);
#endif

#ifdef LCD_SCREEN
    const char *backlight_value = _T(OFF);
    if (p_settings->lcd_backlight) {
        snprintf(txt, sizeof(txt), "%d%%", p_settings->lcd_backlight);
        backlight_value = txt;
    }
    mui_list_view_add_item_ext(app->p_list_view, 0xe1c8, _T(APP_SET_LCD_BACKLIGHT), backlight_value,
                               (void *)SETTINGS_MAIN_MENU_BACK_LIGHT);
    bool de = p_settings->language == LANGUAGE_DE_DE;
    const char *dim_value = _T(OFF);
    if (settings_get_lcd_dim()) {
        uint8_t delay = settings_lcd_dim_idle_seconds();
        if (delay) {
            snprintf(txt, sizeof(txt), "%u s", (unsigned)delay);
            dim_value = txt;
        } else {
            dim_value = de ? "vor Schlaf" : "pre-sleep";
        }
    }
    mui_list_view_add_item_ext(app->p_list_view, 0xe1c9, de ? "Dimmen" : "Auto dim",
                               dim_value, (void *)SETTINGS_MAIN_MENU_LCD_DIM);
#endif

    static const struct {
        uint16_t icon;
        L_StringID title;
        enum settings_main_menu_t action;
        uint8_t field;
    } flags[] = {
        {0xe1c8, _L_APP_SET_FLIP_DISPLAY, SETTINGS_MAIN_MENU_FLIP_DISPLAY, offsetof(settings_data_t, flip_display)},
        {0xe1c8, _L_APP_SET_SWAP_BUTTONS, SETTINGS_MAIN_MENU_SWAP_BUTTONS, offsetof(settings_data_t, swap_buttons)},
        {0xe1dc, _L_APP_SET_ANIM, SETTINGS_MAIN_MENU_ANIM_ENABLED, offsetof(settings_data_t, anim_enabled)},
        {0xe08f, _L_APP_SET_LIPO_BAT, SETTINGS_MAIN_MENU_LI_MODE, offsetof(settings_data_t, bat_mode)},
        {0xe1f3, _L_APP_SET_SHOW_MEM_USAGE, SETTINGS_MAIN_MENU_SHOW_MEM_USAGE, offsetof(settings_data_t, show_mem_usage)},
        {0xe232, _L_APP_SET_HIBERNATE, SETTINGS_MAIN_MENU_ENABLE_HIBERNATE, offsetof(settings_data_t, hibernate_enabled)},
    };
    for (size_t i = 0; i < sizeof(flags) / sizeof(flags[0]); i++) {
        const uint8_t *values = (const uint8_t *)p_settings;
        mui_list_view_add_item_ext(app->p_list_view, flags[i].icon, getLangString(flags[i].title),
                                   values[flags[i].field] ? _T(ON) : _T(OFF),
                                   (void *)(uintptr_t)flags[i].action);
    }

    uint16_t seconds = nrf_pwr_mgmt_get_timeout();
    const char *timeout_value = _T(OFF);
    if (seconds) {
        snprintf(txt, sizeof(txt), "%d%c", seconds < 60 ? seconds : seconds / 60, seconds < 60 ? 's' : 'm');
        timeout_value = txt;
    }
    mui_list_view_add_item_ext(app->p_list_view, 0xe1c9, _T(APP_SET_SLEEP_TIMEOUT), timeout_value,
                               (void *)SETTINGS_MAIN_MENU_SLEEP_TIMEOUT);
    mui_list_view_add_item_ext(app->p_list_view, 0xe1c9, _T(APP_SET_NO_SLEEP),
                               p_settings->no_sleep_mode ? _T(ON) : _T(OFF),
                               (void *)SETTINGS_MAIN_MENU_NO_SLEEP);
    mui_list_view_add_item_ext(app->p_list_view, 0xe1d0, _T(DE3_REMOTE_SESSION),
                               ble_remote_enabled() ? _T(DE361_UNTIL_OFF) : _T(OFF),
                               (void *)SETTINGS_MAIN_MENU_REMOTE);
    static const struct {
        uint16_t icon;
        L_StringID title;
        enum settings_main_menu_t action;
    } actions[] = {
        {0xe1d0, _L_APP_SET_APP_MGMT, SETTINGS_MAIN_MENU_APP_MANAGEMENT},
        {0xe1c9, _L_APP_SET_GO_SLEEP, SETTINGS_MAIN_MENU_GO_SLEEP},
        {0xe1ca, _L_APP_SET_DFU, SETTINGS_MAIN_MENU_DFU},
        {0xe1cb, _L_APP_SET_REBOOT, SETTINGS_MAIN_MENU_REBOOT},
        {0xe1ce, _L_APP_SET_RESET_DEFAULT, SETTINGS_MAIN_MENU_RESET_DEFAULT},
        {0xe1cf, _L_APP_SET_ABOUT, SETTINGS_MAIN_MENU_ABOUT},
    };
    for (size_t i = 0; i < sizeof(actions) / sizeof(actions[0]); i++) {
        mui_list_view_add_item(app->p_list_view, actions[i].icon, getLangString(actions[i].title),
                               (void *)(uintptr_t)actions[i].action);
    }
#if defined(BOARD_LCD) && defined(PIXL_RUNTIME_DIAGNOSTICS)
    mui_list_view_add_item(app->p_list_view, 0xe1c7,
                           p_settings->language == LANGUAGE_DE_DE ? "Gerätetest" : "Device test",
                           (void *)SETTINGS_MAIN_MENU_DEVICE_TEST);
#endif
    /* Read-only base provenance: a pending user edit is not a failed load.
     * Keep the fast first frame; this accessor never reads the filesystem. */
    settings_load_state_t load = settings_load_state();
    bool german = p_settings->language == LANGUAGE_DE_DE;
    const char *base = load == SETTINGS_LOAD_VERIFIED ? (german ? "gelesen" : "loaded") :
                       load == SETTINGS_LOAD_DEFAULTS ? (german ? "Standard" : "defaults") :
                                                       (german ? "Lesen offen" : "read pending");
    mui_list_view_add_item_ext(app->p_list_view, 0xe1c7, german ? "Ladebasis" : "Load base", base,
                               (void *)SETTINGS_MAIN_MENU_LOAD_STATE);
    mui_list_view_add_item(app->p_list_view, 0xe069, _T(BACK_TO_MAIN_MENU), (void *)SETTINGS_MAIN_MENU_EXIT);

    mui_list_view_set_focus(app->p_list_view, foucs_index);
    mui_list_view_set_scroll_offset(app->p_list_view, scroll_offset);
}

void settings_scene_main_on_enter(void *user_data) {
    mui_nav_diag_begin();
    app_settings_t *app = user_data;
    mui_list_view_clear_items(app->p_list_view);
    settings_scene_main_reload(user_data);
    uint16_t focus = app->main_focus;
    if (focus >= mui_list_view_item_size(app->p_list_view)) focus = 0;
    mui_list_view_set_focus(app->p_list_view, focus);
    uint16_t focus_offset = mui_list_view_get_scroll_offset(app->p_list_view);
    /* Keep a valid saved viewport; stale positions must not hide the selection. */
    if (app->main_scroll <= focus_offset &&
        focus_offset - app->main_scroll < app->p_list_view->canvas_height)
        mui_list_view_set_scroll_offset(app->p_list_view, app->main_scroll);
    mui_list_view_set_selected_cb(app->p_list_view, settings_scene_main_list_view_on_selected);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, SETTINGS_VIEW_ID_MAIN);
}

void settings_scene_main_on_exit(void *user_data) {
    mui_nav_diag_end();
    app_settings_t *app = user_data;
    app->main_focus = mui_list_view_get_focus(app->p_list_view);
    app->main_scroll = mui_list_view_get_scroll_offset(app->p_list_view);
    mui_list_view_clear_items(app->p_list_view);
    mui_list_view_set_selected_cb(app->p_list_view, NULL);
}
