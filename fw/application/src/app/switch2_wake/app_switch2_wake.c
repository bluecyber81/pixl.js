/* Adapted from PR479, Aragamiz/pixl.js b0ade162. LCD foreground/VFS integration. */
#include "app_switch2_wake.h"
#include "switch2_protocol.h"
#include "vfs_persist.h"

#include "ble_main.h"
#include "i18n/language.h"
#include "mini_app_launcher.h"
#include "mini_app_registry.h"
#include "mui_include.h"
#include "mui_list_view.h"
#include "mui_text_input.h"
#include "mui_toast_view.h"
#include "nrf_error.h"
#include "nrf_log.h"
#include "nrf_power.h"
#include "vfs.h"

#include <ctype.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#define SWITCH2_WAKE_CFG_PATH "/switch2_wake.txt"
#define SWITCH2_WAKE_ADV_DURATION_10MS 300 // 3.0 seconds

#define ICON_WAKE 0xe1b5
#define ICON_EDIT 0xe1ed
#define ICON_MODE 0xe02b
#define ICON_SAVE 0xe1d6
#define ICON_BACK 0xe069

typedef enum {
    SWITCH2_WAKE_VIEW_LIST = 0,
    SWITCH2_WAKE_VIEW_TEXT_INPUT = 1,
    SWITCH2_WAKE_VIEW_TOAST = 2,
} switch2_wake_view_id_t;

typedef enum {
    SWITCH2_MENU_WAKE = 0,
    SWITCH2_MENU_SCAN,
    SWITCH2_MENU_AUTO_WAKE,
    SWITCH2_MENU_EDIT_MAC,
    SWITCH2_MENU_EDIT_HOST,
    SWITCH2_MENU_PID,
    SWITCH2_MENU_MODE,
    SWITCH2_MENU_SAVE_CFG,
    SWITCH2_MENU_DISCARD,
    SWITCH2_MENU_EXIT,
    SWITCH2_MENU_RELOAD,
} switch2_menu_item_t;

typedef enum {
    SWITCH2_EDIT_NONE = 0,
    SWITCH2_EDIT_MAC,
    SWITCH2_EDIT_HOST,
} switch2_edit_target_t;



typedef struct {
    mui_view_dispatcher_t *p_view_dispatcher;
    mui_view_dispatcher_t *p_view_dispatcher_toast;
    mui_list_view_t *p_list_view;
    mui_text_input_t *p_text_input;
    mui_toast_view_t *p_toast_view;
    switch2_wake_cfg_t cfg;
    switch2_wake_cfg_t saved_cfg;
    switch2_edit_target_t edit_target;
    bool waking;
    bool scanning;
    bool dirty;
    bool profile_loaded;
} app_switch2_wake_t;

static app_switch2_wake_t *s_active_app = NULL;

static const char *s2_tr(const char *de, const char *en) {
    return getLanguage() == LANGUAGE_DE_DE ? de : en;
}

