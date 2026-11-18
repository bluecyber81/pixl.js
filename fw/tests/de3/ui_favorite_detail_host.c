#include <assert.h>
#include <stdbool.h>
static bool ntag_emu_prepare_change(void){return true;}
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include "m-array.h"
#define LIST_VIEW_ITEM_MAX_COUNT 100
#define FAV_TYPE_FAV 1
#define VFS_OK 0
#define _T(x) #x
#define string_get_cstr(x) (x)
typedef struct {uint8_t game_id;uint32_t amiibo_head,amiibo_tail;} amiidb_fav_t;
ARRAY_DEF(amiidb_fav_array,amiidb_fav_t,M_POD_OPLIST)
typedef struct {unsigned fav_type;union{amiidb_fav_t fav;}fav_data;}amiidb_fav_info_t;
typedef struct {uint32_t head,tail;}db_amiibo_t;
typedef struct {bool windowed_favorites;unsigned max_ntags,focus,game_id;}amiibo_view_t;
typedef struct {char cur_fav_dir[64];amiidb_fav_t cur_fav;amiidb_fav_array_t fav_array;amiibo_view_t*p_amiibo_view;const db_amiibo_t*cur_amiibo;}app_amiidb_t;
static unsigned scans, permuted, errors,generated,listed=950,fail_generation;static int read_error;static db_amiibo_t db[950];
static bool m_tag_ready=true;
static uint8_t m_active_focus;
static void amiibo_view_set_max_ntags(amiibo_view_t*v,unsigned n){v->max_ntags=n;}
static void amiibo_view_set_focus(amiibo_view_t*v,unsigned n){v->focus=n;}
static unsigned amiibo_view_get_focus(amiibo_view_t*v){return v->focus;}
static void amiibo_view_set_game_id(amiibo_view_t*v,unsigned n){v->game_id=n;}
static const db_amiibo_t*get_amiibo_by_id(uint32_t h,uint32_t t){return h==1 && t>0 && t<=950?&db[t-1]:NULL;}
static int amiidb_api_fav_list_dir(const char*p,void(*cb)(amiidb_fav_info_t*,void*),void*ctx){
 (void)p; scans++;
 for(unsigned i=0;i<listed;i++){
     unsigned tail = permuted && listed==950 ? (i*151u)%950+1 : i+1;
     amiidb_fav_info_t info={FAV_TYPE_FAV,.fav_data.fav={1,1,tail}};
     cb(&info,ctx);
     if(i%5==0)cb(&info,ctx); /* duplicate file identity, including at full capacity */
 }return read_error;}
static void amiidb_scene_amiibo_detail_error_msg(app_amiidb_t*a,const char*m){(void)a;(void)m;errors++;}
static void amiidb_scene_amiibo_game_list_generate(app_amiidb_t*a){assert(a->cur_amiibo);if(fail_generation){m_tag_ready=false;errors++;return;}m_tag_ready=true;generated++;}
/* ACTUAL_FAVORITE_CALLBACKS */
static void step(app_amiidb_t *app, int direction) {
    amiibo_view_t *view=app->p_amiibo_view;
    view->focus=(view->focus+view->max_ntags+direction)%view->max_ntags;
    amiidb_scene_amiibo_fav_list_update(app);
    if(m_tag_ready) m_active_focus=view->focus;
}
int main(void) {
    for(unsigned i=0;i<950;i++)db[i]=(db_amiibo_t){1,i+1};
    amiibo_view_t view={0};
    app_amiidb_t app={.p_amiibo_view=&view,.cur_fav={1,1,1}};
    amiidb_fav_array_init(app.fav_array);
    const unsigned selections[]={1,100,101,512,950};
    for(permuted=0;permuted<=1;permuted++) {
        for(unsigned i=0;i<sizeof(selections)/sizeof(*selections);i++) {
            unsigned start=selections[i];
            app.cur_fav.amiibo_tail=start;
            amiidb_scene_amiibo_fav_list_init(&app);
            assert(!errors && m_tag_ready && app.cur_amiibo->tail==start);
            assert(amiidb_fav_array_size(app.fav_array)==24 && view.windowed_favorites);
            step(&app,-1);assert(app.cur_fav.amiibo_tail==(start==1?950:start-1));
            step(&app,1);assert(app.cur_fav.amiibo_tail==start);
            step(&app,1);assert(app.cur_fav.amiibo_tail==start%950+1);
        }
        for(int dir=-1;dir<=1;dir+=2) {
            app.cur_fav.amiibo_tail=512;
            amiidb_scene_amiibo_fav_list_init(&app);
            scans=0;
            for(unsigned i=0;i<950;i++) {
                unsigned old=app.cur_fav.amiibo_tail;
                step(&app,dir);
                assert(m_tag_ready && app.cur_fav.amiibo_tail==(dir==1?old%950+1:(old==1?950:old-1)));
            }
            assert(app.cur_fav.amiibo_tail==512 && scans<=42);
        }
    }
    fail_generation=1;step(&app,1);assert(app.cur_fav.amiibo_tail==512 && !m_tag_ready);
    fail_generation=0;read_error=-1;generated=0;
    amiidb_scene_amiibo_fav_list_init(&app);assert(!m_tag_ready && generated==0);read_error=0;
    listed=0;errors=generated=0;amiidb_scene_amiibo_fav_list_init(&app);assert(!m_tag_ready && errors==1 && !generated);
    listed=3;app.cur_fav.amiibo_tail=4;errors=generated=0;amiidb_scene_amiibo_fav_list_init(&app);assert(!m_tag_ready && errors==1 && !generated);
    for(unsigned start=1;start<=3;start++) {
        app.cur_fav.amiibo_tail=start;amiidb_scene_amiibo_fav_list_init(&app);
        assert(m_tag_ready && view.max_ntags==3 && view.focus==start-1 && !view.windowed_favorites);
        step(&app,1);assert(app.cur_fav.amiibo_tail==start%3+1);
    }
    amiidb_fav_array_clear(app.fav_array);
    puts("PASS: ordered 950-key wrap in both directions and filesystem orders, bounded 24, duplicate/missing/read failure");
    return 0;
}
