
#include "mui_scene_dispatcher.h"

#include "chameleon_scene.h"
#include "i18n/language.h"

void chameleon_add_menu_rows(mui_list_view_t *list, const chameleon_menu_row_t *rows, size_t count) {
    for (size_t i = 0; i < count; ++i) {
        mui_list_view_add_item(list, rows[i].icon, getLangString(rows[i].label), (void *)(uintptr_t)rows[i].action);
    }
}

#define ADD_SCENE(prefix, name, id) \
    void prefix##_scene_##name##_on_enter(void*); \
    void prefix##_scene_##name##_on_exit(void* context); 
#include "chameleon_scene_config.h"
#undef ADD_SCENE

const mui_scene_t chameleon_scene_defines[] = {

#define ADD_SCENE(prefix, name, id) \
    { \
        .scene_id = (CHAMELEON_SCENE_##id), \
        .enter_cb = prefix##_scene_##name##_on_enter, \
        .exit_cb = prefix##_scene_##name##_on_exit \
    }, \

#include "chameleon_scene_config.h"
#undef ADD_SCENE

};