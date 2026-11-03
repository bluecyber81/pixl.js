#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <limits.h>
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"FAIL line%d: %s\n",__LINE__,#x); exit(71); } } while (0)

enum { INPUT_TYPE_SHORT, INPUT_TYPE_REPEAT, INPUT_TYPE_RELEASE, INPUT_TYPE_LONG };
enum { INPUT_KEY_LEFT, INPUT_KEY_RIGHT, INPUT_KEY_CENTER };
typedef struct { int type, key; } mui_input_event_t;
typedef struct { uint8_t width, height; } mui_canvas_t;
typedef struct mui_view_s mui_view_t;
struct mui_view_s {
    void *user_data;
    void (*draw_cb)(mui_view_t *, mui_canvas_t *);
    void (*input_cb)(mui_view_t *, mui_input_event_t *);
    void (*enter_cb)(mui_view_t *);
    void (*exit_cb)(mui_view_t *);
};
typedef char string_t[32];
static void string_init(string_t s) { s[0]=0; }
static void string_reset(string_t s) { s[0]=0; }
static void string_clear(string_t s) { s[0]=0; }
static void string_set_str(string_t s,const char *v) { snprintf(s,32,"%s",v); }
static const char *string_get_cstr(const string_t s) { return s; }
static unsigned allocation_calls, allocation_fail_at, live_allocations, free_count;
static void *free_order[2];
static void *mui_mem_malloc(size_t n) {
    if (++allocation_calls == allocation_fail_at) return NULL;
    void *p=calloc(1,n); CHECK(p); ++live_allocations; return p;
}
static void mui_mem_free(void *p) {
    if (p) { CHECK(live_allocations>0); --live_allocations; if(free_count<2)free_order[free_count]=p; ++free_count; free(p); }
}
static mui_view_t *mui_view_create(void) { return mui_mem_malloc(sizeof(mui_view_t)); }
#define u8g2_font_wqy12_t_gb2312a NULL
static void mui_canvas_set_font(mui_canvas_t *c,const void *f) { (void)c; (void)f; }
static unsigned mui_canvas_current_font_height(mui_canvas_t *c) { (void)c; return 10; }
static unsigned mui_canvas_get_width(mui_canvas_t *c) { return c->width; }
static unsigned mui_canvas_get_height(mui_canvas_t *c) { return c->height; }
static int last_box_width;
static char last_text[32];
static void mui_canvas_draw_rframe(mui_canvas_t *c,int x,int y,int w,int h,int r) { (void)c;(void)x;(void)y;(void)w;(void)h;(void)r; }
static void mui_canvas_draw_box(mui_canvas_t *c,int x,int y,int w,int h) { (void)x;(void)y;(void)h; CHECK(w>=0 && w<=c->width-2); last_box_width=w; }
static unsigned mui_canvas_get_utf8_width(mui_canvas_t *c,const char *s) { (void)c; return (unsigned)strlen(s)*6; }
static void mui_canvas_draw_utf8(mui_canvas_t *c,int x,int y,const char *s) { (void)c;(void)x;(void)y;snprintf(last_text,sizeof(last_text),"%s",s); }
/* ACTUAL_PROGRESS_HEADER */
/* ACTUAL_PROGRESS_SOURCE */

typedef struct { int u8g2; } mui_t;
static mui_t ui;
static mui_t *mui(void) { return &ui; }
static unsigned contrast_calls, last_contrast, backlight_calls, last_duty;
static void u8g2_SetContrast(int *display, double value) {
    CHECK(display==&ui.u8g2 && isfinite(value) && value>=0 && value<=255);
    last_contrast=(uint8_t)value; ++contrast_calls;
}
enum { NRFX_DRV_STATE_POWERED_ON=1, NRF_ERROR_BUSY=2, NRF_ERROR_TIMEOUT=3, NRF_ERROR_INVALID_STATE=4, NRF_SUCCESS=0 };
typedef unsigned ret_code_t;
typedef unsigned app_pwm_duty_t;
#define m_pwm_initialized true
#define BACKLIGHT_PWM_MAX_ATTEMPTS 200u
#define NRF_LOG_WARNING(...) ((void)0)
#define _T(x) #x
static void nrf_delay_us(unsigned n){(void)n;}
typedef struct { unsigned state; } pwm_control_t;
static pwm_control_t pwm_control;
static struct { pwm_control_t *p_cb; } pwm1={&pwm_control};
static unsigned pwm_enables, pwm_disables;
static void app_pwm_enable(void *p) { CHECK(p==&pwm1); ++pwm_enables; pwm_control.state=NRFX_DRV_STATE_POWERED_ON; }
static void app_pwm_disable(void *p) { CHECK(p==&pwm1); ++pwm_disables; pwm_control.state=0; last_duty=0; ++backlight_calls; }
static int app_pwm_channel_duty_set(void *p,int channel,unsigned duty) {
    CHECK(p==&pwm1 && channel==0 && duty<=100); last_duty=duty; ++backlight_calls; return 0;
}
static unsigned app_pwm_channel_duty_get(void*p,unsigned ch){CHECK(p==&pwm1 && ch==0);return last_duty;}
/* ACTUAL_DISPLAY_SETTERS */
typedef struct { mui_progress_bar_t *p_progress_bar; void *p_scene_dispatcher,*p_toast_view; } app_settings_t;
static void mui_toast_view_show(void*p,const char*s){(void)p;(void)s;CHECK(false);}
typedef struct { uint8_t lcd_backlight, oled_contrast; } settings_data_t;
static settings_data_t settings;
static settings_data_t *settings_get_data(void) { return &settings; }
static unsigned previous_scenes;
static void mui_scene_dispatcher_previous_scene(void *p) { (void)p; ++previous_scenes; }
/* ACTUAL_SETTINGS_CALLBACKS */

