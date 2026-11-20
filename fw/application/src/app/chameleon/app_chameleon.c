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
#include <stdio.h>

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
    app->discard_state = CHAMELEON_SAVE_ERROR;
    if (!app->exit_paused) return;
    app->exit_paused = false;
    app->retry_slot_count = false;
    if (app->p_view_dispatcher->p_active_view == &app->save_error_view) {
        mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, app->exit_view_id);
        mui_input_modal_boundary();
    }
    if (app->exit_resume_nfc && tag_emulation_active_data_ready()) {
        hal_nfc_set_nrfx_irq_enable(true);
        tag_emulation_sense_run();
    }
    mui_update(mui());
}

void app_chameleon_show_save_error(app_chameleon_t *app) {
    app_chameleon_pause(app);
    app->save_error_drawn = false;
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, CHAMELEON_VIEW_ID_SAVE_ERROR);
    /* A full event queue can evict a requested redraw to make room for keys. */
    mui_update_now(mui());
}

bool app_chameleon_save(app_chameleon_t *app) {
    if (!app || app->exit_prepared) return false;
    if (!app->initialized) return true;
    app_chameleon_pause(app);
    chameleon_save_begin();
    bool saved = app->retry_slot_count ? tag_emulation_save_config() : tag_emulation_save();
    if (!saved || !chameleon_save_settings()) {
        app_chameleon_show_save_error(app);
        return false;
    }
    app_chameleon_resume(app);
    return true;
}

static void app_chameleon_save_error_draw(mui_view_t *view, mui_canvas_t *canvas) {
    static const L_StringID failure[] = {
        _L_DE3_SAVE_FAILED, _L_DE3_CARD_CHECK, _L_DE3_SAVE_RETRY, _L_DE3_BLE_BACK, _L_DE3_SAVE_DISCARD
    };
    static const L_StringID confirm[] = {
        _L_MAIN_MENU, _L_DE3_SAVE_DISCARD_ASK, _L_DE3_SAVE_NO_SELECTED, _L_DE3_SAVE_CONFIRM
    };
    static const L_StringID stages[] = {
        [CHAMELEON_SAVE_CARD] = _L_DE3_CARD_CHECK, [CHAMELEON_READ_CARD] = _L_DE3_CARD_READ,
        [CHAMELEON_WRITE_CARD] = _L_DE3_CARD_WRITE, [CHAMELEON_READ_CONFIG] = _L_DE3_CONFIG_READ,
        [CHAMELEON_WRITE_CONFIG] = _L_DE3_CONFIG_WRITE, [CHAMELEON_SAVE_SETTINGS] = _L_APP_SET
    };
    app_chameleon_t *app = view->user_data;
    bool confirming = app->discard_state != CHAMELEON_SAVE_ERROR;
    const L_StringID *lines = confirming ? confirm : failure;
    const uint8_t spacing = confirming ? 16 : 12;
    const chameleon_save_issue_t *issue = chameleon_last_save_issue();
    mui_canvas_set_font(canvas, u8g2_font_wqy12_t_gb2312a);
    mui_canvas_set_draw_color(canvas, 1);
    for (uint8_t row = 0; row < (confirming ? 4 : 5); row++) {
        L_StringID id = lines[row];
        int32_t code = 0;
        if (id == _L_DE3_CARD_CHECK && (unsigned)issue->stage < sizeof(stages) / sizeof(stages[0])) {
            id = stages[issue->stage];
            if (id != _L_DE3_CARD_CHECK) code = issue->code;
        } else if (id == _L_DE3_SAVE_NO_SELECTED && app->discard_state == CHAMELEON_DISCARD_YES) {
            id = _L_DE3_SAVE_YES_SELECTED;
        }
        const char *text = getLangString(id);
        char message[40];
        if (code) {
            snprintf(message, sizeof(message), "%s %ld", text, (long)code);
            text = message;
        }
        mui_canvas_draw_utf8(canvas, 0, 12 + spacing * row, text);
    }
    if (!app->save_error_drawn) {
        app->save_error_drawn = true;
        mui_fence_input_after_frame();
    }
}

static void app_chameleon_save_error_input(mui_view_t *view, mui_input_event_t *event) {
    app_chameleon_t *app = view->user_data;
    if (app->exit_prepared || !app->save_error_drawn) return;
    if (event->type == INPUT_TYPE_LONG && event->key == INPUT_KEY_CENTER) {
        if (app->discard_state == CHAMELEON_SAVE_ERROR) {
            app_chameleon_resume(app);
            return;
        }
        app->discard_state = CHAMELEON_SAVE_ERROR;
    } else if (event->type != INPUT_TYPE_SHORT) {
        return;
    } else if (event->key == INPUT_KEY_RIGHT) {
        app->discard_state = app->discard_state == CHAMELEON_SAVE_ERROR ? CHAMELEON_DISCARD_NO : CHAMELEON_DISCARD_YES;
    } else if (event->key == INPUT_KEY_LEFT && app->discard_state != CHAMELEON_SAVE_ERROR) {
        app->discard_state = CHAMELEON_DISCARD_NO;
    } else if (event->key == INPUT_KEY_CENTER) {
        switch (app->discard_state) {
        case CHAMELEON_SAVE_ERROR:
            (void)app_chameleon_save(app);
            return;
        case CHAMELEON_DISCARD_NO:
            app->discard_state = CHAMELEON_SAVE_ERROR;
            break;
        case CHAMELEON_DISCARD_YES:
            /* Only this synchronous launcher request may discard. A veto by
             * another owner cancels the authorization and keeps our RAM intact. */
            app->discard_state = CHAMELEON_DISCARD_EXIT;
            mini_app_launcher_exit(mini_app_launcher());
            app = mini_app_launcher_get_app_handle(mini_app_launcher(), MINI_APP_ID_CHAMELEON);
            if (!app) return;
            app->discard_state = CHAMELEON_SAVE_ERROR;
            break;
        default:
            return;
        }
    } else {
        return;
    }
    app->save_error_drawn = false;
    mui_update_now(mui());
}

static bool app_chameleon_prepare_exit(mini_app_inst_t *inst, mini_app_exit_reason_t reason) {
    app_chameleon_t *app = inst->p_handle;
    if (!app || !app->initialized || app->exit_prepared) return true;
    if (reason == MINI_APP_EXIT_SWITCH && app->exit_paused &&
        app->discard_state == CHAMELEON_DISCARD_EXIT &&
        app->p_view_dispatcher->p_active_view == &app->save_error_view) {
        app->exit_prepared = true;
        return true;
    }
    app->discard_state = CHAMELEON_SAVE_ERROR;
    app_chameleon_pause(app);
    settings_data_t *settings = settings_get_data();
    uint8_t default_slot = settings->chameleon_default_slot_index;
    chameleon_save_begin();
    if (!tag_emulation_save_for_exit(&settings->chameleon_default_slot_index) ||
        !chameleon_save_settings()) {
        settings->chameleon_default_slot_index = default_slot;
        app_chameleon_show_save_error(app);
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
    if (p_app_handle->exit_prepared && p_app_handle->discard_state == CHAMELEON_DISCARD_EXIT) {
        settings_discard_chameleon_changes();
        tag_emulation_discard();
    }
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
