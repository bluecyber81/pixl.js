"""Run the actual Chameleon file functions against mocked VFS/UI APIs."""
from pathlib import Path
import json
import os
import shutil
import subprocess
import tempfile

FW = Path(__file__).resolve().parents[2]
base = FW / 'application/src/app/chameleon/scene'
def function(filename, marker):
    text = (base / filename).read_text(encoding='utf-8')
    start = text.index(marker)
    opening = text.index('{', start)
    depth = 1
    end = opening + 1
    while depth:
        depth += (text[end] == '{') - (text[end] == '}')
        end += 1
    return text[start:end]

menu_source = (base / 'chameleon_scene_menu_card_data_file_load.c').read_text(encoding='utf-8')
menu_enum = menu_source[menu_source.index('typedef enum {'):menu_source.index('} chameleon_menu_item_t;') + len('} chameleon_menu_item_t;')]

functions = menu_enum + '\n' + '\n'.join([
    function('chameleon_scene_menu_card_data_file_load.c', 'static void chameleon_browser_cache_free('),
    function('chameleon_scene_menu_card_data_file_load.c', 'static int chameleon_scene_menu_card_data_list_item_cmp('),
    function('chameleon_scene_menu_card_data_file_load.c', 'static void chameleon_scene_menu_card_data_file_load_from_file('),
    function('chameleon_scene_menu_card_data_file_load.c', 'bool update_current_directory('),
    function('chameleon_scene_menu_card_data_file_save.c', 'static void chameleon_scene_menu_card_data_file_save_text_input_event_cb('),
    function('../port/fds_utils.c', 'bool fds_read_sync('),
    function('../port/fds_utils.c', 'bool fds_write_sync('),
])
prefix = r'''
#include <assert.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#define VFS_MAX_PATH_LEN 64
#define VFS_TYPE_REG 0
#define CHELEMEON_DUMP_FOLDER "/chameleon/dump"
#define _T(x) #x
#define NRF_LOG_INFO(...) ((void)0)
#define MUI_TEXT_INPUT_EVENT_CONFIRMED 1
#define ICON_BACK 99
#define ICON_HOME 1
#define string_cmp strcmp
#define FDS_EMULATION_CONFIG_FILE_ID 999
#define TAG_SLOT_CONFIG_SIZE(n) (n)
typedef struct {uint16_t icon;const char *text;void *user_data;} mui_list_item_t;
typedef struct {uint8_t chameleon_slot_num;} settings_data_t;
static settings_data_t settings={8};
static settings_data_t *settings_get_data(void) {return &settings;}
static void fds_map_file_name(uint16_t id,uint16_t key,char *p) {(void)id;(void)key;strcpy(p,"/slot.bin");}
typedef int mui_text_input_event_t;
typedef struct {void *user_data;} mui_text_input_t;
typedef struct {void *p_toast_view; void *p_scene_dispatcher; void *browser_cache;} app_chameleon_t;
typedef struct {int type; size_t size;} vfs_obj_t;
typedef struct {
    bool (*mounted)(void);
    int32_t (*stat_file)(const char *, vfs_obj_t *);
    int32_t (*read_file_data)(const char *,void *,size_t);
    int32_t (*write_file_data)(const char *,void *,size_t);
} vfs_driver_t;
static char current_dir[VFS_MAX_PATH_LEN];
static unsigned char active[64];
static int result, allocations, writes, collision_updates, backs;
static bool alloc_fail, absent, mounted_flag;
static const char *last_toast, *input;
static bool mounted(void) {return mounted_flag;}
static int32_t stat_mock(const char *p,vfs_obj_t *o) {(void)p;o->type=0;o->size=64;return 0;}
static int32_t read_mock(const char *p,void *b,size_t n) {(void)p;memset(b,0x22,n);return result;}
static int32_t write_mock(const char *p,void *b,size_t n) {(void)p;(void)b;(void)n;writes++;return result;}
static vfs_driver_t driver={mounted,stat_mock,read_mock,write_mock};
static vfs_driver_t *vfs_get_default_driver(void) {return absent?NULL:&driver;}
static uint8_t *tag_helper_get_active_tag_memory_data(void) {return active;}
static size_t tag_helper_get_active_tag_data_size(void) {return sizeof(active);}
static void *mui_mem_malloc(size_t n) {if(alloc_fail)return NULL;allocations++;return malloc(n);}
static void mui_mem_free(void *p) {if(p)allocations--;free(p);}
static void mui_toast_view_show(void *v,const char *s) {(void)v;last_toast=s;}
static void tag_helper_load_coll_res_from_block0(void) {collision_updates++;}
static int tag_helper_set_nickname(const char *s) {(void)s;return 0;}
static void mui_scene_dispatcher_back_scene(void *p,int n) {(void)p;(void)n;backs++;}
static void mui_scene_dispatcher_previous_scene(void *p) {(void)p;backs++;}
static const char *mui_text_input_get_input_text(void *p) {(void)p;return input;}
static void reset(void) {
    memset(active,0x11,sizeof(active));current_dir[0]=0;result=64;allocations=0;
    writes=0;collision_updates=0;backs=0;alloc_fail=false;absent=false;mounted_flag=true;
    last_toast="";input="card.bin";
}
'''
tests = r'''
int main(void) {
    app_chameleon_t app={0}; mui_text_input_t text={&app};
    for(int n=-1;n<64;n++) {
        reset();result=n;
        chameleon_scene_menu_card_data_file_load_from_file(&app,"card.bin");
        for(size_t i=0;i<64;i++)assert(active[i]==0x11);
        assert(allocations==0 && collision_updates==0 && backs==0);
    }
    reset(); chameleon_scene_menu_card_data_file_load_from_file(&app,"card.bin");
    for(size_t i=0;i<64;i++)assert(active[i]==0x22);
    assert(allocations==0 && collision_updates==1 && backs==1);
    puts("PASS full read commits; 65 short/error read cases preserve active card");
    reset();alloc_fail=true;chameleon_scene_menu_card_data_file_load_from_file(&app,"card.bin");
    assert(active[0]==0x11 && collision_updates==0);
    reset();absent=true;chameleon_scene_menu_card_data_file_load_from_file(&app,"card.bin");
    assert(active[0]==0x11);
    reset();mounted_flag=false;chameleon_scene_menu_card_data_file_load_from_file(&app,"card.bin");
    assert(active[0]==0x11);
    puts("PASS allocation and unavailable-storage failures preserve active card");
    char long_name[100];memset(long_name,'A',99);long_name[99]=0;
    reset();assert(!update_current_directory(long_name) && current_dir[0]==0);
    assert(update_current_directory("sub"));char previous[64];strcpy(previous,current_dir);
    assert(!update_current_directory(long_name) && strcmp(previous,current_dir)==0);
    chameleon_scene_menu_card_data_file_load_from_file(&app,long_name);
    assert(active[0]==0x11);
    puts("PASS long load/navigation paths rejected without changing current directory");
    for(int n=-1;n<64;n++) {
        reset();result=n;
        chameleon_scene_menu_card_data_file_save_text_input_event_cb(1,&text);
        assert(writes==1 && backs==0 && strstr(last_toast,"FAILED"));
    }
    reset();chameleon_scene_menu_card_data_file_save_text_input_event_cb(1,&text);
    assert(writes==1 && backs==1);
    puts("PASS save requires exact byte count");
    const char *bad[]={long_name,"../card.bin","sub/card.bin","sub\\card.bin",".",".."};
    for(size_t i=0;i<sizeof(bad)/sizeof(bad[0]);i++) {
        reset();input=bad[i];chameleon_scene_menu_card_data_file_save_text_input_event_cb(1,&text);
        assert(writes==0 && backs==0);
    }
    puts("PASS oversized and path-bearing save names rejected");
    mui_list_item_t back={ICON_BACK,"Back",(void*)CHAMELEON_MENU_BACK};
    mui_list_item_t folder={3,"Folder",(void*)CHAMELEON_MENU_FOLDER};
    assert(chameleon_scene_menu_card_data_list_item_cmp(&back,&folder)>0);
    assert(chameleon_scene_menu_card_data_list_item_cmp(&folder,&back)<0);
    assert(chameleon_scene_menu_card_data_list_item_cmp(&back,&back)==0);
    puts("PASS return navigation remains last with symmetric comparison");
    /* Parent, previous page, sorted folders/files, next page, return. */
    mui_list_item_t ordered[]={
        {ICON_HOME,"Parent",(void*)CHAMELEON_MENU_PARENT_DIR},
        {20,"Previous",(void*)CHAMELEON_MENU_PREVIOUS_PAGE},
        {3,"Alpha",(void*)CHAMELEON_MENU_FOLDER},
        {3,"Zulu",(void*)CHAMELEON_MENU_FOLDER},
        {4,"Alpha.bin",(void*)CHAMELEON_MENU_FILE},
        {4,"Zulu.bin",(void*)CHAMELEON_MENU_FILE},
        {21,"Next",(void*)CHAMELEON_MENU_NEXT_PAGE},
        {ICON_BACK,"Back",(void*)CHAMELEON_MENU_BACK}
    };
    const size_t count=sizeof ordered/sizeof ordered[0];
    for(size_t a=0;a<count;a++)for(size_t b=0;b<count;b++) {
        int cmp=chameleon_scene_menu_card_data_list_item_cmp(&ordered[a],&ordered[b]);
        assert(a==b?cmp==0:a<b?cmp<0:cmp>0);
    }
    puts("PASS navigation controls keep total order and folders/files retain lexical sort");
    unsigned char data[64]; uint16_t length;
    reset(); result=-1;length=64;assert(!fds_read_sync(1,1,&length,data) && length==0);
    reset();result=65;length=64;assert(!fds_read_sync(1,1,&length,data) && length==0);
    reset();length=64;assert(fds_read_sync(1,1,&length,data) && length==64);
    assert(!fds_read_sync(1,1,NULL,data));
    reset();result=32;assert(!fds_write_sync(1,1,64,data));
    result=64;assert(fds_write_sync(1,1,64,data));
    mounted_flag=false;assert(!fds_write_sync(1,1,64,data));
    puts("PASS slot storage rejects failed/oversized reads and short writes");
    return 0;
}
'''
with tempfile.TemporaryDirectory(prefix='pixl-chameleon-') as directory:
    root=Path(directory)
    c=root/'test.c'; c.write_text(prefix+functions+tests, encoding='utf-8')
    exe=root/('test.exe' if os.name=='nt' else 'test')
    subprocess.run([shutil.which('gcc') or 'gcc','-std=c11','-O2',str(c),'-o',str(exe)],check=True)
    result=subprocess.run([str(exe)],check=True,capture_output=True,text=True)
    print(json.dumps({'test':'chameleon_files','groups':8,'result':result.stdout},indent=2))
