/* Current status bar view with fake canvas and deterministic battery readings. */
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "bat.h"
#include "i18n/language.h"
typedef struct {int unused;} mui_canvas_t;
typedef struct {int unused;} mui_input_event_t;
typedef struct mui_view_s mui_view_t;
struct mui_view_s {void *user_data;void(*draw_cb)(mui_view_t*,mui_canvas_t*);void(*input_cb)(mui_view_t*,mui_input_event_t*);void(*enter_cb)(mui_view_t*);void(*exit_cb)(mui_view_t*);};
static const uint8_t u8g2_font_siji_t_6x10[1]={0}, small_font[1]={0};
#define MUI_FONT_SMALL small_font
static int updates,glyphs,charging_draws,text_draws;
static unsigned int mv,level;
static bool valid,low,charging;
static char drawn[64];
static chrg_data_cb_t registered;
uint8_t bat_get_level(void){return level;}
uint16_t bat_get_voltage_mv(void){return mv;}
bool bat_has_reading(void){return valid;}
bool bat_is_low(void){return low;}
bool get_stats(void){return charging;}
void chrg_set_callback(chrg_data_cb_t cb){registered=cb;}
static const char* getLangString(const char*s){assert(!strcmp(s,_L_DE3_BAT_LOW));return "Niedrig";}
static void *mui(void){return NULL;}
static void mui_update(void*p){(void)p;updates++;}
static void mui_canvas_set_font(mui_canvas_t*c,const uint8_t*f){(void)c;assert(f==small_font||f==u8g2_font_siji_t_6x10);}
static void mui_canvas_draw_glyph(mui_canvas_t*c,int x,int y,int glyph){
    (void)c;(void)y;glyphs++;
    if(glyph==0xe09e){charging_draws++;assert(x==100);}
    else if(x==110)assert(glyph>=0xe24c&&glyph<=0xe254);
}
static void mui_canvas_draw_utf8_truncate(mui_canvas_t*c,int x,int y,int width,const char*s){
    (void)c;assert(x==14&&y==9&&width==82&&x+width<100);assert(strlen(s)<32);strcpy(drawn,s);text_draws++;
}
static void *mui_mem_malloc(size_t n){void*p=malloc(n);assert(p);return p;}
static void mui_mem_free(void*p){free(p);}
static mui_view_t *mui_view_create(void){return calloc(1,sizeof(mui_view_t));}
static void mui_view_free(mui_view_t*v){free(v);}
/* ACTUAL_STATUS_INCLUDE */
int main(void){
    status_bar_view_t*v=status_bar_view_create();assert(v&&registered);
    mui_view_t*view=status_bar_view_get_view(v);mui_canvas_t c={0};
    valid=true;low=false;charging=false;mv=3817;level=4;view->draw_cb(view,&c);
    assert(!strcmp(drawn,"3.81V")&&glyphs==2&&charging_draws==0);
    low=true;mv=2182;level=1;view->draw_cb(view,&c);assert(!strcmp(drawn,"2.18V Niedrig"));
    charging=true;low=false;view->draw_cb(view,&c);assert(charging_draws==1);
    valid=false;view->draw_cb(view,&c);assert(!strcmp(drawn,"--.--V"));
    registered();assert(updates==1);status_bar_view_free(v);assert(registered==NULL);
    puts("PASS status voltage, translated low hint, unknown value, fixed icon space and callback lifetime");
    return 0;
}
