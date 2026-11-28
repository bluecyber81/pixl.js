/* Local Linux host regression for PFS1 manifest updates. Only synthetic NOR
 * bytes survive a modeled reset; all heap and open littlefs handles are lost. */
#include "packed_fs.h"
#include "packed_vfs_nor_de344.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum operation { UNLINK_FILE, REMOVE_TREE, RENAME_FILE, RENAME_TREE, SET_META, OPERATIONS };
static const char * const names[]={"unlink","remove-tree","rename-file","rename-tree","metadata"};
static nor_fixture_t media;
static uint8_t saved[NOR_BYTES], before[NOR_BYTES], data[540], previous[128], changed[128];
static void *live[32];
static pfs_t *fs;
static uint32_t revision;

static void *acquire(size_t size) {
    for (unsigned i=0;i<32;i++) if (!live[i]) return live[i]=malloc(size);
    REQUIRE(0);return NULL;
}
static void release(void *ptr) {
    for (unsigned i=0;i<32;i++) if (live[i]==ptr) { free(ptr);live[i]=NULL;return; }
    REQUIRE(0);
}
static void power_on(const uint8_t *image) {
    for (unsigned i=0;i<32;i++) { free(live[i]);live[i]=NULL; }
    nor_init(&media);
    if (image) memcpy(media.disk,image,sizeof(media.disk));
    fs=pfs_new(&media.config,acquire,release);REQUIRE(fs);
    if (image) REQUIRE(pfs_mount(fs)==0);
}
static void reset_to_disk(void) {
    memcpy(before,media.disk,sizeof(before));power_on(before);
}
static void initialize(void) {
    for (unsigned i=0;i<sizeof(data);i++) data[i]=(uint8_t)(i*29+5);
    for (unsigned i=0;i<128;i++) { previous[i]=(uint8_t)i;changed[i]=(uint8_t)(255-i); }
    power_on(NULL); REQUIRE(pfs_format(fs)==0);
    uint8_t binding[32]={51};
    REQUIRE(pfs_bind_import(fs,binding)==0 && pfs_finish_import(fs)==0);
    REQUIRE(pfs_mkdir(fs,"/a")==0 && pfs_mkdir(fs,"/b")==0 && pfs_mkdir(fs,"/a/tree")==0);
    REQUIRE(pfs_mkdir(fs,"/a/tree/inner")==0);
    const char *files[]={"/keep","/a/file","/a/tree/first","/a/tree/inner/second"};
    for (unsigned i=0;i<4;i++) REQUIRE(pfs_replace(fs,files[i],data,sizeof(data),previous)==sizeof(data));
    REQUIRE(pfs_setattr(fs,"/a/tree",previous)==0);
    revision=pfs_generation(fs); REQUIRE(revision>1);
}
static void verify_file(const char *path,bool present,const uint8_t *meta) {
    pfs_info_t info; int observed=pfs_stat(fs,path,&info);
    if (!present) { REQUIRE(observed==LFS_ERR_NOENT);return; }
    REQUIRE(observed==0 && info.type==PFS_FILE && info.size==sizeof(data) && !memcmp(info.meta,meta,128));
    pfs_file_t *f;uint8_t content[sizeof(data)];REQUIRE(pfs_open(fs,path,LFS_O_RDONLY,&f)==0);
    REQUIRE(pfs_read(f,content,sizeof(content))==sizeof(content) && !memcmp(content,data,sizeof(data)));
    REQUIRE(pfs_read(f,content,1)==0 && pfs_close(f)==0);
}
static void verify_tree(const char *directory,bool present) {
    pfs_info_t info; int observed=pfs_stat(fs,directory,&info);
    if (present) REQUIRE(observed==0 && info.type==PFS_DIR && !memcmp(info.meta,previous,128));
    else REQUIRE(observed==LFS_ERR_NOENT);
    char name[64];snprintf(name,sizeof(name),"%s/first",directory);verify_file(name,present,previous);
    snprintf(name,sizeof(name),"%s/inner",directory);observed=pfs_stat(fs,name,&info);
    if (present) REQUIRE(observed==0 && info.type==PFS_DIR);
    else REQUIRE(observed==LFS_ERR_NOENT);
    snprintf(name,sizeof(name),"%s/inner/second",directory);verify_file(name,present,previous);
}
static void verify(enum operation op,bool committed) {
    REQUIRE(pfs_generation(fs)==revision+(unsigned)committed);
    bool original_file=!(committed && (op==UNLINK_FILE || op==RENAME_FILE));
    bool original_tree=!(committed && (op==REMOVE_TREE || op==RENAME_TREE));
    verify_file("/keep",true,previous);
    verify_file("/a/file",original_file,op==SET_META && committed?changed:previous);
    verify_file("/b/moved-file",op==RENAME_FILE && committed,previous);
    verify_tree("/a/tree",original_tree);verify_tree("/b/moved-tree",op==RENAME_TREE && committed);
}
static int mutate(enum operation op) {
    switch(op) {
    case UNLINK_FILE:return pfs_remove(fs,"/a/file",false);
    case REMOVE_TREE:return pfs_remove(fs,"/a/tree",true);
    case RENAME_FILE:return pfs_rename(fs,"/a/file","/b/moved-file");
    case RENAME_TREE:return pfs_rename(fs,"/a/tree","/b/moved-tree");
    case SET_META:return pfs_setattr(fs,"/a/file",changed);
    default:return LFS_ERR_INVAL;
    }
}
static void inject(enum operation op,unsigned kind,unsigned at) {
    jmp_buf power_cut;
    if (!setjmp(power_cut)) {
        nor_arm(&media,(enum nor_fault_mode)kind,at,&power_cut);
        (void)mutate(op);
    }
    REQUIRE(media.fault_triggered);
}
static void exercise(enum operation op,unsigned free_blocks) {
    power_on(saved);
    nor_reset_observation(&media);REQUIRE(mutate(op)==0);
    unsigned events=media.stats.event_count;REQUIRE(events>0 && events<1000);
    reset_to_disk();verify(op,true);
    unsigned old=0,committed=0;
    for (unsigned kind=NOR_CUT_AFTER;kind<=NOR_RETURN_IO_BEFORE;kind++)
        for (unsigned at=1;at<=events;at++) {
            power_on(saved);inject(op,kind,at);reset_to_disk();
            bool is_new=pfs_generation(fs)==revision+1;verify(op,is_new);
            if (is_new) committed++;
            else { old++;REQUIRE(mutate(op)==0); }
            reset_to_disk();verify(op,true);
        }
    printf("{\"operation\":\"%s\",\"freeBlocks\":%u,\"events\":%u,\"old\":%u,\"new\":%u}\n",
           names[op],free_blocks,events,old,committed);
}
static unsigned free_blocks(void) {
    uint32_t total=0,remaining=0;REQUIRE(pfs_space(fs,&total,&remaining)==0);
    REQUIRE(total==NOR_BYTES && !(remaining%NOR_BLOCK));return remaining/NOR_BLOCK;
}
/* Unrelated littlefs data reserves real NOR space. Keep it outside PFS's
 * defined file names so collection and subtree changes cannot remove it. */
