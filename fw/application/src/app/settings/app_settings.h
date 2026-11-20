#ifndef APP_SETTINGS_H
#define APP_SETTINGS_H

#include "mini_app_defines.h"

#include "mini_app_registry.h"

#include "mui_include.h"


#include "mui_list_view.h"
#include "mui_u8g2.h"
#include "utils2.h"
#include "version2.h"
#include "mui_progress_bar.h"
#include "mui_msg_box.h"
#include "mui_toast_view.h"
#include "settings_storage_snapshot.h"
#include "settings.h"

typedef struct {
    mui_list_view_t *p_list_view;
    mui_progress_bar_t *p_progress_bar;
    mui_msg_box_t *p_msg_box;
    mui_view_dispatcher_t *p_view_dispatcher;
    mui_scene_dispatcher_t *p_scene_dispatcher;

    mui_toast_view_t *p_toast_view;
    mui_view_dispatcher_t *p_view_dispatcher_toast;

    /* Exit authorizations apply only to the synchronous launcher request. */
    bool exit_saved;
    bool exit_discard;
    bool confirm_discard;
    settings_checkpoint_t entry_settings;
    uint32_t changed_fields;
    uint16_t changed_apps;

    /* Session-only position of the parent menu, independent of submenu lists. */
    uint16_t main_focus;
    uint16_t main_scroll;

    settings_storage_snapshot_t storage_snapshot;
#if defined(BOARD_LCD) && defined(PIXL_RUNTIME_DIAGNOSTICS)
    mui_view_t device_test;
    uint8_t tested_keys;
    uint8_t held_keys;
    uint8_t released_keys;
    uint8_t device_test_page;
    uint8_t backlight_target;
    uint32_t backlight_error;
#endif

} app_settings_t;

typedef enum { SETTINGS_VIEW_ID_MAIN, SETTINGS_VIEW_ID_PROGRESS_BAR, SETTINGS_VIEW_ID_MSG_BOX, SETTINGS_VIEW_ID_TOAST,
               SETTINGS_VIEW_ID_DEVICE_TEST } settings_view_id_t;

#if defined(BOARD_LCD) && defined(PIXL_RUNTIME_DIAGNOSTICS)
void settings_device_test_open(app_settings_t *app);
void settings_device_test_restore(app_settings_t *app);
#endif

#define APP_SETTINGS_CHANGED(app, field) ((app)->changed_fields |= SETTINGS_FIELD_MASK(field))

extern mini_app_t app_settings_info;

#endif
