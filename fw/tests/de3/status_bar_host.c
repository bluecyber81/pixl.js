/* Current status bar view with fake canvas and deterministic battery readings. */
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "bat.h"
#include "ble_main.h"
#include "i18n/language.h"
typedef struct {int unused;} mui_canvas_t;
typedef struct {int unused;} mui_input_event_t;
typedef struct mui_view_s mui_view_t;
struct mui_view_s {void *user_data;void(*draw_cb)(mui_view_t*,mui_canvas_t*);void(*input_cb)(mui_view_t*,mui_input_event_t*);void(*enter_cb)(mui_view_t*);void(*exit_cb)(mui_view_t*);};
static const uint8_t small_font[1]={0};
#define MUI_FONT_SMALL small_font
static int updates,text_draws;
enum { LANGUAGE_EN_US, LANGUAGE_DE_DE };
static int language=LANGUAGE_DE_DE;
static int getLanguage(void) { return language; }
static const uint8_t *bitmaps[128];
static bool boxes[12][128];
ble_link_state_t ble_status_state_get(void){return BLE_LINK_ADVERTISING;}
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
static const char* getLangString(const char*s){assert(!strcmp(s,_L_DE3_BAT_LOW));return language==LANGUAGE_DE_DE?"Niedrig":"Low";}
static void *mui(void){return NULL;}
static void mui_update(void*p){(void)p;updates++;}
static void mui_canvas_set_font(mui_canvas_t*c,const uint8_t*f){(void)c;assert(f==small_font);}
static void mui_canvas_draw_box(mui_canvas_t*c,int x,int y,int w,int h){
    (void)c;assert(x>=0&&x+w<=128&&y>=0&&y+h<=12);
    for(int row=y;row<y+h;row++)
        for(int col=x;col<x+w;col++) boxes[row][col]=true;
}
static void mui_canvas_draw_xbm(mui_canvas_t*c,int x,int y,int w,int h,const uint8_t*bits){
    (void)c;assert(x>=0&&x+w<=128&&y>=0&&y+h<=12&&bits);bitmaps[x]=bits;
}
static void mui_canvas_draw_utf8_truncate(mui_canvas_t*c,int x,int y,int width,const char*s){
    (void)c;assert(x>=13&&y==9&&x+width<=57);assert(strlen(s)<sizeof(drawn));strcpy(drawn,s);text_draws++;
}
static void *mui_mem_malloc(size_t n){void*p=malloc(n);assert(p);return p;}
static void mui_mem_free(void*p){free(p);}
static mui_view_t *mui_view_create(void){return calloc(1,sizeof(mui_view_t));}
static void mui_view_free(mui_view_t*v){free(v);}
/* ACTUAL_STATUS_INCLUDE */
static void render(mui_view_t *view) {
    mui_canvas_t canvas={0};
    memset(bitmaps,0,sizeof(bitmaps));
    memset(boxes,0,sizeof(boxes));
    text_draws=0;
    view->draw_cb(view,&canvas);
}

int main(void){
    status_bar_view_t *v=status_bar_view_create();assert(v&&registered);
    mui_view_t *view=status_bar_view_get_view(v);
    valid=true;mv=3817;level=4;render(view);
    assert(bitmaps[0]==ble_status_bitmap[BLE_LINK_ADVERTISING] && !bitmaps[47]);
    assert(bitmaps[64]==voltage_digits[3] && bitmaps[74]==voltage_digits[8] && bitmaps[81]==voltage_digits[1]);
    assert(bitmaps[90]==voltage_unit && boxes[10][71] && !text_draws);

    low=true;mv=2182;level=1;render(view);
    assert(!strcmp(drawn,"Niedrig") && text_draws==1 && !bitmaps[47]);
    language=LANGUAGE_EN_US;render(view);
    assert(!strcmp(drawn,"Low") && !boxes[10][71]);
    charging=true;low=false;render(view);
    assert(bitmaps[47]==charging_bolt && !text_draws);
    valid=false;charging=false;render(view);
    assert(boxes[5][64] && boxes[5][74] && boxes[5][81] && boxes[5][109]);
    assert(!bitmaps[64] && !bitmaps[74] && !bitmaps[81] && !text_draws);

    valid=true;mv=UINT16_MAX;level=UINT8_MAX;render(view);
    assert(bitmaps[57]==voltage_digits[6] && bitmaps[64]==voltage_digits[5]);
    assert(bitmaps[74]==voltage_digits[5] && bitmaps[81]==voltage_digits[3]);
    registered();assert(updates==1);status_bar_view_free(v);assert(registered==NULL);
    puts("PASS status voltage digits, DE/EN separator and low hints, charge/unknown, bounded icons and callback lifetime");
    return 0;
}
