#include "mui_view.h"
#include <stdlib.h>
#include <string.h>
#include "mui_mem.h"

void mui_view_draw(mui_view_t* p_view, mui_canvas_t* p_canvas){
    if(p_view && p_view->draw_cb){
        p_view->draw_cb(p_view, p_canvas);
    }

}
void mui_view_input(mui_view_t* p_view, mui_input_event_t* p_event){
    if(p_view && p_view->input_cb){
        p_view->input_cb(p_view, p_event);
    }
}
void mui_view_enter(mui_view_t* p_view){
    if(p_view && p_view->enter_cb){
        p_view->enter_cb(p_view);
    }
}
void mui_view_exit(mui_view_t* p_view){
      if(p_view && p_view->exit_cb){
        p_view->exit_cb(p_view);
    }
}

mui_view_t* mui_view_create(){
    mui_view_t *p_view = mui_mem_malloc(sizeof(mui_view_t));
    if (p_view) memset(p_view, 0, sizeof(*p_view));
    return p_view;
}


void mui_view_free(mui_view_t* p_view){
    mui_mem_free(p_view);
}
