/* Actual bsp_btn.c + actual input mapper/game input; deterministic SDK timers. */
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#define BUTTONS_NUMBER 3
#define BSP_BUTTON_0 5
#define BSP_BUTTON_1 6
#define BSP_BUTTON_2 7
#define BUTTON_PULL 1
#define APP_BUTTON_PUSH 1
#define APP_BUTTON_RELEASE 0
#define NRF_SUCCESS 0
#define APP_TIMER_MODE_SINGLE_SHOT 0
#define APP_TIMER_MODE_REPEATED 1
#define APP_TIMER_TICKS(x) (x)
#define APP_ERROR_CHECK(x) assert((x)==0)
#define NRF_LOG_WARNING(...) ((void)0)
#define NRF_LOG_DEBUG(...) ((void)0)
typedef struct {bool running,repeated;uint32_t deadline,period;void*context;void(*handler)(void*);} timer_t;
typedef timer_t *app_timer_id_t;
#define APP_TIMER_DEF(x) static timer_t x##_data; static const app_timer_id_t x=&x##_data
typedef struct {uint8_t pin_no;bool active_state;int pull;void(*handler)(uint8_t,uint8_t);} app_button_cfg_t;
static uint32_t now;
static unsigned app_init_calls,timer_create_calls,enable_calls,disable_calls,feeds,start_failures,stop_failures;
static bool sdk_enabled;
static bool gpio_owned[3];
static timer_t *registered[6];
static int app_timer_start(timer_t*t,uint32_t delay,void*p){if(start_failures){start_failures--;return 4;}if(!t->running){t->deadline=now+delay;t->period=delay;t->context=p;t->running=true;}return 0;}
static int app_timer_stop(timer_t*t){t->running=false;if(stop_failures){stop_failures--;return 4;}return 0;}
static int app_timer_create(timer_t**t,int mode,void(*cb)(void*)){assert(timer_create_calls<6);registered[timer_create_calls++]=*t;(*t)->handler=cb;(*t)->repeated=mode;return 0;}
static int app_button_init(const app_button_cfg_t*c,uint32_t n,uint32_t d){assert(n==3&&d==20&&c);for(unsigned i=0;i<3;i++){assert(!gpio_owned[i]);gpio_owned[i]=true;}app_init_calls++;return 0;}
static int app_button_enable(void){enable_calls++;sdk_enabled=true;return 0;}
static int app_button_disable(void){disable_calls++;sdk_enabled=false;return 0;}
static void nrf_drv_gpiote_in_uninit(uint32_t pin){assert(pin>=5&&pin<=7&&gpio_owned[pin-5]);gpio_owned[pin-5]=false;}
static void nrf_pwr_mgmt_feed(void){feeds++;}
/* ACTUAL_BUTTON_INCLUDE */

