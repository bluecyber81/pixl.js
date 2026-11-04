#include "app_chameleon.h"
#include "chameleon_scene.h"
#include "chameleon_view.h"
#include "amiibo_helper.h"

#include "nrf_log.h"

#include "settings.h"
#include "hal_nfc_t2t.h"
#include "nfc_mf1.h"
#include "tag_emulation.h"
#include "tag_helper.h"

static void chameleon_scene_main_event_cb(chameleon_view_event_t event, chameleon_view_t *p_view) {
    app_chameleon_t *app = p_view->user_data;
    if (event == CHAMELEON_VIEW_EVENT_MENU) {
        mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, CHAMELEON_SCENE_MENU);
    } else if (event == CHAMELEON_VIEW_EVENT_PREV || event == CHAMELEON_VIEW_EVENT_NEXT) {
        uint8_t current = tag_emulation_get_slot();
        uint8_t next = event == CHAMELEON_VIEW_EVENT_PREV ? tag_emulation_slot_find_prev(current)
                                                         : tag_emulation_slot_find_next(current);
        if (!tag_emulation_change_slot(next, true)) app_chameleon_show_save_error(app);
        else if (!tag_emulation_active_data_ready()) app_chameleon_show_load_error(app);
    }
}

void chameleon_scene_main_on_enter(void *user_data) {
    app_chameleon_t *app = user_data;

    if (tag_helper_get_active_tag_type() == TAG_TYPE_UNDEFINED) {
        mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, CHAMELEON_SCENE_MENU_CARD_TYPE);
        return;
    }
    if (!tag_emulation_active_data_ready()) {
        app_chameleon_show_load_error(app);
        return;
    }

    hal_nfc_set_nrfx_irq_enable(true);

    tag_emulation_sense_run();

    chameleon_view_set_event_cb(app->p_chameleon_view, chameleon_scene_main_event_cb);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, CHAMELEON_VIEW_ID_MAIN);
}

void chameleon_scene_main_on_exit(void *user_data) {
    app_chameleon_t *app = user_data;
    tag_emulation_sense_end();
    hal_nfc_set_nrfx_irq_enable(false);
}
