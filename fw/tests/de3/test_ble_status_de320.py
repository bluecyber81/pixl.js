"""Actual BLE boundary/view C with SDK stubs, plus exact u8g2 font metrics.

No radio or device access. Source functions are compiled unchanged, including
the real GAP/NUS/advertising handlers. Mutants exercise the race-sensitive paths.
"""
import csv
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import tempfile
import unittest

FW = Path(__file__).resolve().parents[2]
SRC = FW / "application/src"
BLE = SRC / "mod/ble"
VIEW = SRC / "app/ble/view"
KEYS = ("_L_APP_BLE_TITLE", "_L_DE3_BLE_VISIBLE", "_L_DE3_BLE_CONNECTED",
        "_L_DE3_BLE_INACTIVE", "_L_DE3_BLE_RESTART", "_L_DE3_BLE_BACK", "_L_DE3_BLE_QR", "_L_DE3_BLE_HOST", "_L_DE3_BLE_CLOSING", "_L_DE3_BLE_WAIT_CLIENT")
STRINGS = {r["CODE"]: r for r in csv.DictReader((FW / "data/i18n.csv").open(encoding="utf-8-sig"))}


def function(text, name):
    match = re.search(r"^[ \t]*(?:static[ \t]+)?[A-Za-z_]\w*[ \t*]+" + name + r"\([^;]*?\)\s*\{", text, re.M)
    assert match, name
    end = text.index("{", match.start()) + 1
    depth = 1
    while depth:
        depth += (text[end] == "{") - (text[end] == "}")
        end += 1
    return text[match.start():end]


UI_STUB = r'''
#pragma once
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
#include <string.h>
typedef enum { INPUT_KEY_LEFT, INPUT_KEY_CENTER, INPUT_KEY_RIGHT } input_key_t;
typedef enum { INPUT_TYPE_PRESS, INPUT_TYPE_RELEASE, INPUT_TYPE_SHORT, INPUT_TYPE_LONG, INPUT_TYPE_REPEAT } input_type_t;
typedef struct { input_key_t key; input_type_t type; } mui_input_event_t;
typedef struct { int unused; } mui_canvas_t;
typedef struct mui_view_s mui_view_t;
struct mui_view_s { void *user_data;
 void (*draw_cb)(mui_view_t*,mui_canvas_t*); void (*input_cb)(mui_view_t*,mui_input_event_t*);
 void (*enter_cb)(mui_view_t*); void (*exit_cb)(mui_view_t*); };
enum { u8g2_font_siji_t_6x10, u8g2_font_wqy12_t_gb2312a };
void *mui_mem_malloc(size_t); void mui_mem_free(void*);
mui_view_t *mui_view_create(void); void mui_view_free(mui_view_t*);
void mui_canvas_set_font(mui_canvas_t*,int); void mui_canvas_draw_glyph(mui_canvas_t*,int,int,int);
void mui_canvas_draw_utf8(mui_canvas_t*,int,int,const char*);
void *mui(void); void mui_update(void*);
'''

