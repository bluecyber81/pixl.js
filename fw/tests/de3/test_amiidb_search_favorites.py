"""Offline native tests of the actual DE3 search/favorites C code; no device I/O."""
from pathlib import Path
import importlib.util
import unittest

FW = Path(__file__).resolve().parents[2]
SRC = FW / 'application/src'
spec = importlib.util.spec_from_file_location('de2_native', FW / 'tests/de2/test_player_v3.py')
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


class SearchFavoritesTests(native.NativeTests):
    # Do not inherit unrelated test cases into this module's discovery.
    test_real_player_format_and_resource_lifecycle = None
    test_real_central_v3_guard_preserves_destination_and_classic_path = None
    test_real_favorite_sort_null_folder_data_and_antisymmetry = None
    test_real_ui_generation_never_emulates_failed_or_unsupported_tag = None
    test_real_large_category_navigation_matches_visible_100_items = None

    def test_actual_952_catalog_all_pages_id_case_and_game_filter(self):
        self.compile_run(r'''
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "db_amiibo.c"
#include "db_link.c"
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wmissing-field-initializers"
#include "db_game.c"
#pragma GCC diagnostic pop
#include "amiidb_api_db.c"
static const db_amiibo_t *expected[2048];
static int ref_compare(const void *left,const void *right) {
 const db_amiibo_t *a=*(const db_amiibo_t *const*)left,*b=*(const db_amiibo_t *const*)right;
 int result=strcmp(a->name_en,b->name_en);if(result)return result;
 uint64_t aa=((uint64_t)a->head<<32)|a->tail,bb=((uint64_t)b->head<<32)|b->tail;
 return (aa>bb)-(aa<bb);
}
static unsigned callback_count;
static void count_cb(const db_amiibo_t *a,void *ctx) {(void)ctx;assert(a==expected[callback_count++]);}
int main(void) {
 assert(amiibo_list_size==952);
 for(size_t i=0;i<amiibo_list_size;i++)expected[i]=&amiibo_list[i];
 qsort(expected,amiibo_list_size,sizeof(expected[0]),ref_compare);
 struct {uint64_t before;const db_amiibo_t *items[AMIIDB_RESULT_PAGE_SIZE];uint64_t after;} page={.before=0x12345678,.after=0x87654321};
 uint16_t total;unsigned visited=0;
 for(unsigned number=0;number<(952+AMIIDB_RESULT_PAGE_SIZE-1)/AMIIDB_RESULT_PAGE_SIZE;number++) {
  int count=amiidb_api_db_search_page("",0,number,page.items,&total);
  assert(total==952 && count==(number==952/AMIIDB_RESULT_PAGE_SIZE?952%AMIIDB_RESULT_PAGE_SIZE:AMIIDB_RESULT_PAGE_SIZE));
  for(int j=0;j<count;j++)assert(page.items[j]==expected[visited++]);
  assert(page.before==0x12345678 && page.after==0x87654321);
 }
 assert(visited==952);
 assert(amiidb_api_db_search_page("",0,65535,page.items,&total)==952%AMIIDB_RESULT_PAGE_SIZE && page.items[0]==expected[952/AMIIDB_RESULT_PAGE_SIZE*AMIIDB_RESULT_PAGE_SIZE]);
 assert(amiidb_api_db_search("",count_cb,NULL)==0 && callback_count==952);
 char id[17];
 for(size_t i=0;i<952;i++) {
  snprintf(id,sizeof(id),"%08lX%08lX",(unsigned long)amiibo_list[i].head,(unsigned long)amiibo_list[i].tail);
  assert(amiidb_api_db_search_page(id,0,0,page.items,&total)==1 && total==1 && page.items[0]==&amiibo_list[i]);
 }
 int mixed=amiidb_api_db_search_page("mArIo",0,0,page.items,&total);assert(mixed>1);
 assert(amiidb_api_db_search_page("Mario",0,0,page.items,&total)==mixed);
 assert(amiidb_api_db_search_page("zzzzzzzzzzzzzzzz",0,0,page.items,&total)==0 && total==0);
 assert(amiidb_api_db_search_page("12345678901234567890123456789012345",0,0,page.items,&total)<0 && total==0);
 assert(amiidb_api_db_search_page("",255,0,page.items,&total)==0);
 /* Independently enumerate direct leaf links, not the search algorithm. */
 for(const db_game_t *game=game_list;game->game_id;game++) {
  bool has_children=false;for(const db_game_t *child=game_list;child->game_id;child++)if(child->parent_game_id==game->game_id)has_children=true;
  if(has_children)continue;
  size_t n=0;
  for(size_t i=0;i<952;i++)for(const db_link_t *link=link_list;link->game_id;link++)
   if(link->game_id==game->game_id && link->amiibo_index==i){expected[n++]=&amiibo_list[i];break;}
  qsort(expected,n,sizeof(expected[0]),ref_compare);
  size_t seen=0;
  for(unsigned number=0;number<(n+AMIIDB_RESULT_PAGE_SIZE-1)/AMIIDB_RESULT_PAGE_SIZE || number==0;number++) {
   int count=amiidb_api_db_search_page("",game->game_id,number,page.items,&total);assert(total==n && count>=0);
   for(int j=0;j<count;j++)assert(page.items[j]==expected[seen++]);
  }
  assert(seen==n);
 }
 puts("PASS: all 952 exact IDs, bounded sorted pages, bounds, case search and every leaf game");return 0;
}
''', includes=[SRC / 'amiidb', SRC / 'app/amiidb/api'])

    def test_actual_parent_filter_and_cycle_bound(self):
        self.compile_run(r'''
#include <assert.h>
#include <stdio.h>
#include "db_header.h"
const db_amiibo_t amiibo_list[]={{1,2,"Zulu",""},{2,2,"Alpha",""},{3,2,"Beta",""}};
const size_t amiibo_list_size=3;
const db_game_t game_list[]={{1,0,"Parent","",0,0},{2,1,"Child","",0,0},{3,2,"Grandchild","",0,0},{4,5,"CycleA","",0,0},{5,4,"CycleB","",0,0},{0}};
const db_link_t link_list[]= {{.game_id=2,.amiibo_index=0},{.game_id=3,.amiibo_index=1},{.game_id=4,.amiibo_index=2},{.game_id=2,.amiibo_index=0},{0}};
#include "amiidb_api_db.c"
int main(void) {
 const db_amiibo_t *items[AMIIDB_RESULT_PAGE_SIZE];uint16_t total;
 assert(amiidb_api_db_search_page("",1,0,items,&total)==2 && total==2 && items[0]->head==2 && items[1]->head==1);
 assert(amiidb_api_db_search_page("0000000100000002",3,0,items,&total)==0);
 assert(amiidb_api_db_search_page("0000000200000002",1,0,items,&total)==1);
 assert(amiidb_api_db_search_page("",6,0,items,&total)==0);
 assert(amiidb_api_db_search_page("",5,0,items,&total)==1 && items[0]->head==3);
 puts("PASS: descendant filter, exact ID/filter intersection, duplicate links and cyclic parents bounded");return 0;
}
''', includes=[SRC / 'amiidb', SRC / 'app/amiidb/api'])

    def test_actual_favorite_parser_paths_and_io_failures(self):
        self.compile_run(r'''
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "amiidb_api_fav.h"
static int calls,closed,read_index,read_error=VFS_ERR_EOF,close_error,action_error,driver_absent;
static char last_path[64];static vfs_obj_t entries[8];static int entry_count;
static void path(const char *p){assert(strlen(p)<64);strcpy(last_path,p);calls++;}
static int open_dir(const char*p,vfs_dir_t*d){(void)d;path(p);read_index=0;return 0;}
static int read_dir(vfs_dir_t*d,vfs_obj_t*o){(void)d;if(read_index<entry_count){*o=entries[read_index++];return 0;}return read_error;}
static int close_dir(vfs_dir_t*d){(void)d;closed++;return close_error;}
static int action(const char*p){path(p);return action_error;}
static int write_data(const char*p,void*b,size_t n){assert(b==NULL && n==0);return action(p);}
static vfs_driver_t driver={.open_dir=open_dir,.read_dir=read_dir,.close_dir=close_dir,.create_dir=action,.remove_dir=action,.remove_file=action,.write_file_data=write_data};
vfs_driver_t *vfs_get_driver(vfs_drive_t d){assert(d==VFS_DRIVE_EXT);return driver_absent?NULL:&driver;}
#include "amiidb_api_fav.c"
static int favorites,folders;
static void cb(amiidb_fav_info_t*i,void*c){(void)c;if(i->fav_type==FAV_TYPE_FAV)favorites++;else folders++;}
int main(void) {
 struct {unsigned a;amiidb_fav_t fav;unsigned b;} guarded={.a=123,.b=456};
 assert(amiidb_api_fav_parse_filename("255_1234aBcD_89abcdef.fav",&guarded.fav));
 assert(guarded.fav.game_id==255 && guarded.fav.amiibo_head==0x1234abcd && guarded.fav.amiibo_tail==0x89abcdef && guarded.a==123 && guarded.b==456);
 const char *bad[]={"256_1234ABCD_89ABCDEF.fav","-1_1234ABCD_89ABCDEF.fav","+1_1234ABCD_89ABCDEF.fav","1_123ABCD_89ABCDEF.fav","1_1234ABCD_89ABCDEZ.fav","1_1234ABCD_89ABCDEF.favX","1_1234ABCD_89ABCDEF.bin","1111_1234ABCD_89ABCDEF.fav","","1"};
 amiidb_fav_t before=guarded.fav;
 for(size_t i=0;i<sizeof(bad)/sizeof(*bad);i++){assert(!amiidb_api_fav_parse_filename(bad[i],&guarded.fav));assert(memcmp(&before,&guarded.fav,sizeof(before))==0);}
 char unterminated[48];memset(unterminated,'a',48);assert(!amiidb_api_fav_parse_filename(unterminated,&guarded.fav));
 assert(!amiidb_api_fav_parse_filename(NULL,&guarded.fav));assert(!amiidb_api_fav_parse_filename("1_1234ABCD_89ABCDEF.fav",NULL));
 const char *invalid[]={"",".","..","a/b","a\\b","E:","a\n",unterminated};
 for(size_t i=0;i<sizeof(invalid)/sizeof(*invalid);i++){int saved=calls;assert(amiidb_api_fav_add(invalid[i],&before)==VFS_ERR_MAXNM);assert(calls==saved);}
 char folder[27];memset(folder,'a',25);folder[25]=0;
 assert(amiidb_api_fav_create_dir(folder)==0);assert(amiidb_api_fav_add(folder,&before)==0 && strlen(last_path)==63);
 folder[25]='a';folder[26]=0;int saved=calls;assert(amiidb_api_fav_add(folder,&before)==VFS_ERR_MAXNM && calls==saved);assert(amiidb_api_fav_create_dir(folder)==VFS_ERR_MAXNM);
 before.game_id=1;assert(amiidb_api_fav_add(folder,&before)==0); /* Existing longer folder still works if the complete path fits. */
 action_error=VFS_ERR_NOSPC;assert(amiidb_api_fav_add("valid",&before)==VFS_ERR_NOSPC);action_error=0;
 strcpy(entries[0].name,"Folder");entries[0].type=VFS_TYPE_DIR;
 strcpy(entries[1].name,"255_1234ABCD_89ABCDEF.fav");entries[1].type=VFS_TYPE_REG;
 strcpy(entries[2].name,"256_1234ABCD_89ABCDEF.fav");entries[2].type=VFS_TYPE_REG;
 entry_count=3;assert(amiidb_api_fav_list_dir("",cb,NULL)==0 && favorites==1 && folders==1 && closed==1);
 read_error=VFS_ERR_CRPT;assert(amiidb_api_fav_list_dir("",cb,NULL)==VFS_ERR_CRPT && closed==2);
 read_error=VFS_ERR_EOF;close_error=VFS_ERR_FAIL;assert(amiidb_api_fav_list_dir("",cb,NULL)==VFS_ERR_FAIL && closed==3);close_error=0;
 action_error=VFS_ERR_NOSPC;assert(amiidb_api_fav_empty_dir("valid")==VFS_ERR_NOSPC && closed==4 && read_index==1);action_error=0;
 strcpy(entries[0].name,"../escape");assert(amiidb_api_fav_empty_dir("valid")==VFS_ERR_CRPT && closed==5);
 driver_absent=1;assert(amiidb_api_fav_list_dir("",cb,NULL)==VFS_ERR_NODEV);assert(amiidb_api_fav_add("valid",&before)==VFS_ERR_NODEV);
 puts("PASS: bounded parser, untouched failure output, exact 64-byte path boundary and propagated I/O errors");return 0;
}
''', {'boards.h': ''}, includes=[SRC / 'amiidb', SRC / 'app/amiidb/api', SRC / 'mod/vfs', SRC / 'ntag'])


if __name__ == '__main__':
    unittest.main()
