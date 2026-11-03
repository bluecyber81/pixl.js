#ifndef STATUS_BAR_VIEW_H
#define STATUS_BAR_VIEW_H

#include "mui_include.h"
#include "ble_main.h"

typedef struct {
    mui_view_t* p_view;
    ble_link_state_t link_state;

} status_bar_view_t;

status_bar_view_t* status_bar_view_create();
void status_bar_view_free(status_bar_view_t* p_view);
void status_bar_view_set_link_state(status_bar_view_t* p_view, ble_link_state_t state);
mui_view_t* status_bar_view_get_view(status_bar_view_t* p_view);


#endif