/* Actual LittleFS operations on 512x4096 NOR. Test arrays are host-only.
 * Old/new root attr bytes and complete ballast contents are independent
 * oracles, including reset after every mutating event of root expansion. */
#include "packed_vfs_nor_de344.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static nor_fixture_t nor;
static lfs_t fs;
static unsigned char snapshot[NOR_BYTES], cache[NOR_UNIT], chunk[4096];
static unsigned char previous[128], replacement[128], actual[128];
static jmp_buf jump_target;
static uint32_t sequence, saved_sequence, saved_events, cuts, moves, max_erase, touched;
static unsigned ballast_length;
static struct lfs_file_config file_cfg = {.buffer=cache};

static void attr(unsigned char *p, unsigned value) {
    for (unsigned i=0;i<128;i++) p[i]=(unsigned char)((value>>(8*(i%4)))^(i*37));
}
static unsigned char byte_at(unsigned i) { return (unsigned char)((i*71)^(i>>7)^0xa3); }
static void fill_ballast(unsigned percent) {
    ballast_length=NOR_BYTES*percent/100;
    lfs_file_t file;
    REQUIRE(lfs_file_opencfg(&fs,&file,"ballast",LFS_O_CREAT|LFS_O_WRONLY,&file_cfg)==0);
    for(unsigned pos=0;pos<ballast_length;) {
        unsigned count=ballast_length-pos;
        if(count>sizeof(chunk)) count=sizeof(chunk);
        for(unsigned i=0;i<count;i++) chunk[i]=byte_at(pos+i);
        REQUIRE(lfs_file_write(&fs,&file,chunk,count)==(lfs_ssize_t)count);
        pos+=count;
    }
    REQUIRE(lfs_file_close(&fs,&file)==0);
}
static void verify_ballast(void) {
    lfs_file_t file;
    REQUIRE(lfs_file_opencfg(&fs,&file,"ballast",LFS_O_RDONLY,&file_cfg)==0);
    REQUIRE(lfs_file_size(&fs,&file)==(lfs_soff_t)ballast_length);
    for(unsigned pos=0;pos<ballast_length;) {
        unsigned count=ballast_length-pos;
        if(count>sizeof(chunk)) count=sizeof(chunk);
        REQUIRE(lfs_file_read(&fs,&file,chunk,count)==(lfs_ssize_t)count);
        for(unsigned i=0;i<count;i++) REQUIRE(chunk[i]==byte_at(pos+i));
        pos+=count;
    }
    REQUIRE(lfs_file_close(&fs,&file)==0);
}
static void remount(void) {
    /* Power reset discards fs/caches, not flash. NO_MALLOC has no allocations. */
    memset(&fs,0,sizeof(fs));
    REQUIRE(lfs_mount(&fs,&nor.config)==0);
}
static void fault_replay(void) {
    REQUIRE(saved_events>0 && saved_sequence>0);
    for(int mode=NOR_CUT_AFTER;mode<=NOR_RETURN_IO_BEFORE;mode++) {
        for(uint32_t event=1;event<=saved_events;event++) {
            memcpy(nor.disk,snapshot,sizeof(snapshot));
            nor_disarm(&nor); remount();
            attr(previous,saved_sequence-1); attr(replacement,saved_sequence);
            nor_arm(&nor,(enum nor_fault_mode)mode,event,&jump_target);
            if(!setjmp(jump_target)) {
                /* I/O errors may be retried by LittleFS. Either result must
                 * leave a mountable old-or-new atomic metadata transaction. */
                (void)lfs_setattr(&fs,"/",0x22,replacement,sizeof(replacement));
            }
            REQUIRE(nor.fault_triggered);
            nor_disarm(&nor); remount();
            REQUIRE(lfs_getattr(&fs,"/",0x22,actual,sizeof(actual))==128);
            REQUIRE(!memcmp(actual,previous,128)||!memcmp(actual,replacement,128));
            verify_ballast();
            /* Recovery must also remain writable. */
            REQUIRE(lfs_setattr(&fs,"/",0x22,replacement,128)==0);
            REQUIRE(lfs_unmount(&fs)==0); remount();
            REQUIRE(lfs_getattr(&fs,"/",0x22,actual,128)==128 && !memcmp(actual,replacement,128));
            REQUIRE(lfs_unmount(&fs)==0);
            cuts++;
        }
    }
}
int main(int argc,char **argv) {
    REQUIRE(argc==5);
    unsigned percent=(unsigned)atoi(argv[1]),cycles=(unsigned)atoi(argv[2]);
    unsigned rounds=(unsigned)atoi(argv[3]), expect_move=(unsigned)atoi(argv[4]);
    REQUIRE((percent==60||percent==90) && cycles>0 && rounds>0);
    nor_init(&nor); nor.config.block_cycles=(int32_t)cycles;
    REQUIRE(lfs_format(&fs,&nor.config)==0); remount();
    fill_ballast(percent);
    attr(previous,0); REQUIRE(lfs_setattr(&fs,"/",0x22,previous,128)==0);
    lfs_ssize_t initial_size=lfs_fs_size(&fs);
    REQUIRE(initial_size>(lfs_ssize_t)(NOR_BLOCKS/2));
    if(percent==60) REQUIRE(initial_size<(lfs_ssize_t)(7*NOR_BLOCKS/8));
    else REQUIRE(initial_size>=(lfs_ssize_t)(7*NOR_BLOCKS/8));
    nor_reset_observation(&nor);
    uint32_t total_erases[NOR_BLOCKS]={0};
    for(sequence=1;sequence<=rounds;sequence++) {
        lfs_block_t root0=fs.root[0],root1=fs.root[1];
        /* Keep only the predecessor of the first real expansion. */
        if(!saved_events) memcpy(snapshot,nor.disk,sizeof(snapshot));
        nor_reset_observation(&nor);
        attr(replacement,sequence);
        REQUIRE(lfs_setattr(&fs,"/",0x22,replacement,128)==0);
        for(unsigned b=0;b<NOR_BLOCKS;b++) total_erases[b]+=nor.stats.erase_counts[b];
        /* A reversed pair is a normal compaction, not relocation. */
        if((fs.root[0]!=root0&&fs.root[0]!=root1)||(fs.root[1]!=root0&&fs.root[1]!=root1)) {
            moves++;
            if(!saved_events) {saved_events=nor.stats.event_count;saved_sequence=sequence;}
        }
    }
    for(unsigned b=0;b<NOR_BLOCKS;b++) {
        if(total_erases[b]) touched++;
        if(total_erases[b]>max_erase) max_erase=total_erases[b];
    }
    REQUIRE(lfs_unmount(&fs)==0); remount();
    attr(replacement,rounds);
    REQUIRE(lfs_getattr(&fs,"/",0x22,actual,128)==128 && !memcmp(actual,replacement,128));
    verify_ballast();
    lfs_ssize_t final_size=lfs_fs_size(&fs);
    REQUIRE(final_size>0 && final_size<=(lfs_ssize_t)NOR_BLOCKS);
    REQUIRE(lfs_unmount(&fs)==0);
    REQUIRE(expect_move ? moves>0 : moves==0);
    if(expect_move) {REQUIRE(touched>2);fault_replay();}
    printf("{\"passed\":true,\"percent\":%u,\"blockCycles\":%u,\"transactions\":%u,\"initialBlocks\":%ld,\"finalBlocks\":%ld,\"rootMoves\":%u,\"eraseBlocks\":%u,\"maxErases\":%u,\"expansionEvents\":%u,\"faultCases\":%u,\"pointerBytes\":%zu}\n",
        percent,cycles,rounds,(long)initial_size,(long)final_size,moves,touched,max_erase,saved_events,cuts,sizeof(void*));
    return 0;
}
