/* Offline integration: exact PackedFS, VFS adapter and persistence path.
 * Only physical SPI NOR and malloc are host substitutes. */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>
#include "packed_vfs_nor_de344.h"
#include "hal_spi_flash.h"

static nor_fixture_t media;
static uint8_t saved[NOR_BYTES];
static void *owners[128];
static size_t sizes[128], live, peak;
static unsigned alloc_calls, fail_at, cases, fault_cases, old_states, new_states;
static unsigned read_calls, read_fail_at, read_fault_cases;
static uint8_t old_data[2048], new_data[2048], check[4096], meta[128];
void *mui_mem_malloc(size_t size) {
    ++alloc_calls;
    if (alloc_calls==fail_at || size>18432-live) return NULL;
    for(unsigned i=0;i<128;i++)if(!owners[i]){
        void *p=malloc(size?size:1);REQUIRE(p);owners[i]=p;sizes[i]=size;live+=size;
        if(live>peak)peak=live;return p;
    }
    REQUIRE(0);return NULL;
}
void mui_mem_free(void *p) {
    if(!p)return;
    for(unsigned i=0;i<128;i++)if(owners[i]==p){live-=sizes[i];free(p);owners[i]=NULL;return;}
    REQUIRE(0);
}
uint32_t hal_spi_flash_init(void){return 0;}
uint32_t hal_spi_flash_info(flash_info_t *out){*out=(flash_info_t){4096,512,256};return 0;}
uint32_t hal_spi_flash_read(uint32_t at,void *p,size_t n){if(++read_calls==read_fail_at)return 1;return (uint32_t)media.config.read(&media.config,at/4096,at%4096,p,n);}
uint32_t hal_spi_flash_prog(uint32_t at,const void *p,size_t n){return (uint32_t)media.config.prog(&media.config,at/4096,at%4096,p,n);}
uint32_t hal_spi_flash_erase(uint32_t at){return (uint32_t)media.config.erase(&media.config,at/4096);}
void vfs_packed_latch_recovery(void){}
#include STORE_CORE
#include STORE_ADAPTER