typedef enum {INPUT_KEY_LEFT,INPUT_KEY_CENTER,INPUT_KEY_RIGHT} input_key_t;
typedef enum {INPUT_TYPE_PRESS,INPUT_TYPE_RELEASE,INPUT_TYPE_SHORT,INPUT_TYPE_LONG,INPUT_TYPE_REPEAT} input_type_t;
typedef struct {input_key_t key;input_type_t type;} mui_input_event_t;
typedef struct {void*user_data;} mui_view_t;
typedef struct {int unused;} game_view_t;
static uint8_t key_state[3],key_repeat_cnt;
/* ACTUAL_GAME_INPUT */
static struct {bool swap_buttons;} settings;
#define settings_get_data() (&settings)
static unsigned count,input_count;
static struct {uint8_t key,event;uint32_t timestamp;} events[512];
static mui_input_event_t inputs[512];
static void mui_input_post_event(mui_input_event_t*event){assert(input_count<512);inputs[input_count++]=*event;mui_view_t view={0};game_view_on_input(&view,event);}
/* ACTUAL_INPUT_MAPPER */
static bool deinit_on_long;
static void capture(uint8_t key,bsp_btn_event_t event){assert(count<512);events[count].key=key;events[count].event=event;events[count++].timestamp=now;mui_input_on_bsp_btn_event(key,event);if(deinit_on_long&&event==BSP_BTN_EVENT_LONG)bsp_btn_deinit();}
static void reset(void){bsp_btn_init(capture);assert(app_init_calls>=1&&timer_create_calls==6);now=count=input_count=feeds=start_failures=stop_failures=0;settings.swap_buttons=false;deinit_on_long=false;memset(key_state,0,sizeof key_state);key_repeat_cnt=0;}
static void advance(uint32_t target){for(now++;now<=target;now++){for(unsigned i=0;i<6;i++){timer_t*t=registered[i];if(t->running&&t->deadline==now){if(t->repeated)t->deadline+=t->period;else t->running=false;t->handler(t->context);}}}now=target;}
static unsigned event_count(unsigned key,unsigned event){unsigned n=0;for(unsigned i=0;i<count;i++)if(events[i].key==key&&events[i].event==event)n++;return n;}
static void key(unsigned index,bool press){assert(index<3);bsp_button_event_handler(5+index,press?APP_BUTTON_PUSH:APP_BUTTON_RELEASE);}
static void all_stopped(void){for(unsigned i=0;i<6;i++)assert(!registered[i]->running);}
typedef struct {int event_queue,u8g2;bool initialized;} mui_t;
static unsigned teardown_step;
static void mui_event_queue_deinit(int*q){(void)q;assert(!m_enabled&&!sdk_enabled&&!m_bsp_btn_event_cb);all_stopped();for(unsigned i=0;i<3;i++)assert(!gpio_owned[i]);assert(teardown_step==0);teardown_step=1;}
static void mui_u8g2_deinit(int*d){(void)d;assert(teardown_step==1);teardown_step=2;}
static void mui_mem_deinit(void){assert(teardown_step==2);teardown_step=3;}
/* ACTUAL_INPUT_DEINIT */
/* ACTUAL_MUI_DEINIT */
static void test_single(void){for(unsigned i=0;i<3;i++){
 reset();key(i,true);assert(event_count(i,BSP_BTN_EVENT_PRESSED)==1);advance(999);assert(event_count(i,BSP_BTN_EVENT_LONG)==0);key(i,false);assert(event_count(i,BSP_BTN_EVENT_SHORT)==1);advance(1500);assert(event_count(i,BSP_BTN_EVENT_LONG)==0);all_stopped();
 reset();key(i,true);advance(1000);assert(event_count(i,BSP_BTN_EVENT_LONG)==1);advance(1199);assert(event_count(i,BSP_BTN_EVENT_REPEAT)==0);advance(1200);assert(event_count(i,BSP_BTN_EVENT_REPEAT)==1);advance(1600);assert(event_count(i,BSP_BTN_EVENT_REPEAT)==3);key(i,false);advance(2000);assert(event_count(i,BSP_BTN_EVENT_REPEAT)==3&&event_count(i,BSP_BTN_EVENT_SHORT)==0);all_stopped();
 }puts("PASS each key: PRESS/RELEASE/SHORT, LONG exactly1000ms, REPEAT every200ms, stop on release");}
