#include "app_chameleon.h"
#include "mini_app_registry.h"
#include "mini_app_launcher.h"

#include "mui_include.h"

#include "chameleon_scene.h"
#include "fds_utils.h"
#include "i18n/language.h"
#include "settings.h"
#include "tag_helper.h"
#include "hal_nfc_t2t.h"

static void app_chameleon_on_run(mini_app_inst_t *p_app_inst);
static void app_chameleon_on_kill(mini_app_inst_t *p_app_inst);
static void app_chameleon_on_event(mini_app_inst_t *p_app_inst, mini_app_event_t *p_event);

static void app_chameleon_pause(app_chameleon_t *app) {
    if (app->exit_paused) return;
    app->exit_paused = true;
    app->exit_resume_nfc = mui_scene_dispatcher_current_scene(app->p_scene_dispatcher) == CHAMELEON_SCENE_MAIN;
    app->exit_view_id = VIEW_NONE;
    mui_view_dispatcher_t *views = app->p_view_dispatcher;
    for (uint8_t i = 0; i < views->view_count; i++) {
        if (views->views[i].view == views->p_active_view) app->exit_view_id = views->views[i].id;
    }
    tag_emulation_sense_end();
    hal_nfc_set_nrfx_irq_enable(false);
}

static void app_chameleon_resume(app_chameleon_t *app) {
    app->exit_prepared = false;
    if (!app->exit_paused) return;
    app->exit_paused = false;
    app->retry_slot_count = false;
    if (app->p_view_dispatcher->p_active_view == &app->save_error_view) {
        mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, app->exit_view_id);
    }
    if (app->exit_resume_nfc && tag_emulation_active_data_ready()) {
        hal_nfc_set_nrfx_irq_enable(true);
        tag_emulation_sense_run();
    }
    mui_update(mui());
}

void app_chameleon_show_save_error(app_chameleon_t *app) {
    app_chameleon_pause(app);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, CHAMELEON_VIEW_ID_SAVE_ERROR);
}

bool app_chameleon_save(app_chameleon_t *app) {
    if (!app || app->exit_prepared) return false;
    if (!app->initialized) return true;
    app_chameleon_pause(app);
    bool saved = app->retry_slot_count ? tag_emulation_save_config() : tag_emulation_save();
    if (!saved || settings_save() != NRF_SUCCESS) {
        mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, CHAMELEON_VIEW_ID_SAVE_ERROR);
        return false;
    }
    app_chameleon_resume(app);
    return true;
}

static void app_chameleon_save_error_draw(mui_view_t *view, mui_canvas_t *canvas) {
    app_chameleon_t *app = view->user_data;
    const char *detail = app->retry_slot_count ? _T(DE3_SLOT_COUNT_PENDING) : _T(DE3_SAVE_RAM_ONLY);
    const char *lines[] = {_T(DE3_SAVE_FAILED), detail, _T(DE3_SAVE_RETRY), _T(DE3_BLE_BACK)};
    mui_canvas_set_font(canvas, u8g2_font_wqy12_t_gb2312a);
    mui_canvas_set_draw_color(canvas, 1);
    for (uint8_t i = 0; i < 4; i++) mui_canvas_draw_utf8(canvas, 0, 12 + 15 * i, lines[i]);
}

static void app_chameleon_save_error_input(mui_view_t *view, mui_input_event_t *event) {
    app_chameleon_t *app = view->user_data;
    if (app->exit_prepared || event->key != INPUT_KEY_CENTER) return;
    if (event->type == INPUT_TYPE_SHORT) (void)app_chameleon_save(app);
    else if (event->type == INPUT_TYPE_LONG) app_chameleon_resume(app);
}

static bool app_chameleon_prepare_exit(mini_app_inst_t *inst, mini_app_exit_reason_t reason) {
    (void)reason;
    app_chameleon_t *app = inst->p_handle;
    if (!app || !app->initialized || app->exit_prepared) return true;
    app_chameleon_pause(app);
    settings_data_t *settings = settings_get_data();
    uint8_t default_slot = settings->chameleon_default_slot_index;
    if (!tag_emulation_save_for_exit(&settings->chameleon_default_slot_index) ||
        settings_save() != NRF_SUCCESS) {
        settings->chameleon_default_slot_index = default_slot;
        mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, CHAMELEON_VIEW_ID_SAVE_ERROR);
        return false;
    }
    /* Launcher blocks all UI input while its exit reservation is held.
     * NFC remains stopped until cleanup or the matching cancellation. */
    app->exit_prepared = true;
    return true;
}