static void limit_free(unsigned target) {
    REQUIRE(pfs_unmount(fs)==0);
    lfs_t lfs; REQUIRE(lfs_mount(&lfs,&media.config)==0);
    lfs_file_t file; uint8_t cache[NOR_UNIT],bytes[NOR_BLOCK]={0x4d};
    struct lfs_file_config cfg={.buffer=cache};
    REQUIRE(lfs_file_opencfg(&lfs,&file,"/fixture-pad",LFS_O_CREAT|LFS_O_WRONLY|LFS_O_APPEND,&cfg)==0);
    for (;;) {
        lfs_ssize_t used=lfs_fs_size(&lfs);REQUIRE(used>0 && used<=NOR_BLOCKS);
        if ((unsigned)(NOR_BLOCKS-used)<=target) break;
        REQUIRE(lfs_file_write(&lfs,&file,bytes,sizeof(bytes))==sizeof(bytes));
        REQUIRE(lfs_file_sync(&lfs,&file)==0);
    }
    REQUIRE(lfs_file_close(&lfs,&file)==0 && lfs_unmount(&lfs)==0 && pfs_mount(fs)==0);
}
static void group_lookup_collisions(void) {
    /* These full paths have the same 32-bit FNV-1a hash (944527721). */
    const pfs_small_item_t first={"/test/itk35c4zkp",(const uint8_t *)"one",3};
    const pfs_small_item_t second={"/test/kjfpqm6unl",(const uint8_t *)"two",3};
    const char *const fresh[]={"/test/new0","/test/new1","/test/new2","/test/new3"};
    initialize();
    REQUIRE(pfs_mkdir(fs,"/test")==0);
    REQUIRE(pfs_create_small_group(fs,pfs_generation(fs),&first,1)==0);
    REQUIRE(pfs_create_small_group(fs,pfs_generation(fs),&second,1)==0);
    const uint32_t generation=pfs_generation(fs);
    for (unsigned hit=0;hit<4;hit++) {
        pfs_small_item_t siblings[4];
        for (unsigned i=0;i<4;i++) {
            siblings[i]=first;
            siblings[i].path=i==hit ? second.path : fresh[i];
        }
        REQUIRE(pfs_create_small_group(fs,generation,siblings,4)==LFS_ERR_EXIST);
        REQUIRE(pfs_generation(fs)==generation);
        for (unsigned i=0;i<4;i++) {
            pfs_info_t info;
            REQUIRE(pfs_stat(fs,fresh[i],&info)==LFS_ERR_NOENT);
        }
    }
    /* Validation must report an earlier stored name before a later invalid item. */
    const pfs_small_item_t malformed[]={
        {"/wrong/parent", first.bytes, first.size},
        {NULL, first.bytes, first.size},
        {fresh[3], NULL, 1},
        {fresh[3], first.bytes, 573},
    };
    for (unsigned bad=0;bad<sizeof(malformed)/sizeof(malformed[0]);bad++) {
        for (unsigned pos=1;pos<4;pos++) {
            pfs_small_item_t siblings[4];
            for (unsigned i=0;i<pos;i++)
                siblings[i]=(pfs_small_item_t){fresh[i], first.bytes, first.size};
            siblings[pos]=malformed[bad];
            REQUIRE(pfs_create_small_group(fs,generation,siblings,pos+1)==LFS_ERR_INVAL);
            for (unsigned hit=0;hit<pos;hit++) {
                siblings[hit].path=first.path;
                REQUIRE(pfs_create_small_group(fs,generation,siblings,pos+1)==LFS_ERR_EXIST);
                siblings[hit].path=fresh[hit];
            }
            REQUIRE(pfs_generation(fs)==generation);
        }
    }
    reset_to_disk();
    const pfs_small_item_t *const files[]={&first,&second};
    for (unsigned i=0;i<2;i++) {
        pfs_file_t *file;
        uint8_t bytes[3];
        REQUIRE(pfs_open(fs,files[i]->path,LFS_O_RDONLY,&file)==0);
        REQUIRE(pfs_read(file,bytes,sizeof(bytes))==sizeof(bytes));
        REQUIRE(!memcmp(bytes,files[i]->bytes,sizeof(bytes)) && pfs_close(file)==0);
    }
}
int main(void) {
    group_lookup_collisions();
    initialize();memcpy(saved,media.disk,sizeof(saved));
    unsigned remaining=free_blocks();
    for (unsigned op=0;op<OPERATIONS;op++) exercise((enum operation)op,remaining);
    power_on(saved);limit_free(16);remaining=free_blocks();REQUIRE(remaining>=14 && remaining<=16);
    memcpy(saved,media.disk,sizeof(saved));
    for (unsigned op=0;op<OPERATIONS;op++) exercise((enum operation)op,remaining);
    power_on(saved);limit_free(5);remaining=free_blocks();REQUIRE(remaining<=5);
    memcpy(saved,media.disk,sizeof(saved));
    for (unsigned op=0;op<OPERATIONS;op++) {
        power_on(saved);REQUIRE(mutate((enum operation)op)==LFS_ERR_NOSPC);
        reset_to_disk();verify((enum operation)op,false);
    }
    printf("{\"outOfSpaceCases\":%u,\"freeBlocks\":%u}\n",OPERATIONS,remaining);
    REQUIRE(pfs_destroy(fs)==0);
    for (unsigned i=0;i<32;i++) REQUIRE(!live[i]);
    return 0;
}
