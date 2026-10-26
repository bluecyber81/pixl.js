#ifndef MUI_SCENE_DISPATCHER_H
#define MUI_SCENE_DISPATCHER_H

#include "mui_common.h"
typedef void (*mui_scene_enter_cb_t)(void *user_data);
typedef void (*mui_scene_exit_cb_t)(void *user_data);

/* A 63-byte filesystem path can nest at most 31 one-character directories;
 * leave room for their menus too, without allocating while changing scenes. */
#define MUI_SCENE_STACK_CAPACITY 64

typedef struct {
    uint32_t scene_id;
    mui_scene_enter_cb_t enter_cb;
    mui_scene_exit_cb_t exit_cb;
} mui_scene_t;

typedef struct {
    void *user_data;
    const mui_scene_t *p_scene_defines;
    uint32_t scene_num;
    uint32_t default_scene_id;
    uint32_t scene_id_stack[MUI_SCENE_STACK_CAPACITY];
    uint8_t scene_depth;
    bool (*transition_guard)(void);
} mui_scene_dispatcher_t;

mui_scene_dispatcher_t* mui_scene_dispatcher_create();
void mui_scene_dispatcher_free(mui_scene_dispatcher_t* p_dispatcher);
void mui_scene_dispatcher_exit(mui_scene_dispatcher_t* p_dispatcher);

void mui_scene_dispatcher_set_scene_defines(mui_scene_dispatcher_t *p_dispatcher, const mui_scene_t *p_scene_defines,
                                            uint32_t scene_num);
void mui_scene_dispatcher_set_user_data(mui_scene_dispatcher_t *p_dispatcher, void *user_data);
/* Push a new scene; named ancestors are resumed (history above them removed),
 * and requesting the current scene refreshes it without growing history. */
void mui_scene_dispatcher_next_scene(mui_scene_dispatcher_t *p_dispatcher, uint32_t scene_id);
void mui_scene_dispatcher_previous_scene(mui_scene_dispatcher_t *p_dispatcher);
void mui_scene_dispatcher_back_scene(mui_scene_dispatcher_t *p_dispatcher, uint32_t step);

uint32_t mui_scene_dispatcher_current_scene(mui_scene_dispatcher_t *p_dispatcher);

static inline void mui_mui_scene_dispatcher_set_default_scene_id(mui_scene_dispatcher_t *p_dispatcher, uint32_t default_scene_id) {
    p_dispatcher->default_scene_id = default_scene_id;
}

#endif
