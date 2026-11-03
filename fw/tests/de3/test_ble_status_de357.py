"""Actual BLE status snapshots/observers and 128x64 U8g2 status-bar pixels.

No radio or LCD hardware is simulated. Optional production-rendered PBM frames
are written when PIXL_BLE_STATUS_RENDER names an existing output directory.
"""
from pathlib import Path
import os
import re
import shutil
import subprocess
import tempfile
import unittest

from root_host import FW, SRC, HostTests
from test_ble_status_de320 import function
from test_text_input_render_de344 import LIBS


STATE_HARNESS = r'''
#include "ble_main.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"line %u: %s\n",__LINE__,#x); exit(73); } } while (0)
#define BLE_CONN_HANDLE_INVALID 65535
static unsigned critical_depth, status_calls, file_calls, poll_step;
static bool can_send;
static ble_link_state_t status_seen, file_seen;
#define CRITICAL_REGION_ENTER() do { ++critical_depth;
#define CRITICAL_REGION_EXIT() --critical_depth; } while(0)
/*ACTUAL_GLOBALS*/
static bool ble_work_can_send(void) { return can_send; }
static void ble_on_disconnected(void) {}
static void ble_file_join_poll(void) { CHECK(poll_step==0);poll_step++; }
static void ble_work_process(void (*fn)(void)) { CHECK(fn==ble_on_disconnected && poll_step==1);poll_step++; }
static void ble_release_stopped_session(void) { CHECK(poll_step==2);poll_step++; }
static void ble_file_link_poll(void) { CHECK(poll_step==3);poll_step++; }
static void ble_pending_mode_poll(void) { CHECK(poll_step==4);poll_step++; }
static void ble_df_driver_poll(void) { CHECK(poll_step==5);poll_step++; }
/*ACTUAL_FUNCTIONS*/
static void status_changed(ble_link_state_t state) {
    CHECK(!critical_depth && poll_step==6);status_seen=state;status_calls++;
}
static void file_changed(ble_link_state_t state) {
    CHECK(!critical_depth && poll_step==6);file_seen=state;file_calls++;
}
static void process(void) { poll_step=0;ble_process_pending();CHECK(poll_step==6 && !critical_depth); }
static void expect(ble_link_state_t state) {
    CHECK(ble_status_state_get()==state && !critical_depth);
    process();CHECK(status_seen==state);
    unsigned before=status_calls;
    for(unsigned n=0;n<100;n++)process();
    CHECK(status_calls==before); /* Idle main-loop ticks cannot repaint. */
}
int main(void) {
    m_conn_handle=m_nus_session_handle=m_release_handle=BLE_CONN_HANDLE_INVALID;
    m_ble_initialized=false;m_sessions_enabled=true;can_send=true;
    ble_link_state_observe(file_changed);ble_status_state_observe(status_changed);
    expect(BLE_LINK_INACTIVE);CHECK(status_calls==1 && file_calls==1);
    m_advertising_active=true;expect(BLE_LINK_INACTIVE); /* Stale pre-init flag. */
    m_ble_initialized=true;expect(BLE_LINK_ADVERTISING);
    m_sessions_enabled=false;expect(BLE_LINK_INACTIVE);
    m_sessions_enabled=true;m_mode_pending=true;expect(BLE_LINK_INACTIVE);
    m_mode_pending=false;expect(BLE_LINK_ADVERTISING);

    // File transfer, remote control and compatibility modes must all require
    // the current peer's NUS session; legacy CONNECTED alone is insufficient.
    unsigned modes=0;
    for(unsigned mode=0;mode<3;mode++) {
        m_file_mode=mode==0;m_remote_mode=mode==1;
        m_conn_handle=4;m_nus_session_handle=BLE_CONN_HANDLE_INVALID;
        expect(BLE_LINK_HOST_CONNECTED);
        if(mode==1)CHECK(ble_link_state_get()==BLE_LINK_CONNECTED); // Legacy API deliberately unchanged.
        m_nus_session_handle=5;expect(BLE_LINK_HOST_CONNECTED); // Old peer cannot make a new one ready.
        m_nus_session_handle=4;expect(BLE_LINK_CONNECTED);
        can_send=false;expect(BLE_LINK_HOST_CONNECTED);can_send=true;expect(BLE_LINK_CONNECTED);
        m_sessions_enabled=false;expect(BLE_LINK_DISCONNECTING);m_sessions_enabled=true;
        m_mode_pending=true;expect(BLE_LINK_DISCONNECTING);m_mode_pending=false;
        m_release_handle=4;m_release_attempted=false;m_release_requested=false;expect(BLE_LINK_DISCONNECTING);
        m_release_attempted=true;m_release_requested=true;expect(BLE_LINK_DISCONNECTING);
        m_release_requested=false;expect(BLE_LINK_HOST_CONNECTED); // Failed request leaves a physical link, not an ongoing disconnect or ready channel.
        m_release_handle=BLE_CONN_HANDLE_INVALID;m_nus_session_handle=BLE_CONN_HANDLE_INVALID;
        expect(BLE_LINK_HOST_CONNECTED);
        m_conn_handle=BLE_CONN_HANDLE_INVALID;expect(BLE_LINK_ADVERTISING);
        m_advertising_active=false;expect(BLE_LINK_INACTIVE);
        m_advertising_active=true;modes++;
    }

    // Status observer owns a different subscription. Removing/replacing one
    // cannot steal the file screen's callback or leave a freed view reachable.
    process();ble_status_state_observe(NULL);unsigned status_before=status_calls,file_before=file_calls;
    m_advertising_active=false;process();CHECK(status_calls==status_before && file_calls==file_before+1);
    ble_status_state_observe(status_changed);process();CHECK(status_calls==status_before+1);
    ble_link_state_observe(NULL);file_before=file_calls;m_advertising_active=true;
    process();CHECK(file_calls==file_before && status_seen==BLE_LINK_ADVERTISING);
    ble_status_state_observe(NULL);m_advertising_active=false;process();
    printf("PASS: %u BLE modes, stale peer/release/transition states, independent observers, foreground delivery and idle redraw suppression\n",modes);
    return 0;
}
'''