static void format_mac_plain(const uint8_t mac[6], char out[13]) {
    snprintf(out, 13, "%02X%02X%02X%02X%02X%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
}

static bool switch2_wake_load_cfg(switch2_wake_cfg_t *cfg) {
    vfs_driver_t *driver = vfs_get_default_driver();
    if (!driver || !driver->mounted()) return false;
    /* One extra byte rejects oversized/truncated text. Never mount/format as
     * a side effect of a wake option or bypass the storage recovery latch. */
    char text[513];
    int32_t n = driver->read_file_data(SWITCH2_WAKE_CFG_PATH, text, sizeof(text)-1);
    if (n == VFS_ERR_NOOBJ) {
        switch2_wake_cfg_set_default(cfg);
        return true;
    }
    if (n < 0 || n >= (int32_t)sizeof(text)-1 || memchr(text, 0, (size_t)n)) return false;
    text[n] = 0;
    return switch2_wake_parse_cfg(cfg, text);
}
static bool switch2_wake_save_cfg(const switch2_wake_cfg_t *cfg) {
    vfs_driver_t *driver = vfs_get_default_driver();
    if (!driver || !driver->mounted()) return false;
    char text[256];
    int size = switch2_wake_format_cfg(cfg, text, sizeof(text));
    return size > 0 && vfs_persist_write(driver, SWITCH2_WAKE_CFG_PATH, text, (size_t)size) == size;
}

static const char *pid_label(uint16_t pid) {
    if (pid == SWITCH2_PID_JC2_L) return "JC2-L";
    if (pid == SWITCH2_PID_JC2_R) return "JC2-R";
    if (pid == SWITCH2_PID_PRO2)  return "Pro2";
    return "Custom";
}

static void switch2_wake_add_profile_items(app_switch2_wake_t *app) {
    char sub[16];

    mui_list_view_add_item_ext(app->p_list_view, ICON_WAKE,
                               app->waking ? s2_tr("Sende Weckpaket...", "Waking...") : s2_tr("Switch 2 wecken", "Wake Switch 2"),
                               app->waking ? "..." : "",
                               (void *)SWITCH2_MENU_WAKE);

    mui_list_view_add_item_ext(app->p_list_view, ICON_WAKE,
                               app->scanning ? s2_tr("Suche...", "Scanning...") : s2_tr("Controller suchen", "Scan Wake Pkt"),
                               app->scanning ? "15s" : "",
                               (void *)SWITCH2_MENU_SCAN);

    mui_list_view_add_item_ext(app->p_list_view, ICON_MODE,
                               s2_tr("Beim Tastenstart", "Boot Wake"),
                               app->cfg.auto_wake ? _T(ON_F) : _T(OFF_F),
                               (void *)SWITCH2_MENU_AUTO_WAKE);

    if (app->cfg.has_mac) {
        snprintf(sub, sizeof(sub), "..%02X%02X%02X",
                 app->cfg.controller_mac[3], app->cfg.controller_mac[4], app->cfg.controller_mac[5]);
    } else {
        snprintf(sub, sizeof(sub), "%s", s2_tr("Fehlt", "Unset"));
    }
    mui_list_view_add_item_ext(app->p_list_view, ICON_EDIT, s2_tr("Controller-MAC", "Ctrl MAC"), sub,
                               (void *)SWITCH2_MENU_EDIT_MAC);

    if (app->cfg.has_raw_data) {
        snprintf(sub, sizeof(sub), "RAW %dB", app->cfg.raw_data_len);
    } else if (app->cfg.has_host) {
        snprintf(sub, sizeof(sub), "..%02X%02X%02X",
                 app->cfg.host_mac[3], app->cfg.host_mac[4], app->cfg.host_mac[5]);
    } else {
        snprintf(sub, sizeof(sub), "%s", s2_tr("Fehlt", "Unset"));
    }
    mui_list_view_add_item_ext(app->p_list_view, ICON_EDIT, s2_tr("Switch-2-MAC", "Host MAC"), sub,
                               (void *)SWITCH2_MENU_EDIT_HOST);

    mui_list_view_add_item_ext(app->p_list_view, ICON_MODE, s2_tr("Controller-Typ", "Ctrl Type"), pid_label(app->cfg.pid),
                               (void *)SWITCH2_MENU_PID);

    mui_list_view_add_item_ext(app->p_list_view, ICON_MODE, s2_tr("Sendemodus", "Adv Mode"),
                               app->cfg.connectable ? "Conn" : "NonConn",
                               (void *)SWITCH2_MENU_MODE);

    mui_list_view_add_item(app->p_list_view, ICON_SAVE, s2_tr("Konfig. speichern", "Save Config"),
                           (void *)SWITCH2_MENU_SAVE_CFG);

    if (app->dirty) mui_list_view_add_item(app->p_list_view, ICON_BACK,
        s2_tr("Aenderung verwerfen", "Discard unsaved"), (void *)SWITCH2_MENU_DISCARD);
}

static void switch2_wake_reload_menu(app_switch2_wake_t *app) {
    uint16_t focus = mui_list_view_get_focus(app->p_list_view);
    uint16_t scroll = mui_list_view_get_scroll_offset(app->p_list_view);
    mui_list_view_clear_items(app->p_list_view);
    if (app->profile_loaded)
        switch2_wake_add_profile_items(app);
    else
        mui_list_view_add_item(app->p_list_view, ICON_BACK,
            s2_tr("Erneut laden", "Retry load"), (void *)SWITCH2_MENU_RELOAD);
    mui_list_view_add_item(app->p_list_view, ICON_BACK, _T(MAIN_RETURN),
                           (void *)SWITCH2_MENU_EXIT);

    uint32_t count = mui_list_view_item_size(app->p_list_view);
    if (focus >= count && count > 0) {
        focus = (uint16_t)(count - 1);
    }
    mui_list_view_set_focus(app->p_list_view, focus);
    mui_list_view_set_scroll_offset(app->p_list_view, scroll);
}

static void switch2_wake_open_profile(app_switch2_wake_t *app) {
    app->profile_loaded = switch2_wake_load_cfg(&app->cfg);
    if (app->profile_loaded)
        app->saved_cfg = app->cfg;
    else
        mui_toast_view_show(app->p_toast_view, s2_tr("Lesefehler", "Read failed"));
    switch2_wake_reload_menu(app);
}

static bool switch2_save_current(app_switch2_wake_t *app) {
    if (!app->profile_loaded) return false;
    app->dirty = true;
    bool saved = switch2_wake_save_cfg(&app->cfg);
    if (saved) {
        app->saved_cfg = app->cfg;
        app->dirty = false;
    }
    return saved;
}
static void switch2_save_feedback(app_switch2_wake_t *app) {
    bool saved = switch2_save_current(app);
    switch2_wake_reload_menu(app);
    mui_toast_view_show(app->p_toast_view, saved ? s2_tr("Konfig. gespeichert", "Config Saved") : _T(FAILED));
}

static void switch2_wake_on_ble_done(uint32_t result) {
    if (s_active_app == NULL) {
        return;
    }
    s_active_app->waking = false;
    switch2_wake_reload_menu(s_active_app);
    mui_toast_view_show(s_active_app->p_toast_view, result == NRF_SUCCESS ? s2_tr("Weckpaket gesendet", "Wake Sent") : _T(FAILED));
    mui_update(mui());
}

static void switch2_wake_on_scan_done(bool found, const ble_switch2_scan_result_t *res) {
    if (s_active_app == NULL) {
        return;
    }
    s_active_app->scanning = false;
    if (found && res != NULL && res->adv_len == SWITCH2_WAKE_ADV_LEN) {
        memcpy(s_active_app->cfg.controller_mac, res->controller_mac, 6);
        s_active_app->cfg.has_mac = true;
        memcpy(s_active_app->cfg.host_mac, res->host_mac, 6);
        s_active_app->cfg.has_host = true;
        s_active_app->cfg.pid = res->pid;
        memcpy(s_active_app->cfg.raw_data, res->adv_data, res->adv_len);
        s_active_app->cfg.raw_data_len = res->adv_len;
        s_active_app->cfg.has_raw_data = true;
        bool saved = switch2_save_current(s_active_app);
        switch2_wake_reload_menu(s_active_app);
        mui_toast_view_show(s_active_app->p_toast_view,
                            saved ? s2_tr("Erfasst + gespeichert", "Captured!") : _T(FAILED));
    } else {
        switch2_wake_reload_menu(s_active_app);
        mui_toast_view_show(s_active_app->p_toast_view, s2_tr("Kein Paket gefunden", "Scan Timeout"));
    }
    mui_update(mui());
}

static void switch2_wake_toggle_scan(app_switch2_wake_t *app) {
    if (app->scanning) {
        ble_switch2_scan_stop();
        app->scanning = false;
        switch2_wake_reload_menu(app);
        mui_toast_view_show(app->p_toast_view, s2_tr("Suche beendet", "Scan Stopped"));
        return;
    }

    if (app->waking) {
        ble_raw_adv_stop();
        app->waking = false;
        switch2_wake_reload_menu(app);
        mui_toast_view_show(app->p_toast_view, s2_tr("Senden aus; erneut", "Stopped; press again"));
        return;
    }
    if (ble_miniapp_radio_busy()) {
        switch2_wake_reload_menu(app);
        mui_toast_view_show(app->p_toast_view, s2_tr("Funk wird beendet", "Radio is stopping"));
        return;
    }

    uint32_t err = ble_switch2_scan_start(15, switch2_wake_on_scan_done);
    if (err != NRF_SUCCESS) {
        char msg[32];
        snprintf(msg, sizeof(msg), "Scan Err: 0x%X", (unsigned int)err);
        mui_toast_view_show(app->p_toast_view, msg);
        return;
    }

    app->scanning = true;
    switch2_wake_reload_menu(app);
    mui_toast_view_show(app->p_toast_view, s2_tr("Home am Controller", "Press JC2 Home"));
}

static void switch2_wake_trigger(app_switch2_wake_t *app) {
    if (app->scanning) {
        ble_switch2_scan_stop();
        app->scanning = false;
        switch2_wake_reload_menu(app);
        mui_toast_view_show(app->p_toast_view, s2_tr("Suche aus; erneut", "Stopped; press again"));
        return;
    }
    if (app->waking) {
        ble_raw_adv_stop();
        app->waking = false;
        switch2_wake_reload_menu(app);
        mui_toast_view_show(app->p_toast_view, s2_tr("Senden beendet", "Stopped"));
        return;
    }

    if (ble_miniapp_radio_busy()) {
        switch2_wake_reload_menu(app);
        mui_toast_view_show(app->p_toast_view, s2_tr("Funk wird beendet", "Radio is stopping"));
        return;
    }
    if (!app->cfg.has_mac) {
        mui_toast_view_show(app->p_toast_view, s2_tr("Controller-MAC fehlt", "Set Ctrl MAC"));
        return;
    }

    uint8_t adv_payload[SWITCH2_WAKE_ADV_LEN];
    uint8_t adv_len = switch2_wake_build_adv(&app->cfg, adv_payload);
    if (adv_len == 0) {
        mui_toast_view_show(app->p_toast_view, s2_tr("Switch-2-MAC fehlt", "Set Host MAC"));
        return;
    }

    uint32_t err = ble_raw_adv_start(app->cfg.controller_mac, adv_payload, adv_len,
                                     app->cfg.connectable, SWITCH2_WAKE_ADV_DURATION_10MS,
                                     switch2_wake_on_ble_done);
    if (err != NRF_SUCCESS) {
        char msg[32];
        snprintf(msg, sizeof(msg), "BLE Err: 0x%X", (unsigned int)err);
        mui_toast_view_show(app->p_toast_view, msg);
        return;
    }

    app->waking = true;
    switch2_wake_reload_menu(app);
    mui_toast_view_show(app->p_toast_view, s2_tr("Sende Weckpaket...", "Waking..."));
}

static void switch2_wake_text_input_cb(mui_text_input_event_t event, mui_text_input_t *p_text_input) {
    app_switch2_wake_t *app = p_text_input->user_data;

    if (event == MUI_TEXT_INPUT_EVENT_CONFIRMED) {
        const char *txt = mui_text_input_get_input_text(p_text_input);
        uint8_t mac[6];
        if (!parse_mac_str(txt, mac)) {
            mui_toast_view_show(app->p_toast_view, s2_tr("MAC ungueltig!", "Invalid MAC!"));
            mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, SWITCH2_WAKE_VIEW_LIST);
            app->edit_target = SWITCH2_EDIT_NONE;
            return;
        }

        if (app->edit_target == SWITCH2_EDIT_MAC) {
            memcpy(app->cfg.controller_mac, mac, 6);
            app->cfg.has_mac = true;
        } else if (app->edit_target == SWITCH2_EDIT_HOST) {
            memcpy(app->cfg.host_mac, mac, 6);
            app->cfg.has_host = true;
            app->cfg.has_raw_data = false;
            app->cfg.raw_data_len = 0;
        }

        bool saved = switch2_save_current(app);
        switch2_wake_reload_menu(app);
        mui_toast_view_show(app->p_toast_view,
                            saved ? s2_tr("Konfig. gespeichert", "Config Saved") : _T(FAILED));
    }

    app->edit_target = SWITCH2_EDIT_NONE;
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, SWITCH2_WAKE_VIEW_LIST);
}