static vfs_driver_t *driver(void){return (vfs_driver_t *)&vfs_driver_fs;}
static void drop(void){
    REQUIRE(vfs_packed_handles_idle());REQUIRE(!vfs_persist_active(driver()));
    REQUIRE(driver()->umount()==0);REQUIRE(pfs_destroy(store)==0);store=NULL;REQUIRE(live==0);
}
static void baseline(void){
    fail_at=0;nor_disarm(&media);nor_init(&media);REQUIRE(driver()->format()==0);
    uint8_t identity[32]={1};REQUIRE(vfs_packed_bind_import(identity)==0);
    REQUIRE(vfs_persist_write_meta(driver(),"/saved",old_data,sizeof(old_data),meta)==sizeof(old_data));
    REQUIRE(vfs_packed_finish_import()==0);REQUIRE(pfs_gc(store)==0);drop();
    memcpy(saved,media.disk,sizeof(saved));
}
static void reset_baseline(void){
    if(store)drop();fail_at=0;nor_disarm(&media);memcpy(media.disk,saved,sizeof(saved));
    nor_reset_observation(&media);REQUIRE(driver()->mount()==0);REQUIRE(vfs_packed_handles_idle());
}
static unsigned state(void){
    fail_at=0;int n=driver()->read_file_data("/saved",check,sizeof(check));REQUIRE(n==2048);
    vfs_obj_t info;REQUIRE(driver()->stat_file("/saved",&info)==0);REQUIRE(!memcmp(info.meta,meta,128));
    if(!memcmp(check,old_data,2048))return 0;
    REQUIRE(!memcmp(check,new_data,2048));return 1;
}
static void boundary_api(void){
    reset_baseline();size_t initial=live;vfs_file_t f={0};vfs_dir_t d={0};
    const char *invalid[]={"", "relative", "/", "/a/", "/a//b", "/a/../b", "/a/./b"};
    for(unsigned i=0;i<sizeof(invalid)/sizeof(*invalid);i++){
        REQUIRE(driver()->open_file(invalid[i],&f,VFS_MODE_CREATE|VFS_MODE_WRITEONLY)<0);REQUIRE(!f.handle);
        REQUIRE(vfs_packed_handles_idle());REQUIRE(live==initial);cases++;
    }
    for(unsigned n=0;n<=2049;n+=(n<1?1:n<2048?2047:1)){
        int r=vfs_persist_write(driver(),"/boundary",new_data,n);
        if(n<=2048){REQUIRE(r==(int)n);REQUIRE(driver()->read_file_data("/boundary",check,sizeof(check))==(int)n);REQUIRE(!memcmp(check,new_data,n));}
        else REQUIRE(r==VFS_ERR_UNSUPT);
        REQUIRE(vfs_packed_handles_idle());REQUIRE(live==initial);cases++;
    }
    for(unsigned n=0;n<=129;n+=(n==0?127:1)){
        int r=driver()->update_file_meta("/saved",meta,n);REQUIRE(r==(n<=128?0:VFS_ERR_FAIL));
        REQUIRE(live==initial);cases++;
    }
    REQUIRE(driver()->open_file("/saved",&f,VFS_MODE_READONLY)==0);
    REQUIRE(driver()->read_file(&f,NULL,1)==VFS_ERR_FAIL);
    REQUIRE(driver()->read_file(&f,check,(size_t)INT32_MAX+1)==VFS_ERR_FAIL);
    REQUIRE(driver()->write_file(&f,check,1)<0);REQUIRE(driver()->close_file(&f)==0);REQUIRE(!f.handle);
    REQUIRE(driver()->close_file(&f)<0);REQUIRE(driver()->abort_file(&f)==0);
    REQUIRE(driver()->open_dir("/",&d)==0);REQUIRE(driver()->umount()<0);REQUIRE(driver()->format()<0);
    REQUIRE(driver()->close_dir(&d)==0);REQUIRE(!d.handle);REQUIRE(live==initial);cases+=8;
    puts("PASS VFS paths, lengths0/1/2048/2049, raw128 bounds, readonly and lifecycle");
}
static void handles(void){
    reset_baseline();size_t initial=live;vfs_file_t files[9]={0};vfs_dir_t dirs[9]={0};
    for(unsigned split=0;split<=8;split++){
        for(unsigned i=0;i<split;i++)REQUIRE(driver()->open_file("/saved",&files[i],VFS_MODE_READONLY)==0);
        for(unsigned i=split;i<8;i++)REQUIRE(driver()->open_dir("/",&dirs[i])==0);
        REQUIRE(driver()->open_file("/saved",&files[8],VFS_MODE_READONLY)<0);REQUIRE(!files[8].handle);
        REQUIRE(driver()->open_dir("/",&dirs[8])<0);REQUIRE(!dirs[8].handle);
        REQUIRE(driver()->umount()<0);REQUIRE(driver()->format()<0);
        for(unsigned i=0;i<split;i++)REQUIRE(driver()->close_file(&files[i])==0);
        for(unsigned i=split;i<8;i++)REQUIRE(driver()->close_dir(&dirs[i])==0);
        REQUIRE(vfs_packed_handles_idle());REQUIRE(live==initial);cases++;
    }
    REQUIRE(driver()->open_file("/saved",&files[0],VFS_MODE_WRITEONLY|VFS_MODE_TRUNC)==0);
    REQUIRE(driver()->write_file(&files[0],new_data,2048)==2048);
    REQUIRE(vfs_persist_write(driver(),"/saved",old_data,2048)<0);
    REQUIRE(driver()->open_file("/second",&files[1],VFS_MODE_CREATE|VFS_MODE_WRITEONLY)<0);
    REQUIRE(driver()->open_file("/saved",&files[1],VFS_MODE_READONLY)==0);
    REQUIRE(driver()->read_file(&files[1],check,2048)==2048);REQUIRE(!memcmp(check,old_data,2048));
    REQUIRE(driver()->abort_file(&files[0])==0);REQUIRE(driver()->close_file(&files[1])==0);
    REQUIRE(vfs_persist_write(driver(),"/saved",new_data,2048)==2048);
    REQUIRE(live==initial);cases++;puts("PASS mixed8-handle boundary, pinned reader and external-writer ownership");
}
static void oom(void){
    reset_baseline();alloc_calls=0;REQUIRE(vfs_persist_write(driver(),"/saved",new_data,2048)==2048);
    unsigned attempts=alloc_calls;REQUIRE(attempts>2);
    for(unsigned nth=1;nth<=attempts;nth++){
        reset_baseline();size_t initial=live;alloc_calls=0;fail_at=nth;
        int r=vfs_persist_write(driver(),"/saved",new_data,2048);REQUIRE(r<0);fail_at=0;
        REQUIRE(!vfs_persist_active(driver()));REQUIRE(vfs_packed_handles_idle());REQUIRE(live==initial);
        unsigned present=state();old_states+=!present;new_states+=present;
        REQUIRE(vfs_persist_write(driver(),"/saved",new_data,2048)==2048);REQUIRE(state()==1);
        REQUIRE(live==initial);cases++;
    }
    for(unsigned kind=0;kind<3;kind++){
        reset_baseline();size_t initial=live;alloc_calls=0;fail_at=1;
        vfs_file_t f={0};vfs_dir_t d={0};
        int r=kind==0?driver()->open_dir("/",&d):driver()->open_file("/saved",&f,kind==1?VFS_MODE_READONLY:VFS_MODE_WRITEONLY);
        REQUIRE(r==VFS_ERR_NOMEM);REQUIRE(!f.handle&&!d.handle);fail_at=0;
        REQUIRE(vfs_packed_handles_idle());REQUIRE(live==initial);cases++;
    }
    printf("PASS one-shot OOM at all%u persistence allocations; old/new committed state and retry remain valid\n",attempts);
}
static void fault_io(void){
    reset_baseline();nor_reset_observation(&media);REQUIRE(vfs_persist_write(driver(),"/saved",new_data,2048)==2048);
    unsigned count=media.stats.event_count;REQUIRE(count>1&&count<1000);
    for(unsigned nth=1;nth<=count;nth++){
        reset_baseline();size_t initial=live;nor_arm(&media,NOR_RETURN_IO_BEFORE,nth,NULL);
        int r=vfs_persist_write(driver(),"/saved",new_data,2048);
        REQUIRE(media.fault_triggered);REQUIRE(r<0);nor_disarm(&media);
        REQUIRE(!vfs_persist_active(driver()));REQUIRE(vfs_packed_handles_idle());REQUIRE(live==initial);
        drop();REQUIRE(driver()->mount()==0);unsigned present=state();old_states+=!present;new_states+=present;
        REQUIRE(vfs_persist_write(driver(),"/saved",new_data,2048)==2048);REQUIRE(state()==1);
        fault_cases++;
    }
    printf("PASS I/O failures at all%u program/erase calls, no handle leak and exact old/new after remount\n",count);
}
static void fault_read(void){
    reset_baseline();read_calls=0;REQUIRE(vfs_persist_write(driver(),"/saved",new_data,2048)==2048);
    unsigned count=read_calls;REQUIRE(count>1&&count<1000);
    for(unsigned nth=1;nth<=count;nth++){
        reset_baseline();size_t initial=live;read_calls=0;read_fail_at=nth;
        int r=vfs_persist_write(driver(),"/saved",new_data,2048);
        REQUIRE(read_calls>=read_fail_at);REQUIRE(r<0);read_fail_at=0;
        REQUIRE(!vfs_persist_active(driver()));REQUIRE(vfs_packed_handles_idle());REQUIRE(live==initial);
        drop();REQUIRE(driver()->mount()==0);unsigned present=state();old_states+=!present;new_states+=present;
        REQUIRE(vfs_persist_write(driver(),"/saved",new_data,2048)==2048);REQUIRE(state()==1);
        read_fault_cases++;
    }
    printf("PASS read I/O failures at all%u calls; no stranded owner, no partial data/raw128 after remount\n",count);
}
static void mount_oom(void){
    for (unsigned i = 1; i <= 2; ++i) {
        reset_baseline();drop();REQUIRE(configure()==0);size_t initial=live;
        alloc_calls=0;fail_at=i;unsigned writes=media.stats.event_count;
        REQUIRE(driver()->mount()==0);REQUIRE(alloc_calls==2);fail_at=0;
        REQUIRE(media.stats.event_count==writes);REQUIRE(live==initial);REQUIRE(state()==0);cases++;
    }
    puts("PASS either mount cache or index allocation may fail without skipped validation, writes or leaks");
}

