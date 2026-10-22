#ifndef MUI_CORE_H
#define MUI_CORE_H

#include "mui_common.h"
#include "mui_event.h"
#include "mui_input.h"
#include "mui_view_port.h"

#define SCREEN_HEIGHT 64
#define SCREEN_WIDTH 128
#define LAYER_STATUS_BAR_HEIGHT 13


#define MUI_LAYER_CAPACITY 2

typedef enum {
    MUI_LAYER_DESKTOP, 
    MUI_LAYER_WINDOW,
    MUI_LAYER_STATUS_BAR, 
    MUI_LAYER_FULLSCREEN,
    MUI_LAYER_TOAST,
    MUI_LAYER_MAX
} mui_layer_t;

typedef struct {
    uint8_t initialized;
    uint8_t screen_width;
    uint8_t screen_height;
    u8g2_t u8g2;
    mui_canvas_t canvas;
    mui_event_queue_t event_queue;
    mui_view_port_t *layers[MUI_LAYER_MAX][MUI_LAYER_CAPACITY];
    uint8_t layer_counts[MUI_LAYER_MAX];
    uint8_t auto_update;
    uint8_t memory_error;
} mui_t;

mui_t* mui();

void mui_init(mui_t* p_mui);
void mui_post(mui_t* p_mui, mui_event_t*p_event);
void mui_tick(mui_t* p_mui);
void mui_deinit(mui_t *p_mui);
void mui_panic(mui_t *p_mui, char* err);
void mui_set_auto_update(mui_t* p_mui, bool enabled);
void mui_show_memory_error(mui_t *p_mui);


void mui_add_view_port(mui_t* p_mui, mui_view_port_t* p_vp, mui_layer_t layer);
void mui_remove_view_port(mui_t* p_mui, mui_view_port_t* p_vp, mui_layer_t layer);
void mui_update(mui_t* p_mui);
void mui_update_now(mui_t* p_mui);


#endif
