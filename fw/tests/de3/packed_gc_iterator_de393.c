/* Regression for deletion while iterating the embedded LittleFS 2.8 root. */
#include "lfs.h"
static int counted_dir_open(lfs_t *, lfs_dir_t *, const char *);
static int failing_remove(lfs_t *, const char *);
#define lfs_dir_open counted_dir_open
#define lfs_remove failing_remove
#define main original_contract_main
#include CONTRACT
#undef main
#undef lfs_dir_open
#undef lfs_remove

static unsigned root_scans, fail_remove_at;
static int remove_error;
static int failing_remove(lfs_t *lfs, const char *path) {
    if(fail_remove_at && !--fail_remove_at) return remove_error;
    return lfs_remove(lfs,path);
}
static int counted_dir_open(lfs_t *lfs, lfs_dir_t *dir, const char *path) {
    if (!strcmp(path, "/")) ++root_scans;
    return lfs_dir_open(lfs, dir, path);
}
static const uint8_t foreign_data[] = {0x7a,0x19,0xc5,0,0x42};
static void physical_file(const char *name) {
    io_t file;
    REQUIRE(io_open(store, &file, name, LFS_O_WRONLY|LFS_O_CREAT|LFS_O_EXCL)==0);
    REQUIRE(lfs_file_write(&store->lfs,&file.f,foreign_data,sizeof(foreign_data))==(int)sizeof(foreign_data));
    REQUIRE(io_close(store,&file,0)==0);
}
static void physical_preserved(const char *name) {
    io_t file; uint8_t bytes[sizeof(foreign_data)];
    REQUIRE(io_open(store,&file,name,LFS_O_RDONLY)==0);
    REQUIRE(lfs_file_read(&store->lfs,&file.f,bytes,sizeof(bytes))==(int)sizeof(bytes));
    REQUIRE(!memcmp(bytes,foreign_data,sizeof(bytes)));
    REQUIRE(io_close(store,&file,0)==0);
}
static unsigned root_pairs(void) {
    lfs_dir_t dir; REQUIRE(lfs_dir_open(&store->lfs,&dir,"/")==0);
    lfs_block_t prior=dir.m.pair[0]; unsigned pairs=1;
    struct lfs_info info; int r;
    while((r=lfs_dir_read(&store->lfs,&dir,&info))>0) {
        if(dir.m.pair[0]!=prior) {prior=dir.m.pair[0];++pairs;}
    }
    REQUIRE(r==0 && lfs_dir_close(&store->lfs,&dir)==0);
    return pairs;
}
static unsigned obsolete_count(void) {
    lfs_dir_t dir; REQUIRE(lfs_dir_open(&store->lfs,&dir,"/")==0);
    struct lfs_info info; int r; unsigned obsolete=0;
    while((r=lfs_dir_read(&store->lfs,&dir,&info))>0) {
        uint32_t id;
        if(shard_id(info.name,&id) && !manifest_has(&store->current,id)) ++obsolete;
    }
    REQUIRE(r==0 && lfs_dir_close(&store->lfs,&dir)==0);
    return obsolete;
}
static void split_drop_case(unsigned garbage) {
    reset_baseline();
    pfs_dir_t *snapshot; pfs_file_t *reader;
    REQUIRE(pfs_opendir(store,"/",&snapshot)==0);
    REQUIRE(pfs_open(store,"/saved",LFS_O_RDONLY,&reader)==0);
    REQUIRE(pfs_replace(store,"/saved",new_data,2048,meta)==2048);
    const char *foreign[]={"/a_keep","/p00000000","/p0000000x","/pABCDEF01","/z_keep"};
    for(unsigned i=0;i<sizeof(foreign)/sizeof(foreign[0]);i++) physical_file(foreign[i]);
    REQUIRE(lfs_mkdir(&store->lfs,"/foreign_directory")==0);
    physical_file("/foreign_directory/child");
    for(unsigned i=0;i<garbage;i++) {char name[16];shard_name(0x10000u+i,name);physical_file(name);}
    physical_file(NEXT); physical_file(STAGE);
    unsigned before_pairs=root_pairs();
    REQUIRE(before_pairs>1 && obsolete_count()==garbage+1);
    root_scans=0;
    REQUIRE(pfs_gc(store)==0 && !pfs_poisoned(store));
    unsigned scans=root_scans;
    REQUIRE(scans==1 && store->gc_state==GC_PENDING);
    REQUIRE(obsolete_count()==1);
    unsigned after_pairs=root_pairs(); REQUIRE(after_pairs<before_pairs);
    struct lfs_info physical;
    REQUIRE(lfs_stat(&store->lfs,NEXT,&physical)==LFS_ERR_NOENT);
    REQUIRE(lfs_stat(&store->lfs,STAGE,&physical)==LFS_ERR_NOENT);
    for(unsigned i=0;i<sizeof(foreign)/sizeof(foreign[0]);i++) physical_preserved(foreign[i]);
    physical_preserved("/foreign_directory/child");
    REQUIRE(pfs_read(reader,check,sizeof(check))==2048 && !memcmp(check,old_data,2048));
    pfs_info_t info; REQUIRE(pfs_readdir(snapshot,&info)==1);
    REQUIRE(!strcmp(info.path,"/saved") && !memcmp(info.meta,meta,128));
    REQUIRE(pfs_readdir(snapshot,&info)==0);
    root_scans=0; REQUIRE(pfs_close(reader)==0 && root_scans==0);
    REQUIRE(pfs_closedir(snapshot)==0 && root_scans==1);
    REQUIRE(obsolete_count()==0 && store->gc_state==GC_CLEAN);
    REQUIRE(driver()->read_file_data("/saved",check,sizeof(check))==2048 && !memcmp(check,new_data,2048));
    REQUIRE(store->lfs.mlist==NULL);
    printf("{\"garbageGroups\":%u,\"rootPairsBefore\":%u,\"rootPairsAfter\":%u,\"gcScans\":%u,\"protectedDataPreserved\":true}\n",garbage,before_pairs,after_pairs,scans);
    drop();
}
static void iterator_error_case(int error) {
    reset_baseline();
    pfs_dir_t *snapshot; pfs_file_t *reader;
    REQUIRE(pfs_opendir(store,"/",&snapshot)==0);
    REQUIRE(pfs_open(store,"/saved",LFS_O_RDONLY,&reader)==0);
    REQUIRE(pfs_replace(store,"/saved",new_data,2048,meta)==2048);
    for(unsigned i=0;i<160;i++) {char name[16];shard_name(0x10000u+i,name);physical_file(name);}
    struct lfs_mlist *before=store->lfs.mlist;
    root_scans=0;fail_remove_at=7;remove_error=error;
    REQUIRE(pfs_gc(store)==error && !fail_remove_at && root_scans==1);
    REQUIRE(store->lfs.mlist==before && store->gc_state==GC_PENDING);
    REQUIRE(pfs_poisoned(store)==(error==LFS_ERR_IO));
    REQUIRE(obsolete_count()==155);
    REQUIRE(pfs_read(reader,check,sizeof(check))==2048 && !memcmp(check,old_data,2048));
    REQUIRE(driver()->read_file_data("/saved",check,sizeof(check))==2048 && !memcmp(check,new_data,2048));
    pfs_info_t info;REQUIRE(pfs_readdir(snapshot,&info)==1 && !strcmp(info.path,"/saved"));
    REQUIRE(!memcmp(info.meta,meta,128));
    REQUIRE(pfs_close(reader)==0 && pfs_closedir(snapshot)==0);
    REQUIRE(store->lfs.mlist==NULL);
    if(error==LFS_ERR_IO) {drop();REQUIRE(driver()->mount()==0);}
    REQUIRE(pfs_gc(store)==0 && obsolete_count()==0);
    REQUIRE(store->lfs.mlist==NULL && !pfs_poisoned(store));
    REQUIRE(driver()->read_file_data("/saved",check,sizeof(check))==2048 && !memcmp(check,new_data,2048));
    drop();
}
int main(void) {
    REQUIRE(LFS_VERSION==0x00020008 && LFS_DISK_VERSION==0x00020001);
    for(unsigned i=0;i<2048;i++) {old_data[i]=(uint8_t)(i*7+3);new_data[i]=(uint8_t)(i*13+5);}
    for(unsigned i=0;i<128;i++) meta[i]=(uint8_t)(i*9+17);
    baseline(); split_drop_case(160); split_drop_case(400);
    iterator_error_case(LFS_ERR_NOSPC); iterator_error_case(LFS_ERR_IO);
    REQUIRE(live==0);
    printf("{\"passed\":true,\"splitCases\":2,\"partialErrorCases\":2,\"liveAtEnd\":%zu,\"pointerBytes\":%zu,\"lfsVersion\":%u,\"lfsDiskVersion\":%u}\n",live,sizeof(void *),LFS_VERSION,LFS_DISK_VERSION);
    puts("PASS one-pass GC over metadata splits/drop; current, pinned, and foreign data survive; mid-scan errors close iterator and recover; no dangling iterator");
    return 0;
}
