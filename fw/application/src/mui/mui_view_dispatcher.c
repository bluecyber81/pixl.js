#include "mui_view_dispatcher.h"
#include "mui_core.h"

static void mui_view_dispatcher_set_curent_view(mui_view_dispatcher_t *d, mui_view_t *v) {
    if (!d) return;
    if (d->p_active_view) mui_view_exit(d->p_active_view);
    d->p_active_view = v;
    if (v) mui_view_enter(v);
    mui_view_port_enable_set(d->p_view_port, v != NULL);
    if (v) mui_view_port_update(d->p_view_port);
}
static void mui_view_dispatcher_on_draw(mui_view_port_t *vp, mui_canvas_t *canvas) {
    mui_view_dispatcher_t *d = vp->user_data;
    if (d->p_active_view) mui_view_draw(d->p_active_view, canvas);
}
static void mui_view_dispatcher_on_input(mui_view_port_t *vp, mui_input_event_t *event) {
    mui_view_dispatcher_t *d = vp->user_data;
    if (d->p_active_view) mui_view_input(d->p_active_view, event);
}
mui_view_dispatcher_t *mui_view_dispatcher_create(void) {
    mui_view_dispatcher_t *d = mui_mem_malloc(sizeof(*d));
    if (!d) return NULL;
    memset(d, 0, sizeof(*d));
    d->p_view_port = mui_view_port_create();
    if (!d->p_view_port) { mui_mem_free(d); return NULL; }
    d->p_view_port->draw_cb = mui_view_dispatcher_on_draw;
    d->p_view_port->input_cb = mui_view_dispatcher_on_input;
    d->p_view_port->user_data = d;
    return d;
}
void mui_view_dispatcher_free(mui_view_dispatcher_t *d) {
    if (!d) return;
    mui_view_port_free(d->p_view_port);
    mui_mem_free(d);
}
void mui_view_dispatcher_add_view(mui_view_dispatcher_t *d, uint32_t id, mui_view_t *v) {
    if (!d || !v) return;
    for (unsigned i = 0; i < d->view_count; i++) {
        if (d->views[i].id == id) { d->views[i].view = v; return; }
    }
    if (d->view_count == MUI_DISPATCHER_MAX_VIEWS) { mui_show_memory_error(mui()); return; }
    d->views[d->view_count].id = id;
    d->views[d->view_count++].view = v;
}
void mui_view_dispatcher_remove_view(mui_view_dispatcher_t *d, uint32_t id) {
    if (!d) return;
    for (unsigned i = 0; i < d->view_count; i++) {
        if (d->views[i].id != id) continue;
        if (d->p_active_view == d->views[i].view) mui_view_dispatcher_set_curent_view(d, NULL);
        d->views[i] = d->views[--d->view_count];
        return;
    }
}
void mui_view_dispatcher_attach(mui_view_dispatcher_t *d, mui_layer_t layer) {
    if (d) mui_add_view_port(mui(), d->p_view_port, layer);
}
void mui_view_dispatcher_detach(mui_view_dispatcher_t *d, mui_layer_t layer) {
    if (!d) return;
    mui_view_port_enable_set(d->p_view_port, false);
    mui_remove_view_port(mui(), d->p_view_port, layer);
}
void mui_view_dispatcher_switch_to_view(mui_view_dispatcher_t *d, uint32_t id) {
    if (!d) return;
    if (id == VIEW_NONE) { mui_view_dispatcher_set_curent_view(d, NULL); return; }
    for (unsigned i = 0; i < d->view_count; i++) {
        if (d->views[i].id == id) { mui_view_dispatcher_set_curent_view(d, d->views[i].view); return; }
    }
}