static void mount_io(void) {
    reset_baseline();
    char path[20];
    for (unsigned i = 0; i < 100; ++i) {
        snprintf(path, sizeof(path), "/figure%03u.bin", i);
        REQUIRE(pfs_replace(store, path, new_data, 540, meta) == 540);
    }
    drop();
    REQUIRE(configure() == 0);
    nor_reset_observation(&media);
    REQUIRE(pfs_mount(store) == 0); /* Same production scanner without the adapter's cache. */
    uint64_t uncached = media.stats.reads;
    REQUIRE(!media.stats.programs && !media.stats.erases);
    drop();
    nor_reset_observation(&media);
    REQUIRE(driver()->mount() == 0);
    REQUIRE(!media.stats.programs && !media.stats.erases && !mount_pages);
    REQUIRE(media.stats.reads < uncached);
    printf("BENCH same 100-figure cold mount: %llu uncached vs %llu physical reads of 256 bytes\n",
           (unsigned long long)uncached, (unsigned long long)media.stats.reads);
    for (unsigned i = 0; i < 100; ++i) {
        snprintf(path, sizeof(path), "/figure%03u.bin", i);
        vfs_obj_t obj;
        REQUIRE(driver()->stat_file(path, &obj) == 0 && !memcmp(obj.meta, meta, sizeof(meta)));
        REQUIRE(driver()->read_file_data(path, check, sizeof(check)) == 540 && !memcmp(check, new_data, 540));
    }
    drop();
    read_calls = 0;
    read_fail_at = 1;
    REQUIRE(driver()->mount() != 0 && !mount_pages);
    read_fail_at = 0;
    REQUIRE(driver()->mount() == 0 && !mount_pages);
}