RENDER_HARNESS = r'''
#include "mui_canvas.h"
#include "status_bar_view.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"line %u: %s\n",__LINE__,#x); exit(73); } } while (0)
extern const uint8_t u8g2_font_likeminecraft_te[],u8g2_font_siji_t_6x10[];
#define MUI_FONT_SMALL u8g2_font_likeminecraft_te
#define _L_DE3_BAT_LOW 1
static unsigned voltage=4180, level=8, redraws, bitmap_draws;
static bool valid=true, low, charging;
static const char *low_text="Niedrig";
static bool get_stats(void) { return charging; }
static uint8_t bat_get_level(void) { return level; }
static bool bat_has_reading(void) { return valid; }
static unsigned bat_get_voltage_mv(void) { return voltage; }
static bool bat_is_low(void) { return low; }
static const char *getLangString(int id) { CHECK(id==_L_DE3_BAT_LOW);return low_text; }
static void *mui(void) { return &redraws; }
static void mui_update(void *p) { CHECK(p==&redraws);redraws++; }
void original_draw_xbm(mui_canvas_t *,uint8_t,uint8_t,uint8_t,uint8_t,const uint8_t*);
void mui_canvas_draw_xbm(mui_canvas_t *c,uint8_t x,uint8_t y,uint8_t w,uint8_t h,const uint8_t *bits) {
    CHECK(x==0 && y==0 && w==13 && h==11 && bits);bitmap_draws++;
    original_draw_xbm(c,x,y,w,h,bits);
}
/*ACTUAL_ICONS*/
/*ACTUAL_FUNCTIONS*/
static const u8x8_display_info_t display_info={.tile_width=16,.tile_height=8,.pixel_width=128,.pixel_height=64};
static bool pixel(const uint8_t *buffer,unsigned x,unsigned y) { return !!(buffer[(y/8)*128+x] & (1U<<(y%8))); }
static void save_frame(const char *directory,const char *name,const uint8_t *buf) {
    if (!directory) return;
    char path[2048];CHECK(snprintf(path,sizeof(path),"%s/status-%s.pbm",directory,name)>0);
    FILE *f=fopen(path,"wb");CHECK(f);fprintf(f,"P1\n128 64\n");
    for(unsigned y=0;y<64;y++)for(unsigned x=0;x<128;x++)
        fprintf(f,"%u%c",pixel(buf,x,y),x==127?'\n':' ');
    fclose(f);
}
int main(int argc,char **argv) {
    u8g2_t u={0};uint8_t buffer[1024]={0},frames[5][1024];mui_canvas_t canvas={0};
    u.u8x8.display_info=&display_info;
    u8g2_SetupBuffer(&u,buffer,8,u8g2_ll_hvline_vertical_top_lsb,&u8g2_cb_r0);
    canvas.fb=&u;mui_canvas_set_frame(&canvas,0,0,128,12);
    status_bar_view_t status={0};mui_view_t view={.user_data=&status};status.p_view=&view;
    const ble_link_state_t states[]={BLE_LINK_INACTIVE,BLE_LINK_ADVERTISING,BLE_LINK_HOST_CONNECTED,BLE_LINK_CONNECTED,BLE_LINK_DISCONNECTING};
    const char *names[]={"inactive","visible","link","ready","disconnecting"};
    for(unsigned i=0;i<5;i++) {
        memset(buffer,0,sizeof(buffer));status.link_state=states[i];
        status_bar_view_on_draw(&view,&canvas);memcpy(frames[i],buffer,sizeof(buffer));
        unsigned icon_pixels=0;
        for(unsigned y=0;y<64;y++)for(unsigned x=0;x<128;x++) {
            if(x<13 && y<11)icon_pixels+=pixel(buffer,x,y);
            if(x>=14)CHECK(pixel(buffer,x,y)==pixel(frames[0],x,y));
            if(y>=11 && x<14)CHECK(!pixel(buffer,x,y));
        }
        CHECK(icon_pixels>=15 && icon_pixels<130);
        for(unsigned j=0;j<i;j++)CHECK(memcmp(frames[i],frames[j],1024)!=0);
        save_frame(argc>1?argv[1]:NULL,names[i],buffer);
    }
    CHECK(bitmap_draws==5);
    // Invalid enum values must choose the bounded inactive bitmap, including
    // a negative value represented by either signed or short unsigned enums.
    for(unsigned bad=0;bad<2;bad++) {
        memset(buffer,0,sizeof(buffer));status.link_state=(ble_link_state_t)(bad?255:-1);
        status_bar_view_on_draw(&view,&canvas);CHECK(!memcmp(buffer,frames[0],1024));
    }

    // All states keep the measured voltage, charging indicator and battery
    // pixels identical. Exercise every battery level and translated low text.
    unsigned cases=0;
    for(unsigned battery=0;battery<=8;battery++)for(unsigned ch=0;ch<2;ch++)
      for(unsigned warning=0;warning<4;warning++) {
        level=battery;charging=ch;low=warning>0;valid=warning!=3;
        low_text=warning==2?"Batteriestand sehr niedrig, bitte laden":"Niedrig";
        voltage=warning?2182:4180;
        for(unsigned i=0;i<5;i++) {
            memset(buffer,0,sizeof(buffer));status.link_state=states[i];status_bar_view_on_draw(&view,&canvas);
            if(!i)memcpy(frames[0],buffer,1024);
            for(unsigned y=0;y<64;y++)for(unsigned x=14;x<128;x++)
                CHECK(pixel(buffer,x,y)==pixel(frames[0],x,y));
            // No status pixels may escape the 12-high status layer.
            for(unsigned y=12;y<64;y++)for(unsigned x=0;x<128;x++)CHECK(!pixel(buffer,x,y));
            cases++;
        }
      }

    // Setter must tolerate absent UI and avoid an unbounded redraw loop.
    status_bar_view_set_link_state(NULL,BLE_LINK_CONNECTED);
    status.link_state=BLE_LINK_INACTIVE;redraws=0;
    status_bar_view_set_link_state(&status,BLE_LINK_INACTIVE);CHECK(redraws==0);
    for(unsigned i=1;i<5;i++) {
        unsigned before=redraws;status_bar_view_set_link_state(&status,states[i]);
        CHECK(status.link_state==states[i] && redraws==before+1);
        for(unsigned n=0;n<100;n++)status_bar_view_set_link_state(&status,states[i]);
        CHECK(redraws==before+1);
    }
    printf("PASS: 5 distinct actual BT icons, %u status/battery/voltage pixel scenarios, bounds and change-only redraw\n",cases);
    return 0;
}
'''


