"""Real emulator file callback + write result checks; no radio or real flash."""
from test_nfc_save_retry_de337 import HERE,SRC,run
from test_nfc_lifecycle_de3_3 import function
import re

def main():
 prefix=(HERE/'nfc_lifecycle_host.c').read_text().split('/* ACTUAL_SOURCE */')[0]
 engine=re.sub(r"(?m)^\s*#include[^\n]*\n","",(SRC/'ntag/ntag_emu_v2.c').read_text())
 scene=(SRC/'app/amiibo/scene/amiibo_scene_amiibo_detail.c').read_text()
 stubs=r'''
#define VFS_MAX_PATH_LEN 64
#define VFS_MAX_NAME_LEN 49
#define VFS_TYPE_REG 1
#define VFS_OK 0
#define NRF_ERR_WRITE_ERROR -1002
#define _T(x) #x
#define string_get_cstr(x) (x)
typedef struct {int type;size_t size;} vfs_obj_t;
typedef struct {int32_t(*stat_file)(const char*,vfs_obj_t*);int32_t(*rename_file)(const char*,const char*);} vfs_driver_t;
typedef struct {ntag_t *ntag;char file_name[49];} amiibo_detail_view_t;
typedef struct {ntag_t ntag;amiibo_detail_view_t*p_amiibo_detail_view;int current_drive;char current_file[49],current_folder[64];void*p_toast_view;} app_amiibo_t;
typedef struct {const char *name_en;} db_amiibo_t;
typedef struct {bool auto_gen_amiibo;} settings_data_t;
static settings_data_t settings;
static settings_data_t *settings_get_data(void){return &settings;}
static int m_amiibo_gen_delay_timer;static uint32_t m_generate_generation;
#define APP_TIMER_TICKS(n) (n)
static void app_timer_stop(int t){(void)t;}
static void app_timer_start(int t,int n,void*c){(void)t;(void)n;(void)c;}
static void *mui(void){return NULL;}
static void mui_update(void*p){(void)p;}
static void mui_show_memory_error(void*p){(void)p;assert(false);}
static void mui_toast_view_show(void*p,const char*s){(void)p;(void)s;assert(false);}
static bool path_ok=true;
static bool cwalk_append_segment(char*out,const char*a,const char*b){(void)a;(void)b;strcpy(out,"/tag.bin");return path_ok;}
static bool mui_string_try_set_str(char*a,const char*b){strcpy(a,b);return true;}
static uint32_t to_little_endian_int32(const uint8_t*p){(void)p;return 0;}
static const db_amiibo_t *get_amiibo_by_id(uint32_t a,uint32_t b){(void)a;(void)b;return NULL;}
static bool amiibo_scene_amiibo_detail_reload_files(app_amiibo_t*a){(void)a;return true;}
static int32_t write_error;static uint8_t persisted;static unsigned saves;
static int32_t stat_file(const char*p,vfs_obj_t*o){assert(!strcmp(p,"/tag.bin"));o->type=VFS_TYPE_REG;o->size=540;return 0;}
static vfs_driver_t driver={.stat_file=stat_file};
static vfs_driver_t *vfs_get_driver(int d){(void)d;return &driver;}
static int32_t vfs_persist_recover(vfs_driver_t*d){assert(d==&driver);return 0;}
static int32_t vfs_persist_write(vfs_driver_t*d,const char*p,const void*data,size_t n){
 assert(d==&driver&&!strcmp(p,"/tag.bin")&&n==540);saves++;
 if(write_error){return write_error;}persisted=((uint8_t*)data)[16];return n;
}
'''
 code=prefix+engine+stubs+function(scene,'ntag_write')+function(scene,'ntag_update')+function(scene,'ntag_update_cb')+r'''
int main(void){
 const int errors[]={-28,-5,539};
 app_amiibo_t app={0};amiibo_detail_view_t detail={.ntag=&app.ntag};
 for(unsigned k=0;k<3;k++){
  memset(&ntag_emu,0,sizeof(ntag_emu));memset(&app,0,sizeof(app));
  app.p_amiibo_detail_view=&detail;app.ntag.type=NTAG_215;app.ntag.data[16]=0x11;strcpy(app.current_file,"tag.bin");
  persisted=0x11;write_error=errors[k];saves=0;
  ntag_emu_set_tag(&app.ntag);ntag_emu_set_update_cb(ntag_update_cb,&app);
  const uint8_t write[]={NFC_CMD_WRITE,4,0x55,0x55,0x55,0x55};
  nfc_callback(NULL,HAL_NFC_EVENT_COMMAND,write,sizeof(write));assert(ack==10);
  assert(!ntag_emu_prepare_change());assert(saves==1&&ntag_emu_save_pending()&&ntag_emu.dirty&&persisted==0x11&&app.ntag.data[16]==0x55);
  write_error=0;assert(ntag_emu_retry_save());assert(saves==2&&persisted==0x55&&!ntag_emu_save_pending()&&!ntag_emu.paused);
 }
 path_ok=false;ntag_emu.ntag.data[16]=0x66;ntag_emu.dirty=true;unsigned prior=saves;
 assert(!ntag_emu_prepare_change());assert(saves==prior&&ntag_emu_save_pending()&&ntag_emu.ntag.data[16]==0x66);
 path_ok=true;assert(ntag_emu_retry_save());assert(saves==prior+1&&persisted==0x66);
 puts("PASS real file-save callback: NOSPC, IO, short write, path failure retain RAM; exact retry saves original file");return 0;
}
'''
 run('file persistence handoff',code)
 link=(SRC/'app/amiibolink/scene/amiibolink_scene_main.c').read_text()
 external=link.split('#else',1)[1].split('#endif',1)[0]
 code=prefix+r'''
#define VFS_MAX_PATH_LEN 64
#define VFS_DRIVE_EXT 1
typedef struct {int unused;} app_amiibolink_t;
typedef struct {int32_t(*write_file_data)(const char*,void*,size_t);} vfs_driver_t;
static int32_t result;static unsigned calls;
static int32_t store(const char*p,void*d,size_t n){assert(!strcmp(p,"/amiibolink/05.bin")&&d&&n==540);calls++;return result;}
static vfs_driver_t driver={store};static vfs_driver_t*vfs_get_driver(int d){assert(d==1);return &driver;}
'''+function(external,'ntag_update')+r'''
int main(void){app_amiibolink_t app={0};ntag_t tag={0};const int results[]={-28,-5,0,539,540,541};
 for(unsigned i=0;i<6;i++){result=results[i];assert(ntag_update(&app,5,&tag)==(result==540));}assert(calls==6);
 puts("PASS AmiiboLink exact save-result contract: only 540 is success");return 0;}
'''
 run('AmiiboLink exact persistence result',code)

if __name__=='__main__':main()