HARNESS = r'''
#include <stdio.h>
#include <stdlib.h>
#include "mui_include.h"
#include "ble_main.h"
#include "ble_status_view.h"
#include "i18n/language.h"
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"CHECK line %d: %s\n",__LINE__,#x); exit(71); } } while(0)
#define NRF_SUCCESS 0
#define NRF_ERROR_INVALID_STATE 8
#define BLE_CONN_HANDLE_INVALID 65535
#define BLE_GATT_ATT_MTU_DEFAULT 23
#define OPCODE_LENGTH 1
#define HANDLE_LENGTH 2
#define BLE_FILE_JOIN_TIMEOUT_TICKS 491520u
static uint32_t app_timer_cnt_get(void) {return 0;}
static uint32_t app_timer_cnt_diff_compute(uint32_t now,uint32_t old) {return (now-old)&0xffffffu;}
#define NRF_SDH_BLE_GATT_MAX_MTU_SIZE 250
#define BLE_CONNECT_SLEEP_TIMEOUT_SECONDS 180
#define DEVICE_NAME_AMILOOP "AmiLoop"
#define BLE_GAP_PHY_AUTO 0
#define BLE_GAP_SEC_STATUS_PAIRING_NOT_SUPP 0
#define BLE_HCI_REMOTE_USER_TERMINATED_CONNECTION 0x13
static void test_log(const char *format,...) { (void)format; }
#define NRF_LOG_INFO(...) test_log(__VA_ARGS__)
#define NRF_LOG_DEBUG(...) test_log(__VA_ARGS__)
#define NRF_LOG_WARNING(...) test_log(__VA_ARGS__)
#define APP_ERROR_CHECK(x) CHECK((x)==NRF_SUCCESS)
#define RUNTIME_DIAG_GATT_CLIENT_TIMEOUT 1
#define RUNTIME_DIAG_GATT_SERVER_TIMEOUT 2
#define CRITICAL_REGION_ENTER() do { ++critical_depth;
#define CRITICAL_REGION_EXIT() --critical_depth; } while(0)
typedef uint32_t ret_code_t;
typedef int ble_adv_evt_t;
enum { BLE_ADV_EVT_FAST=1, BLE_ADV_EVT_IDLE, BLE_ADV_MODE_FAST, BLE_ADV_MODE_IDLE,
       BSP_INDICATE_ADVERTISING, BSP_INDICATE_IDLE, BSP_INDICATE_CONNECTED,
       BLE_GAP_EVT_CONNECTED, BLE_GAP_EVT_DISCONNECTED, BLE_GAP_EVT_PHY_UPDATE_REQUEST,
       BLE_GAP_EVT_SEC_PARAMS_REQUEST, BLE_GATTS_EVT_SYS_ATTR_MISSING,
       BLE_GATTC_EVT_TIMEOUT, BLE_GATTS_EVT_TIMEOUT,
       BLE_NUS_EVT_RX_DATA, BLE_NUS_EVT_TX_RDY, BLE_NUS_EVT_COMM_STARTED, BLE_NUS_EVT_COMM_STOPPED };
typedef struct { struct { int evt_id; } header;
 struct { struct { uint16_t conn_handle; struct { struct { uint8_t reason; } disconnected; } params; } gap_evt;
          struct { uint16_t conn_handle; } gattc_evt, gatts_evt; } evt; } ble_evt_t;
typedef struct { int rx_phys, tx_phys; } ble_gap_phys_t;
typedef struct { int type; uint16_t conn_handle; struct { struct { const uint8_t *p_data; size_t length; } rx_data; } params; } ble_nus_evt_t;
typedef struct { void *p_adv_data; int adv_mode_current, adv_handle; struct { bool ble_adv_on_disconnect_disabled; } adv_modes_config; } advertising_t;
static advertising_t m_advertising;
static int critical_depth, irq, redraws, updates, observed, feeds, disconnects, adv_starts, queues;
static int adv_error, softdevice_connect_during_restart, frees, indications, last_indication;
static uint16_t timeout=30, m_previous_pwr_mgmt_sleep_timeout=180, m_ble_nus_max_data_len=20;
static int m_qwr;
/* GLOBALS */
static void on_adv_evt(ble_adv_evt_t);
static uint32_t bsp_indication_set(int i) { indications++; last_indication=i; return 0; }
static uint32_t ble_advertising_start(advertising_t *a,int mode) {
 CHECK(a==&m_advertising); adv_starts++; a->adv_mode_current=mode;
 if(mode==BLE_ADV_MODE_IDLE) CHECK(a->adv_modes_config.ble_adv_on_disconnect_disabled);
 if(softdevice_connect_during_restart) return NRF_ERROR_INVALID_STATE;
 if(adv_error)return adv_error;
 on_adv_evt(mode==BLE_ADV_MODE_FAST ? BLE_ADV_EVT_FAST : BLE_ADV_EVT_IDLE); return 0;
}
#define BLE_CONN_STATUS_CONNECTED 1
static int ble_conn_state_status(uint16_t h) {(void)h;return BLE_CONN_STATUS_CONNECTED;}
static bool ble_work_cleanup_complete(void) {return true;}
static void ble_work_connected(void) {}
static void ble_work_disconnected(void) {}
static void ble_on_disconnected(void) {}
static void ble_work_process(void (*cleanup)(void)) { (void)cleanup; CHECK(!critical_depth); }
static void ble_df_driver_poll(void) {}
static void ble_pending_mode_poll(void) {} /* Remote modes have a dedicated harness. */
static void ble_file_link_poll(void) {} /* Actual owner covered by DE351 handoff suite. */
static bool m_mode_pending,m_mode_adv_requested,m_mode_handlers_ready,m_mode_wait_reply;
static bool ble_remote_receive_irq(const uint8_t*p,size_t n){(void)p;(void)n;CHECK(false);return false;}
void ble_get_addr_str(char *addr){strcpy(addr,"00:00:00:00:00:00");}
static bool ble_work_receive(const uint8_t *p,size_t n) { (void)p;(void)n;queues++;return true; }
static bool ble_work_tx_ready(void) { queues++;return true; }
static void nrf_pwr_mgmt_feed(void) { feeds++; }
static uint16_t nrf_pwr_mgmt_get_timeout(void) { return timeout; }
static void nrf_pwr_mgmt_set_timeout(uint16_t t) { timeout=t; }
static void runtime_diag_ble_disconnected(uint8_t r) { (void)r; }
static void runtime_diag_ble_abort(int r) { (void)r; }
static bool ble_device_name_is(const char *s) { (void)s;return false; }
static uint32_t nrf_ble_qwr_conn_handle_assign(void *q,uint16_t h) { (void)q;(void)h;return 0; }
static uint32_t sd_ble_gattc_exchange_mtu_request(uint16_t h,int n) { (void)h;(void)n;return 0; }
static uint32_t sd_ble_gap_phy_update(uint16_t h,const ble_gap_phys_t*p) { (void)h;(void)p;return 0; }
static uint32_t sd_ble_gap_sec_params_reply(uint16_t h,int s,void*a,void*b) { (void)h;(void)s;(void)a;(void)b;return 0; }
static uint32_t sd_ble_gatts_sys_attr_set(uint16_t h,void*p,int a,int b) { (void)h;(void)p;(void)a;(void)b;return 0; }
static uint32_t sd_ble_gap_disconnect(uint16_t h,int reason) { (void)h;(void)reason;disconnects++;return 0; }
static uint32_t sd_ble_gap_adv_stop(int h) { (void)h;return 0; }
/* ACTUAL_BLE */
static void observed_state(ble_link_state_t state) { CHECK(!critical_depth&&!irq);observed++;(void)state; }
static void event(int kind) {
 ble_evt_t e={0};e.header.evt_id=kind;e.evt.gap_evt.conn_handle=4;irq=1;ble_evt_handler(&e,NULL);irq=0;
 CHECK(!critical_depth);
}
static void adv(int kind) { irq=1;on_adv_evt(kind);irq=0; }
void *mui_mem_malloc(size_t size) { void *p=malloc(size);CHECK(p);memset(p,0xa5,size);return p; }
void mui_mem_free(void *p) { CHECK(m_link_state_handler==NULL);free(p);frees++; }
mui_view_t *mui_view_create(void) { return mui_mem_malloc(sizeof(mui_view_t)); }
void mui_view_free(mui_view_t *v) { mui_mem_free(v); }
void mui_canvas_set_font(mui_canvas_t*c,int f) { (void)c;(void)f; }
void mui_canvas_draw_glyph(mui_canvas_t*c,int x,int y,int f) { (void)c;(void)x;(void)y;(void)f; }
static char drawn[4][80];static int drawn_n;
void mui_canvas_draw_utf8(mui_canvas_t*c,int x,int y,const char*s) {
 (void)c;CHECK(x>=0&&y>=0&&y<51&&s&&drawn_n<4);strcpy(drawn[drawn_n++],s);
}
void draw_qrcode(mui_canvas_t*c,int x,int y,int n,const char*s) { (void)c;(void)x;(void)y;(void)n;(void)s; }
void *mui(void) { return &updates; }
void mui_update(void *p) { CHECK(p==&updates&&!irq&&!critical_depth);redraws++; }
/* STRINGS */
typedef struct { void *p_view_dispatcher; ble_status_view_t *p_ble_view; void *p_scene_dispatcher; } app_ble_t;
typedef struct { void *p_handle; } mini_app_inst_t;
#define MINI_APP_ID_BLE 1
#define MUI_LAYER_WINDOW 2
static app_ble_t *active_app;
static void *mini_app_launcher(void) { return &active_app; }
static void *mini_app_launcher_get_app_handle(void*p,int id) { (void)p;(void)id;return active_app; }
static void mini_app_launcher_kill(void*p,int id) { (void)p;(void)id;active_app=NULL; }
static void mui_view_dispatcher_detach(void*p,int layer) { (void)p;(void)layer;CHECK(!m_link_state_handler); }
static void mui_view_dispatcher_free(void*p) { (void)p;CHECK(!m_link_state_handler); }
static void mui_scene_dispatcher_free(void*p) { (void)p;CHECK(!m_link_state_handler); }
/* ACTUAL_SCENE */
/* ACTUAL_KILL */
#include "ble_status_view.c"
static void draw(ble_status_view_t *v) { drawn_n=0;v->p_view->draw_cb(v->p_view,NULL); }
static void input(ble_status_view_t *v,input_key_t key,input_type_t type) {
 mui_input_event_t e={key,type};v->p_view->input_cb(v->p_view,&e);
}
static void setup(void) {
 m_advertising.p_adv_data=&m_advertising; m_sessions_enabled=true;m_file_mode=false;m_ble_initialized=true;m_conn_handle=BLE_CONN_HANDLE_INVALID;m_advertising_active=false;
 m_advertising.adv_mode_current=BLE_ADV_MODE_IDLE;ble_link_state_observe(observed_state);
 ble_process_pending();CHECK(observed==1);observed=0;
}
int main(int argc,char **argv) {
 CHECK(argc==2);const char *test=argv[1]; setup();
 if(!strcmp(test,"transitions")) {
  CHECK(ble_link_state_get()==BLE_LINK_INACTIVE);CHECK(ble_restart_advertising());
  CHECK(adv_starts==1&&ble_link_state_get()==BLE_LINK_ADVERTISING&&observed==0);
  ble_process_pending();CHECK(observed==1);ble_process_pending();CHECK(observed==1);
  adv(BLE_ADV_EVT_IDLE);CHECK(ble_link_state_get()==BLE_LINK_INACTIVE&&observed==1);
  ble_process_pending();CHECK(observed==2);event(BLE_GAP_EVT_CONNECTED);
  CHECK(ble_link_state_get()==BLE_LINK_CONNECTED&&timeout==180&&observed==2);
  ble_process_pending();CHECK(observed==3);event(BLE_GAP_EVT_DISCONNECTED);
  CHECK(ble_link_state_get()==BLE_LINK_INACTIVE&&timeout==30);ble_process_pending();CHECK(observed==4);
 } else if(!strcmp(test,"observer_order")) {
  event(BLE_GAP_EVT_CONNECTED);adv(BLE_ADV_EVT_FAST); /* SDK restart before our GAP-disconnect callback */
  event(BLE_GAP_EVT_DISCONNECTED);CHECK(ble_link_state_get()==BLE_LINK_ADVERTISING);
  event(BLE_GAP_EVT_CONNECTED);event(BLE_GAP_EVT_DISCONNECTED);adv(BLE_ADV_EVT_FAST);
  CHECK(ble_link_state_get()==BLE_LINK_ADVERTISING);
 } else if(!strcmp(test,"guarded_restart")) {
  m_ble_initialized=false;CHECK(!ble_restart_advertising()&&!adv_starts);
  m_ble_initialized=true;adv(BLE_ADV_EVT_FAST);CHECK(!ble_restart_advertising()&&!adv_starts);
  event(BLE_GAP_EVT_CONNECTED);CHECK(!ble_restart_advertising()&&!adv_starts&&!disconnects);
  event(BLE_GAP_EVT_DISCONNECTED);softdevice_connect_during_restart=1;
  CHECK(!ble_restart_advertising()&&adv_starts==1&&!disconnects);
  event(BLE_GAP_EVT_CONNECTED);CHECK(ble_link_state_get()==BLE_LINK_CONNECTED);
 } else if(!strcmp(test,"failed_restart")) {
  adv_error=99;CHECK(!ble_restart_advertising()&&ble_link_state_get()==BLE_LINK_INACTIVE&&!disconnects);
  adv_error=0;CHECK(ble_restart_advertising()&&ble_link_state_get()==BLE_LINK_ADVERTISING);
 } else if(!strcmp(test,"disable")) {
  adv(BLE_ADV_EVT_FAST);ble_disable();CHECK(ble_link_state_get()==BLE_LINK_INACTIVE);
  event(BLE_GAP_EVT_CONNECTED);CHECK(disconnects==1); /* late CONNECT after disable is rejected */
  ble_disable();CHECK(disconnects==2);
  event(BLE_GAP_EVT_DISCONNECTED);CHECK(ble_link_state_get()==BLE_LINK_INACTIVE);
 } else if(!strcmp(test,"no_packet_redraw")) {
  event(BLE_GAP_EVT_CONNECTED);ble_process_pending();CHECK(observed==1);
  for(unsigned i=0;i<1000;i++) {ble_nus_evt_t e={.conn_handle=4};e.type=i%2 ? BLE_NUS_EVT_RX_DATA : BLE_NUS_EVT_TX_RDY;
   irq=1;nus_data_handler(&e);irq=0;ble_process_pending();}
  CHECK(observed==1&&feeds==1000&&queues==1000&&!disconnects);
 } else if(!strcmp(test,"session_ui")) {
  m_file_mode=true;ble_status_view_t *v=ble_status_view_create();strcpy(v->ble_addr,"01:23:45:67:89:AB");
  event(BLE_GAP_EVT_CONNECTED);draw(v);
  CHECK(v->drawn_link_state==BLE_LINK_HOST_CONNECTED&&!strcmp(drawn[2],"BT verbunden")&&!strcmp(drawn[3],"Wartet auf Client"));
  ble_nus_evt_t e={.type=BLE_NUS_EVT_COMM_STARTED,.conn_handle=4};nus_data_handler(&e);draw(v);
  CHECK(v->drawn_link_state==BLE_LINK_CONNECTED&&!strcmp(drawn[2],"Dateisitzung aktiv"));
  e.type=BLE_NUS_EVT_COMM_STOPPED;nus_data_handler(&e);draw(v);
  CHECK(v->drawn_link_state==BLE_LINK_DISCONNECTING&&!strcmp(drawn[2],"Trennen..."));
  ble_link_state_observe(NULL);ble_status_view_free(v);
 } else if(!strcmp(test,"ui")||!strcmp(test,"click_race")||!strcmp(test,"lifetime")) {
  app_ble_t *app=mui_mem_malloc(sizeof(*app));memset(app,0,sizeof(*app));active_app=app;
  app->p_ble_view=ble_status_view_create();ble_status_view_t *v=app->p_ble_view;
  strcpy(v->ble_addr,"01:23:45:67:89:AB");ble_status_view_set_event_cb(v,ble_scene_connect_status_view_event_cb);
  ble_link_state_observe(ble_scene_link_state_changed);ble_process_pending();draw(v);
  CHECK(drawn_n==4&&v->drawn_link_state==BLE_LINK_INACTIVE&&!strcmp(drawn[1],"Nicht sichtbar"));
  if(!strcmp(test,"lifetime")) {
   mini_app_inst_t inst={app};app_ble_on_kill(&inst);active_app=NULL;CHECK(!inst.p_handle&&frees==3);
   int old=redraws;event(BLE_GAP_EVT_CONNECTED);ble_process_pending();CHECK(redraws==old);
  } else {
   if(!strcmp(test,"click_race"))event(BLE_GAP_EVT_CONNECTED);
   input(v,INPUT_KEY_CENTER,INPUT_TYPE_SHORT);CHECK(!disconnects&&active_app==app);
   CHECK(ble_link_state_get()==(!strcmp(test,"click_race")?BLE_LINK_CONNECTED:BLE_LINK_ADVERTISING));
   draw(v);CHECK(drawn_n==4&&!strcmp(drawn[1],v->ble_addr));
   input(v,INPUT_KEY_CENTER,INPUT_TYPE_REPEAT);CHECK(!disconnects&&active_app==app);
   input(v,INPUT_KEY_LEFT,INPUT_TYPE_SHORT);CHECK(v->page==1);int old=redraws;
   ble_process_pending();CHECK(redraws==old); /* QR need not repaint on link events. */
   input(v,INPUT_KEY_RIGHT,INPUT_TYPE_SHORT);CHECK(v->page==0);
   if(!strcmp(test,"ui")) {adv(BLE_ADV_EVT_IDLE);draw(v);input(v,INPUT_KEY_CENTER,INPUT_TYPE_LONG);CHECK(!active_app);}
   else {draw(v);input(v,INPUT_KEY_CENTER,INPUT_TYPE_SHORT);CHECK(disconnects==1&&!active_app);}
   ble_link_state_observe(NULL);ble_status_view_free(v);mui_mem_free(app);
  }
 } else return 2;
 CHECK(!critical_depth);puts("PASS");return 0;
}
'''