static unsigned callbacks;
static int32_t callback_value;
static mui_progress_bar_event_t callback_event;
static void observed(mui_progress_bar_event_t event,mui_progress_bar_t *bar) {
    ++callbacks; callback_event=event; callback_value=bar->current_value;
    CHECK(callback_value>=bar->min_value && callback_value<=bar->max_value);
}
static void input(mui_progress_bar_t *bar,int type,int key) {
    mui_input_event_t evt={type,key}; mui_progress_bar_on_input(bar->p_view,&evt);
}
static void slider(void) {
    mui_progress_bar_t *bar=mui_progress_bar_create(); CHECK(bar);
    bar->event_cb=observed;
    for(int type=INPUT_TYPE_SHORT;type<=INPUT_TYPE_REPEAT;type++) {
        for(int32_t value=0;value<=100;value++) {
            bar->current_value=value; unsigned before=callbacks; input(bar,type,INPUT_KEY_LEFT);
            int32_t expected=value==0?100:value<5?0:value-5;
            CHECK(callbacks==before+1 && callback_event==MUI_PROGRESS_BAR_EVENT_DECREMENT && callback_value==expected);
            bar->current_value=value; input(bar,type,INPUT_KEY_RIGHT);
            expected=value==100?0:value>95?100:value+5;
            CHECK(callbacks==before+2 && callback_event==MUI_PROGRESS_BAR_EVENT_INCREMENT && callback_value==expected);
            bar->current_value=value; input(bar,type,INPUT_KEY_CENTER);
            CHECK(callbacks==before+3 && callback_event==MUI_PROGRESS_BAR_EVENT_CONFIRMED && callback_value==value);
        }
    }
    int32_t invalid[]={INT32_MIN,-1,101,INT32_MAX};
    for(unsigned i=0;i<4;i++) {bar->current_value=invalid[i];input(bar,INPUT_TYPE_SHORT,INPUT_KEY_CENTER);CHECK(callback_value==(i<2?0:100));}
    for(int type=INPUT_TYPE_RELEASE;type<=INPUT_TYPE_LONG;type++) {
        bar->current_value=52;unsigned before=callbacks;input(bar,type,INPUT_KEY_RIGHT);CHECK(callbacks==before && bar->current_value==52);
    }
    bar->min_value=10;bar->max_value=20;bar->current_value=15;input(bar,INPUT_TYPE_SHORT,INPUT_KEY_RIGHT);CHECK(callback_value==16);
    bar->min_value=-50;bar->max_value=50;bar->current_value=-49;input(bar,INPUT_TYPE_SHORT,INPUT_KEY_LEFT);CHECK(callback_value==-50);
    bar->min_value=0;bar->max_value=1;bar->current_value=0;input(bar,INPUT_TYPE_REPEAT,INPUT_KEY_RIGHT);CHECK(callback_value==1);
    bar->min_value=42;bar->max_value=42;bar->current_value=42;input(bar,INPUT_TYPE_SHORT,INPUT_KEY_LEFT);CHECK(callback_value==42);
    bar->min_value=INT32_MIN;bar->max_value=INT32_MAX;bar->current_value=INT32_MAX-1;input(bar,INPUT_TYPE_SHORT,INPUT_KEY_RIGHT);CHECK(callback_value==INT32_MAX);
    bar->current_value=INT32_MIN+1;input(bar,INPUT_TYPE_SHORT,INPUT_KEY_LEFT);CHECK(callback_value==INT32_MIN);
    mui_progress_bar_free(bar);CHECK(live_allocations==0);
    puts("PASS all101 values x SHORT/REPEAT x LEFT/RIGHT/CENTER: clamp before callback; endpoint wrap; generic ranges and int32 boundaries");
}
static unsigned expected_contrast(int32_t value) {
    if(value>100)value=100;
    if(value<1)value=1;
#ifdef LCD_SCREEN
    if(value<60)value=60;
#endif
    return (uint8_t)((value-1)*(255.0/99.0));
}
static void callbacks_test(void) {
    mui_progress_bar_t *bar=mui_progress_bar_create(); app_settings_t app={.p_progress_bar=bar}; bar->user_data=&app;
    for(int32_t value=-5;value<=105;value++) {
        int32_t clamped=value<0?0:value>100?100:value;
        settings.lcd_backlight=31;settings.oled_contrast=71;unsigned previous=previous_scenes;
        bar->current_value=value;settings_scene_lcd_backlight_event_cb(MUI_PROGRESS_BAR_EVENT_INCREMENT,bar);
        CHECK(last_duty==(unsigned)clamped && settings.lcd_backlight==31 && previous_scenes==previous);
        bar->current_value=value;settings_scene_lcd_backlight_event_cb(MUI_PROGRESS_BAR_EVENT_CONFIRMED,bar);
        CHECK(bar->current_value==clamped && settings.lcd_backlight==clamped && previous_scenes==previous+1);
        bar->current_value=value;settings_scene_oled_contrast_event_cb(MUI_PROGRESS_BAR_EVENT_DECREMENT,bar);
        CHECK(last_contrast==expected_contrast(clamped) && settings.oled_contrast==71 && previous_scenes==previous+1);
        bar->current_value=value;settings_scene_oled_contrast_event_cb(MUI_PROGRESS_BAR_EVENT_CONFIRMED,bar);
        CHECK(bar->current_value==clamped && settings.oled_contrast==clamped && previous_scenes==previous+2);
    }
    unsigned previous=previous_scenes,b=backlight_calls,c=contrast_calls;
    settings_scene_lcd_backlight_event_cb((mui_progress_bar_event_t)99,bar);
    settings_scene_oled_contrast_event_cb((mui_progress_bar_event_t)99,bar);
    CHECK(previous_scenes==previous && b==backlight_calls && c==contrast_calls);
    mui_progress_bar_free(bar);CHECK(live_allocations==0);
    puts("PASS actual brightness/contrast callbacks: signed clamp before uint8 conversion, preview without saving, confirmation persists bounded value");
}
static void setters_test(void) {
    for(unsigned value=0;value<=255;value++) {
        mui_u8g2_set_backlight_level((uint8_t)value);CHECK(last_duty==(value>100?100:value));
        mui_u8g2_set_contrast_level((uint8_t)value);CHECK(last_contrast==expected_contrast(value));
    }
    CHECK(pwm_enables==1 && pwm_disables==1 && contrast_calls==256 && backlight_calls==256);
#ifdef LCD_SCREEN
    puts("PASS LCD setters: all256 uint8 inputs, PWM0..100, contrast low-visibility guard and0..255 output");
#else
    puts("PASS OLED setter: all256 uint8 inputs including zero, no negative float-to-byte conversion");
#endif
}
static void allocation_test(void) {
    for(unsigned nth=1;nth<=2;nth++) {
        allocation_calls=0;allocation_fail_at=nth;free_count=0;
        CHECK(mui_progress_bar_create()==NULL && live_allocations==0 && allocation_calls==nth && free_count==nth-1);
    }
    allocation_calls=0;allocation_fail_at=0;free_count=0;
    mui_progress_bar_t *bar=mui_progress_bar_create();CHECK(bar && bar->p_view && bar->p_view->user_data==bar && !bar->user_data);
    CHECK(live_allocations==2 && !bar->event_cb && bar->min_value==0 && bar->max_value==100 && bar->current_value==0);
    void *view=bar->p_view,*object=bar;mui_progress_bar_free(bar);
    CHECK(live_allocations==0 && free_count==2 && free_order[0]==view && free_order[1]==object);
    mui_progress_bar_free(NULL);CHECK(live_allocations==0 && free_count==2);
    puts("PASS actual constructor fail-at1/fail-at2, reverse cleanup, valid retry and NULL-safe destructor");
}
static void draw_test(void) {
    mui_canvas_t canvas={128,64};mui_progress_bar_t *bar=mui_progress_bar_create();
    for(int value=-5;value<=105;value++) {
        bar->current_value=value;mui_progress_bar_on_draw(bar->p_view,&canvas);
        CHECK(atoi(last_text)==(value<0?0:value>100?100:value));
    }
    bar->min_value=10;bar->max_value=20;bar->current_value=10;mui_progress_bar_on_draw(bar->p_view,&canvas);CHECK(last_box_width==0);
    bar->current_value=20;mui_progress_bar_on_draw(bar->p_view,&canvas);CHECK(last_box_width==126);
    bar->max_value=10;mui_progress_bar_on_draw(bar->p_view,&canvas);CHECK(last_box_width==0);
    bar->max_value=9;mui_progress_bar_on_draw(bar->p_view,&canvas);CHECK(last_box_width==0);
    bar->min_value=INT32_MIN;bar->max_value=INT32_MAX;bar->current_value=INT32_MAX;mui_progress_bar_on_draw(bar->p_view,&canvas);CHECK(last_box_width==126);
    mui_progress_bar_free(bar);CHECK(live_allocations==0);
    puts("PASS actual renderer: bounded bar/text, nonzero minimum, zero/reversed range and int32 span");
}
int main(int argc,char **argv) {
    CHECK(argc==2);switch(atoi(argv[1])) {case 0:slider();break;case 1:callbacks_test();break;case 2:setters_test();break;case 3:allocation_test();break;case 4:draw_test();break;default:CHECK(false);}return 0;
}