static void test_overlap(void){
 for(unsigned a=0;a<3;a++)for(unsigned b=0;b<3;b++)if(a!=b){
  reset();key(a,true);advance(900);key(b,true);advance(1000);assert(event_count(a,BSP_BTN_EVENT_LONG)==1&&event_count(b,BSP_BTN_EVENT_LONG)==0);advance(1900);assert(event_count(b,BSP_BTN_EVENT_LONG)==1);key(a,false);advance(2100);assert(event_count(b,BSP_BTN_EVENT_REPEAT)==1);key(b,false);all_stopped();
  reset();key(a,true);advance(100);key(b,true);advance(200);key(a,false);advance(1100);assert(event_count(a,BSP_BTN_EVENT_SHORT)==1&&event_count(b,BSP_BTN_EVENT_LONG)==1);key(b,false);all_stopped();
  reset();key(a,true);advance(100);key(b,true);advance(200);key(b,false);advance(1000);assert(event_count(b,BSP_BTN_EVENT_SHORT)==1&&event_count(a,BSP_BTN_EVENT_LONG)==1);key(a,false);all_stopped();
  reset();key(a,true);advance(1000);key(b,true);advance(1200);assert(event_count(a,BSP_BTN_EVENT_REPEAT)==1&&event_count(b,BSP_BTN_EVENT_REPEAT)==0);advance(2000);assert(event_count(b,BSP_BTN_EVENT_LONG)==1);key(a,false);key(b,false);all_stopped();
 }puts("PASS all6 ordered key pairs, independent deadlines, both release orders, no repeat theft");
 for(unsigned order=0;order<6;order++){static const unsigned orders[6][3]={{0,1,2},{0,2,1},{1,0,2},{1,2,0},{2,0,1},{2,1,0}};reset();for(unsigned i=0;i<3;i++)key(i,true);advance(1200);for(unsigned i=0;i<3;i++){assert(event_count(i,BSP_BTN_EVENT_LONG)==1&&event_count(i,BSP_BTN_EVENT_REPEAT)==1);assert(key_state[i]==1);}for(unsigned j=0;j<3;j++){unsigned i=orders[order][j];key(i,false);assert(!key_state[i]);}all_stopped();}
 puts("PASS simultaneous three-key chords and all6 release permutations preserve game press/release state");
}
static void test_lifecycle(void){
 reset();for(unsigned i=0;i<3;i++)key(i,true);advance(1200);mui_t ui={.initialized=true};teardown_step=0;mui_deinit(&ui);assert(teardown_step==3&&!ui.initialized);unsigned n=count;all_stopped();assert(!sdk_enabled);for(unsigned i=0;i<6;i++)registered[i]->handler(registered[i]->context);for(unsigned i=0;i<3;i++){key(i,false);key(i,true);}assert(count==n);advance(5000);assert(count==n);bsp_btn_deinit();all_stopped();
 bsp_btn_init(capture);assert(app_init_calls>=2&&timer_create_calls==6&&sdk_enabled);key(1,true);advance(6000);assert(event_count(1,BSP_BTN_EVENT_LONG)==2);key(1,false);all_stopped();
 reset();deinit_on_long=true;key(0,true);advance(1000);all_stopped();assert(!sdk_enabled);advance(2000);assert(event_count(0,BSP_BTN_EVENT_REPEAT)==0);reset();
 puts("PASS deinit stops6 timers, pending callbacks/input ignored, repeat-safe init and callback-triggered deinit");
}
static void test_edges(void){
 reset();key(0,true);key(0,true);assert(count==1);key(0,false);key(0,false);assert(count==3);unsigned n=count,f=feeds;bsp_button_event_handler(255,APP_BUTTON_PUSH);bsp_button_event_handler(255,APP_BUTTON_RELEASE);bsp_button_event_handler(5,99);button_long_push_timer_handler(NULL);button_repeat_push_timer_handler(NULL);assert(count==n&&feeds==f);all_stopped();
 reset();start_failures=1;key(0,true);advance(1200);assert(!event_count(0,BSP_BTN_EVENT_LONG));key(0,false);assert(event_count(0,BSP_BTN_EVENT_SHORT)==1);key(0,true);advance(2200);assert(event_count(0,BSP_BTN_EVENT_LONG)==1);key(0,false);all_stopped();
 reset();key(0,true);start_failures=1;advance(1000);assert(event_count(0,BSP_BTN_EVENT_LONG)==1);advance(2000);assert(!event_count(0,BSP_BTN_EVENT_REPEAT));stop_failures=2;key(0,false);all_stopped();for(unsigned i=0;i<6;i++)if(registered[i]->context)registered[i]->handler(registered[i]->context);assert(event_count(0,BSP_BTN_EVENT_REPEAT)==0);reset();
 puts("PASS duplicate/unknown events, null/stale callbacks, timer allocation errors and recovery");
}
static void test_swap(void){for(unsigned swap=0;swap<2;swap++)for(unsigned i=0;i<3;i++){
 reset();settings.swap_buttons=swap;key(i,true);unsigned mapped=swap?2-i:i;assert(input_count==1&&inputs[0].key==mapped&&inputs[0].type==INPUT_TYPE_PRESS&&key_state[mapped]);advance(1200);assert(inputs[1].key==mapped&&inputs[1].type==INPUT_TYPE_LONG);assert(inputs[2].key==mapped&&inputs[2].type==INPUT_TYPE_REPEAT);assert(key_repeat_cnt==(mapped==1?1:0));key(i,false);assert(!key_state[mapped]&&key_repeat_cnt==0);
 }puts("PASS actual UI swap mapper and game input: all keys, long/repeat, center-key exit counter");}
int main(void){test_single();test_overlap();test_lifecycle();test_edges();test_swap();puts("PASS DE3.3 actual-source button regression groups");}
