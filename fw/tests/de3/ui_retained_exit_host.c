
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define CACHEDATASIZE 312
#define MUI_LAYER_FULLSCREEN 0
#define MUI_LAYER_TOAST 1
#define AMIIBO_SCENE_AMIIBO_DETAIL 3
#define AMIIBO_SCENE_FILE_BROWSER 4
typedef struct { unsigned char data[2048]; } ntag_t;
typedef struct {void *p_handle; unsigned char *p_retain_data;} mini_app_inst_t;
typedef struct {bool hibernate_enabled;} mini_app_t;
typedef int vfs_drive_t;
#define VFS_MAX_NAME_LEN 48
/* ACTUAL_AMIIBO_CACHE_DEFINITION */
typedef struct {bool cached_enabled; int current_drive; char current_folder[128],current_file[64]; uint32_t current_focus_index,current_scene_id;} legacy_amiibo_cache_t;
_Static_assert(offsetof(app_amiibo_cache_data_t,browser_magic)==sizeof(legacy_amiibo_cache_t), "legacy cache prefix changed");
_Static_assert(sizeof(app_amiibo_cache_data_t)<=CACHEDATASIZE, "retain buffer too small");
typedef struct {bool cached_enabled;char search_str[16];uint16_t game_id_path[8];uint8_t game_id_index,current_focus_index;uint16_t cur_scroll_offset;uint32_t prev_scene_id,current_scene_id;} app_amiidb_cache_data_t;
typedef struct {int amiibolink_mode;uint8_t cycle_mode_index;} app_amiibolink_retain_data_t;
typedef struct {uint8_t cycle_mode_index;} app_chameleon_retain_data_t;
typedef struct {
 void *p_view_dispatcher,*p_view_dispatcher_toast,*p_list_view,*p_text_input,*p_msg_box,*p_scene_dispatcher;
 void *p_amiibo_detail_view,*p_amiibo_view,*p_toast_view,*p_amiibolink_view,*p_chameleon_view;
 int amiibolink_mode,current_drive;uint16_t game_id_path[8];uint8_t game_id_index,prev_scene_id; bool initialized;
 char current_file[64],current_folder[128],cur_fav_dir[64],search_str[33]; int fav_array,amiibo_files;
 uint32_t current_focus_index;
 char browser_anchor[VFS_MAX_NAME_LEN];uint16_t browser_anchor_icon;int8_t browser_direction;
} app_amiibo_t;
typedef app_amiibo_t app_amiidb_t;
typedef app_amiibo_t app_amiibolink_t;
typedef app_amiibo_t app_chameleon_t;
mini_app_t app_amiibo_info={true},app_amiidb_info={false};
static struct {ntag_t ntag;} cache;
#define cache_get_data() (&cache)
#define string_get_cstr(x) (x)
#define string_clear(x) ((void)(x))
#define string_array_clear(x) ((void)(x))
#define amiidb_fav_array_clear(x) ((void)(x))
static unsigned scene=AMIIBO_SCENE_FILE_BROWSER,freed,exited;
static app_amiibo_t *active_app;
static unsigned nfc_flushes;
static unsigned list_focus_reads;
static bool ntag_emu_prepare_change(void) {
 assert(active_app && !freed && !exited);
 strcpy(active_app->current_file,"renamed.bin");
 nfc_flushes++;
return true;}
static unsigned mui_scene_dispatcher_current_scene(void*p){(void)p;return scene;}
static unsigned mui_list_view_get_focus(void*p){(void)p;list_focus_reads++;return 7;}
static unsigned mui_list_view_get_scroll_offset(void*p){(void)p;return 26;}
static unsigned amiibolink_view_get_index(void*p){(void)p;return 5;}
static unsigned chameleon_view_get_index(void*p){(void)p;return 6;}
/* Chameleon persistence and NFC quiescence belong to prepare_exit, covered by
 * test_chameleon_exit_guard.py. This fixture exercises cleanup/retention only. */