/* Create a genuine old journal record on the synthetic NOR. The canonical
 * bytes may agree with the incoming save before recovery, but differ after. */
static void pending_replacement(const char *path, const uint8_t tag[540]) {
    uint8_t record[212 + 540] = {0}, pending[80] = {0};
    put32(record, 0x31524750u);
    put32(record + 4, 1);
    put32(record + 8, 540);
    put32(record + 12, ~crc(~0u, tag, 540));
    memcpy(record + 16, path, strlen(path) + 1);
    memcpy(record + 80, meta, sizeof(meta));
    put32(record + 208, ~crc(~0u, record, 208));
    memcpy(record + 212, tag, 540);
    put32(pending, 0x31545050u);
    memcpy(pending + 8, record + 208, 4);
    memcpy(pending + 12, path, strlen(path) + 1);
    put32(pending + 76, ~crc(~0u, pending, 76));
    REQUIRE(pfs_replace(store, "/.pixl_txn_new", record, sizeof(record), NULL) == sizeof(record));
    REQUIRE(pfs_replace(store, "/.pixl_txn_pending", pending, sizeof(pending), NULL) == sizeof(pending));
}

static void recovery_before_compare(void) {
    const char *path = "/tag.bin";
    for (unsigned requested_old = 0; requested_old <= 1; ++requested_old) {
        reset_baseline();
        REQUIRE(vfs_persist_write_meta(driver(), path, old_data, 540, meta) == 540);
        pending_replacement(path, new_data);
        const uint8_t *requested = requested_old ? old_data : new_data;
        REQUIRE(vfs_persist_write(driver(), path, requested, 540) == 540);
        REQUIRE(driver()->read_file_data(path, check, sizeof(check)) == 540 && !memcmp(check, requested, 540));
        vfs_obj_t obj;
        REQUIRE(driver()->stat_file(path, &obj) == VFS_OK && !memcmp(obj.meta, meta, sizeof(meta)));
        REQUIRE(driver()->stat_file("/.pixl_txn_pending", &obj) == VFS_ERR_NOOBJ);
    }
}

