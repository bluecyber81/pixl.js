#include "app_desktop.h"
#include "mini_app_registry.h"

#include "mui_include.h"

#include "app_list_view.h"
#include "i18n/language.h"
#include "mini_app_launcher.h"
#include "mui_nav_diag.h"

#include "settings.h"

typedef enum { DESKTOP_VIEW_ID_MAIN } desktop_view_id_t;

static void app_desktop_on_run(mini_app_inst_t *p_app_inst);
static void app_desktop_on_kill(mini_app_inst_t *p_app_inst);
static void app_desktop_on_event(mini_app_inst_t *p_app_inst, mini_app_event_t *p_event);

typedef struct {
    app_list_view_t *p_app_list_view;
    mui_view_dispatcher_t *p_view_dispatcher;
} app_desktop_t;

static void app_desktop_list_view_on_selected(app_list_view_event_t event, app_list_view_t *p_view) {
    const mini_app_t *app = app_list_view_get(p_view, app_list_view_get_focus(p_view));
    if (!app) return;
    mini_app_launcher_t *launcher = mini_app_launcher();
    bool first = mui_menu_diag_select(app->id);
    mini_app_launcher_run(launcher, app->id);
    if (first) mui_menu_diag_return(launcher->p_main_app_inst && launcher->p_main_app_inst->p_app == app);
}

static void app_desktop_populate_list(app_list_view_t *view, uint32_t enabled_apps, uint32_t last_app_id) {
    for (uint32_t i = 0; i < mini_app_registry_get_app_num(); i++) {
        const mini_app_t *app = mini_app_registry_find_by_index(i);
        if (app->sys) continue;
        if ((enabled_apps & (1u << app->id)) || app->id == MINI_APP_ID_SETTINGS)
            app_list_view_add_app(view, app, app->id == last_app_id);
    }
}

void app_desktop_on_run(mini_app_inst_t *p_app_inst) {

    app_desktop_t *p_app_handle = mui_mem_malloc(sizeof(app_desktop_t));
    if (!p_app_handle) { p_app_inst->p_handle = NULL; return; }
    memset(p_app_handle, 0, sizeof(app_desktop_t));
    /* Construct every owned UI object before any app activation. */
    p_app_handle->p_view_dispatcher = mui_view_dispatcher_create();
    if (!p_app_handle->p_view_dispatcher) goto startup_failed;
    p_app_handle->p_app_list_view = app_list_view_create();
    if (!p_app_handle->p_app_list_view) goto startup_failed;
    p_app_inst->p_handle = p_app_handle;



    app_desktop_populate_list(p_app_handle->p_app_list_view, settings_get_data()->app_enable_bits,
                              mini_app_launcher()->last_menu_app_id);

    app_list_view_set_event_cb(p_app_handle->p_app_list_view, app_desktop_list_view_on_selected);

    mui_view_dispatcher_add_view(p_app_handle->p_view_dispatcher, DESKTOP_VIEW_ID_MAIN,
                                 app_list_view_get_view(p_app_handle->p_app_list_view));
    mui_view_dispatcher_attach(p_app_handle->p_view_dispatcher, MUI_LAYER_WINDOW);
    mui_view_dispatcher_switch_to_view(p_app_handle->p_view_dispatcher, DESKTOP_VIEW_ID_MAIN);
    mui_menu_diag_enter();

    return;

startup_failed:
    app_list_view_free(p_app_handle->p_app_list_view);
    mui_view_dispatcher_free(p_app_handle->p_view_dispatcher);
    mui_mem_free(p_app_handle);
    p_app_inst->p_handle = NULL;
}

void app_desktop_on_kill(mini_app_inst_t *p_app_inst) {
    app_desktop_t *p_app_handle = p_app_inst->p_handle;
    if (!p_app_handle) return;
    mui_menu_diag_leave();

    mui_view_dispatcher_switch_to_view(p_app_handle->p_view_dispatcher, VIEW_NONE);
    mui_view_dispatcher_detach(p_app_handle->p_view_dispatcher, MUI_LAYER_WINDOW);
    mui_view_dispatcher_free(p_app_handle->p_view_dispatcher);
    app_list_view_free(p_app_handle->p_app_list_view);

    mui_mem_free(p_app_handle);

    p_app_inst->p_handle = NULL;
}

void app_desktop_on_event(mini_app_inst_t *p_app_inst, mini_app_event_t *p_event) {}

mini_app_t app_desktop_info = {.id = MINI_APP_ID_DESKTOP,
                               .name = "desktop",
                               .icon = 0xe1f0,
                               .deamon = false,
                               .sys = true,
                               .hibernate_enabled = false,
                               .run_cb = app_desktop_on_run,
                               .kill_cb = app_desktop_on_kill,
                               .on_event_cb = app_desktop_on_event};
