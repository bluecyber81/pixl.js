"""Allocation-free save overlay: real engine, selection, cancellation and confirmation."""
from test_nfc_save_retry_de337 import HERE,SRC,run
from test_nfc_lifecycle_de3_3 import function
import re

def main():
 prefix=(HERE/'nfc_lifecycle_host.c').read_text().split('/* ACTUAL_SOURCE */')[0]
 engine=re.sub(r"(?m)^\s*#include[^\n]*\n","",(SRC/'ntag/ntag_emu_v2.c').read_text())
 ui=(SRC/'mui/mui_core.c').read_text()
 code=prefix+engine+r'''
typedef struct {int n;} mui_canvas_t;
typedef struct {mui_canvas_t canvas;uint8_t screen_width,screen_height;} mui_t;
typedef struct {uint32_t arg_int;} mui_event_t;
#define INPUT_KEY_LEFT 0
#define INPUT_KEY_CENTER 1
#define INPUT_KEY_RIGHT 2
#define INPUT_TYPE_SHORT 1
#define INPUT_TYPE_LONG 2
#define INPUT_TYPE_REPEAT 3
#define INPUT_TYPE_PRESS 4
#define INPUT_TYPE_RELEASE 5
#define _T(x) #x
static const int u8g2_font_wqy12_t_gb2312a;
static uint8_t m_save_confirm;static uint32_t m_save_generation;
static unsigned exited,saves,draws;
static bool fail=true;
static uint8_t persisted=0x11;
static void mui_canvas_set_frame(mui_canvas_t*c,int x,int y,int w,int h){(void)c;(void)x;(void)y;(void)w;(void)h;}
static void mui_canvas_set_draw_color(mui_canvas_t*c,int n){(void)c;(void)n;}
static void mui_canvas_set_font(mui_canvas_t*c,int n){(void)c;(void)n;}
static void mui_canvas_draw_utf8(mui_canvas_t*c,int x,int y,const char*s){(void)c;(void)x;(void)y;assert(s);draws++;}
static void mui_canvas_flush(mui_canvas_t*c){(void)c;}
static void mui_update(mui_t*m){(void)m;}
static void *mini_app_launcher(void){return (void*)1;}
static void mini_app_launcher_exit(void*p){assert(p==(void*)1&&!ntag_emu_save_pending()&&!ntag_emu.dirty);exited++;}
static void saved(ntag_event_type_t t,void*ctx,ntag_t*tag){(void)ctx;if(t==NTAG_EVENT_TYPE_WRITTEN){saves++;if(fail)ntag_emu_save_failed();else persisted=tag->data[16];}}
/* If either actual UI function requests heap allocation this suite cannot link. */
'''+function(ui,'mui_nfc_save_active')+function(ui,'mui_nfc_save_draw')+function(ui,'mui_nfc_save_input')+r'''
static mui_t ui={.screen_width=128,.screen_height=64};
static void input(unsigned key,unsigned type){
 mui_event_t e={key|(INPUT_TYPE_PRESS<<8)};
 if(type==INPUT_TYPE_SHORT){assert(mui_nfc_save_input(&ui,&e));e.arg_int=key|(INPUT_TYPE_RELEASE<<8);assert(mui_nfc_save_input(&ui,&e));}
 e.arg_int=key|(type<<8);assert(mui_nfc_save_input(&ui,&e));
}
static void reset(void){
 memset(&ntag_emu,0,sizeof(ntag_emu));ntag_t tag={.type=NTAG_215};tag.data[16]=0x11;
 m_save_confirm=0;exited=saves=draws=0;persisted=0x11;fail=true;
 ntag_emu_set_tag(&tag);ntag_emu_set_update_cb(saved,&ui);
 const uint8_t write[]={NFC_CMD_WRITE,4,0x55,0x55,0x55,0x55};
 nfc_callback(NULL,HAL_NFC_EVENT_COMMAND,write,sizeof(write));assert(ack==10);
 nfc_callback(NULL,HAL_NFC_EVENT_FIELD_OFF,NULL,0);ntag_emu_process_pending();assert(saves==1&&ntag_emu_save_pending());
}
int main(void){
 reset();assert(mui_nfc_save_draw(&ui)&&draws==4);
 input(INPUT_KEY_CENTER,INPUT_TYPE_SHORT);assert(saves==2&&persisted==0x11&&ntag_emu.ntag.data[16]==0x55);
 input(INPUT_KEY_RIGHT,INPUT_TYPE_SHORT);assert(m_save_confirm==1);
 input(INPUT_KEY_RIGHT,INPUT_TYPE_REPEAT);assert(m_save_confirm==1&&!exited);
 input(INPUT_KEY_CENTER,INPUT_TYPE_SHORT);assert(!m_save_confirm&&!exited&&ntag_emu_save_pending()); /* No is default. */
 input(INPUT_KEY_RIGHT,INPUT_TYPE_SHORT);input(INPUT_KEY_LEFT,INPUT_TYPE_SHORT);
 assert(!m_save_confirm&&ntag_emu.ntag.data[16]==0x55&&persisted==0x11);
 input(INPUT_KEY_RIGHT,INPUT_TYPE_SHORT);input(INPUT_KEY_RIGHT,INPUT_TYPE_SHORT);assert(m_save_confirm==2);
 input(INPUT_KEY_CENTER,INPUT_TYPE_LONG);assert(!m_save_confirm&&!exited&&ntag_emu_save_pending());
 fail=false;input(INPUT_KEY_CENTER,INPUT_TYPE_SHORT);assert(persisted==0x55&&!ntag_emu_save_pending()&&!ntag_emu.paused&&!exited);
 assert(!mui_nfc_save_draw(&ui));
 reset();input(INPUT_KEY_RIGHT,INPUT_TYPE_SHORT);input(INPUT_KEY_RIGHT,INPUT_TYPE_SHORT);
 assert(m_save_confirm==2);fail=false;assert(ntag_emu_prepare_change());
 ntag_t imported={.type=NTAG_215};imported.data[16]=0x77;assert(ntag_emu_set_tag(&imported));
 ntag_emu_save_failed();fail=true;input(INPUT_KEY_CENTER,INPUT_TYPE_SHORT);
 assert(!exited&&m_save_confirm==0&&ntag_emu_save_pending()&&ntag_emu.ntag.data[16]==0x77);
 reset();input(INPUT_KEY_RIGHT,INPUT_TYPE_SHORT);input(INPUT_KEY_RIGHT,INPUT_TYPE_SHORT);
 assert(!exited&&ntag_emu_save_pending()&&persisted==0x11);
 input(INPUT_KEY_CENTER,INPUT_TYPE_SHORT);assert(exited==1&&!ntag_emu_save_pending()&&!ntag_emu.dirty&&persisted==0x11);
 assert(!ntag_emu_discard_changes());
 puts("PASS actual zero-allocation overlay: repeated retry, No/Back/held key keep RAM, separate Yes confirmation exits without storage write");return 0;
}
'''
 run('allocation-free retry/discard overlay',code)

if __name__=='__main__':main()