static void repeated_saves(void) {
    reset_baseline();
    const char *path = "/tag.bin";
    uint8_t tag[540], changed_meta[128];
    memcpy(tag, old_data, sizeof(tag));
    memcpy(changed_meta, meta, sizeof(meta));
    REQUIRE(vfs_persist_write_meta(driver(), path, tag, sizeof(tag), meta) == sizeof(tag));
    uint64_t original_revision = vfs_packed_revision();
    nor_reset_observation(&media);
    for (unsigned i = 0; i < 100; ++i) {
        REQUIRE(vfs_persist_write_meta(driver(), path, tag, sizeof(tag), i % 2 ? meta : NULL) == sizeof(tag));
    }
    REQUIRE(media.stats.programs == 0 && media.stats.erases == 0);
    REQUIRE(vfs_packed_revision() == original_revision);
    uint64_t equal_reads = media.stats.reads;
    nor_reset_observation(&media);
    for (unsigned i = 0; i < 100; ++i) {
        ++tag[sizeof(tag)-1]; /* Differ only in the final partial comparison buffer. */
        REQUIRE(vfs_persist_write(driver(), path, tag, sizeof(tag)) == sizeof(tag));
    }
    REQUIRE(media.stats.programs >= 100 && media.stats.erases > 0);
    printf("BENCH 100 identical NTAG saves: %llu reads, 0 programs, 0 erases; 100 changed: %llu reads, %llu programs, %llu erases\n",
        (unsigned long long)equal_reads, (unsigned long long)media.stats.reads,
        (unsigned long long)media.stats.programs, (unsigned long long)media.stats.erases);
    original_revision = vfs_packed_revision();
    changed_meta[127] ^= 1;
    REQUIRE(vfs_persist_write_meta(driver(), path, tag, sizeof(tag), changed_meta) == sizeof(tag));
    REQUIRE(vfs_packed_revision() != original_revision);
    drop(); REQUIRE(driver()->mount() == 0);
    vfs_obj_t obj;
    REQUIRE(driver()->stat_file(path, &obj) == 0 && !memcmp(obj.meta, changed_meta, sizeof(meta)));
    REQUIRE(driver()->read_file_data(path, check, sizeof(check)) == sizeof(tag) && !memcmp(check, tag, sizeof(tag)));
    nor_reset_observation(&media);
    REQUIRE(vfs_persist_write_meta(driver(), path, tag, sizeof(tag), changed_meta) == sizeof(tag));
    REQUIRE(media.stats.programs == 0 && media.stats.erases == 0);
    /* An invalid legacy pending marker must stop even an identical save. */
    uint8_t bad_marker[8] = {0};
    REQUIRE(pfs_replace(store, "/.pixl_txn_pending", bad_marker, sizeof(bad_marker), NULL) == sizeof(bad_marker));
    REQUIRE(vfs_persist_write(driver(), path, tag, sizeof(tag)) == VFS_ERR_CRPT);
}
int main(void){
    for(unsigned i=0;i<2048;i++){old_data[i]=(uint8_t)(i*7+3);new_data[i]=(uint8_t)(i*13+5);}
    for(unsigned i=0;i<128;i++)meta[i]=(uint8_t)(i*9+17);
    baseline();boundary_api();handles();oom();fault_io();fault_read();mount_oom();mount_io();repeated_saves();recovery_before_compare();drop();
    printf("{\"passed\":true,\"pointerBytes\":%zu,\"cases\":%u,\"faultCases\":%u,\"readFaultCases\":%u,\"peakRequestedHeap\":%zu,\"oldStates\":%u,\"newStates\":%u,\"liveAtEnd\":%zu}\n",sizeof(void*),cases,fault_cases,read_fault_cases,peak,old_states,new_states,live);
    return 0;
}