static void switch2_wake_open_mac_editor(app_switch2_wake_t *app, switch2_edit_target_t target) {
    char initial[13] = "";
    app->edit_target = target;

    mui_text_input_reset(app->p_text_input);
    if (target == SWITCH2_EDIT_MAC) {
        mui_text_input_set_header(app->p_text_input, s2_tr("Controller-MAC", "Ctrl MAC"));
        if (app->cfg.has_mac) {
            format_mac_plain(app->cfg.controller_mac, initial);
        }
    } else {
        mui_text_input_set_header(app->p_text_input, s2_tr("Switch-2-MAC", "Host MAC"));
        if (app->cfg.has_host) {
            format_mac_plain(app->cfg.host_mac, initial);
        }
    }
    mui_text_input_set_input_text(app->p_text_input, initial);
    mui_text_input_set_event_cb(app->p_text_input, switch2_wake_text_input_cb);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, SWITCH2_WAKE_VIEW_TEXT_INPUT);
}

static void switch2_wake_list_selected_cb(mui_list_view_event_t event, mui_list_view_t *p_list_view,
                                          mui_list_item_t *p_item) {
    app_switch2_wake_t *app = p_list_view->user_data;
    (void)event;
    uint32_t sel = (uint32_t)(uintptr_t)p_item->user_data;

    if (!app->profile_loaded && sel != SWITCH2_MENU_EXIT) {
        if (sel == SWITCH2_MENU_RELOAD) switch2_wake_open_profile(app);
        return;
    }
    switch (sel) {
    case SWITCH2_MENU_WAKE:
        switch2_wake_trigger(app);
        break;
    case SWITCH2_MENU_SCAN:
        switch2_wake_toggle_scan(app);
        break;
    case SWITCH2_MENU_AUTO_WAKE:
        app->cfg.auto_wake = !app->cfg.auto_wake;
        switch2_save_feedback(app);
        break;
    case SWITCH2_MENU_EDIT_MAC:
        switch2_wake_open_mac_editor(app, SWITCH2_EDIT_MAC);
        break;
    case SWITCH2_MENU_EDIT_HOST:
        switch2_wake_open_mac_editor(app, SWITCH2_EDIT_HOST);
        break;
    case SWITCH2_MENU_PID:
        if (app->cfg.pid == SWITCH2_PID_JC2_L) {
            app->cfg.pid = SWITCH2_PID_JC2_R;
        } else if (app->cfg.pid == SWITCH2_PID_JC2_R) {
            app->cfg.pid = SWITCH2_PID_PRO2;
        } else {
            app->cfg.pid = SWITCH2_PID_JC2_L;
        }
        app->cfg.has_raw_data = false;
        app->cfg.raw_data_len = 0;
        switch2_save_feedback(app);
        break;
    case SWITCH2_MENU_MODE:
        app->cfg.connectable = !app->cfg.connectable;
        switch2_save_feedback(app);
        break;
    case SWITCH2_MENU_SAVE_CFG:
        switch2_save_feedback(app);
        break;
    case SWITCH2_MENU_DISCARD:
        app->cfg = app->saved_cfg;
        app->dirty = false;
        switch2_wake_reload_menu(app);
        break;
    case SWITCH2_MENU_EXIT:
        /* prepare_exit can reject an unsaved config. Only a successful kill
         * cancels radio ownership, so a rejected return leaves truthful state. */
        mini_app_launcher_kill(mini_app_launcher(), MINI_APP_ID_SWITCH2_WAKE);
        break;
    default:
        break;
    }
}

