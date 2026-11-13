"""Actual detail reload/error/back functions with a missing retained file.

The VFS, translation/message rendering, allocation-free path concatenation and
NFC activation boundaries are synthetic. No device, RF or hardware wake claim.
"""
from root_host import HostTests, SRC, function
import unittest


class AmiiboResumeMissingFileTests(HostTests):
    def test_missing_file_error_returns_to_browser_and_veto_preserves_state(self):
        source = (SRC / "app/amiibo/scene/amiibo_scene_amiibo_detail.c").read_text()
        actual = "\n".join(function(source, name) for name in [
            "amiibo_scene_amiibo_detail_msg_box_error_cb", "amiibo_scene_amiibo_detail_reload_error",
            "ntag_read", "amiibo_scene_amiibo_detail_reload_ntag"])
        self.compile_run(r'''
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>
#define VFS_MAX_PATH_LEN 64
#define VFS_MAX_NAME_LEN 48
#define VFS_OK 0
#define NRF_SUCCESS 0
#define NRF_ERR_NOT_AMIIBO -1000
#define NRF_ERR_READ_ERROR -1001
#define NRF_ERR_WRITE_ERROR -1002
#define VFS_ERR_NOSPC -28
#define VFS_ERR_CRPT -84
#define VFS_ERR_MAXNM -36
#define VFS_ERR_NODEV -19
#define VFS_ERR_FAIL -5
#define VFS_TYPE_REG 0
#define VFS_OBJ_FLAG_READONLY 1
#define NRF_LOG_INFO(...) ((void)0)
#define string_get_cstr(s) (s)
#define string_set_str(a,b) strcpy(a,b)
enum {AMIIBO_SCENE_FILE_BROWSER=0,AMIIBO_VIEW_ID_MSG_BOX=3};
enum {_L_NOT_AMIIBO_FILE=1,_L_APP_AMIIDB_SLOT_SAVE_FAILED,_L_READ_FILE_FAILED,_L_DE3_STORAGE_FULL,_L_DE3_STORAGE_CORRUPT,_L_DE3_PATH_TOO_LONG,_L_DE3_STORAGE_UNAVAILABLE,_L_DE3_STORAGE_IO_ERROR,_L_ERR,_L_BACK};
typedef unsigned ntag_type_t;
typedef struct {char notes[32];bool read_only;ntag_type_t type;uint8_t data[572];} ntag_t;
typedef struct {bool has_notes,has_flags;char notes[32];uint8_t flags;} vfs_meta_t;
typedef struct {unsigned type,size;char meta[128];} vfs_obj_t;
typedef struct {int(*stat_file)(const char*,vfs_obj_t*);int(*read_file_data)(const char*,void*,size_t);} vfs_driver_t;
typedef int mui_msg_box_event_t;
typedef struct mui_msg_box_s mui_msg_box_t;
struct mui_msg_box_s {void *user_data;void(*callback)(mui_msg_box_event_t,mui_msg_box_t*);};
typedef struct {ntag_t *ntag;char file_name[48];} amiibo_detail_view_t;
typedef struct {
 char current_folder[64],current_file[48];int current_drive;ntag_t ntag;
 amiibo_detail_view_t *p_amiibo_detail_view;mui_msg_box_t *p_msg_box;
 void *p_scene_dispatcher,*p_view_dispatcher;
} app_amiibo_t;
static bool allow=true,path_ok=true,missing=true;static unsigned stats,reads,rf_sets,errors,scene=2,view=1;
static char message[160];
static const char *getLangString(unsigned id){return id==_L_READ_FILE_FAILED?"Read failed":id==_L_BACK?"Back":"Error";}
static void mui_msg_box_set_header(mui_msg_box_t*m,const char*s){(void)m;(void)s;}
static void mui_msg_box_set_message(mui_msg_box_t*m,const char*s){(void)m;strcpy(message,s);errors++;}
static void mui_msg_box_set_btn_text(mui_msg_box_t*m,const char*l,const char*c,const char*r){(void)m;assert(!l&&!r&&!strcmp(c,"Back"));}
static void mui_msg_box_set_btn_focus(mui_msg_box_t*m,unsigned f){(void)m;assert(f==1);}
static void mui_msg_box_set_event_cb(mui_msg_box_t*m,void(*cb)(mui_msg_box_event_t,mui_msg_box_t*)){m->callback=cb;}
static void mui_scene_dispatcher_next_scene(void*d,unsigned id){(void)d;scene=id;}
static void mui_view_dispatcher_switch_to_view(void*d,unsigned id){(void)d;view=id;}
static bool ntag_emu_prepare_change(void){return allow;}
static bool cwalk_append_segment(char*out,const char*folder,const char*file){int n=snprintf(out,64,"%s/%s",folder,file);return path_ok&&n>=0&&n<64;}
static bool mui_string_try_set_str(char*out,const char*text){strcpy(out,text);return true;}
static void *mui(void){return NULL;}
static void mui_show_memory_error(void*m){(void)m;assert(false);}
static bool is_valid_amiibo_ntag_by_size(unsigned n){return n==540;}
static ntag_type_t _ntag_type(unsigned n){assert(n==540);return 2;}
static void vfs_meta_decode(const uint8_t*raw,size_t n,vfs_meta_t*m){(void)raw;(void)n;memset(m,0,sizeof(*m));}
static int vfs_persist_recover(vfs_driver_t*d){(void)d;return VFS_OK;}
static int stat_file(const char*p,vfs_obj_t*o){assert(!strcmp(p,"/games/Mario.bin"));stats++;if(missing)return -2;memset(o,0,sizeof(*o));o->size=540;return 0;}
static int read_file(const char*p,void*out,size_t n){assert(!strcmp(p,"/games/Mario.bin")&&n==540);reads++;memset(out,0x33,n);return n;}
static vfs_driver_t driver={stat_file,read_file};
static vfs_driver_t *vfs_get_driver(int drive){assert(drive==1);return &driver;}
static void amiibo_detail_view_set_ntag(amiibo_detail_view_t*v,ntag_t*n){v->ntag=n;}
static void ntag_emu_set_tag(ntag_t*n){assert(n->data[0]==0x33);rf_sets++;}
''' + actual + r'''
int main(void){
 app_amiibo_t app={.current_drive=1};amiibo_detail_view_t detail={0};mui_msg_box_t box={.user_data=&app};
 app.p_amiibo_detail_view=&detail;app.p_msg_box=&box;strcpy(app.current_folder,"/games");strcpy(app.current_file,"Mario.bin");
 memset(&app.ntag,0xa5,sizeof(app.ntag));ntag_t old_tag=app.ntag;
 allow=false;assert(!amiibo_scene_amiibo_detail_reload_ntag(&app,app.current_file));
 assert(!stats&&!reads&&!rf_sets&&!errors&&scene==2&&view==1&&!strcmp(app.current_file,"Mario.bin")&&!memcmp(&old_tag,&app.ntag,sizeof(old_tag)));
 allow=true;assert(!amiibo_scene_amiibo_detail_reload_ntag(&app,app.current_file));
 assert(stats==1&&!reads&&!rf_sets&&errors==1&&view==AMIIBO_VIEW_ID_MSG_BOX&&scene==2&&!app.current_file[0]);
 assert(!strcmp(app.current_folder,"/games")&&strstr(message,"Mario.bin")&&strstr(message,"Read failed")&&box.callback);
 box.callback(0,&box);assert(scene==AMIIBO_SCENE_FILE_BROWSER);
 strcpy(app.current_file,"Mario.bin");missing=false;
 assert(amiibo_scene_amiibo_detail_reload_ntag(&app,app.current_file));
 assert(stats==2&&reads==1&&rf_sets==1&&errors==1&&detail.ntag==&app.ntag&&!strcmp(detail.file_name,"Mario.bin"));
 puts("PASS retained file removed: error with Back to same-folder browser; save veto preserves state; later reselect succeeds");
 return 0;
}
''')


if __name__ == "__main__":
    unittest.main()
