
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define CACHEDATASIZE 312
#define MUI_LAYER_FULLSCREEN 0
#define MUI_LAYER_TOAST 1
#define AMIIBO_SCENE_AMIIBO_DETAIL 3
#define AMIIBO_SCENE_FILE_BROWSER 4
#define TAG_SENSE_HF 1
#define INVALID_SLOT_INDEX 255
typedef struct { unsigned char data[2048]; } ntag_t;
typedef struct {void *p_handle; unsigned char *p_retain_data;} mini_app_inst_t;
typedef struct {bool hibernate_enabled;} mini_app_t;
typedef struct {bool cached_enabled; int current_drive; char current_folder[128],current_file[64]; uint32_t current_focus_index,current_scene_id;} app_amiibo_cache_data_t;
typedef struct {bool cached_enabled;char search_str[16];uint16_t game_id_path[8];uint8_t game_id_index,current_focus_index;uint16_t cur_scroll_offset;uint32_t prev_scene_id,current_scene_id;} app_amiidb_cache_data_t;
typedef struct {int amiibolink_mode;uint8_t cycle_mode_index;} app_amiibolink_retain_data_t;
typedef struct {uint8_t cycle_mode_index;} app_chameleon_retain_data_t;
typedef struct {
 void *p_view_dispatcher,*p_view_dispatcher_toast,*p_list_view,*p_text_input,*p_msg_box,*p_scene_dispatcher;
 void *p_amiibo_detail_view,*p_amiibo_view,*p_toast_view,*p_amiibolink_view,*p_chameleon_view;
 int amiibolink_mode,current_drive;uint16_t game_id_path[8];uint8_t game_id_index,prev_scene_id; bool initialized;
 char current_file[64],current_folder[128],cur_fav_dir[64],search_str[33]; int fav_array,amiibo_files;
} app_amiibo_t;
typedef app_amiibo_t app_amiidb_t;
typedef app_amiibo_t app_amiibolink_t;
typedef app_amiibo_t app_chameleon_t;
mini_app_t app_amiibo_info={true},app_amiidb_info={false};
static struct {ntag_t ntag;} cache;
#define cache_get_data() (&cache)
typedef struct {uint8_t chameleon_default_slot_index;} settings_data_t;
static settings_data_t mock_settings={255};
#define settings_get_data() (&mock_settings)
#define string_get_cstr(x) (x)
#define string_clear(x) ((void)(x))
#define string_array_clear(x) ((void)(x))
#define amiidb_fav_array_clear(x) ((void)(x))
static unsigned scene=AMIIBO_SCENE_FILE_BROWSER,freed,exited;
static app_amiibo_t *active_app;
static unsigned nfc_flushes;
static void ntag_emu_prepare_change(void) {
 assert(active_app && !freed && !exited);
 strcpy(active_app->current_file,"renamed.bin");
 nfc_flushes++;
}
static unsigned mui_scene_dispatcher_current_scene(void*p){(void)p;return scene;}
static unsigned mui_list_view_get_focus(void*p){(void)p;return 7;}
static unsigned mui_list_view_get_scroll_offset(void*p){(void)p;return 26;}
static unsigned amiibolink_view_get_index(void*p){(void)p;return 5;}
static unsigned chameleon_view_get_index(void*p){(void)p;return 6;}
static bool tag_helper_valid_default_slot(void){return false;}
static bool tag_emulation_slot_is_enabled(unsigned i,int s){(void)i;(void)s;return false;}
static void tag_emulation_change_slot(unsigned i,bool s){(void)i;(void)s;}
static void tag_emulation_save(void){}
static void settings_save(void){}
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
 unsigned which=(unsigned)atoi(argv[1]), retained=(unsigned)atoi(argv[2]); scene=(unsigned)atoi(argv[3]);
 struct {unsigned char before[16],data[312],after[16];} guard;memset(&guard,0xa5,sizeof guard);
 app_amiibo_t app={.amiibolink_mode=3,.current_drive=1,.game_id_index=1,.prev_scene_id=2,.initialized=true};
 strcpy(app.current_file,"known.bin");strcpy(app.current_folder,"/known");
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
  if(which==0 && (scene==3 || scene==4)){app_amiibo_cache_data_t*c=(void*)guard.data;assert(c->cached_enabled && c->current_focus_index==7 && strcmp(c->current_file,"renamed.bin")==0);}
  if(which==1 || (which==0 && scene==9))for(unsigned i=0;i<312;i++)assert(guard.data[i]==0);
  if(which==2){app_amiibolink_retain_data_t*c=(void*)guard.data;assert(c->amiibolink_mode==3 && c->cycle_mode_index==5);}
  if(which==3){app_chameleon_retain_data_t*c=(void*)guard.data;assert(c->cycle_mode_index==6);}
 }
 puts("complete kill callback reached cleanup; valid retained data and canaries preserved");return 0;
}
