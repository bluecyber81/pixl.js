#include "player_view.h"
#include <stdio.h>
static uint8_t file_data[2064];
static size_t file_size, cursor;
static unsigned opens, closes, aborts, events, header_reads, frame_reads, text_draws, boxes, cases;
static int open_error, close_error, stat_error, header_error, frame_error;
static bool descriptor_live, directory, short_header;
static char caption[32];
static int stat_fake(const char *path, vfs_obj_t *obj) {
    assert(path && *path);obj->size=file_size;obj->type=directory?VFS_TYPE_DIR:VFS_TYPE_REG;return stat_error;
}
static int open_fake(const char *path,vfs_file_t *fd,uint32_t mode) {
    assert(path && *path && mode==VFS_MODE_READONLY && !descriptor_live);opens++;
    if(open_error)return open_error;
    descriptor_live=true;fd->handle=(void*)1;cursor=0;return VFS_OK;
}
static int close_fake(vfs_file_t *fd) {
    assert(descriptor_live && fd->handle==(void*)1);closes++;
    if(close_error)return close_error;
    descriptor_live=false;fd->handle=NULL;return VFS_OK;
}
static int abort_fake(vfs_file_t *fd) {
    assert(descriptor_live && fd->handle==(void*)1);aborts++;descriptor_live=false;fd->handle=NULL;return VFS_OK;
}
static int read_fake(vfs_file_t *fd,void *data,size_t size) {
    assert(descriptor_live && fd->handle==(void*)1 && cursor<=file_size);
    if(!cursor){header_reads++;if(header_error)return header_error;if(short_header)size--;}
    else {frame_reads++;if(frame_error)return frame_error;}
    if(size>file_size-cursor)size=file_size-cursor;
    memcpy(data,file_data+cursor,size);cursor+=size;return (int)size;
}
static vfs_driver_t driver={.stat_file=stat_fake,.open_file=open_fake,.close_file=close_fake,
                           .abort_file=abort_fake,.read_file=read_fake};
