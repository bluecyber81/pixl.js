#ifndef MUI_EVENT_H
#define MUI_EVENT_H

#include "mui_common.h"

#define MAX_EVENT_MSG 64


typedef struct {
    uint32_t id;
    uint32_t arg_int;
    void*  arg_ptr;
} mui_event_t;



typedef void (*mui_event_handler_t)(void* context, mui_event_t *p_event);

typedef struct {
    mui_event_handler_t dispatcher;
    void* dispatch_context;
    /* Allocated once in main context; posting and popping never allocate. */
    mui_event_t *events;
    uint8_t head;
    uint8_t count;
    bool redraw_pending;
} mui_event_queue_t;




bool mui_event_queue_init(mui_event_queue_t *p_queue);
void mui_event_queue_deinit(mui_event_queue_t *p_queue);
void mui_event_set_callback(mui_event_queue_t *p_queue, mui_event_handler_t dispatcher, void * context);
/* A full queue preserves input by evicting its oldest ANIM/REDRAW, if any.
 * Input is never reordered or replayed; an all-input overflow stays bounded. */
void mui_event_post(mui_event_queue_t *p_queue, mui_event_t *p_event);
void mui_event_dispatch(mui_event_queue_t *p_queue);
void mui_event_dispatch_now(mui_event_queue_t *p_queue, mui_event_t* p_event);


#endif 
