
#include "mini_app_launcher.h"
#include "mini_app_registry.h"
#include "mui_nav_diag.h"
#include "nrf_log.h"
#include "nrf_log_ctrl.h"
#include "settings.h"
#include "nrf_power.h"
#include "tag_helper.h"
#include "ntag_emu.h"
#ifdef VFS_PACKED_LFS_ENABLE
#include "vfs_packed_runtime.h"
#endif

mini_app_launcher_t *mini_app_launcher() {
    static mini_app_launcher_t launcher;
    return &launcher;
}

bool mini_app_launcher_input_blocked(mini_app_launcher_t *launcher) {
    return launcher->exit_busy || launcher->exit_prepared;
}

static void mini_app_launcher_clear_exit(mini_app_launcher_t *launcher) {
    launcher->exit_prepared = false;
    launcher->prepared_inst = NULL;
    launcher->prepared_handle = NULL;
}

bool mini_app_launcher_exit_prepared(mini_app_launcher_t *launcher, mini_app_exit_reason_t reason) {
    mini_app_inst_t *inst = launcher->p_main_app_inst;
    return launcher->exit_prepared && !launcher->exit_busy && launcher->exit_reason == reason &&
           launcher->prepared_inst == inst && (!inst ||
           (inst->state == APP_STATE_RUNNING && inst->p_handle == launcher->prepared_handle));
}

void mini_app_launcher_cancel_exit(mini_app_launcher_t *launcher) {
    if (launcher->exit_busy || !launcher->exit_prepared) return;
    mini_app_inst_t *inst = launcher->prepared_inst;
    void *handle = launcher->prepared_handle;
    launcher->exit_busy = true;
    mini_app_launcher_clear_exit(launcher);
    if (inst && inst == launcher->p_main_app_inst && inst->state == APP_STATE_RUNNING &&
        inst->p_handle == handle && inst->p_app->cancel_exit_cb)
        inst->p_app->cancel_exit_cb(inst);
    ntag_emu_cancel_change();
    launcher->exit_busy = false;
}

bool mini_app_launcher_prepare_exit(mini_app_launcher_t *launcher, mini_app_exit_reason_t reason) {
    if (launcher->exit_busy) return false;
    if (launcher->exit_prepared) return mini_app_launcher_exit_prepared(launcher, reason);
    launcher->exit_busy = true;
    if (!ntag_emu_prepare_change()) {
        launcher->exit_busy = false;
        return false;
    }
    mini_app_inst_t *inst = launcher->p_main_app_inst;
    void *handle = inst ? inst->p_handle : NULL;
    bool ready = !inst || !handle || inst->state != APP_STATE_RUNNING ||
                 !inst->p_app->prepare_exit_cb || inst->p_app->prepare_exit_cb(inst, reason);
    /* A callback must never authorize teardown of a different owner. */
    if (ready && inst == launcher->p_main_app_inst && (!inst || inst->p_handle == handle)) {
        launcher->prepared_inst = inst;
        launcher->prepared_handle = handle;
        launcher->exit_reason = reason;
        launcher->exit_prepared = true;
    } else {
        if (ready && inst && inst->p_handle == handle && inst->p_app->cancel_exit_cb)
            inst->p_app->cancel_exit_cb(inst);
        ntag_emu_cancel_change();
        ready = false;
    }
    launcher->exit_busy = false;
    return ready;
}