static void app_chameleon_cancel_exit(mini_app_inst_t *inst) {
    app_chameleon_t *app = inst->p_handle;
    if (app) app_chameleon_resume(app);
}

static void app_chameleon_init_error_cb(mui_msg_box_event_t event, mui_msg_box_t *box) {
    (void)box;
    if (event == MUI_MSG_BOX_EVENT_SELECT_CENTER) mini_app_launcher_exit(mini_app_launcher());
}

void app_chameleon_show_load_error(app_chameleon_t *app) {
    app->initialized = false;
    mui_msg_box_set_header(app->p_msg_box, _T(ERR));
    mui_msg_box_set_message(app->p_msg_box, _T(DE3_STORAGE_IO_ERROR));
    mui_msg_box_set_btn_text(app->p_msg_box, NULL, _T(MAIN_MENU), NULL);
    mui_msg_box_set_btn_focus(app->p_msg_box, 1);
    mui_msg_box_set_event_cb(app->p_msg_box, app_chameleon_init_error_cb);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, CHAMELEON_VIEW_ID_MSG_BOX);
}

typedef struct {
    uint8_t cycle_mode_index;
} app_chameleon_retain_data_t;

void app_chameleon_on_run(mini_app_inst_t *p_app_inst) {

    app_chameleon_t *p_app_handle = mui_mem_malloc(sizeof(app_chameleon_t));
    if (!p_app_handle) { p_app_inst->p_handle = NULL; return; }
    memset(p_app_handle, 0, sizeof(app_chameleon_t));
    /* Construct every owned UI object before any app activation. */
    p_app_handle->p_view_dispatcher = mui_view_dispatcher_create();
    if (!p_app_handle->p_view_dispatcher) goto startup_failed;
    p_app_handle->p_chameleon_view = chameleon_view_create();
    if (!p_app_handle->p_chameleon_view) goto startup_failed;
    p_app_handle->p_scene_dispatcher = mui_scene_dispatcher_create();
    if (!p_app_handle->p_scene_dispatcher) goto startup_failed;
    p_app_handle->p_list_view = mui_list_view_create();
    if (!p_app_handle->p_list_view) goto startup_failed;
    p_app_handle->p_msg_box = mui_msg_box_create();
    if (!p_app_handle->p_msg_box) goto startup_failed;
    p_app_handle->p_toast_view = mui_toast_view_create();
    if (!p_app_handle->p_toast_view) goto startup_failed;
    p_app_handle->p_text_input = mui_text_input_create();
    if (!p_app_handle->p_text_input) goto startup_failed;
    p_app_handle->p_view_dispatcher_toast = mui_view_dispatcher_create();
    if (!p_app_handle->p_view_dispatcher_toast) goto startup_failed;
    p_app_inst->p_handle = p_app_handle;
    p_app_handle->save_error_view.user_data = p_app_handle;
    p_app_handle->save_error_view.draw_cb = app_chameleon_save_error_draw;
    p_app_handle->save_error_view.input_cb = app_chameleon_save_error_input;
    mui_view_dispatcher_add_view(p_app_handle->p_view_dispatcher, CHAMELEON_VIEW_ID_SAVE_ERROR,
                                 &p_app_handle->save_error_view);



    mui_list_view_set_user_data(p_app_handle->p_list_view, p_app_handle);
    chameleon_view_set_user_data(p_app_handle->p_chameleon_view, p_app_handle);
    mui_msg_box_set_user_data(p_app_handle->p_msg_box, p_app_handle);
    mui_toast_view_set_user_data(p_app_handle->p_toast_view, p_app_handle);
    mui_text_input_set_user_data(p_app_handle->p_text_input, p_app_handle);

    mui_view_dispatcher_add_view(p_app_handle->p_view_dispatcher, CHAMELEON_VIEW_ID_MAIN,
                                 chameleon_view_get_view(p_app_handle->p_chameleon_view));
    mui_view_dispatcher_add_view(p_app_handle->p_view_dispatcher, CHAMELEON_VIEW_ID_LIST,
                                 mui_list_view_get_view(p_app_handle->p_list_view));
    mui_view_dispatcher_add_view(p_app_handle->p_view_dispatcher, CHAMELEON_VIEW_ID_MSG_BOX,
                                 mui_msg_box_get_view(p_app_handle->p_msg_box));
    mui_view_dispatcher_add_view(p_app_handle->p_view_dispatcher, CHAMELEON_VIEW_ID_TEXT_INPUT,
                                 mui_text_input_get_view(p_app_handle->p_text_input));

    mui_view_dispatcher_attach(p_app_handle->p_view_dispatcher, MUI_LAYER_FULLSCREEN);

    mui_scene_dispatcher_set_user_data(p_app_handle->p_scene_dispatcher, p_app_handle);
    mui_scene_dispatcher_set_scene_defines(p_app_handle->p_scene_dispatcher, chameleon_scene_defines,
                                           CHAMELEON_SCENE_MAX);

    mui_view_dispatcher_add_view(p_app_handle->p_view_dispatcher_toast, CHAMELEON_VIEW_ID_TOAST,
                                 mui_toast_view_get_view(p_app_handle->p_toast_view));
    mui_view_dispatcher_attach(p_app_handle->p_view_dispatcher_toast, MUI_LAYER_TOAST);
    mui_view_dispatcher_switch_to_view(p_app_handle->p_view_dispatcher_toast, CHAMELEON_VIEW_ID_TOAST);

    if (p_app_inst->p_retain_data) {
        app_chameleon_retain_data_t *p_retain = (app_chameleon_retain_data_t *)p_app_inst->p_retain_data;
    }

    // init emulation
    p_app_handle->initialized = tag_emulation_init();
    if (!p_app_handle->initialized) {
        app_chameleon_show_load_error(p_app_handle);
        return;
    }

    if (!fds_config_file_exists()) {
        mui_scene_dispatcher_next_scene(p_app_handle->p_scene_dispatcher, CHAMELEON_SCENE_FACTORY);
    } else {
        mui_scene_dispatcher_next_scene(p_app_handle->p_scene_dispatcher, CHAMELEON_SCENE_MAIN);
    }

    return;

startup_failed:
    mui_view_dispatcher_free(p_app_handle->p_view_dispatcher_toast);
    mui_text_input_free(p_app_handle->p_text_input);
    mui_toast_view_free(p_app_handle->p_toast_view);
    mui_msg_box_free(p_app_handle->p_msg_box);
    mui_list_view_free(p_app_handle->p_list_view);
    mui_scene_dispatcher_free(p_app_handle->p_scene_dispatcher);
    chameleon_view_free(p_app_handle->p_chameleon_view);
    mui_view_dispatcher_free(p_app_handle->p_view_dispatcher);
    mui_mem_free(p_app_handle);
    p_app_inst->p_handle = NULL;
}

