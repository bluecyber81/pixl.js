"""Actual bounded dispatchers/launcher: failed allocation, capacity and retry."""
import re
import unittest
from test_app_startup_allocations import SRC, function, compile_run


def stripped(path):
    return re.sub(r'^#include[^\n]*\n', '', (SRC / path).read_text(encoding='utf-8'), flags=re.M)


COMMON = r'''
#include <assert.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
static bool nfc_change_allowed=true;static unsigned guard_calls;
static bool ntag_emu_prepare_change(void){guard_calls++;return nfc_change_allowed;}
static unsigned calls, fail_at, live, errors;
static void *mui_mem_malloc(size_t n) {
 if (++calls == fail_at) return NULL;
 void *p = malloc(n); assert(p); memset(p,0xa5,n); live++; return p;
}
static void mui_mem_free(void *p) {if(p){assert(live);live--;free(p);}}
typedef struct {int value;} mui_canvas_t;
typedef struct {int key,type;} mui_input_event_t;
typedef struct mui_view_s mui_view_t;
struct mui_view_s {void *user_data;void(*draw_cb)(mui_view_t*,mui_canvas_t*);void(*input_cb)(mui_view_t*,mui_input_event_t*);void(*enter_cb)(mui_view_t*);void(*exit_cb)(mui_view_t*);};
typedef struct mui_view_port_s mui_view_port_t;
struct mui_view_port_s {void *user_data;bool enabled;void(*draw_cb)(mui_view_port_t*,mui_canvas_t*);void(*input_cb)(mui_view_port_t*,mui_input_event_t*);};
enum {VIEW_NONE=0xffffffff};
typedef enum {MUI_LAYER_DESKTOP,MUI_LAYER_WINDOW,MUI_LAYER_STATUS_BAR,MUI_LAYER_FULLSCREEN,MUI_LAYER_TOAST,MUI_LAYER_MAX} mui_layer_t;
#define MUI_LAYER_CAPACITY 2
typedef struct {mui_view_port_t *layers[MUI_LAYER_MAX][MUI_LAYER_CAPACITY];uint8_t layer_counts[MUI_LAYER_MAX];} mui_t;
static mui_t core;
static mui_t *mui(void){return &core;}
static void mui_update(mui_t *m){(void)m;}
static void mui_show_memory_error(mui_t *m){(void)m;errors++;}
static mui_view_port_t *mui_view_port_create(void){mui_view_port_t *p=mui_mem_malloc(sizeof(*p));if(p)memset(p,0,sizeof(*p));return p;}
static void mui_view_port_free(mui_view_port_t *p){mui_mem_free(p);}
static void mui_view_port_enable_set(mui_view_port_t*p,bool enabled){p->enabled=enabled;}
static void mui_view_port_update(mui_view_port_t*p){(void)p;}
static void mui_view_draw(mui_view_t*v,mui_canvas_t*c){if(v->draw_cb)v->draw_cb(v,c);}
static void mui_view_input(mui_view_t*v,mui_input_event_t*e){if(v->input_cb)v->input_cb(v,e);}
static void mui_view_enter(mui_view_t*v){if(v->enter_cb)v->enter_cb(v);}
static void mui_view_exit(mui_view_t*v){if(v->exit_cb)v->exit_cb(v);}
'''