FONT = r'''
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "u8g2.h"
extern const uint8_t u8g2_font_wqy12_t_gb2312a[];
void u8g2_DrawHVLine(u8g2_t*u,u8g2_uint_t x,u8g2_uint_t y,u8g2_uint_t len,uint8_t d){assert(0);}
uint8_t u8g2_IsIntersection(u8g2_t*u,u8g2_uint_t x,u8g2_uint_t y,u8g2_uint_t x1,u8g2_uint_t y1){assert(0);return 0;}
uint8_t u8x8_DrawTile(u8x8_t*u,uint8_t x,uint8_t y,uint8_t cnt,uint8_t*p){assert(0);return 0;}
int main(void) {
 u8g2_t font={0};u8g2_SetFont(&font,u8g2_font_wqy12_t_gb2312a);
 /* FONT_LABELS */
 for(unsigned i=0;i<sizeof(labels)/sizeof(*labels);i++) {
  unsigned width=u8g2_GetUTF8Width(&font,labels[i]);
  assert(width>0&&offsets[i]+width<=128);
  printf("FONT %s: %u px, x=%u\n",labels[i],width,offsets[i]);
 }
 assert(u8g2_GetGlyphWidth(&font,0xfc)>0); /* German ue must exist, not silently vanish. */
 assert(12-u8g2_GetAscent(&font)>=0&&48-u8g2_GetDescent(&font)<51);
 printf("FONT ascent=%d descent=%d; 128x51 content below 13px status bar\n",u8g2_GetAscent(&font),u8g2_GetDescent(&font));
 puts("PASS");return 0;
}
'''


class StatusTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cc = shlex.split(os.environ.get("CC", "gcc"))
        cls.ble = (BLE / "ble_main.c").read_text(encoding="utf-8")
        cls.view = (VIEW / "ble_status_view.c").read_text(encoding="utf-8")
        cls.scene = (SRC / "app/ble/scene/ble_scene_connect_start.c").read_text(encoding="utf-8")
        cls.kill = function((SRC / "app/ble/app_ble.c").read_text(encoding="utf-8"), "app_ble_on_kill")

    def compile_run(self, modes, *, ble=None, view=None, kill=None, failure=False):
        ble = self.ble if ble is None else ble
        view = self.view if view is None else view
        names = ("ble_file_join_poll", "ble_release_stopped_session", "ble_link_state_get", "ble_link_state_observe", "ble_restart_advertising",
                 "ble_process_pending", "on_adv_evt", "ble_evt_handler", "ble_stop_transport", "ble_disable", "nus_data_handler")
        declarations = []
        for name in ("m_conn_handle", "m_ble_initialized", "m_advertising_active", "m_reported_link_state", "m_link_state_handler", "m_nus_session_handle", "m_release_handle", "m_link_generation", "m_release_attempted", "m_file_mode", "m_sessions_enabled", "m_file_join_pending", "m_file_join_tick", "m_remote_mode", "m_session_generation", "m_timeout_overridden", "m_file_link_handoff"):
            declarations.append(re.search(r"^static[^\n]*\b" + name + r"\b[^\n]*;[^\n]*", ble, re.M)[0])
        source = HARNESS.replace("/* GLOBALS */", "\n".join(declarations))
        source = source.replace("/* ACTUAL_BLE */", "\n".join(function(ble, n) for n in names))
        source = source.replace("/* ACTUAL_SCENE */", "\n".join(function(self.scene, n) for n in
            ("ble_scene_connect_status_view_event_cb", "ble_scene_link_state_changed")))
        source = source.replace("/* ACTUAL_KILL */", self.kill if kill is None else kill)
        source = source.replace("/* STRINGS */", "const char *getLangString(int key) { static const char *strings[]={" +
            ",".join(json.dumps(STRINGS[key]["de_DE"], ensure_ascii=False) for key in KEYS) + "}; return strings[key]; }")
        with tempfile.TemporaryDirectory(prefix="de320-ble-status-") as directory:
            path = Path(directory)
            (path / "i18n").mkdir()
            (path / "mui_include.h").write_text(UI_STUB, encoding="utf-8")
            (path / "ble_main.h").write_bytes((BLE / "ble_main.h").read_bytes())
            (path / "ble_status_view.h").write_bytes((VIEW / "ble_status_view.h").read_bytes())
            (path / "ble_status_view.c").write_text(view, encoding="utf-8")
            (path / "mui_qrcode_helper.h").write_text("void draw_qrcode(mui_canvas_t*,int,int,int,const char*);\n")
            (path / "i18n/language.h").write_text("#pragma once\nenum {" + ",".join(KEYS) + "};\nconst char *getLangString(int);\n")
            (path / "test.c").write_text(source, encoding="utf-8")
            exe = path / ("test.exe" if os.name == "nt" else "test")
            command = self.cc + ["-std=c11", "-O1", "-Wall", "-Wextra", "-Werror", "-Wno-unused-function",
                                 "-Wno-unused-parameter", "-I", str(path), str(path / "test.c"), "-o", str(exe)]
            result = subprocess.run(command, capture_output=True, text=True, timeout=60)
            self.assertEqual(result.returncode, 0, result.stderr)
            for mode in modes:
                result = subprocess.run([str(exe), mode], capture_output=True, text=True, timeout=10)
                self.assertEqual(result.returncode != 0, failure, f"{mode}: {result.stdout} {result.stderr}")

    def test_actual_ble_events_and_view(self):
        self.compile_run(("transitions", "observer_order", "guarded_restart", "failed_restart", "disable",
                          "no_packet_redraw", "ui", "click_race", "lifetime", "session_ui"))

    def test_mutants_are_detected(self):
        wrong = self.ble.replace("m_conn_handle = BLE_CONN_HANDLE_INVALID;\n        /* Do not clear", 
                                 "m_conn_handle = BLE_CONN_HANDLE_INVALID; m_advertising_active=false;\n        /* Do not clear")
        self.assertNotEqual(wrong, self.ble)
        self.compile_run(("observer_order",), ble=wrong, failure=True)
        wrong = self.ble.replace("if (state != m_reported_link_state)", "if (true)")
        self.compile_run(("no_packet_redraw",), ble=wrong, failure=True)
        wrong = self.view.replace("p_ble_status_view->drawn_link_state == BLE_LINK_INACTIVE", "ble_link_state_get() == BLE_LINK_INACTIVE")
        self.compile_run(("click_race",), view=wrong, failure=True)
        wrong = self.kill.replace("    ble_link_state_observe(NULL);", "")
        self.compile_run(("lifetime",), kill=wrong, failure=True)
        wrong = self.ble.replace("    m_advertising.adv_modes_config.ble_adv_on_disconnect_disabled = true;\n    if (m_advertising.p_adv_data)",
                                 "    if (m_advertising.p_adv_data)")
        self.assertNotEqual(wrong, self.ble)
        self.compile_run(("disable",), ble=wrong, failure=True)

    def test_previous_static_view_fails_new_inactive_behavior(self):
        baseline = FW.parents[1] / "allmiibo_de319_20261023/fw/application/src/app/ble/view/ble_status_view.c"
        self.assertTrue(baseline.is_file(), "DE3.19 baseline required")
        self.compile_run(("ui",), view=baseline.read_text(encoding="utf-8"), failure=True)

    def test_exact_font_fits_lcd_and_locales_fallback(self):
        for key in KEYS[1:]:
            self.assertTrue(STRINGS[key]["en_US"] and STRINGS[key]["de_DE"])
        self.assertIn("return string && strlen(string) > 0 ? string : lang_en_US[stringID]",
                      (SRC / "i18n/language.c").read_text(encoding="utf-8"))
        labels, offsets = [], []
        for language in ("en_US", "de_DE"):
            for key in KEYS:
                labels.append(STRINGS[key][language]);offsets.append(14 if key == "_L_APP_BLE_TITLE" else 4)
        labels.append("01:23:45:67:89:AB");offsets.append(12)
        source = FONT.replace("/* FONT_LABELS */", "const char *labels[]={" +
            ",".join(json.dumps(s, ensure_ascii=False) for s in labels) + "};\nconst unsigned offsets[]={" +
            ",".join(map(str, offsets)) + "};")
        with tempfile.TemporaryDirectory(prefix="de320-ble-font-") as directory:
            path = Path(directory);u8g2 = FW / "components/u8g2/csrc"
            (path / "mui_u8g2.h").write_text('#include "u8g2.h"\n')
            (path / "font_data.c").write_bytes((SRC / "mui/u8g2_font_wqy12_t_gb2312a.c").read_bytes())
            (path / "test.c").write_text(source, encoding="utf-8")
            exe = path / ("font.exe" if os.name == "nt" else "font")
            command = self.cc + ["-std=c11", "-O1", "-ffunction-sections", "-fdata-sections", "-Wl,--gc-sections",
                "-I", str(path), "-I", str(u8g2), str(path / "test.c"), str(path / "font_data.c"),
                str(u8g2 / "u8g2_font.c"), str(u8g2 / "u8x8_8x8.c"), str(u8g2 / "u8g2_kerning.c"), "-o", str(exe)]
            result = subprocess.run(command, capture_output=True, text=True, timeout=60)
            self.assertEqual(result.returncode, 0, result.stderr)
            result = subprocess.run([str(exe)], capture_output=True, text=True, encoding="utf-8", timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            print(result.stdout, end="")


if __name__ == "__main__":
    unittest.main()
