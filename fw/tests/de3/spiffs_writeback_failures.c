#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stddef.h>
#include <stdalign.h>
#include "spiffs.h"
#include "spiffs_nucleus.h"

/* Actual SPIFFS/config, synthetic NOR; no device access or user data. */
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"FAIL line %d: %s\n",__LINE__,#x); exit(1); } } while (0)
#define CAPACITY (4u * 1024u * 1024u)
enum { FAULT = -12345 };
static spiffs fs;
static uint8_t flash[CAPACITY], work[512];
static alignas(max_align_t) uint8_t fds[8 * sizeof(spiffs_fd)], cache[(256+32)*4];
static unsigned writes, fail_at, partial_bytes, failures, permanent, cases, unsuccessful_retries;
static uint8_t initial[128], patch[20], extra[256];
static int32_t hal_read(uint32_t address, uint32_t size, uint8_t *data) {
    CHECK(address <= CAPACITY && size <= CAPACITY-address);
    memcpy(data,flash+address,size); return 0;
}
static int32_t hal_write(uint32_t address, uint32_t size, uint8_t *data) {
    CHECK(address <= CAPACITY && size <= CAPACITY-address);
    CHECK(!size || size <= 256u-(address&255u));
    ++writes;
    int bad = permanent || (fail_at && writes==fail_at);
    uint32_t n = bad && partial_bytes < size ? partial_bytes : size;
    for (uint32_t i=0;i<n;i++) flash[address+i] &= data[i];
    if (bad) { ++failures; return FAULT; }
    return 0;
}
static int32_t hal_erase(uint32_t address, uint32_t size) {
    CHECK(address <= CAPACITY && size <= CAPACITY-address);
    CHECK(!(address&4095u) && size==4096);
    memset(flash+address,255,size); return 0;
}
static void reset(void) {
    memset(&fs,0,sizeof fs); memset(flash,255,sizeof flash);
    writes=fail_at=partial_bytes=failures=permanent=0;
    spiffs_config cfg={0}; cfg.phys_size=CAPACITY; cfg.phys_erase_block=4096;
    cfg.log_block_size=4096; cfg.log_page_size=256;
    cfg.hal_read_f=hal_read; cfg.hal_write_f=hal_write; cfg.hal_erase_f=hal_erase;
    (void)SPIFFS_mount(&fs,&cfg,work,fds,sizeof fds,cache,sizeof cache,NULL);
    SPIFFS_unmount(&fs); CHECK(SPIFFS_format(&fs)==0);
    CHECK(SPIFFS_mount(&fs,&cfg,work,fds,sizeof fds,cache,sizeof cache,NULL)==0);
}
static spiffs_file prepare(int empty) {
    reset();
    spiffs_file f=SPIFFS_open(&fs,"/probe.bin",SPIFFS_CREAT|SPIFFS_RDWR|SPIFFS_O_DIRECT,0);
    CHECK(f>=0);
    if (!empty) CHECK(SPIFFS_write(&fs,f,initial,sizeof initial)==sizeof initial);
    CHECK(SPIFFS_close(&fs,f)==0);
    f=SPIFFS_open(&fs,"/probe.bin",SPIFFS_RDWR,0); CHECK(f>=0);
    CHECK(SPIFFS_write(&fs,f,patch,sizeof patch)==sizeof patch);
    return f;
}
static spiffs_fd *descriptor(spiffs_file f) {
    spiffs_fd *fd=NULL; CHECK(spiffs_fd_get(&fs,SPIFFS_FH_UNOFFS(&fs,f),&fd)==0); return fd;
}
static void verify(const uint8_t *expected, size_t size) {
    uint8_t actual[300]; CHECK(size < sizeof actual);
    spiffs_stat st; CHECK(SPIFFS_stat(&fs,"/probe.bin",&st)==0 && st.size==size);
    spiffs_file f=SPIFFS_open(&fs,"/probe.bin",SPIFFS_RDONLY,0); CHECK(f>=0);
    int n=SPIFFS_read(&fs,f,actual,sizeof actual); CHECK(n==(int)size);
    CHECK(!memcmp(actual,expected,size)); CHECK(SPIFFS_close(&fs,f)==0);
}
enum { OP_CLOSE, OP_FLUSH, OP_READ, OP_SEEK, OP_STAT, OP_TRUNCATE, OP_BOUNDARY, OP_LARGE, OP_COUNT };
static const char *names[]={"close","flush","read","seek","stat","truncate","boundary-write","large-write"};
static int operation(spiffs_file f, unsigned op) {
    uint8_t bytes[4]; spiffs_stat st;
    switch(op) {
    case OP_CLOSE: return SPIFFS_close(&fs,f);
    case OP_FLUSH: return SPIFFS_fflush(&fs,f);
    case OP_READ: return SPIFFS_read(&fs,f,bytes,sizeof bytes);
    case OP_SEEK: return SPIFFS_lseek(&fs,f,0,SPIFFS_SEEK_SET);
    case OP_STAT: return SPIFFS_fstat(&fs,f,&st);
    case OP_TRUNCATE: return SPIFFS_ftruncate(&fs,f,20);
    case OP_BOUNDARY: return SPIFFS_write(&fs,f,extra,240);
    default: return SPIFFS_write(&fs,f,extra,256);
    }
}
static unsigned flush_programs(void) {
    spiffs_file f=prepare(0); unsigned begin=writes;
    int result=SPIFFS_fflush(&fs,f);
    if(result<0)fprintf(stderr,"clean flush result=%d faults=%u writes=%u\n",result,failures,writes-begin);
    CHECK(result>=0); unsigned count=writes-begin;
    CHECK(count && SPIFFS_close(&fs,f)==0); return count;
}
static void retry_case(unsigned op,unsigned nth,unsigned partial) {
    spiffs_file f=prepare(0); fail_at=writes+nth; partial_bytes=partial;
    int result=operation(f,op);
    if (result!=FAULT) fprintf(stderr,"operation=%s nth=%u partial=%u result=%d failures=%u\n",names[op],nth,partial,result,failures);
    CHECK(result==FAULT && failures==1);
    spiffs_fd *fd=descriptor(f);
    CHECK(fd->cache_page && fd->cache_page->size==sizeof patch);
    CHECK(fd->fdoffset==sizeof patch);
    /* One injected failure, then an explicit caller retry, no background loop. */
    fail_at=0; int retry=operation(f,op);
    if (retry<0) {
        /* A partial metadata program can leave an invalid page. Preserving
         * buffered bytes cannot make arbitrary NOR corruption transactional.
         * It must remain an error and allow bounded, write-free abandonment. */
        CHECK(descriptor(f)->cache_page);
#ifdef HAS_SPIFFS_ABORT
        unsigned before=writes; CHECK(SPIFFS_abort(&fs,f)==0 && writes==before);
#endif
        ++unsuccessful_retries; ++cases; return;
    }
    if (op!=OP_CLOSE) CHECK(SPIFFS_close(&fs,f)==0);
    uint8_t expected[276]; memcpy(expected,initial,sizeof initial); memcpy(expected,patch,sizeof patch);
    size_t size=sizeof initial;
    if (op==OP_TRUNCATE) size=20;
    if (op==OP_BOUNDARY || op==OP_LARGE) {
        size=20+(op==OP_BOUNDARY?240:256); memcpy(expected+20,extra,size-20);
    }
    verify(expected,size); ++cases;
}
static void empty_close_retry(void) {
    spiffs_file f=prepare(1); fail_at=writes+1;
    CHECK(SPIFFS_close(&fs,f)==FAULT);
    CHECK(SPIFFS_close(&fs,f)==0); verify(patch,sizeof patch); ++cases;
}
#ifdef HAS_SPIFFS_ABORT
static void abort_cases(void) {
    for (unsigned partial=0;partial<=4;partial+=4) {
        spiffs_file f=prepare(0); permanent=1; partial_bytes=partial;
        CHECK(SPIFFS_close(&fs,f)==FAULT); CHECK(SPIFFS_close(&fs,f)==FAULT);
        unsigned before=writes; CHECK(SPIFFS_abort(&fs,f)==0 && writes==before);
        CHECK(SPIFFS_abort(&fs,f)<0 && SPIFFS_close(&fs,f)<0 && writes==before);
        permanent=0;
        spiffs_file opened[8];
        for (unsigned i=0;i<fs.fd_count;++i) { opened[i]=SPIFFS_open(&fs,"/probe.bin",SPIFFS_RDONLY,0); CHECK(opened[i]>=0); }
        CHECK(SPIFFS_open(&fs,"/probe.bin",SPIFFS_RDONLY,0)==SPIFFS_ERR_OUT_OF_FILE_DESCS);
        for (unsigned i=0;i<fs.fd_count;++i) CHECK(SPIFFS_close(&fs,opened[i])==0);
        /* Before-write failure preserves old content. Partial program failure
         * offers no rollback promise; only abort resource/no-write semantics. */
        if (!partial) verify(initial,sizeof initial);
        ++cases;
    }
    /* A second open handle may not have resolved the shared cache yet. */
    for (unsigned second_flags=SPIFFS_RDONLY;second_flags<=SPIFFS_RDWR;++second_flags) {
        if(second_flags!=SPIFFS_RDONLY && second_flags!=SPIFFS_RDWR) continue;
        spiffs_file first=prepare(0);
        spiffs_file second=SPIFFS_open(&fs,"/probe.bin",second_flags,0); CHECK(second>=0);
        fail_at=writes+1; CHECK(SPIFFS_close(&fs,first)==FAULT);
        unsigned before=writes; CHECK(SPIFFS_abort(&fs,first)==0 && writes==before);
        CHECK(descriptor(second)->cache_page && descriptor(second)->cache_page->size==20);
        CHECK(SPIFFS_close(&fs,second)==0);
        uint8_t expected[128]; memcpy(expected,initial,sizeof expected); memcpy(expected,patch,sizeof patch);
        verify(expected,sizeof expected); ++cases;
    }
    /* Both writers contribute to the same object cache. Aborting either one
     * cannot selectively undo its bytes or discard the surviving writer's. */
    for(unsigned abort_second=0;abort_second<2;++abort_second) {
        spiffs_file first=prepare(0);
        spiffs_file second=SPIFFS_open(&fs,"/probe.bin",SPIFFS_RDWR,0); CHECK(second>=0);
        CHECK(SPIFFS_write(&fs,second,extra,10)==10);
        unsigned before=writes;
        CHECK(SPIFFS_abort(&fs,abort_second?second:first)==0 && writes==before);
        CHECK(SPIFFS_close(&fs,abort_second?first:second)==0);
        uint8_t expected[128]; memcpy(expected,initial,sizeof expected);
        memcpy(expected,patch,sizeof patch); memcpy(expected,extra,10);
        verify(expected,sizeof expected); ++cases;
    }
    spiffs_file first=prepare(0), second=SPIFFS_open(&fs,"/probe.bin",SPIFFS_RDWR,0); CHECK(second>=0);
    CHECK(SPIFFS_write(&fs,second,patch,sizeof patch)==sizeof patch);
    unsigned before=writes; CHECK(SPIFFS_abort(&fs,first)==0 && writes==before);
    CHECK(SPIFFS_abort(&fs,second)==0 && writes==before);
    verify(initial,sizeof initial); ++cases;
}
#endif
int main(void) {
    for(unsigned i=0;i<sizeof initial;i++)initial[i]=(uint8_t)(i*7+3);
    memset(patch,0x55,sizeof patch); memset(extra,0x42,sizeof extra);
    empty_close_retry();
    unsigned count=flush_programs();
    for(unsigned op=0;op<OP_COUNT;++op) for(unsigned nth=1;nth<=count;++nth) {
        retry_case(op,nth,0); retry_case(op,nth,1); retry_case(op,nth,4);
    }
#ifdef HAS_SPIFFS_ABORT
    abort_cases();
#endif
    printf("PASS %u writeback fault cases; %u NOR program points per flush; %u metadata faults remained errors and were explicitly aborted\n",cases,count,unsuccessful_retries);
    return 0;
}
