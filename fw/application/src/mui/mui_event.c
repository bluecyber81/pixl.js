#include "mui_event.h"
#include "nrf_log.h"
#include "app_util_platform.h"
#include "mui_nav_diag.h"

bool mui_event_queue_init(mui_event_queue_t *p_queue) {
    if (!p_queue) return false;
    mui_event_t *events = mui_mem_malloc(MAX_EVENT_MSG * sizeof(*events));
    uint8_t nested;
    app_util_critical_region_enter(&nested);
    p_queue->events = events;
    p_queue->head = 0;
    p_queue->count = 0;
    p_queue->redraw_pending = false;
    app_util_critical_region_exit(nested);
    return events != NULL;
}

void mui_event_queue_deinit(mui_event_queue_t *p_queue) {
    if (!p_queue) return;
    uint8_t nested;
    app_util_critical_region_enter(&nested);
    mui_event_t *events = p_queue->events;
    p_queue->events = NULL;
    p_queue->count = 0;
    p_queue->head = 0;
    p_queue->redraw_pending = false;
    p_queue->dispatcher = NULL;
    p_queue->dispatch_context = NULL;
    app_util_critical_region_exit(nested);
    mui_mem_free(events);
}
void mui_event_set_callback(mui_event_queue_t *p_queue, mui_event_handler_t dispatcher,
                            void *context) {
    uint8_t nested;
    app_util_critical_region_enter(&nested);
    p_queue->dispatch_context = context;
    p_queue->dispatcher = dispatcher;
    app_util_critical_region_exit(nested);
}

void mui_event_post(mui_event_queue_t *p_queue, mui_event_t *p_event) {
    if (!p_queue || !p_event) return;
    bool full = false;
    bool accepted = false;
    uint8_t nested;
    app_util_critical_region_enter(&nested);
    if (p_queue->events && !(p_event->id == MUI_EVENT_ID_REDRAW && p_queue->redraw_pending)) {
        if (p_queue->count < MAX_EVENT_MSG) {
            uint8_t tail = (p_queue->head + p_queue->count) % MAX_EVENT_MSG;
            p_queue->events[tail] = *p_event;
            p_queue->count++;
            accepted = true;
            if (p_event->id == MUI_EVENT_ID_REDRAW) p_queue->redraw_pending = true;
        } else {
            full = true;
        }
    }
    if (p_event->id == MUI_EVENT_ID_INPUT)
        mui_nav_diag_post(p_event->arg_int & 0xFF, (p_event->arg_int >> 8) & 0xFF,
                          accepted, p_queue->count);
    app_util_critical_region_exit(nested);
    if (full) NRF_LOG_WARNING("event buffer is FULL!!");
}

void mui_event_dispatch(mui_event_queue_t *p_queue) {
    if (!p_queue) return;
    /* A producer cannot keep this main-loop pass busy indefinitely. */
    for (unsigned processed = 0; processed < MAX_EVENT_MSG; processed++) {
        mui_event_t event;
        mui_event_handler_t dispatcher = NULL;
        void *context = NULL;
        uint8_t nested;
        app_util_critical_region_enter(&nested);
        if (p_queue->events && p_queue->count && p_queue->dispatcher) {
            event = p_queue->events[p_queue->head];
            p_queue->head = (p_queue->head + 1) % MAX_EVENT_MSG;
            p_queue->count--;
            if (event.id == MUI_EVENT_ID_REDRAW) p_queue->redraw_pending = false;
            dispatcher = p_queue->dispatcher;
            context = p_queue->dispatch_context;
            if (event.id == MUI_EVENT_ID_INPUT)
                mui_nav_diag_deliver(event.arg_int & 0xFF, (event.arg_int >> 8) & 0xFF);
        }
        app_util_critical_region_exit(nested);
        if (!dispatcher) break;
        /* Never keep application IRQs masked while drawing or handling input. */
        dispatcher(context, &event);
    }
}

void mui_event_dispatch_now(mui_event_queue_t *p_queue, mui_event_t* p_event){
    if (p_queue && p_event && p_queue->dispatcher) {
        if (p_event->id == MUI_EVENT_ID_INPUT)
            mui_nav_diag_deliver(p_event->arg_int & 0xFF, (p_event->arg_int >> 8) & 0xFF);
        p_queue->dispatcher(p_queue->dispatch_context, p_event);
    }
}