LIFECYCLE_HARNESS = r'''
#include "ble_main.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"line %u: %s\n",__LINE__,#x); exit(73); } } while (0)
typedef struct {void *p_handle;} mini_app_inst_t;
typedef struct {unsigned marker;} status_bar_view_t;
typedef struct {unsigned marker;} mui_view_dispatcher_t;
enum {MINI_APP_ID_STATUS_BAR,STATUS_BAR_VIEW_ID_MAIN,MUI_LAYER_STATUS_BAR};
static unsigned allocation,fail_at,live,attached,delivered;
static mini_app_inst_t *current;
static ble_link_state_handler_t status_handler;
static void *mui_mem_malloc(size_t n) {
    if(++allocation==fail_at)return NULL;
    void *p=calloc(1,n);CHECK(p);live++;return p;
}
static void mui_mem_free(void *p) {CHECK(!status_handler);if(p){CHECK(live);live--;free(p);}}
static mui_view_dispatcher_t *mui_view_dispatcher_create(void) {return mui_mem_malloc(sizeof(mui_view_dispatcher_t));}
static void mui_view_dispatcher_free(mui_view_dispatcher_t *p) {mui_mem_free(p);}
static status_bar_view_t *status_bar_view_create(void) {return mui_mem_malloc(sizeof(status_bar_view_t));}
static void status_bar_view_free(status_bar_view_t *p) {mui_mem_free(p);}
static void *status_bar_view_get_view(status_bar_view_t *p) {CHECK(p);return p;}
static void mui_view_dispatcher_add_view(mui_view_dispatcher_t *p,int id,void *v) {CHECK(p&&v&&id==STATUS_BAR_VIEW_ID_MAIN);}
static void mui_view_dispatcher_attach(mui_view_dispatcher_t *p,int layer) {CHECK(p&&layer==MUI_LAYER_STATUS_BAR);attached=1;}
static void mui_view_dispatcher_switch_to_view(mui_view_dispatcher_t *p,int id) {CHECK(p&&attached&&id==STATUS_BAR_VIEW_ID_MAIN);}
static void mui_view_dispatcher_detach(mui_view_dispatcher_t *p,int layer) {CHECK(p&&layer==MUI_LAYER_STATUS_BAR&&!status_handler);attached=0;}
void ble_status_state_observe(ble_link_state_handler_t handler) {
    if(handler)CHECK(attached&&current->p_handle&&live==3);
    status_handler=handler;
}
static void *mini_app_launcher(void) {return current;}
static void *mini_app_launcher_get_app_handle(void *p,int id) {CHECK(p==current&&id==MINI_APP_ID_STATUS_BAR);return current->p_handle;}
static void status_bar_view_set_link_state(status_bar_view_t *p,ble_link_state_t state) {CHECK(p&&live==3&&state==BLE_LINK_CONNECTED);delivered++;}
/*ACTUAL_APP_TYPE*/
/*ACTUAL_FUNCTIONS*/
int main(void) {
    for(unsigned failure=0;failure<=3;failure++) {
        mini_app_inst_t instance={0};current=&instance;allocation=live=attached=delivered=0;fail_at=failure;
        app_status_bar_on_run(&instance);
        if(failure)CHECK(!instance.p_handle&&!status_handler&&!live&&!attached);
        else {
            CHECK(instance.p_handle&&status_handler&&live==3&&attached);
            status_handler(BLE_LINK_CONNECTED);CHECK(delivered==1);
        }
        app_status_bar_on_kill(&instance);CHECK(!instance.p_handle&&!status_handler&&!live&&!attached);
        app_status_bar_link_state_changed(BLE_LINK_CONNECTED);CHECK(delivered==(failure?0:1));
        app_status_bar_on_kill(&instance);CHECK(!live); // Idempotent cleanup.
    }
    puts("PASS: status subscription after full initialization, allocation-failure unwinding, unsubscribe-before-free and absent-view callback");
    return 0;
}
'''