static void mui_view_dispatcher_detach(void*p,int l){(void)p;(void)l;}
static void noop(void*p){(void)p;assert(exited==1 && freed==0);}
static void scene_exit(void*p){(void)p;assert(exited==0 && freed==0);exited++;}
#define mui_view_dispatcher_free noop
#define mui_list_view_free noop
#define mui_text_input_free noop
#define mui_msg_box_free noop
#define mui_scene_dispatcher_free noop
#define mui_scene_dispatcher_exit scene_exit
#define amiibo_detail_view_free noop
#define amiibo_view_free noop
#define amiibolink_view_free noop
#define chameleon_view_free noop
#define mui_toast_view_free noop
static void mui_mem_free(void*p){assert(p);freed++;}

/* ACTUAL_KILL_CALLBACKS */
int main(int argc,char**argv){
 assert(argc==5);
 unsigned which=(unsigned)atoi(argv[1]), retained=(unsigned)atoi(argv[2]); scene=(unsigned)atoi(argv[3]);
 int direction=atoi(argv[4]);assert(direction>=-1 && direction<=1);
 struct {unsigned char before[16],data[312],after[16];} guard;memset(&guard,0xa5,sizeof guard);
 app_amiibo_t app={.amiibolink_mode=3,.current_drive=1,.game_id_index=1,.prev_scene_id=2,.initialized=true};
 strcpy(app.current_file,"known.bin");strcpy(app.current_folder,"/known");
 app.current_focus_index=13;app.browser_direction=direction;app.browser_anchor_icon=0xe1ed;
 strcpy(app.browser_anchor,"0048-previous-page.bin");
 active_app=&app;
 mini_app_inst_t instance={&app,retained?guard.data:NULL};
 if(which==0)app_amiibo_on_kill(&instance);
 else if(which==1)app_amiidb_on_kill(&instance);
 else if(which==2)app_amiibolink_on_kill(&instance);
 else app_chameleon_on_kill(&instance);
 assert(instance.p_handle==NULL && freed==1 && exited==1);
 assert(nfc_flushes==(which==0?1u:0u));
 for(unsigned i=0;i<16;i++)assert(guard.before[i]==0xa5 && guard.after[i]==0xa5);
 if(retained){
  if(which==0 && (scene==3 || scene==4)){
   app_amiibo_cache_data_t*c=(void*)guard.data;
   assert(c->cached_enabled && c->current_focus_index==(scene==3?13u:7u) && strcmp(c->current_file,"renamed.bin")==0);
   assert(c->current_drive==1 && c->current_scene_id==scene && strcmp(c->current_folder,"/known")==0);
   assert(c->browser_magic==APP_AMIIBO_CACHE_PAGE_MAGIC && c->browser_direction==direction && c->browser_anchor_icon==0xe1ed);
   assert(strcmp(c->browser_anchor,"0048-previous-page.bin")==0);
   assert(list_focus_reads==(scene==4?1u:0u));
   for(size_t i=sizeof(*c);i<CACHEDATASIZE;i++)assert(guard.data[i]==0xa5);
   app_amiibo_t restored={0};restored.current_focus_index=c->current_focus_index;
   app_amiibo_restore_browser_cache(&restored,c);
   assert(restored.current_focus_index==c->current_focus_index && restored.browser_direction==direction);
   assert(restored.browser_anchor_icon==c->browser_anchor_icon && strcmp(restored.browser_anchor,c->browser_anchor)==0);
   c->browser_magic=0;restored.current_focus_index=13;
   app_amiibo_restore_browser_cache(&restored,c);
   assert(!restored.current_focus_index && !restored.browser_direction && !restored.browser_anchor[0]);
  }
  if(which==1 || (which==0 && scene==9))for(unsigned i=0;i<312;i++)assert(guard.data[i]==0);
  if(which==2){app_amiibolink_retain_data_t*c=(void*)guard.data;assert(c->amiibolink_mode==3 && c->cycle_mode_index==5);}
  if(which==3){app_chameleon_retain_data_t*c=(void*)guard.data;assert(c->cycle_mode_index==6);}
 }
 puts("complete kill callback reached cleanup; valid retained data and canaries preserved");return 0;
}
