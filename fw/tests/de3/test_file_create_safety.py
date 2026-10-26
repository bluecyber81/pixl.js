"""Actual device-menu callbacks: creation collisions, batch preflight and errors.

Storage and UI are host stubs. --baseline-root proves the old callbacks fail
the same preservation checks. No device, keys or tag dumps are used.
"""
import argparse
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile

FW = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(FW / "tests/de2"))
from test_player_v3 import function

CALLBACKS = (
    "amiibo_scene_file_browser_text_input_create_folder_event_cb",
    "amiibo_scene_file_browser_text_input_create_amiibo_event_cb",
    "amiibo_scene_file_browser_text_input_create_amiibo_batch_event_cb",
    "amiibo_scene_file_browser_menu_msg_box_remove_folder_event_cb",
)
HELPERS = (
    "amiibo_scene_file_browser_show_error",
    "amiibo_scene_file_browser_new_path",
    "amiibo_scene_file_browser_batch_count",
)

HARNESS = r'''
#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include "vfs.h"
#include "ntag_def.h"
#define CHECK(x) do { if(!(x)){fprintf(stderr,"CHECK line %d: %s\n",__LINE__,#x);exit(71);} } while(0)
#define MUI_TEXT_INPUT_EVENT_CONFIRMED 1
#define MUI_MSG_BOX_EVENT_SELECT_LEFT 1
#define AMIIBO_SCENE_FILE_BROWSER 2
#define AMIIBO_VIEW_ID_MSG_BOX 3
#define AMIIBO_VIEW_ID_LIST 4
#define AMIIBO_MAX_AMIIBO_IN_BATCH 50
#define string_get_cstr(x) (x)
#define _T(x) #x
#define _L_BACK 1
#define _L_ERR 2
#define getLangString(x) "message"
typedef int mui_text_input_event_t;
typedef int mui_msg_box_event_t;
typedef struct {void *user_data;} mui_text_input_t;
typedef struct {void *user_data;} mui_msg_box_t;
typedef struct {char *current_folder,*current_file;vfs_drive_t current_drive;
 void *p_msg_box,*p_view_dispatcher,*p_scene_dispatcher;} app_amiibo_t;
static const char *input;
static int writes,errors,navigations,stats,recoveries,create_calls,remove_calls;
static int create_result,remove_result,stat_result,recovery_result,write_fail_at;
static int existing_index,error_index,restore_existing,driver_missing,object_type;
static bool existing;
static uint8_t stored[540];
static char last_error[96];
static int alloc_calls,free_calls,fail_alloc,mutate_folder;
static void *live_tag;
static app_amiibo_t *active_app;
void *mui_mem_malloc(size_t n){
 alloc_calls++;CHECK(n==sizeof(ntag_t) && !live_tag);
 if(fail_alloc)return NULL;
 live_tag=malloc(n);CHECK(live_tag);memset(live_tag,0xcc,n);return live_tag;
}
void mui_mem_free(void *p){CHECK(p && p==live_tag);free_calls++;free(p);live_tag=NULL;}
static const char *mui_text_input_get_input_text(void*v){(void)v;return input;}
static int32_t stat_fake(const char*p,vfs_obj_t*o){
 stats++;o->type=object_type;o->size=540;
 int index=0;const char *base=strrchr(p,'/');
 if(base)sscanf(base+1,"new_%d.bin",&index);
 if(stat_result && (!error_index || index==error_index))return stat_result;
 return existing || (index && index==existing_index) ? VFS_OK : VFS_ERR_NOOBJ;
}
static int32_t create_fake(const char*p){(void)p;create_calls++;return create_result;}
static int32_t remove_fake(const char*p){(void)p;remove_calls++;return remove_result;}
static vfs_driver_t driver={.stat_file=stat_fake,.create_dir=create_fake,
 .remove_file=remove_fake,.remove_dir=remove_fake};
vfs_driver_t *vfs_get_driver(vfs_drive_t d){(void)d;return driver_missing?NULL:&driver;}
int32_t vfs_persist_recover(vfs_driver_t*d){
 recoveries++;if(!d)return VFS_ERR_NODEV;
 if(restore_existing)existing=true;
 return recovery_result;
}
static int32_t vfs_persist_write(vfs_driver_t*d,const char*p,const void*b,size_t n){
 (void)d;(void)p;writes++;
 if(writes==write_fail_at)return VFS_ERR_NOSPC;
 CHECK(n==sizeof(stored));memcpy(stored,b,n);return (int32_t)n;
}
static void ntag_store_new_rand(ntag_t*n){memset(n,0,sizeof(*n));memset(n->data,0x42,NTAG_DATA_SIZE);n->type=NTAG_215;}
static void amiibo_scene_file_browser_show_messege(app_amiibo_t*a,const char*m){
 (void)a;errors++;snprintf(last_error,sizeof(last_error),"%s",m);
}
static void mui_scene_dispatcher_previous_scene(void*p){(void)p;navigations++;}
static void mui_scene_dispatcher_next_scene(void*p,int n){(void)p;(void)n;navigations++;}
static void mui_msg_box_set_header(void*a,const char*b){(void)a;(void)b;}
static void mui_msg_box_set_message(void*a,const char*b){(void)a;(void)b;}
static void mui_msg_box_set_btn_text(void*a,const char*b,const char*c,const char*d){(void)a;(void)b;(void)c;(void)d;}
static void mui_msg_box_set_btn_focus(void*a,int b){(void)a;(void)b;}
static void mui_view_dispatcher_switch_to_view(void*a,int b){(void)a;(void)b;}
static void *mui(void){return NULL;}
static void mui_update_now(void*a){(void)a;if(mutate_folder)active_app->current_folder="/123456789012345678901234567890123456789012345678901234567890";}
/* ACTUAL_CALLBACKS */
static void reset(void){
 CHECK(live_tag==NULL);alloc_calls=free_calls=fail_alloc=mutate_folder=0;
 writes=errors=navigations=stats=recoveries=create_calls=remove_calls=0;
 create_result=remove_result=stat_result=recovery_result=write_fail_at=0;
 existing_index=error_index=restore_existing=driver_missing=0;
 object_type=VFS_TYPE_REG;existing=false;last_error[0]=0;memset(stored,0xa5,sizeof(stored));
}
int main(int argc,char **argv){
 CHECK(argc==2);int scenario=atoi(argv[1]);reset();
 static app_amiibo_t a={.current_folder="/",.current_file="existing.bin"};
 active_app=&a;
 mui_text_input_t t={&a};mui_msg_box_t b={&a};input="existing.bin";
 switch(scenario){
 case 0: case 1: case 2: case 7: case 8: case 14: case 17:
  existing=scenario==0;stat_result=scenario==1?VFS_ERR_CRPT:0;
  recovery_result=scenario==7?VFS_ERR_CRPT:0;restore_existing=scenario==8;
  write_fail_at=scenario==14?1:0;driver_missing=scenario==17;
  amiibo_scene_file_browser_text_input_create_amiibo_event_cb(1,&t);
  if(scenario==2){CHECK(writes==1 && navigations==1 && errors==0 && stored[0]==0x42);}
  else {CHECK(writes==(scenario==14?1:0) && navigations==0 && errors==1 && stored[0]==0xa5);}
  if(scenario==0 || scenario==1 || scenario==8)CHECK(stats==1);
  if(scenario==7 || scenario==17)CHECK(stats==0);
  break;
 case 3: case 5: case 6: case 15:
  input=scenario==5?"50":"3";existing_index=scenario==3?3:0;
  if(scenario==6){stat_result=VFS_ERR_CRPT;error_index=3;}
  write_fail_at=scenario==15?2:0;
  amiibo_scene_file_browser_text_input_create_amiibo_batch_event_cb(1,&t);
  if(scenario==5)CHECK(writes==50 && stats==50 && navigations==1 && !errors);
  else if(scenario==15)CHECK(writes==2 && stats==3 && !navigations && errors==1);
  else CHECK(!writes && stats==3 && errors==1 && !navigations && stored[0]==0xa5);
  CHECK(recoveries==1);break;
 case 4: {
  const char *bad[]={"0","2junk","-1","+2","2 "," 2","51","4294967296","9999999999999999999999"};
  for(unsigned i=0;i<sizeof(bad)/sizeof(*bad);i++){
   reset();input=bad[i];amiibo_scene_file_browser_text_input_create_amiibo_batch_event_cb(1,&t);
   CHECK(!writes && !stats && !recoveries && errors==1 && !navigations);
  }break;
 }
 case 9:
  input="folder";create_result=VFS_ERR_NOSPC;
  amiibo_scene_file_browser_text_input_create_folder_event_cb(1,&t);
  CHECK(create_calls==1 && errors==1 && !navigations && strstr(last_error,"-91"));break;
 case 10: case 11: case 18:
  existing=true;remove_result=VFS_ERR_FAIL;object_type=scenario==11?VFS_TYPE_DIR:VFS_TYPE_REG;
  if(scenario==18)stat_result=VFS_ERR_CRPT;
  amiibo_scene_file_browser_menu_msg_box_remove_folder_event_cb(1,&b);
  CHECK(errors==1 && !navigations && remove_calls==(scenario==18?0:1));break;
 case 12:
  input="folder";amiibo_scene_file_browser_text_input_create_folder_event_cb(1,&t);
  CHECK(create_calls==1 && navigations==1 && !errors);
  reset();existing=true;amiibo_scene_file_browser_menu_msg_box_remove_folder_event_cb(1,&b);
  CHECK(remove_calls==1 && navigations==1 && !errors);
  reset();input="";amiibo_scene_file_browser_text_input_create_amiibo_batch_event_cb(1,&t);
  CHECK(!writes && !stats && navigations==1 && !errors);
  reset();amiibo_scene_file_browser_menu_msg_box_remove_folder_event_cb(0,&b);
  CHECK(!remove_calls && !stats && !errors);break;
 case 13:
  a.current_folder="/123456789012345678901234567890123456789012345678901234567890";
  amiibo_scene_file_browser_text_input_create_amiibo_event_cb(1,&t);
  CHECK(!writes && !stats && !recoveries && errors==1);break;
 case 16:
  amiibo_scene_file_browser_text_input_create_folder_event_cb(0,&t);
  amiibo_scene_file_browser_text_input_create_amiibo_event_cb(0,&t);
  amiibo_scene_file_browser_text_input_create_amiibo_batch_event_cb(0,&t);
  CHECK(!writes && !stats && !recoveries && !errors && !navigations && !create_calls);break;
 case 19:
  input="0002";amiibo_scene_file_browser_text_input_create_amiibo_batch_event_cb(1,&t);
  CHECK(writes==2 && stats==2 && navigations==1 && !errors);break;
 case 20: case 21:
  fail_alloc=1;input=scenario==20?"new.bin":"50";
  if(scenario==20)amiibo_scene_file_browser_text_input_create_amiibo_event_cb(1,&t);
  else amiibo_scene_file_browser_text_input_create_amiibo_batch_event_cb(1,&t);
  CHECK(alloc_calls==1 && free_calls==0 && !writes && !navigations && errors==1 && stored[0]==0xa5);
  CHECK(stats==(scenario==20?1:50) && recoveries==1);break;
 case 22:
  input="3";mutate_folder=1;
  amiibo_scene_file_browser_text_input_create_amiibo_batch_event_cb(1,&t);
  CHECK(alloc_calls==1 && free_calls==1 && !writes && !navigations && errors==1);break;
 case 23:
  input="";amiibo_scene_file_browser_text_input_create_amiibo_event_cb(1,&t);
  CHECK(!alloc_calls && !free_calls && !writes && !stats && !recoveries && !errors && navigations==1);break;
 default: return 2;
 }
 CHECK(live_tag==NULL);
 if(scenario==2 || scenario==5 || scenario==14 || scenario==15 || scenario==19)
  CHECK(alloc_calls==1 && free_calls==1);
 printf("PASS device create/error scenario %d\n",scenario);return 0;
}
'''