class BleStatusTests(HostTests):
    def test_actual_application_observer_lifetime(self):
        source=(SRC/'app/status_bar/app_status_bar.c').read_text()
        app_type=re.search(r'typedef struct \{[^}]+\} app_status_bar_t;',source).group()
        functions='\n'.join(function(source,name) for name in ('app_status_bar_link_state_changed','app_status_bar_on_run','app_status_bar_on_kill'))
        self.compile_run(LIFECYCLE_HARNESS.replace('/*ACTUAL_APP_TYPE*/',app_type).replace('/*ACTUAL_FUNCTIONS*/',functions),includes=(SRC/'mod/ble',))

    def test_actual_snapshot_and_independent_observers(self):
        source=(SRC/'mod/ble/ble_main.c').read_text()
        declarations=[]
        for name in ('m_conn_handle','m_nus_session_handle','m_release_handle','m_release_attempted',
                     'm_ble_initialized','m_sessions_enabled','m_mode_pending','m_advertising_active',
                     'm_file_mode','m_remote_mode','m_reported_link_state','m_link_state_handler',
                     'm_reported_status_state','m_status_state_handler'):
            match=re.search(r'^static [^;\n]*\b'+name+r'\b[^;\n]*;',source,re.M)
            self.assertIsNotNone(match,name)
            declaration='static bool m_mode_pending;' if name=='m_mode_pending' else match.group()
            if declaration not in declarations: declarations.append(declaration)
        functions='\n'.join(function(source,name) for name in ('ble_link_state_get','ble_status_state_get',
            'ble_link_state_observe','ble_status_state_observe','ble_process_pending'))
        code=STATE_HARNESS.replace('/*ACTUAL_GLOBALS*/','\n'.join(declarations)).replace('/*ACTUAL_FUNCTIONS*/',functions)
        self.compile_run(code,includes=(SRC/'mod/ble',))

    def test_actual_status_bar_pixels(self):
        source=(SRC/'app/status_bar/view/status_bar_view.c').read_text()
        # Copy the production bitmap table exactly, without a second icon copy.
        first=source.index('static const uint8_t')
        end=source.index('static void status_bar_view_on_draw')
        icons=source[first:end]
        functions='\n'.join(function(source,name) for name in ('status_bar_view_on_draw','status_bar_view_set_link_state'))
        code=RENDER_HARNESS.replace('/*ACTUAL_ICONS*/',icons).replace('/*ACTUAL_FUNCTIONS*/',functions)
        with tempfile.TemporaryDirectory(prefix='pixl-ble-status-') as tmp:
            folder=Path(tmp)
            for name in ('mui_canvas.h','u8g2_font_likeminecraft_te.c','u8g2_font_siji_t_6x10.c'):
                shutil.copyfile(SRC/'mui'/name,folder/name)
            shutil.copyfile(SRC/'app/status_bar/view/status_bar_view.h',folder/'status_bar_view.h')
            (folder/'mui_common.h').write_text('#pragma once\n#include <stdbool.h>\n#include <stdint.h>\n#include <string.h>\n#include "u8g2.h"\n')
            (folder/'mui_u8g2.h').write_text('#include "u8g2.h"\n')
            (folder/'mui_include.h').write_text('#pragma once\n#include "mui_canvas.h"\ntypedef struct {void *user_data;} mui_view_t;\n')
            canvas=(SRC/'mui/mui_canvas.c').read_text().replace('mui_canvas_draw_xbm(', 'original_draw_xbm(',1)
            (folder/'mui_canvas.c').write_text(canvas)
            (folder/'main.c').write_text(code)
            binary=folder/'test.exe';u8=FW/'components/u8g2/csrc'
            cmd=['gcc','-std=c11','-O1','-g','-Wno-unused-function','-I',str(folder),'-I',str(u8),'-I',str(SRC/'mod/ble')]
            if os.environ.get('PIXL_SANITIZE')=='1':
                cmd+=['-fsanitize=address,undefined','-fno-sanitize-recover=all']
            cmd += [str(folder/n) for n in ('main.c','mui_canvas.c','u8g2_font_likeminecraft_te.c','u8g2_font_siji_t_6x10.c')]
            cmd += [str(u8/n) for n in LIBS]+['-o',str(binary)]
            build=subprocess.run(cmd,capture_output=True,text=True,timeout=120)
            self.assertEqual(build.returncode,0,build.stdout+build.stderr)
            command=[str(binary)]
            if os.environ.get('PIXL_BLE_STATUS_RENDER'):command.append(os.environ['PIXL_BLE_STATUS_RENDER'])
            result=subprocess.run(command,capture_output=True,text=True,timeout=60)
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)
            print(result.stdout)


if __name__=='__main__':unittest.main()