static void app_switch2_wake_on_run(mini_app_inst_t *p_app_inst) {
    app_switch2_wake_t *app = mui_mem_malloc(sizeof(*app));
    if (!app) return;
    memset(app, 0, sizeof(*app));
    app->p_view_dispatcher = mui_view_dispatcher_create();
    if (!app->p_view_dispatcher) goto startup_failed;
    app->p_list_view = mui_list_view_create();
    if (!app->p_list_view) goto startup_failed;
    app->p_text_input = mui_text_input_create();
    if (!app->p_text_input) goto startup_failed;
    app->p_toast_view = mui_toast_view_create();
    if (!app->p_toast_view) goto startup_failed;
    app->p_view_dispatcher_toast = mui_view_dispatcher_create();
    if (!app->p_view_dispatcher_toast) goto startup_failed;
    p_app_inst->p_handle = app;
    s_active_app = app;
    ble_disable();
    mui_list_view_set_user_data(app->p_list_view, app);
    mui_list_view_set_selected_cb(app->p_list_view, switch2_wake_list_selected_cb);
    mui_text_input_set_user_data(app->p_text_input, app);
    mui_toast_view_set_user_data(app->p_toast_view, app);
    mui_view_dispatcher_add_view(app->p_view_dispatcher, SWITCH2_WAKE_VIEW_LIST, mui_list_view_get_view(app->p_list_view));
    mui_view_dispatcher_add_view(app->p_view_dispatcher, SWITCH2_WAKE_VIEW_TEXT_INPUT, mui_text_input_get_view(app->p_text_input));
    mui_view_dispatcher_add_view(app->p_view_dispatcher_toast, SWITCH2_WAKE_VIEW_TOAST, mui_toast_view_get_view(app->p_toast_view));
    mui_view_dispatcher_attach(app->p_view_dispatcher, MUI_LAYER_WINDOW);
    mui_view_dispatcher_attach(app->p_view_dispatcher_toast, MUI_LAYER_TOAST);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher_toast, SWITCH2_WAKE_VIEW_TOAST);
    switch2_wake_open_profile(app);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, SWITCH2_WAKE_VIEW_LIST);
    return;