vfs_driver_t *vfs_get_driver(vfs_drive_t drive){assert(drive==VFS_DRIVE_EXT);return &driver;}
static void capture_text(mui_canvas_t*c,int x,int y,const char*s){
    (void)c;(void)x;(void)y;text_draws++;snprintf(caption,sizeof(caption),"%s",s);
}
static void capture_box(mui_canvas_t*c,int x,int y,int w,int h){
    (void)c;(void)x;(void)y;(void)w;(void)h;boxes++;
}
#define mui_canvas_draw_utf8 capture_text
#define mui_canvas_draw_box capture_box
#include PLAYER_SOURCE
static mui_canvas_t canvas={128,64};
static void stopped(player_view_event_t event,player_view_t *p){
    assert(event==PLAYER_VIEW_EVENT_PLAY_STOPPED && !p->is_playing && !descriptor_live);events++;
}
static void prepare(unsigned count){
    assert(!descriptor_live);memset(file_data,0,sizeof(file_data));
    file_data[0]=0x56;file_data[1]=0x58;file_data[2]=0x49;file_data[3]=0x50;
    file_data[4]=count;file_data[6]=5;file_data[8]=128;file_data[10]=64;
    memset(file_data+16,0x55,1024);memset(file_data+1040,0xaa,1024);
    file_size=16+1024*count;cursor=0;
    opens=closes=aborts=events=header_reads=frame_reads=text_draws=boxes=0;
    open_error=close_error=stat_error=header_error=frame_error=timer_error=0;
    directory=short_header=false;caption[0]=0;
}
static void draw(player_view_t *p){p->p_view->draw_cb(p->p_view,&canvas);}
static void next(player_view_t *p){player_view_on_frame_tick(NULL);draw(p);}
static void released(player_view_t*p){
    assert(!p->is_playing&&!p->file_open&&!p->p_dirver&&!p->frame_buffer&&!p->frame_buffer_size&&!descriptor_live);
}
int main(void){
    player_view_t *p=player_view_create();assert(p&&!p->loop&&!p->show_counter);p->event_cb=stopped;
    prepare(2);assert(player_view_play(p,VFS_DRIVE_EXT,"/player/a.pixv"));
    draw(p);assert(p->played_frames==1&&p->frame_buffer[0]==0x55&&!text_draws&&!boxes);
    p->show_counter=true;draw(p);assert(text_draws==1&&boxes==1&&!strcmp(caption,"1")&&frame_reads==1);
    p->show_counter=false;next(p);assert(p->played_frames==2&&p->frame_buffer[0]==0xaa);
    next(p);released(p);assert(events==1&&closes==1&&opens==1&&!p->play_error);cases++;
    /* Complete rounds reuse the one frame allocation and never restart the timer. */
    for(unsigned count=1;count<=2;count++){
        prepare(count);p->loop=true;assert(player_view_play(p,VFS_DRIVE_EXT,"/player/loop.pixv"));
        uint8_t *buffer=p->frame_buffer;int allocated=allocations,started=starts;
        draw(p);
        for(unsigned frame=1;frame<3*count+1;frame++){
            next(p);assert(p->is_playing&&p->played_frames==frame%count+1&&p->frame_buffer==buffer);
            assert(p->frame_buffer[0]==(frame%count?0xaa:0x55)&&allocations==allocated&&starts==started);
        }
        assert(opens==4&&closes==3&&header_reads==4&&!events&&!aborts&&!text_draws&&!boxes);
        player_view_stop(p);released(p);assert(opens==closes&&p->loop&&!p->show_counter);cases++;
    }
    /* Failures at every restart boundary stop without resizing the frame buffer
     * or leaving a descriptor/timer owner alive. Format changes are rejected. */
    for(unsigned failure=0;failure<14;failure++){
        prepare(1);p->loop=true;assert(player_view_play(p,VFS_DRIVE_EXT,"/player/changed.pixv"));draw(p);
        switch(failure){
        case 0:close_error=VFS_ERR_FAIL;break;
        case 1:open_error=VFS_ERR_FAIL;break;
        case 2:stat_error=VFS_ERR_FAIL;break;
        case 3:header_error=VFS_ERR_FAIL;break;
        case 4:short_header=true;break;
        case 5:file_data[4]=0;file_size=16;break; /* zero frames */
        case 6:file_data[6]=6;break; /* valid but changed FPS */
        case 7:file_data[8]=120;file_size=16+960;break; /* valid changed dimensions */
        case 8:file_data[4]=2;file_size=2064;break; /* valid changed frame count */
        case 9:file_size--;break;
        case 10:file_data[12]=1;break; /* nonzero reserved header field */
        case 11:directory=true;break;
        case 12:frame_error=VFS_ERR_FAIL;break;
        case 13:file_data[8]=129;file_size=16+17*64;break; /* wider than LCD */
        }
        int allocated=allocations;next(p);released(p);
        assert(p->play_error&&events==1&&allocations==allocated);
        assert(aborts==(failure==0));unsigned old_closes=closes;player_view_stop(p);assert(closes==old_closes);cases++;
    }
    /* A later caller may release its path buffer: the player owns a bounded copy. */
    prepare(1);char path[VFS_MAX_PATH_LEN];memset(path,'x',sizeof(path));path[sizeof(path)-1]=0;
    assert(player_view_play(p,VFS_DRIVE_EXT,path));memset(path,'y',sizeof(path));
    assert(p->path[0]=='x'&&p->path[sizeof(path)-1]==0);draw(p);next(p);assert(p->is_playing);player_view_stop(p);cases++;
    prepare(1);assert(!player_view_play(p,VFS_DRIVE_EXT,path));assert(!opens);released(p);cases++;
    assert(!player_view_play(p,VFS_DRIVE_EXT,"")&&!player_view_play(p,VFS_DRIVE_EXT,NULL));assert(!opens);cases++;
    prepare(0);assert(!player_view_play(p,VFS_DRIVE_EXT,"/player/empty.pixv"));released(p);assert(closes==1);cases++;
    player_view_free(p);assert(allocations==frees);
    printf("PASS %u player loop/counter/path/reopen cases; real player, one frame buffer, no lost allocations\n",cases);
    return 0;
}
