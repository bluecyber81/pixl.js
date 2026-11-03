#include "lfs.h"
static unsigned force_full_reserves, reserve_calls;
static lfs_ssize_t probed_fs_size(lfs_t *lfs) {
 ++reserve_calls;
 if(force_full_reserves){--force_full_reserves;return 512;}
 return lfs_fs_size(lfs);
}
static unsigned injected_sync;
static int probed_sync(lfs_t *lfs,lfs_file_t *file) {
 if(injected_sync&&!--injected_sync)return LFS_ERR_NOSPC;
 return lfs_file_sync(lfs,file);
}
#define lfs_file_sync probed_sync
#define lfs_fs_size probed_fs_size
#define main original_contract_main
#include CONTRACT
#undef main
#undef lfs_fs_size
#undef lfs_file_sync
struct prior_file_layout {
 handle_t h;io_t io;pfs_info_t info;location_t loc;uint32_t pos;int flags;bool writing;
};
_Static_assert(sizeof(pfs_file_t)==sizeof(struct prior_file_layout),"writer handle must not grow");
static unsigned extra;
static void staged_snapshot(unsigned release_before,unsigned inject_full,unsigned inject_sync) {
 reset_baseline();size_t initial=live;vfs_file_t reader={0},writer={0};vfs_dir_t dir={0};
 REQUIRE(driver()->open_file("/saved",&reader,VFS_MODE_READONLY)==0);
 REQUIRE(driver()->open_dir("/",&dir)==0);
 REQUIRE(driver()->open_file("/saved",&writer,VFS_MODE_WRITEONLY|VFS_MODE_TRUNC)==0);
 REQUIRE(driver()->write_file(&writer,new_data,2048)==2048);
 REQUIRE(driver()->create_dir("/blocked")<0);
 REQUIRE(driver()->remove_file("/saved")<0);
 REQUIRE(driver()->rename_file("/saved","/moved")<0);
 REQUIRE(driver()->update_file_meta("/saved",meta,128)<0);
 REQUIRE(pfs_gc(store)<0);REQUIRE(vfs_persist_write(driver(),"/saved",old_data,2048)<0);
 if(release_before&1)REQUIRE(driver()->close_file(&reader)==0);
 if(release_before&2)REQUIRE(driver()->close_dir(&dir)==0);
 reserve_calls=0;force_full_reserves=inject_full;injected_sync=inject_sync;
 int result=driver()->close_file(&writer);
 if(inject_sync) {
  REQUIRE(result==VFS_ERR_NOSPC);REQUIRE(writer.handle);REQUIRE(!injected_sync);
  REQUIRE(!store->poisoned);REQUIRE(state()==0);
  result=driver()->close_file(&writer);
 }
 if(inject_full==2) {
  REQUIRE(result==VFS_ERR_NOSPC);REQUIRE(writer.handle);REQUIRE(force_full_reserves==0);
  REQUIRE(driver()->abort_file(&writer)==0);
  REQUIRE(state()==0);
 } else {
  REQUIRE(result==0);REQUIRE(!writer.handle);REQUIRE(!force_full_reserves);
  REQUIRE(reserve_calls==((inject_full||inject_sync)?2u:1u));REQUIRE(state()==1);
 }
 if(!(release_before&1)) {
  REQUIRE(driver()->read_file(&reader,check,2048)==2048);REQUIRE(!memcmp(check,old_data,2048));
  REQUIRE(driver()->close_file(&reader)==0);
 }
 if(!(release_before&2)) {
  vfs_obj_t obj;REQUIRE(driver()->read_dir(&dir,&obj)==0);REQUIRE(!strcmp(obj.name,"saved"));
  REQUIRE(obj.size==2048&&!memcmp(obj.meta,meta,128));REQUIRE(driver()->read_dir(&dir,&obj)==VFS_ERR_EOF);
  REQUIRE(driver()->close_dir(&dir)==0);
 }
 REQUIRE(vfs_packed_handles_idle());REQUIRE(live==initial);REQUIRE(pfs_gc(store)==0);
 drop();REQUIRE(driver()->mount()==0);REQUIRE(state()==(inject_full==2?0u:1u));extra++;
}
int main(void) {
 for(unsigned i=0;i<2048;i++){old_data[i]=(uint8_t)(i*7+3);new_data[i]=(uint8_t)(i*13+5);}
 for(unsigned i=0;i<128;i++)meta[i]=(uint8_t)(i*9+17);
 baseline();
 for(unsigned release=0;release<4;release++) {
  for(unsigned space=0;space<3;space++)staged_snapshot(release,space,0);
  /* Stage sync is #1; #2 leaves an unpublished shard, #3 a manifest. */
  for(unsigned sync=2;sync<=3;sync++)staged_snapshot(release,0,sync);
 }
 drop();REQUIRE(live==0);
 printf("{\"passed\":true,\"stageLifecycleCases\":%u,\"pointerBytes\":%zu,\"peakRequestedHeap\":%zu,\"liveAtEnd\":%zu}\n",extra,sizeof(void*),peak,live);
 puts("PASS exclusive stage writer, snapshots, low-space GC retry, retained failure and interrupted-commit retry");return 0;
}