static mini_app_inst_t *mini_app_launcher_find(mini_app_launcher_t *launcher, uint32_t id) {
    for (mini_app_inst_t *p = launcher->instances; p; p = p->next)
        if (p->p_app->id == id) return p;
    return NULL;
}
static void mini_app_launcher_inst_kill(mini_app_launcher_t *launcher, mini_app_inst_t *inst) {
    if (!inst || !inst->p_handle || inst->state != APP_STATE_RUNNING) return;
    inst->p_app->kill_cb(inst);
    inst->state = APP_STATE_KILLED;
    if (inst == launcher->p_main_app_inst) {
#ifdef MUI_FIRST_MENU_DIAG
        mui_menu_return_diag_begin(inst->p_app->sys ? 0u : (uint8_t)inst->p_app->id,
                                   mui_input_context_current());
#endif
        mui_input_context_changed();
    }
}
static mini_app_inst_t *mini_app_launcher_inst_run(mini_app_launcher_t *launcher, uint32_t id, uint8_t *retain) {
    const mini_app_t *app = mini_app_registry_find_by_id(id);
    if (!app) return NULL;
    mini_app_inst_t *inst = mini_app_launcher_find(launcher, id);
    if (!inst) {
        inst = mui_mem_malloc(sizeof(*inst));
        if (!inst) return NULL;
        memset(inst, 0, sizeof(*inst));
        inst->p_app = app;
        inst->next = launcher->instances;
        launcher->instances = inst;
    }
    if (inst->state == APP_STATE_RUNNING && inst->p_handle) return inst;
    inst->p_retain_data = retain;
    inst->p_handle = NULL;
    inst->state = APP_STATE_KILLED;
    app->run_cb(inst);
    if (!inst->p_handle) return NULL;
    inst->state = APP_STATE_RUNNING;
    return inst;
}
void mini_app_launcher_run_with_retain_data(mini_app_launcher_t *launcher, uint32_t id, uint8_t *retain) {
#ifdef VFS_PACKED_LFS_ENABLE
    if (vfs_packed_recovery_required() && id != MINI_APP_ID_BLE && id != MINI_APP_ID_STATUS_BAR) {
        id = MINI_APP_ID_BLE;
        retain = NULL;
    }
#endif
    if (mini_app_launcher_input_blocked(launcher)) return;
    const mini_app_t *app = mini_app_registry_find_by_id(id);
    if (!app) return;
    if (!app->deamon && !mini_app_launcher_prepare_exit(launcher, MINI_APP_EXIT_SWITCH)) return;
    launcher->exit_busy = true;
    if (!app->deamon && launcher->p_main_app_inst) {
        mini_app_launcher_inst_kill(launcher, launcher->p_main_app_inst);
        launcher->p_main_app_inst = NULL;
    }
    mini_app_launcher_clear_exit(launcher);
    mini_app_inst_t *inst = mini_app_launcher_inst_run(launcher, id, retain);
    if (!app->deamon) {
        launcher->p_main_app_inst = inst;
        if (inst && !app->sys) launcher->last_menu_app_id = app->id;
        /* Also fence input produced during startup or an allocation failure.
         * The old app was already destroyed, even when inst is NULL. */
        mui_input_context_changed();
#ifdef MUI_FIRST_MENU_DIAG
        mui_menu_return_diag_commit(inst && id == MINI_APP_ID_DESKTOP,
                                    (uint8_t)launcher->last_menu_app_id, mui_input_context_current());
#endif
    }
    launcher->exit_busy = false;
    if (!inst) mui_show_memory_error(mui());
}
void mini_app_launcher_run(mini_app_launcher_t *launcher, uint32_t id) {
    mini_app_launcher_run_with_retain_data(launcher, id, NULL);
}
void mini_app_launcher_kill(mini_app_launcher_t *launcher, uint32_t id) {
    if (mini_app_launcher_input_blocked(launcher)) return;
    mini_app_inst_t *inst = mini_app_launcher_find(launcher, id);
    if (!inst) return;
    bool was_main = inst == launcher->p_main_app_inst;
    if (was_main && !mini_app_launcher_prepare_exit(launcher, MINI_APP_EXIT_SWITCH)) return;
    launcher->exit_busy = true;
    mini_app_launcher_inst_kill(launcher, inst);
    if (was_main) launcher->p_main_app_inst = NULL;
    mini_app_launcher_clear_exit(launcher);
    launcher->exit_busy = false;
    if (was_main) mini_app_launcher_run(launcher, MINI_APP_ID_DESKTOP);
}
void mini_app_launcher_exit(mini_app_launcher_t *launcher) {
    if (launcher->p_main_app_inst) mini_app_launcher_kill(launcher, launcher->p_main_app_inst->p_app->id);
}
void *mini_app_launcher_get_app_handle(mini_app_launcher_t *launcher, uint32_t id) {
    mini_app_inst_t *inst = mini_app_launcher_find(launcher, id);
    return inst && inst->state == APP_STATE_RUNNING ? inst->p_handle : NULL;
}
void mini_app_launcher_post_event(mini_app_launcher_t *launcher, uint32_t id, mini_app_event_t *event) {
    mini_app_inst_t *inst = mini_app_launcher_find(launcher, id);
    if (inst == launcher->p_main_app_inst && mini_app_launcher_input_blocked(launcher)) return;
    if (inst && inst->state == APP_STATE_RUNNING && inst->p_handle && inst->p_app->on_event_cb)
        inst->p_app->on_event_cb(inst, event);
}

