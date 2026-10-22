/* Actual pinned SDK17.1 debounce state machine plus actual DE3.3 BSP. */
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#define NRF_MODULE_ENABLED(x) 1
#define APP_BUTTON_CONFIG_LOG_ENABLED 0
#define NRF_LOG_WARNING(...) ((void)0)
#define NRF_LOG_DEBUG(...) ((void)0)
#define NRF_LOG_MODULE_REGISTER()
#define APP_ERROR_CHECK(x) assert((x)==0)
#define ASSERT(x) assert(x)
#define STATIC_ASSERT(x) _Static_assert(x,#x)
#define VERIFY_SUCCESS(x) do{if((x)!=0)return (x);}while(0)
#define CRITICAL_REGION_ENTER() do{}while(0)
#define CRITICAL_REGION_EXIT() do{}while(0)
#define NRF_SUCCESS 0
#define NRF_ERROR_INVALID_PARAM 7
#define BUTTONS_NUMBER 3
#define BSP_BUTTON_0 5
#define BSP_BUTTON_1 6
#define BSP_BUTTON_2 7
#define BUTTON_PULL 1
#define APP_BUTTON_PUSH 1
#define APP_BUTTON_RELEASE 0
#define APP_BUTTON_ACTIVE_HIGH 1
#define APP_TIMER_MODE_SINGLE_SHOT 0
#define APP_TIMER_MODE_REPEATED 1
#define APP_TIMER_MIN_TIMEOUT_TICKS 1
#define APP_TIMER_TICKS(x) (x)
#define GPIO_COUNT 1
typedef struct {bool running,repeated;uint32_t deadline,period;void*context;void(*handler)(void*);} timer_t;
typedef timer_t *app_timer_id_t;
#define APP_TIMER_DEF(x) static timer_t x##_data; static const app_timer_id_t x=&x##_data
typedef struct {uint8_t pin_no;bool active_state;int pull_cfg;void(*button_handler)(uint8_t,uint8_t);} app_button_cfg_t;
typedef uint32_t nrf_drv_gpiote_pin_t;
typedef int nrf_gpiote_polarity_t;
typedef struct {int pull;} nrf_drv_gpiote_in_config_t;
#define GPIOTE_CONFIG_IN_SENSE_TOGGLE(x) {0}
static uint32_t now;
static unsigned registered_count;
static timer_t*registered[7];
static bool gpiote_initialized,gpio_owned[32],gpio_enabled[32],gpio_high[32];
static void(*gpio_callbacks[32])(nrf_drv_gpiote_pin_t,nrf_gpiote_polarity_t);
static bool nrf_drv_gpiote_is_init(void){return gpiote_initialized;}
static uint32_t nrf_drv_gpiote_init(void){gpiote_initialized=true;return 0;}
static uint32_t nrf_drv_gpiote_in_init(uint32_t pin,const nrf_drv_gpiote_in_config_t*c,void(*cb)(nrf_drv_gpiote_pin_t,nrf_gpiote_polarity_t)){(void)c;assert(pin<32);if(gpio_owned[pin])return 8;gpio_owned[pin]=true;gpio_callbacks[pin]=cb;return 0;}
static void nrf_drv_gpiote_in_uninit(uint32_t pin){assert(pin<32&&gpio_owned[pin]);gpio_owned[pin]=gpio_enabled[pin]=false;gpio_callbacks[pin]=NULL;}
static void nrf_drv_gpiote_in_event_enable(uint32_t pin,bool event){assert(pin<32&&gpio_owned[pin]&&event);gpio_enabled[pin]=true;}
static void nrf_drv_gpiote_in_event_disable(uint32_t pin){assert(pin<32&&gpio_owned[pin]);gpio_enabled[pin]=false;}
static bool nrf_drv_gpiote_in_is_set(uint32_t pin){assert(pin<32&&gpio_owned[pin]);return gpio_high[pin];}
static uint32_t app_timer_create(app_timer_id_t const*t,int mode,void(*cb)(void*)){unsigned i;for(i=0;i<registered_count;i++)if(registered[i]==*t)break;if(i==registered_count){assert(registered_count<7);registered[registered_count++]=*t;}(*t)->running=false;(*t)->repeated=mode;(*t)->handler=cb;return 0;}
static uint32_t app_timer_start(timer_t*t,uint32_t delay,void*p){if(!t->running){t->deadline=now+delay;t->period=delay;t->context=p;t->running=true;}return 0;}
static uint32_t app_timer_stop(timer_t*t){t->running=false;return 0;}
static void nrf_pwr_mgmt_feed(void){}
#define btn_state_t sdk_btn_state_t
/* ACTUAL_SDK_BUTTON_INCLUDE */
#undef btn_state_t
/* ACTUAL_BUTTON_INCLUDE */
static unsigned event_counts[3][5];
static void capture(uint8_t key,bsp_btn_event_t event){assert(key<3&&event<5);event_counts[key][event]++;}
static void advance(uint32_t target){for(now++;now<=target;now++){for(unsigned i=0;i<registered_count;i++){timer_t*t=registered[i];if(t->running&&t->deadline==now){if(t->repeated)t->deadline+=t->period;else t->running=false;t->handler(t->context);}}}now=target;}
static void pin(unsigned key,bool press){uint32_t p=5+key;gpio_high[p]=!press;if(gpio_enabled[p]&&gpio_callbacks[p])gpio_callbacks[p](p,0);}
static void check_stopped(void){for(unsigned i=0;i<registered_count;i++)assert(!registered[i]->running);for(unsigned i=5;i<=7;i++)assert(!gpio_owned[i]);assert(gpio_owned[30]);}
int main(void){
 memset(gpio_high,1,sizeof gpio_high);gpio_owned[30]=true;bsp_btn_init(capture);assert(registered_count==7);
 pin(0,true);advance(10);pin(0,false);advance(100);assert(!event_counts[0][BSP_BTN_EVENT_PRESSED]);
 pin(0,true);advance(175);assert(event_counts[0][BSP_BTN_EVENT_PRESSED]==1);advance(1175);assert(event_counts[0][BSP_BTN_EVENT_LONG]==1);bsp_btn_deinit();check_stopped();
 puts("PASS real SDK debounce suppresses bounce; independent BSP LONG starts at debounced PRESS");
 for(unsigned cycle=0;cycle<10;cycle++){
  for(unsigned k=0;k<3;k++)pin(k,false); /* Release while GPIOTE is disabled. */
  advance(now+100);bsp_btn_init(capture);assert(registered_count==7);for(unsigned k=0;k<3;k++)assert(state_get(5+k)==BTN_IDLE);
  unsigned old[3];for(unsigned k=0;k<3;k++){old[k]=event_counts[k][BSP_BTN_EVENT_PRESSED];pin(k,true);}
  advance(now+75);for(unsigned k=0;k<3;k++){assert(state_get(5+k)==BTN_PRESSED);assert(event_counts[k][BSP_BTN_EVENT_PRESSED]==old[k]+1);}
  advance(now+1200);bsp_btn_deinit();check_stopped();bsp_btn_deinit();check_stopped();
 }
 puts("PASS10 real-SDK deinit/reinit cycles while keys were held: debounce reset, no GPIO double allocation,7 stable timer nodes");
 puts("PASS backlight/other GPIOTE owner on pin30 survives every button teardown");
}
