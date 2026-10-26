"""Actual manual-UID callback with mocked storage; static coverage of all 13 path joins."""
import re
import unittest
import test_player_v3 as host

SCENES = host.SRC / "app/amiibo/scene"


class PathUidTests(unittest.TestCase):
    compile_run = host.NativeTests.compile_run

    def test_every_affected_path_join_checks_failure(self):
        count = 0
        for filename in ("amiibo_scene_amiibo_detail.c", "amiibo_scene_amiibo_detail_menu.c", "amiibo_scene_file_browser_menu.c"):
            source = (SCENES / filename).read_text(encoding="utf-8")
            calls = list(re.finditer(r"cwalk_append_segment\(", source))
            for call in calls:
                self.assertEqual(source[call.start()-1], "!", filename)
            count += len(calls)
        self.assertEqual(count, 13)

    def test_real_uid_parser_and_save_callback_bounds_paths_and_formats(self):
        source = (SCENES / "amiibo_scene_amiibo_detail_menu.c").read_text(encoding="utf-8")
        parse = host.function(source, "amiibo_scene_parse_uid")
        callback = host.function(source, "amiibo_scene_amiibo_detail_menu_text_input_set_id_event_cb")
        self.compile_run(r'''
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ntag_def.h"
#include "vfs.h"
static int32_t vfs_persist_write(vfs_driver_t*d,const char*p,const void*b,size_t n) {return d->write_file_data(p,(void*)b,n);}
#define NRF_SUCCESS 0
#define MUI_TEXT_INPUT_EVENT_CONFIRMED 1
#define _T(x) #x
#define string_get_cstr(x) (x)
typedef int ret_code_t;
typedef int mui_text_input_event_t;
typedef struct {void *user_data;} mui_text_input_t;
typedef struct {char *current_folder,*current_file;vfs_drive_t current_drive;void *p_toast_view,*p_scene_dispatcher;ntag_t ntag;} app_amiibo_t;
static const char *input="04.12.34.56.78.9a.BC";
static bool path_valid=true;
static int writes,emulations,uid_changes,toasts,write_delta;
static int stat_error,helper_error,allocation_fail,allocations,frees;
static size_t stored_size,last_write;
static const char *mui_text_input_get_input_text(void *v) {(void)v;return input;}
static bool cwalk_append_segment(char *out,const char *a,const char*b) {(void)a;(void)b;strcpy(out,path_valid?"/valid":"");return path_valid;}
static void mui_toast_view_show(void *v,const char *s) {(void)v;(void)s;toasts++;}
static void mui_scene_dispatcher_previous_scene(void *v) {(void)v;}
static void ntag_store_get_uuid(ntag_t *n,uint8_t *u) {memcpy(u,n->data,7);}
static int amiibo_helper_set_amiibo_uuid(ntag_t*n,uint8_t*u) {uid_changes++;memcpy(n->data,u,7);return helper_error;}
static void *mui_mem_malloc(size_t n) {if(allocation_fail)return NULL;allocations++;return malloc(n);}
static void mui_mem_free(void *p) {if(p)frees++;free(p);}
static bool ntag_emu_set_tag(ntag_t*n) {(void)n;emulations++;return true;}
static int stat_fake(const char*p,vfs_obj_t*o) {(void)p;o->size=stored_size;o->type=VFS_TYPE_REG;return stat_error;}
static int write_fake(const char*p,void*d,size_t n) {(void)p;(void)d;last_write=n;writes++;return (int)n+write_delta;}
static vfs_driver_t driver={.stat_file=stat_fake,.write_file_data=write_fake};
vfs_driver_t *vfs_get_driver(vfs_drive_t d) {(void)d;return &driver;}
''' + parse + "\n" + callback + r'''
int main(void) {
 struct {uint8_t left[16];uint8_t uid[7];uint8_t right[16];} output;
 memset(&output,0xa5,sizeof(output));
 assert(amiibo_scene_parse_uid(input,output.uid));
 const uint8_t expected[7]={4,0x12,0x34,0x56,0x78,0x9a,0xbc};assert(memcmp(output.uid,expected,7)==0);
 for(unsigned j=0;j<16;j++)assert(output.left[j]==0xa5 && output.right[j]==0xa5);
 const char *invalid[]={"","04","04.12.34.56.78.9A.BCextra","04:12:34:56:78:9A:BC","+4.12.34.56.78.9A.BC","04.12.34.56.78.9A.ZZ","04.12.34.56.78.9A.B "};
 for(unsigned j=0;j<sizeof(invalid)/sizeof(*invalid);j++) {assert(!amiibo_scene_parse_uid(invalid[j],output.uid));assert(memcmp(output.uid,expected,7)==0);}
 assert(!amiibo_scene_parse_uid(NULL,output.uid) && !amiibo_scene_parse_uid(input,NULL));
 app_amiibo_t app={.current_folder="/",.current_file="tag.bin"};mui_text_input_t view={&app};
 path_valid=false;amiibo_scene_amiibo_detail_menu_text_input_set_id_event_cb(1,&view);
 assert(writes==0 && emulations==0 && uid_changes==0 && toasts==1);
 path_valid=true;const size_t sizes[]={532,540,572,2048};
 for(unsigned i=0;i<4;i++) {
  memset(&app.ntag,0,sizeof(app.ntag));app.ntag.type=_ntag_type(sizes[i]);stored_size=sizes[i];
  writes=emulations=uid_changes=toasts=write_delta=0;
  amiibo_scene_amiibo_detail_menu_text_input_set_id_event_cb(1,&view);
  assert(writes==1 && emulations==1 && uid_changes==1 && last_write==sizes[i]);
  assert(memcmp(app.ntag.data,expected,7)==0 && allocations==frees);
 }
 memset(&app.ntag,0,sizeof(app.ntag));app.ntag.type=NTAG_215;stored_size=572;write_delta=-1;emulations=0;
 ntag_t before=app.ntag;
 amiibo_scene_amiibo_detail_menu_text_input_set_id_event_cb(1,&view);
 assert(emulations==0 && toasts==1 && memcmp(&app.ntag,&before,sizeof(before))==0 && allocations==frees);
 writes=0;write_delta=0;
 amiibo_scene_amiibo_detail_menu_text_input_set_id_event_cb(1,&view);
 assert(writes==1 && emulations==1 && memcmp(app.ntag.data,expected,7)==0 && allocations==frees);
 for(unsigned fail=0;fail<3;fail++) {
  app.ntag=before;writes=emulations=toasts=0;
  stat_error=fail==0?-1:0;allocation_fail=fail==1;helper_error=fail==2?-1:0;
  amiibo_scene_amiibo_detail_menu_text_input_set_id_event_cb(1,&view);
  assert(writes==0 && emulations==0 && toasts==1 && memcmp(&app.ntag,&before,sizeof(before))==0 && allocations==frees);
 }
 puts("PASS: bounded UID parser, rejected paths, exact original lengths, failed saves preserve RAM and allow retry, all temporary copies freed");return 0;
}
''', {"boards.h": ""}, [host.SRC / "ntag", host.SRC / "mod/vfs"])


if __name__ == "__main__":
    unittest.main()
