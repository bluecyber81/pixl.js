#include "mui_scene_dispatcher.h"
#include "mui_core.h"

mui_scene_dispatcher_t *mui_scene_dispatcher_create(void) {
    mui_scene_dispatcher_t *d = mui_mem_malloc(sizeof(*d));
    if (d) memset(d, 0, sizeof(*d));
    return d;
}
void mui_scene_dispatcher_free(mui_scene_dispatcher_t *d) { mui_mem_free(d); }
void mui_scene_dispatcher_exit(mui_scene_dispatcher_t *d) {
    if (!d || !d->scene_depth || !d->p_scene_defines) return;
    uint32_t id = d->scene_id_stack[d->scene_depth - 1];
    /* Clear before the callback, so a repeated exit cannot stop freed resources. */
    d->scene_depth = 0;
    if (id < d->scene_num && d->p_scene_defines[id].exit_cb)
        d->p_scene_defines[id].exit_cb(d->user_data);
}
void mui_scene_dispatcher_set_scene_defines(mui_scene_dispatcher_t *d, const mui_scene_t *defs, uint32_t count) {
    if (!d) return;
    d->p_scene_defines = defs; d->scene_num = count;
}
void mui_scene_dispatcher_set_user_data(mui_scene_dispatcher_t *d, void *data) { if (d) d->user_data = data; }
void mui_scene_dispatcher_next_scene(mui_scene_dispatcher_t *d, uint32_t id) {
    if (!d || !d->p_scene_defines || id >= d->scene_num) return;
    /* Scenes are single instances whose folder/search state lives in the app.
     * A named return to a parent (or a refresh of the current scene) must not
     * append another copy: many existing menus use next_scene(parent). */
    unsigned next_depth = d->scene_depth + 1;
    for (unsigned i = 0; i < d->scene_depth; i++) {
        if (d->scene_id_stack[i] == id) { next_depth = i + 1; break; }
    }
    if (next_depth > MUI_SCENE_STACK_CAPACITY) { mui_show_memory_error(mui()); return; }
    if (d->scene_depth) {
        uint32_t old = d->scene_id_stack[d->scene_depth - 1];
        if (d->p_scene_defines[old].exit_cb) d->p_scene_defines[old].exit_cb(d->user_data);
    }
    d->scene_depth = next_depth;
    d->scene_id_stack[next_depth - 1] = id;
    if (d->p_scene_defines[id].enter_cb) d->p_scene_defines[id].enter_cb(d->user_data);
}
void mui_scene_dispatcher_back_scene(mui_scene_dispatcher_t *d, uint32_t step) {
    if (!d || !d->scene_depth || !d->p_scene_defines || step == 0) return;
    uint32_t old = d->scene_id_stack[d->scene_depth - 1];
    unsigned depth = step < d->scene_depth ? d->scene_depth - step : 0;
    uint32_t next = depth ? d->scene_id_stack[depth - 1] : d->default_scene_id;
    if (next >= d->scene_num) return;
    if (d->p_scene_defines[old].exit_cb) d->p_scene_defines[old].exit_cb(d->user_data);
    d->scene_depth = depth;
    if (!depth) d->scene_id_stack[d->scene_depth++] = next;
    if (d->p_scene_defines[next].enter_cb) d->p_scene_defines[next].enter_cb(d->user_data);
}
void mui_scene_dispatcher_previous_scene(mui_scene_dispatcher_t *d) { mui_scene_dispatcher_back_scene(d, 1); }
uint32_t mui_scene_dispatcher_current_scene(mui_scene_dispatcher_t *d) {
    return d && d->scene_depth ? d->scene_id_stack[d->scene_depth - 1] : 0;
}
