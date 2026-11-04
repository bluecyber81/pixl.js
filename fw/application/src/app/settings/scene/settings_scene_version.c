#include "app_settings.h"
#include "i18n/language.h"
#include "mini_app_launcher.h"
#include "settings_scene.h"
#include "settings_device_info.h"
#include "utils2.h"
#include "version2.h"

static void settings_scene_version_list_view_on_selected(mui_list_view_event_t event, mui_list_view_t *p_list_view,
                                                         mui_list_item_t *p_item) {
    app_settings_t *app = p_list_view->user_data;
    mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
}

void settings_scene_version_on_enter(void *user_data) {

    app_settings_t *app = user_data;
    char txt[32];
    settings_device_info_format_text(txt, sizeof(txt), version_get_version(NULL));
    mui_list_view_add_item_ext(app->p_list_view, 0xe1c7, "Version", txt, (void *)0xFF);

    settings_device_info_format_text(txt, sizeof(txt), version_get_builddate(NULL));
    mui_list_view_add_item_ext(app->p_list_view, 0xe1c8, "BuildDate", txt, (void *)0xFF);

    settings_device_info_format_text(txt, sizeof(txt), version_get_githash(NULL));
    mui_list_view_add_item_ext(app->p_list_view, 0xe1c9, "GitHash", txt, (void *)0xFF);

    settings_device_info_format_text(txt, sizeof(txt), version_get_gitbranch(NULL));
    mui_list_view_add_item_ext(app->p_list_view, 0xe1ca, "Branch", txt, (void *)0xFF);

#if defined(LCD_SCREEN) && defined(LCD_ST7567)
    settings_device_info_format_text(txt, sizeof(txt), "LCD/ST7567");
#elif defined(OLED_SCREEN) && defined(OLED_SH1106)
    settings_device_info_format_text(txt, sizeof(txt), "OLED/SH1106");
#else
    snprintf(txt, sizeof(txt), "[%u]", (unsigned)version_get_target(NULL));
#endif
    mui_list_view_add_item_ext(app->p_list_view, 0xe1cb, _T(DE39_INFO_BUILD_TARGET), txt, (void *)0xFF);

    settings_device_info_format_chip(txt, sizeof(txt), NRF_FICR->INFO.PART);
    mui_list_view_add_item_ext(app->p_list_view, 0xe1cb, "Chip", txt, (void *)0xFF);

    settings_softdevice_info_t sd_info;
    bool sd_valid = settings_device_info_read_softdevice(&sd_info);
    if (sd_valid) {
        settings_device_info_format_softdevice(txt, sizeof(txt), &sd_info);
    } else {
        settings_device_info_format_text(txt, sizeof(txt), _T(DE39_INFO_UNKNOWN));
    }
    mui_list_view_add_item_ext(app->p_list_view, 0xe1cb, "SoftDevice", txt, (void *)0xFF);

    if (sd_valid) {
        snprintf(txt, sizeof(txt), "[0x%04X]", (unsigned)sd_info.fwid);
    } else {
        settings_device_info_format_text(txt, sizeof(txt), _T(DE39_INFO_UNKNOWN));
    }
    mui_list_view_add_item_ext(app->p_list_view, 0xe1cb, "SD-FWID", txt, (void *)0xFF);

    snprintf(txt, sizeof(txt), "[%u]", (unsigned)version_get_dirty_flag(NULL));
    mui_list_view_add_item_ext(app->p_list_view, 0xe1cc, "Dirty", txt, (void *)0xFF);

    snprintf(txt, sizeof(txt), "[%.12s]", version_get_source_id());
    mui_list_view_add_item_ext(app->p_list_view, 0xe1c9, "Source-ID", txt, (void *)0xFF);

    mui_list_view_add_item(app->p_list_view, 0xe1cd, getLangString(_L_BACK), (void *)0);

    mui_list_view_set_selected_cb(app->p_list_view, settings_scene_version_list_view_on_selected);

    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, SETTINGS_VIEW_ID_MAIN);
}

void settings_scene_version_on_exit(void *user_data) {
    app_settings_t *app = user_data;
    mui_list_view_clear_items(app->p_list_view);
    mui_list_view_set_selected_cb(app->p_list_view, NULL);
}
