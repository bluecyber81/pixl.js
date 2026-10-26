"""Actual scene callbacks: persist to old active slot before reusing app buffers."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
from test_nfc_lifecycle_de3_3 import function

PREFIX = r'''
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include "ntag_def.h"
typedef enum {NTAG_EVENT_TYPE_WRITTEN,NTAG_EVENT_TYPE_READ} ntag_event_type_t;
typedef struct {ntag_t ntag;void *p_amiibo_view,*p_toast_view;} app_amiidb_t;
typedef app_amiidb_t app_amiibolink_t;
typedef struct {bool auto_gen_amiibo;} settings_data_t;
static settings_data_t settings;
static settings_data_t *settings_get_data(void){return &settings;}
static bool amiibo_helper_is_key_loaded(void){return true;}
static unsigned stopped,started,saved_index,saves,emulated,errors,focus=8;
static uint8_t saved_value;
static int m_amiibo_gen_delay_timer=1;
static uint32_t m_generate_generation;
static uint32_t ntag_emu_get_generation(void){return 37;}
static void app_timer_stop(int timer){assert(timer==1);stopped++;}
static void app_timer_start(int timer,int ticks,void*ctx){assert(timer==1&&ticks==1000&&ctx);started++;}
#define APP_TIMER_TICKS(n) (n)
#define VFS_OK 0
#define VFS_ERR_NOOBJ -1
#define DE3_STORAGE_IO_ERROR 1
#define APP_AMIIDB_SLOT_SAVE_FAILED 2
#define _T(x) x
static void *mui(void){return NULL;}
static void mui_update(void*p){(void)p;}
static void mui_toast_view_show(void*p,int text){(void)p;(void)text;errors++;}
static void ntag_emu_save_failed(void){errors++;}
static void amiibo_view_set_focus(void*p,uint8_t v){(void)p;focus=v;}
static void ntag_save_error(app_amiibolink_t*app){(void)app;errors++;}
static uint8_t amiibo_view_get_focus(void*p){(void)p;return (uint8_t)focus;}
'''


def main():
    here = Path(__file__).resolve().parent
    src = here.parents[1] / "application/src"
    cc = shutil.which("gcc")
    if not cc:
        raise RuntimeError("Existing gcc required")
    amiidb = (src / "app/amiidb/scene/amiidb_scene_amiibo_detail.c").read_text(encoding="utf-8")
    link = (src / "app/amiibolink/scene/amiibolink_scene_main.c").read_text(encoding="utf-8")
    suites = {
        "amiidb_slot": PREFIX + r'''
static uint8_t m_active_slot=2;
static bool m_active_slot_persist=true,m_tag_ready=true,dirty=true;
static int read_result;
static app_amiidb_t *active_app;
static ntag_t old_tag;
static int amiidb_api_slot_write(uint8_t slot,ntag_t*tag){saves++;saved_index=slot;saved_value=tag->data[16];return VFS_OK;}
static int amiidb_api_slot_read(uint8_t slot,ntag_t*tag){assert(saves==1&&saved_index==2);memset(tag,0,sizeof(*tag));tag->data[16]=slot;return read_result;}
static void ntag_store_new_rand(ntag_t*tag){memset(tag,0,sizeof(*tag));}
static void amiidb_scene_amiibo_detail_error_msg(app_amiidb_t*app,int text){(void)app;(void)text;errors++;}
static bool ntag_emu_set_tag(const ntag_t*tag) {assert(m_active_slot==8&&m_active_slot_persist&&tag->data[16]==8);emulated++;return true;}
static bool ntag_emu_prepare_change(void);
''' + function(amiidb, "ntag_update_cb") + r'''
static bool ntag_emu_prepare_change(void) {if(dirty){dirty=false;ntag_update_cb(NTAG_EVENT_TYPE_WRITTEN,active_app,&old_tag);}return true;}
''' + function(amiidb, "amiidb_scene_amiibo_data_list_update") + r'''
int main(void){
 app_amiidb_t app={0};active_app=&app;old_tag.data[16]=0x55;
 amiidb_scene_amiibo_data_list_update(&app);
 assert(saves==1&&saved_index==2&&saved_value==0x55&&emulated==1&&app.ntag.data[16]==8&&stopped==1);
 read_result=-9;emulated=0;amiidb_scene_amiibo_data_list_update(&app);
 assert(!m_tag_ready&&errors==1&&emulated==0&&saves==1);
 settings.auto_gen_amiibo=true;ntag_update_cb(NTAG_EVENT_TYPE_READ,&app,&old_tag);
 assert(started==1&&m_generate_generation==37);
 return 0;
}
''',
        "amiibolink_slot": PREFIX + r'''
#define BLE_AMIIBOLINK_MODE_RANDOM 1
#define BLE_AMIIBOLINK_MODE_RANDOM_AUTO_GEN 2
static uint8_t m_active_index=99;
static int m_active_mode=3;
static bool ntag_update(app_amiibolink_t*app,uint8_t index,ntag_t*tag){(void)app;saves++;saved_index=index;saved_value=tag->data[16];return true;}
''' + function(link, "ntag_update_cb") + r'''
int main(void){
 app_amiibolink_t app={0};ntag_t tag={0};tag.data[16]=0x55;
 ntag_update_cb(NTAG_EVENT_TYPE_WRITTEN,&app,&tag);
 assert(saves==1&&saved_index==99&&saved_value==0x55&&stopped==1);
 m_active_mode=BLE_AMIIBOLINK_MODE_RANDOM_AUTO_GEN;
 ntag_update_cb(NTAG_EVENT_TYPE_READ,&app,&tag);assert(started==1&&m_generate_generation==37);
 return 0;
}
''',
    }
    with tempfile.TemporaryDirectory(prefix="pixl-nfc-app-") as tmp:
        for name, code in suites.items():
            c = Path(tmp) / (name + ".c")
            exe = Path(tmp) / (name + (".exe" if os.name == "nt" else ""))
            c.write_text(code, encoding="utf-8")
            cmd = [cc, "-std=c11", "-O1", "-Wall", "-Wextra", "-Werror", "-Wno-unused-function",
                   "-Wno-unused-variable", "-I", str(src / "ntag"), str(c), "-o", str(exe)]
            if os.environ.get("PIXL_SANITIZE") == "1":
                cmd += ["-fsanitize=address,undefined", "-fno-omit-frame-pointer"]
            subprocess.run(cmd, check=True, timeout=60)
            subprocess.run([str(exe)], check=True, timeout=30)
            print("PASS actual scene handoff:", name)


if __name__ == "__main__":
    main()