startup_failed:
    mui_view_dispatcher_free(app->p_view_dispatcher_toast);
    mui_toast_view_free(app->p_toast_view);
    mui_text_input_free(app->p_text_input);
    mui_list_view_free(app->p_list_view);
    mui_view_dispatcher_free(app->p_view_dispatcher);
    mui_mem_free(app);
}

static bool app_switch2_wake_prepare_exit(mini_app_inst_t *inst, mini_app_exit_reason_t reason) {
    (void)reason;
    app_switch2_wake_t *app = inst->p_handle;
    if (app && app->dirty && !switch2_save_current(app)) {
        mui_toast_view_show(app->p_toast_view, _T(FAILED));
        return false; /* Explicit Save/Discard choices retain unsaved RAM. */
    }
    return true;
}

static void app_switch2_wake_on_kill(mini_app_inst_t *p_app_inst) {
    app_switch2_wake_t *app = p_app_inst->p_handle;
    if (!app) return;
    s_active_app = NULL;
    ble_switch2_scan_stop();
    ble_raw_adv_stop();

    mui_view_dispatcher_detach(app->p_view_dispatcher, MUI_LAYER_WINDOW);
    mui_view_dispatcher_free(app->p_view_dispatcher);
    mui_list_view_free(app->p_list_view);
    mui_text_input_free(app->p_text_input);

    mui_view_dispatcher_detach(app->p_view_dispatcher_toast, MUI_LAYER_TOAST);
    mui_view_dispatcher_free(app->p_view_dispatcher_toast);
    mui_toast_view_free(app->p_toast_view);

    mui_mem_free(app);
    p_app_inst->p_handle = NULL;
}