void mini_app_launcher_init(mini_app_launcher_t *p_launcher, uint32_t wakeup_reason) {

    memset(p_launcher, 0, sizeof(*p_launcher));

    mini_app_launcher_run(p_launcher, MINI_APP_ID_STATUS_BAR);
#ifdef VFS_PACKED_LFS_ENABLE
    if (vfs_packed_recovery_required()) {
        mini_app_launcher_run(p_launcher, MINI_APP_ID_BLE);
        return;
    }
#endif

    cache_data_t *p_cache = cache_get_data();
    settings_data_t *p_settings = settings_get_data();
    
    NRF_LOG_INFO("wakeup reason: %d", wakeup_reason);

    if( (wakeup_reason & NRF_POWER_RESETREAS_NFC_MASK) && tag_helper_valid_default_slot()){
        mini_app_launcher_run_with_retain_data(p_launcher, MINI_APP_ID_CHAMELEON, NULL);
    }else if (p_cache->enabled == 1 && p_settings->hibernate_enabled == 1) {
        const mini_app_t *saved_app = mini_app_registry_find_by_id(p_cache->id);
        if (saved_app && !saved_app->deamon && saved_app->hibernate_enabled) {
            mini_app_launcher_run_with_retain_data(p_launcher, p_cache->id, p_cache->retain_data);
        } else {
            /* A stale/unsupported retained ID must never leave only the
             * background status bar running. Do not restore daemon state. */
            p_cache->enabled = false;
            memset(p_cache->retain_data, 0, sizeof(p_cache->retain_data));
            mini_app_launcher_run_with_retain_data(p_launcher, MINI_APP_ID_DESKTOP, NULL);
        }
    } else {
        mini_app_launcher_run_with_retain_data(p_launcher, MINI_APP_ID_DESKTOP, NULL);
    }
}

bool mini_app_launcher_sleep(mini_app_launcher_t *p_launcher) {
    if (!mini_app_launcher_prepare_exit(p_launcher, MINI_APP_EXIT_SLEEP)) return false;
    p_launcher->exit_busy = true;
    mini_app_inst_t *app = p_launcher->p_main_app_inst;
    cache_data_t *p_cache = cache_get_data();
    if (!app) {
        p_cache->enabled = false;
        memset(p_cache->retain_data, 0, sizeof(p_cache->retain_data));
    } else {
        settings_data_t *p_settings = settings_get_data();
        NRF_LOG_INFO("running APP: %d %s %d", app->p_app->id, nrf_log_push((char *)app->p_app->name),
                     app->p_app->hibernate_enabled);
        if (app->p_app->hibernate_enabled == 1 && p_settings->hibernate_enabled == 1) {
            p_cache->id = app->p_app->id;
            p_cache->enabled = true;
            app->p_retain_data = p_cache->retain_data;
        } else {
            p_cache->enabled = false;
            memset(p_cache->retain_data, 0, sizeof(p_cache->retain_data));
            app->p_retain_data = NULL;
        }
        mini_app_launcher_inst_kill(p_launcher, app);
    }
    p_launcher->p_main_app_inst = NULL;
    mini_app_launcher_clear_exit(p_launcher);
    p_launcher->exit_busy = false;
    return true;
}
