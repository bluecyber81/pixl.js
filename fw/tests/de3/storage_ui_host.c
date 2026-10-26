/* Current storage scene, with only its VFS and UI edges mocked. */
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <stddef.h>
#include "vfs.h"
#include "app/settings/settings_storage_snapshot.h"
#include "i18n/language.h"
typedef enum { MUI_MSG_BOX_EVENT_SELECT_LEFT, MUI_MSG_BOX_EVENT_SELECT_CENTER, MUI_MSG_BOX_EVENT_SELECT_RIGHT } mui_msg_box_event_t;
typedef struct mui_msg_box_s mui_msg_box_t;
typedef void (*box_cb_t)(mui_msg_box_event_t, mui_msg_box_t *);
struct mui_msg_box_s { void *user_data; box_cb_t cb; int focus; const char *header,*message,*left,*center,*right; };
typedef struct { void *user_data; } mui_list_item_t;
typedef struct { void *user_data; int count; const char *labels[20]; void *values[20]; } mui_list_view_t;
typedef int mui_list_view_event_t;
typedef struct { mui_list_view_t *p_list_view; mui_msg_box_t *p_msg_box; void *p_view_dispatcher,*p_scene_dispatcher; settings_storage_snapshot_t storage_snapshot; } app_settings_t;
enum {SETTINGS_VIEW_ID_MAIN,SETTINGS_VIEW_ID_PROGRESS_BAR,SETTINGS_VIEW_ID_MSG_BOX};
static int current_view, previous_scenes, stat_result, mount_result, format_result;
static int mount_calls,format_calls,stat_calls,updates;
static vfs_stat_t status;
static vfs_driver_t driver;
static vfs_driver_t *active_driver;
static mui_list_view_t list;
static mui_msg_box_t box;
static app_settings_t app={.p_list_view=&list,.p_msg_box=&box};
static const char *getLangString(const char *s) { return s; }
vfs_driver_t *vfs_get_default_driver(void) {return active_driver;}
static void mui_msg_box_set_message(mui_msg_box_t *b,const char *s) {b->message=s;}
static void mui_msg_box_set_header(mui_msg_box_t *b,const char *s) {b->header=s;}
static void mui_msg_box_set_btn_text(mui_msg_box_t *b,const char *l,const char *c,const char *r) {b->left=l;b->center=c;b->right=r;}
static void mui_msg_box_set_btn_focus(mui_msg_box_t *b,int i) {b->focus=i;}
static void mui_msg_box_set_event_cb(mui_msg_box_t *b,box_cb_t cb) {b->cb=cb;}
static void mui_view_dispatcher_switch_to_view(void *d,int view) {(void)d;current_view=view;}
static void mui_scene_dispatcher_previous_scene(void *d) {(void)d;previous_scenes++;}
static void *mui(void) {return NULL;}
static void mui_update_now(void *m) {(void)m;updates++;assert(box.cb==NULL);}
static void mui_list_view_clear_items(mui_list_view_t *v) {v->count=0;}
static void mui_list_view_add_item(mui_list_view_t *v,int icon,const char *s,void *value) {
    (void)icon;assert(v->count<20);v->labels[v->count]=s;v->values[v->count++]=value;
}
static void mui_list_view_add_item_ext(mui_list_view_t *v,int icon,const char *s,const char *extra,void *value) {
    assert(strlen(extra)<64);mui_list_view_add_item(v,icon,s,value);
}
static void mui_list_view_set_selected_cb(mui_list_view_t *v,void (*cb)(mui_list_view_event_t,mui_list_view_t *,mui_list_item_t *)) {(void)v;(void)cb;}
static int32_t mock_stat(vfs_stat_t *s) {stat_calls++;*s=status;return stat_result;}
static int32_t mock_mount(void) {mount_calls++;assert(box.cb==NULL);assert(!app.storage_snapshot.valid);if(mount_result==0)status.avaliable=1;return mount_result;}
static int32_t mock_format(void) {format_calls++;assert(box.cb==NULL);assert(!app.storage_snapshot.valid);if(format_result==0)status.avaliable=0;return format_result;}
/* ACTUAL_STORAGE_SNAPSHOT_READ */
/* ACTUAL_STORAGE_INCLUDE */
static void reset(void) {
    driver=(vfs_driver_t){.stat=mock_stat,.mount=mock_mount,.format=mock_format};active_driver=&driver;
    stat_result=mount_result=format_result=0;mount_calls=format_calls=stat_calls=previous_scenes=updates=0;
    status=(vfs_stat_t){1,4194304,2048};memset(&list,0,sizeof(list));memset(&box,0,sizeof(box));
    list.user_data=&app;box.user_data=&app;settings_scene_storage_on_enter(&app);
}
static bool has(const char *text) {for(int i=0;i<list.count;i++) if(!strcmp(list.labels[i],text))return true;return false;}
static void select_item(uintptr_t id) {mui_list_item_t item={(void *)id};settings_scene_storage_on_selected(0,&list,&item);}
static void click(mui_msg_box_event_t event) {assert(box.cb);box.cb(event,&box);}
static void assert_back(void) {assert(box.cb==settings_scene_storage_result_cb && box.focus==1 && !box.left && box.center && !box.right);}
static void test_readonly_status(void) {
    reset();assert(current_view==SETTINGS_VIEW_ID_MAIN && stat_calls==1 && mount_calls==0 && format_calls==0);
    assert(app.storage_snapshot.valid && app.storage_snapshot.stat.free_bytes==2048);
    vfs_stat_t cached={0};
    assert(settings_storage_snapshot_read(&app.storage_snapshot,active_driver,&cached)==VFS_OK);
    assert(stat_calls==1 && cached.free_bytes==2048);
    assert(has(_L_TOTAL_SPACE) && has(_L_AVAILABLE_SPACE) && !has(_L_DE3_STORAGE_RETRY_MOUNT));
    status.free_bytes=0;settings_scene_storage_on_enter(&app);assert(has(_L_DE3_STORAGE_FULL));
    assert(stat_calls==2 && app.storage_snapshot.stat.free_bytes==0);
    status.avaliable=0;settings_scene_storage_on_enter(&app);assert(has(_L_NOT_MOUNTED) && has(_L_DE3_STORAGE_RETRY_MOUNT));
    stat_result=VFS_ERR_NODEV;settings_scene_storage_on_enter(&app);assert(has(_L_DE3_STORAGE_UNAVAILABLE));
    active_driver=NULL;settings_scene_storage_on_enter(&app);assert(list.count==2 && has(_L_BACK) && !has(_L_FORMAT));
    assert(mount_calls==0 && format_calls==0);
    puts("PASS storage status is read-only, unavailable/full/null-driver states remain navigable");
}
static void test_format_errors(void) {
    const int codes[]={VFS_ERR_NOSPC,VFS_ERR_MAXNM,VFS_ERR_NODEV,VFS_ERR_CRPT,VFS_ERR_FAIL};
    const char *labels[]={_L_DE3_STORAGE_FULL,_L_DE3_PATH_TOO_LONG,_L_DE3_STORAGE_UNAVAILABLE,_L_DE3_STORAGE_CORRUPT,_L_DE3_STORAGE_IO_ERROR};
    for(size_t i=0;i<sizeof(codes)/sizeof(*codes);i++) {
        reset();select_item(STORAGE_LIST_MENU_FORMAT);assert(box.focus==2 && format_calls==0);
        format_result=codes[i];click(MUI_MSG_BOX_EVENT_SELECT_LEFT);
        assert(format_calls==1 && mount_calls==0 && !strcmp(box.message,labels[i]));assert_back();
        click(MUI_MSG_BOX_EVENT_SELECT_LEFT);assert(format_calls==1); /* No retry from stale focus. */
        click(MUI_MSG_BOX_EVENT_SELECT_CENTER);assert(current_view==SETTINGS_VIEW_ID_MAIN && previous_scenes==0);
        int count=list.count;settings_scene_storage_on_enter(&app);assert(list.count==count);
    }
    reset();select_item(STORAGE_LIST_MENU_FORMAT);click(MUI_MSG_BOX_EVENT_SELECT_RIGHT);
    assert(format_calls==0 && current_view==SETTINGS_VIEW_ID_MAIN && previous_scenes==0);
    puts("PASS five distinct format-error paths, cancel, restored button and no implicit reformat");
}
static void test_mount_and_success(void) {
    reset();mount_result=VFS_ERR_FAIL;select_item(STORAGE_LIST_MENU_FORMAT);click(MUI_MSG_BOX_EVENT_SELECT_LEFT);
    assert(format_calls==1 && mount_calls==1 && !strcmp(box.message,_L_DE3_STORAGE_IO_ERROR));assert_back();
    click(MUI_MSG_BOX_EVENT_SELECT_CENTER);assert(has(_L_DE3_STORAGE_RETRY_MOUNT));
    mount_result=0;select_item(STORAGE_LIST_MENU_MOUNT);assert(mount_calls==2 && format_calls==1);
    assert(!strcmp(box.message,_L_DE3_STORAGE_MOUNT_DONE));assert_back();
    click(MUI_MSG_BOX_EVENT_SELECT_CENTER);assert(!has(_L_DE3_STORAGE_RETRY_MOUNT));
    select_item(STORAGE_LIST_MENU_FORMAT);click(MUI_MSG_BOX_EVENT_SELECT_LEFT);
    assert(format_calls==2 && mount_calls==3 && !strcmp(box.message,_L_DE3_STORAGE_FORMAT_DONE));assert_back();
    click(MUI_MSG_BOX_EVENT_SELECT_CENTER);select_item(STORAGE_LIST_MENU_BACK);assert(previous_scenes==1);
    settings_scene_storage_on_exit(&app);assert(list.count==0 && box.cb==NULL);
    reset();driver.mount=NULL;select_item(STORAGE_LIST_MENU_FORMAT);click(MUI_MSG_BOX_EVENT_SELECT_LEFT);
    assert(!strcmp(box.message,_L_DE3_STORAGE_UNAVAILABLE));assert_back();
    puts("PASS mount failure is not success, safe mount retry, explicit format success, exit cleanup");
}
int main(void) {test_readonly_status();test_format_errors();test_mount_and_success();return 0;}