static void app_switch2_wake_on_event(mini_app_inst_t *p_app_inst, mini_app_event_t *p_event) { (void)p_app_inst; (void)p_event; }

void app_switch2_wake_on_boot(uint32_t wakeup_reason) {
    if (!(wakeup_reason & NRF_POWER_RESETREAS_OFF_MASK)) return;
    // Skip silent RFID-field wakeups (e.g., scanning an Amiibo card without turning on screen)
    if (wakeup_reason & (NRF_POWER_RESETREAS_NFC_MASK | NRF_POWER_RESETREAS_LPCOMP_MASK)) {
        return;
    }

    // Do not clobber BLE state if a non-desktop app (e.g. AmiiboLink) was restored on boot
    mini_app_launcher_t *p_launcher = mini_app_launcher();
    if (p_launcher->p_main_app_inst != NULL && p_launcher->p_main_app_inst->p_app != NULL &&
        p_launcher->p_main_app_inst->p_app->id != MINI_APP_ID_DESKTOP) {
        return;
    }

    switch2_wake_cfg_t cfg;
    if (!switch2_wake_load_cfg(&cfg) || !cfg.auto_wake || !cfg.has_mac) {
        return;
    }

    uint8_t adv_payload[SWITCH2_WAKE_ADV_LEN];
    uint8_t adv_len = switch2_wake_build_adv(&cfg, adv_payload);
    if (adv_len == 0) {
        return;
    }

    (void)ble_raw_adv_start(cfg.controller_mac, adv_payload, adv_len,
                            cfg.connectable, 200, NULL);
}

const mini_app_t app_switch2_wake_info = {
    .id = MINI_APP_ID_SWITCH2_WAKE,
    .name = "Switch2 Wake",
    .name_i18n_key = _L_APP_SWITCH2_WAKE,
    .icon = 0xe1b5,
    .deamon = false,
    .sys = false,
    .hibernate_enabled = false,
    .icon_32x32 = &app_switch2_wake_32x32,
    .run_cb = app_switch2_wake_on_run,
    .kill_cb = app_switch2_wake_on_kill,
    .on_event_cb = app_switch2_wake_on_event,
    .prepare_exit_cb = app_switch2_wake_prepare_exit,
};