void app_chameleon_on_kill(mini_app_inst_t *p_app_inst) {
    app_chameleon_t *p_app_handle = p_app_inst->p_handle;
    if (!p_app_handle) return;

    app_chameleon_retain_data_t *p_retain = (app_chameleon_retain_data_t *)p_app_inst->p_retain_data;

    if (p_retain) {
        p_retain->cycle_mode_index = chameleon_view_get_index(p_app_handle->p_chameleon_view);
    }

    /* Persistence and NFC quiescence belong to prepare_exit_cb. No writes
     * may be hidden in cleanup after the launcher has accepted the exit. */
    mui_scene_dispatcher_exit(p_app_handle->p_scene_dispatcher);
    mui_scene_dispatcher_free(p_app_handle->p_scene_dispatcher);

    mui_view_dispatcher_detach(p_app_handle->p_view_dispatcher, MUI_LAYER_FULLSCREEN);
    mui_view_dispatcher_free(p_app_handle->p_view_dispatcher);
    mui_list_view_free(p_app_handle->p_list_view);
    mui_text_input_free(p_app_handle->p_text_input);
    chameleon_view_free(p_app_handle->p_chameleon_view);

    mui_view_dispatcher_detach(p_app_handle->p_view_dispatcher_toast, MUI_LAYER_TOAST);
    mui_view_dispatcher_free(p_app_handle->p_view_dispatcher_toast);
    mui_toast_view_free(p_app_handle->p_toast_view);

    mui_msg_box_free(p_app_handle->p_msg_box);
    mui_mem_free(p_app_handle);

    p_app_inst->p_handle = NULL;
}

void app_chameleon_on_event(mini_app_inst_t *p_app_inst, mini_app_event_t *p_event) {}

mini_app_t app_chameleon_info = {.id = MINI_APP_ID_CHAMELEON,
                                 .name = "Chameleon",
                                 .name_i18n_key = _L_APP_CHAMELEON,
                                 .icon = 0xe1db,
                                 .deamon = false,
                                 .sys = false,
                                 .hibernate_enabled = true,
                                 .icon_32x32 = &app_card_emulator_32x32,
                                 .run_cb = app_chameleon_on_run,
                                 .kill_cb = app_chameleon_on_kill,
                                 .on_event_cb = app_chameleon_on_event,
                                 .prepare_exit_cb = app_chameleon_prepare_exit,
                                 .cancel_exit_cb = app_chameleon_cancel_exit};