def build_and_run(root, baseline=False):
    source = (root / "application/src/app/amiibo/scene/amiibo_scene_file_browser_menu.c").read_text(encoding="utf-8")
    cwalk = (root / "application/src/mod/cwalk2.c").read_text(encoding="utf-8")
    pieces = [function(cwalk, name) for name in ("bounded_path_length", "cwalk_append_segment")]
    pieces += [function(source, name) for name in HELPERS if name + "(" in source]
    pieces += [function(source, name) for name in CALLBACKS]
    with tempfile.TemporaryDirectory(prefix="pixl-create-menu-") as td:
        folder = Path(td)
        (folder / "boards.h").write_text("")
        cfile = folder / "test.c"
        cfile.write_text(HARNESS.replace("/* ACTUAL_CALLBACKS */", "\n".join(pieces)), encoding="utf-8")
        binary = folder / ("test.exe" if os.name == "nt" else "test")
        command = shlex.split(os.environ.get("CC", "gcc")) + [
            "-std=c11", "-O1", "-Wall", "-Wextra", "-Werror", "-Wno-format-extra-args",
            "-I", str(folder), "-I", str(root / "application/src/mod/vfs"),
            "-I", str(root / "application/src/ntag"), str(cfile), "-o", str(binary)]
        subprocess.run(command, check=True, timeout=60)
        for case in ([0, 3, 4, 9, 10] if baseline else range(24)):
            run = subprocess.run([str(binary), str(case)], capture_output=True, text=True, timeout=15)
            if baseline:
                assert run.returncode == 71 and "CHECK" in run.stderr, (case, run.stdout, run.stderr)
                print(f"PASS old callbacks fail preservation/error assertion: scenario {case}")
            else:
                assert run.returncode == 0, (case, run.stdout, run.stderr)
                print(run.stdout.strip())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-root", type=Path)
    args = parser.parse_args()
    build_and_run(FW)
    if args.baseline_root:
        build_and_run(args.baseline_root.resolve(), baseline=True)
