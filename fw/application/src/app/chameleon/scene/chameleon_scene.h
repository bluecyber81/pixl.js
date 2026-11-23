#ifndef CHAMELEON_SCENE_H
#define CHAMELEON_SCENE_H

#include "mui_scene_dispatcher.h"
#include "mui_list_view.h"
#include "i18n/string_id.h"

// Generate scene id and total number
#define ADD_SCENE(prefix, name, id) CHAMELEON_SCENE_##id,
typedef enum {
#include "chameleon_scene_config.h"
    CHAMELEON_SCENE_MAX,
} ble_scene_id_t;
#undef ADD_SCENE

typedef struct {
    uint16_t icon;
    L_StringID label;
    uint8_t action;
} chameleon_menu_row_t;

void chameleon_add_menu_rows(mui_list_view_t *list, const chameleon_menu_row_t *rows, size_t count);
extern const mui_scene_t chameleon_scene_defines[];




#endif 