class BoundedStartupTests(unittest.TestCase):
    def test_actual_dispatchers_registration_scene_capacity_and_rollback(self):
        core = (SRC / 'mui/mui_core.c').read_text(encoding='utf-8')
        parts = [function(core, n) for n in ('mui_find_view_port_enabled', 'mui_add_view_port', 'mui_remove_view_port')]
        source = COMMON + '\n'.join(parts)
        for path in ('mui/mui_view_dispatcher.h', 'mui/mui_view_dispatcher.c',
                     'mui/mui_scene_dispatcher.h', 'mui/mui_scene_dispatcher.c'):
            source += '\n' + stripped(path)
        source += r'''
static unsigned enters,exits;
static void enter(void*p){assert(p==&enters);enters++;}
static void leave(void*p){assert(p==&enters);exits++;}
int main(void){
 for(unsigned fail=1;fail<=2;fail++) {calls=0;fail_at=fail;assert(!mui_view_dispatcher_create()&&!live);}
 calls=0;fail_at=1;assert(!mui_scene_dispatcher_create()&&!live);
 fail_at=0;calls=0;
 mui_view_dispatcher_t*d=mui_view_dispatcher_create();assert(d&&live==2);
 mui_view_t views[9]={{0}};
 for(unsigned i=0;i<8;i++)mui_view_dispatcher_add_view(d,i,&views[i]);
 unsigned count=calls;mui_view_dispatcher_add_view(d,8,&views[8]);assert(errors==1&&d->view_count==8&&calls==count);
 mui_view_dispatcher_switch_to_view(d,99);assert(!d->p_active_view);
 mui_view_dispatcher_switch_to_view(d,3);assert(d->p_active_view==&views[3]);
 mui_view_dispatcher_remove_view(d,3);assert(!d->p_active_view&&d->view_count==7);
 mui_view_dispatcher_switch_to_view(d,3);assert(!d->p_active_view);
 mui_view_dispatcher_remove_view(d,99);
 mui_view_dispatcher_attach(d,MUI_LAYER_FULLSCREEN);
 mui_view_dispatcher_attach(d,MUI_LAYER_TOAST);assert(core.layer_counts[MUI_LAYER_TOAST]==0);
 assert(core.layer_counts[MUI_LAYER_FULLSCREEN]==1);
 mui_view_dispatcher_detach(d,MUI_LAYER_WINDOW);assert(core.layer_counts[MUI_LAYER_FULLSCREEN]==0);
 mui_view_dispatcher_free(d);mui_view_dispatcher_free(NULL);assert(!live);
 mui_view_port_t a={.enabled=true},b={.enabled=true},c={.enabled=true};
 mui_add_view_port(&core,&a,MUI_LAYER_WINDOW);mui_add_view_port(&core,&b,MUI_LAYER_WINDOW);
 mui_add_view_port(&core,&c,MUI_LAYER_WINDOW);assert(errors==2&&core.layer_counts[MUI_LAYER_WINDOW]==2);
 assert(mui_find_view_port_enabled(&core,MUI_LAYER_WINDOW)==&b);
 mui_remove_view_port(&core,&a,MUI_LAYER_WINDOW);assert(core.layers[MUI_LAYER_WINDOW][0]==&b);
 mui_remove_view_port(&core,&b,MUI_LAYER_WINDOW);
 mui_scene_dispatcher_t*s=mui_scene_dispatcher_create();assert(s&&live==1);
 mui_scene_t defs[MUI_SCENE_STACK_CAPACITY+1];
 for(unsigned i=0;i<MUI_SCENE_STACK_CAPACITY+1;i++)defs[i]=(mui_scene_t){.enter_cb=enter,.exit_cb=leave};
 mui_scene_dispatcher_set_user_data(s,&enters);mui_scene_dispatcher_set_scene_defines(s,defs,MUI_SCENE_STACK_CAPACITY+1);
 s->transition_guard=ntag_emu_prepare_change;
 nfc_change_allowed=false;mui_scene_dispatcher_next_scene(s,0);assert(!s->scene_depth&&!enters&&!exits);
 nfc_change_allowed=true;
 /* Existing MAIN -> DATA_LIST -> named MAIN return must stay shallow. */
 for(unsigned i=0;i<1000;i++){
  mui_scene_dispatcher_next_scene(s,0);assert(s->scene_depth==1);
  mui_scene_dispatcher_next_scene(s,1);assert(s->scene_depth==2);
  mui_scene_dispatcher_next_scene(s,0);assert(s->scene_depth==1);
 }
 mui_scene_dispatcher_next_scene(s,0);assert(s->scene_depth==1&&errors==2);
 nfc_change_allowed=false;unsigned held_enters=enters,held_exits=exits;
 mui_scene_dispatcher_next_scene(s,1);mui_scene_dispatcher_back_scene(s,1);
 assert(s->scene_depth==1&&enters==held_enters&&exits==held_exits);
 nfc_change_allowed=true;mui_scene_dispatcher_exit(s);enters=exits=0;
 count=calls;
 for(unsigned i=0;i<MUI_SCENE_STACK_CAPACITY;i++)mui_scene_dispatcher_next_scene(s,i);
 assert(s->scene_depth==MUI_SCENE_STACK_CAPACITY&&enters==MUI_SCENE_STACK_CAPACITY&&calls==count);
 unsigned prior=exits,prior_guards=guard_calls;mui_scene_dispatcher_next_scene(s,MUI_SCENE_STACK_CAPACITY);assert(errors==3&&exits==prior&&guard_calls==prior_guards);
 mui_scene_dispatcher_next_scene(s,99);assert(exits==prior);
 mui_scene_dispatcher_back_scene(s,99);assert(s->scene_depth==1&&mui_scene_dispatcher_current_scene(s)==0);
 prior=exits;mui_scene_dispatcher_exit(s);mui_scene_dispatcher_exit(s);assert(exits==prior+1&&s->scene_depth==0);
 mui_scene_dispatcher_free(s);mui_scene_dispatcher_free(NULL);assert(!live);
 puts("PASS");
}
'''
        compile_run(source)

    def test_actual_launcher_failure_retry_state_and_unknown_ids(self):
        text = (SRC / 'core/mini_app_launcher.c').read_text(encoding='utf-8')
        names = ('mini_app_launcher_find', 'mini_app_launcher_inst_kill', 'mini_app_launcher_inst_run',
                 'mini_app_launcher_run_with_retain_data', 'mini_app_launcher_run', 'mini_app_launcher_kill',
                 'mini_app_launcher_exit', 'mini_app_launcher_get_app_handle', 'mini_app_launcher_post_event')
        source = COMMON + 'typedef int xbm_t;\n' + stripped('core/mini_app_defines.h') + stripped('core/mini_app_launcher.h')
        source += r'''
enum {MINI_APP_ID_DESKTOP=1};
static unsigned run_count,kill_count,event_count;
static bool fail_app;
static void run(mini_app_inst_t*i){run_count++;if(!fail_app)i->p_handle=mui_mem_malloc(1);}
static void kill(mini_app_inst_t*i){assert(i->p_handle);kill_count++;mui_mem_free(i->p_handle);i->p_handle=NULL;}
static void event(mini_app_inst_t*i,mini_app_event_t*e){assert(i->p_handle&&e);event_count++;}
static const mini_app_t apps[2]={{.id=1,.run_cb=run,.kill_cb=kill,.on_event_cb=event},{.id=2,.run_cb=run,.kill_cb=kill,.on_event_cb=event}};
static const mini_app_t *mini_app_registry_find_by_id(uint32_t id){return id==1?&apps[0]:id==2?&apps[1]:NULL;}
'''
        source += '\n'.join(function(text, n) for n in names)
        source += r'''
int main(void){
 mini_app_launcher_t l={0};uint8_t retain=7;mini_app_event_t e={0};
 fail_at=1;mini_app_launcher_run(&l,2);assert(errors==1&&!l.instances&&!l.p_main_app_inst&&!live);
 calls=0;fail_at=0;fail_app=true;
 mini_app_launcher_run(&l,2);assert(errors==2&&l.instances&&!l.p_main_app_inst&&live==1);
 assert(!mini_app_launcher_get_app_handle(&l,2));
 mini_app_launcher_post_event(&l,2,&e);assert(!event_count);
 fail_app=false;mini_app_launcher_run_with_retain_data(&l,2,&retain);
 assert(l.p_main_app_inst&&l.p_main_app_inst->p_retain_data==&retain&&l.p_main_app_inst->state==APP_STATE_RUNNING&&live==2);
 mini_app_launcher_post_event(&l,2,&e);assert(event_count==1);
 mini_app_launcher_kill(&l,99);mini_app_launcher_run(&l,99);assert(!kill_count);
 nfc_change_allowed=false;
 mini_app_launcher_kill(&l,2);mini_app_launcher_run(&l,1);mini_app_launcher_exit(&l);
 assert(!kill_count&&l.p_main_app_inst->p_app->id==2&&l.p_main_app_inst->p_handle&&live==2);
 nfc_change_allowed=true;
 mini_app_launcher_kill(&l,2);assert(kill_count==1&&l.p_main_app_inst->p_app->id==1);
 mini_app_launcher_run_with_retain_data(&l,2,&retain);assert(kill_count==2&&l.p_main_app_inst->state==APP_STATE_RUNNING&&l.p_main_app_inst->p_retain_data==&retain);
 mini_app_launcher_inst_kill(&l,l.p_main_app_inst);mini_app_launcher_inst_kill(&l,l.p_main_app_inst);assert(kill_count==3);
 while(l.instances){mini_app_inst_t*next=l.instances->next;mui_mem_free(l.instances);l.instances=next;}
 assert(!live);puts("PASS");
}
'''
        compile_run(source)


if __name__ == '__main__':
    unittest.main()
