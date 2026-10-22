#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include <stddef.h>
#include "spiffs.h"
#include "spiffs_nucleus.h"

/* Real SPIFFS code/configuration; only the physical NOR device is modelled.
 * Optional images are synthetic temporary fixtures; no device access. */
static spiffs fs;
static uint8_t *flash;
static uint32_t capacity, rejected, crossings, writes, reads, erases, max_write;
static uint8_t work[512], fds[128], cache[(256+32)*4];
static int valid(uint32_t addr, uint32_t len) {
    return addr <= capacity && len <= capacity-addr &&
           addr <= 0x1000000u && len <= 0x1000000u-addr;
}
static int32_t read_flash(uint32_t addr, uint32_t len, uint8_t *data) {
    if (!valid(addr,len)) { rejected++; return SPIFFS_ERR_INTERNAL; }
    reads++; memcpy(data,flash+addr,len); return 0;
}
static int32_t write_flash(uint32_t addr, uint32_t len, uint8_t *data) {
    if (!valid(addr,len)) { rejected++; return SPIFFS_ERR_INTERNAL; }
    if (len && len > 256u-(addr&255u)) { crossings++; return SPIFFS_ERR_INTERNAL; }
    writes++; if (len>max_write) max_write=len;
    for (uint32_t i=0;i<len;i++) flash[addr+i]&=data[i];
    return 0;
}
static int32_t erase_flash(uint32_t addr, uint32_t len) {
    if (!valid(addr,len)) { rejected++; return SPIFFS_ERR_INTERNAL; }
    assert((addr&4095u)==0 && len==4096); erases++;
    memset(flash+addr,255,len); return 0;
}
static int32_t mount_fs(void) {
    spiffs_config cfg={0}; cfg.phys_size=capacity; cfg.phys_addr=0;
    cfg.phys_erase_block=4096; cfg.log_block_size=4096; cfg.log_page_size=256;
    cfg.hal_read_f=read_flash; cfg.hal_write_f=write_flash; cfg.hal_erase_f=erase_flash;
    return SPIFFS_mount(&fs,&cfg,work,fds,sizeof(fds),cache,sizeof(cache),NULL);
}
static void pattern(uint8_t *data,size_t n,unsigned id,unsigned generation) {
    for(size_t i=0;i<n;i++) data[i]=(uint8_t)(id*29+generation*31+i*17);
}
static void save(unsigned id,unsigned generation) {
    char path[64]; uint8_t data[540],meta[128];
    snprintf(path,sizeof(path),"/A2026/figure%03u.bin",id);
    pattern(data,sizeof(data),id,generation); pattern(meta,sizeof(meta),id,0);
    spiffs_file f=SPIFFS_open(&fs,path,SPIFFS_CREAT|SPIFFS_TRUNC|SPIFFS_WRONLY,0);
    assert(f>=0);
    /* browser-like fragments plus a final short frame */
    for(unsigned i=0;i<sizeof(data);i+=233) {
        unsigned n=sizeof(data)-i; if(n>233)n=233;
        assert(SPIFFS_write(&fs,f,data+i,n)==(int)n);
    }
    assert(SPIFFS_close(&fs,f)==0);
    assert(SPIFFS_update_meta(&fs,path,meta)==0);
}
static void check(unsigned id,unsigned generation) {
    char path[64]; uint8_t actual[541],expected[540],meta[128]; spiffs_stat st;
    snprintf(path,sizeof(path),"/A2026/figure%03u.bin",id);
    spiffs_file f=SPIFFS_open(&fs,path,SPIFFS_RDONLY,0);
    if(f<0)fprintf(stderr,"open failed: %s, result %d, errno %d\n",path,f,SPIFFS_errno(&fs));
    assert(f>=0);
    assert(SPIFFS_read(&fs,f,actual,sizeof(actual))==540);
    assert(SPIFFS_close(&fs,f)==0);
    pattern(expected,sizeof(expected),id,generation); assert(!memcmp(actual,expected,540));
    assert(SPIFFS_stat(&fs,path,&st)==0 && st.size==540);
    pattern(meta,sizeof(meta),id,0); assert(!memcmp(st.meta,meta,128));
}
static void image_io(const char *path, int writing) {
    FILE *file=fopen(path,writing?"wb":"rb"); assert(file);
    size_t n=writing?fwrite(flash,1,capacity,file):fread(flash,1,capacity,file);
    assert(n==capacity && fclose(file)==0);
}
static void damaged_name(void) {
    const char *path="/A2026/figure000.bin";
    spiffs_stat st; assert(SPIFFS_stat(&fs,path,&st)==0);
    uint32_t address=(uint32_t)st.pix*256u + offsetof(spiffs_page_object_ix_header,name);
    uint8_t original[SPIFFS_OBJ_NAME_LEN]; memcpy(original,flash+address,sizeof(original));
    SPIFFS_unmount(&fs);
    /* Simulated damaged metadata, not a normal NOR write. No terminated alias. */
    memset(flash+address,'X',sizeof(original)); assert(mount_fs()==0);
    spiffs_DIR dir; struct {struct spiffs_dirent ent; uint8_t canary[32];} out;
    memset(&out,0xa5,sizeof(out)); SPIFFS_clearerr(&fs);
    assert(SPIFFS_opendir(&fs,"/",&dir));
    unsigned count=0; while(SPIFFS_readdir(&dir,&out.ent))assert(++count<=950);
    assert(SPIFFS_errno(&fs)==SPIFFS_ERR_NAME_TOO_LONG);
    for(unsigned i=0;i<sizeof(out.canary);i++)assert(out.canary[i]==0xa5);
    assert(SPIFFS_closedir(&dir)==0);
    assert(SPIFFS_stat(&fs,path,&st)==SPIFFS_ERR_NAME_TOO_LONG);
    assert(SPIFFS_open(&fs,"/new.bin",SPIFFS_CREAT|SPIFFS_WRONLY,0)==SPIFFS_ERR_NAME_TOO_LONG);
    SPIFFS_unmount(&fs); memcpy(flash+address,original,sizeof(original));
    assert(mount_fs()==0); check(0,6);
    puts("PASS damaged unterminated name rejected by directory, stat and creation; restored file unchanged");
}
static void full_storage(void) {
    uint8_t block[1024]; pattern(block,sizeof(block),123,9);
    spiffs_file f=SPIFFS_open(&fs,"/pressure.bin",SPIFFS_CREAT|SPIFFS_WRONLY,0); assert(f>=0);
    unsigned accepted=0;
    for(unsigned i=0;i<capacity/sizeof(block)+1;i++) {
        int result=SPIFFS_write(&fs,f,block,sizeof(block));
        if(result==(int)sizeof(block))accepted+=(unsigned)result;
        else {assert(result==SPIFFS_ERR_FULL); break;}
    }
    assert(accepted>capacity/2 && accepted<capacity);
    int closed=SPIFFS_close(&fs,f); assert(closed==0 || closed==SPIFFS_ERR_FULL);
    SPIFFS_unmount(&fs); assert(mount_fs()==0);
    for(unsigned i=0;i<950;i++)check(i,i<100?6:0);
    assert(SPIFFS_remove(&fs,"/pressure.bin")==0);
    for(unsigned round=7;round<=12;round++)for(unsigned i=0;i<100;i++)save(i,round);
    SPIFFS_unmount(&fs); assert(mount_fs()==0);
    for(unsigned i=0;i<950;i++)check(i,i<100?12:0);
    assert(SPIFFS_check(&fs)==0);
    for(unsigned i=0;i<950;i++)check(i,i<100?12:0);
    printf("PASS full-storage rejection at %u appended bytes; all original files preserved; delete/GC/rewrite/remount\n",accepted);
}
int main(int argc,char **argv) {
    assert(argc==2 || argc==4); capacity=(uint32_t)strtoul(argv[1],NULL,10)*1024u*1024u;
    flash=malloc(capacity); assert(flash); memset(flash,255,capacity);
    if(argc==4 && strcmp(argv[2],"seed"))image_io(argv[3],0);
    int mounted=mount_fs();
    if(capacity>0x1000000u) {
        printf("{\"capacity\":%u,\"mount_result\":%d,\"rejected\":%u,\"page_index_bits\":%u,\"page65536_alias\":%u}\n",
               capacity,mounted,rejected,(unsigned)(sizeof(spiffs_page_ix)*8),(unsigned)(spiffs_page_ix)65536u);
        assert(mounted<0 && rejected>0 && (spiffs_page_ix)65536u==0);
        free(flash); return 0;
    }
    if(argc==4 && strcmp(argv[2],"seed")) {
        assert(mounted==0);
        unsigned generation=!strcmp(argv[2],"update")?6:7;
        for(unsigned i=0;i<950;i++)check(i,i<100?generation:0);
        if(!strcmp(argv[2],"update"))for(unsigned i=0;i<100;i++)save(i,7);
        SPIFFS_unmount(&fs);
        if(!strcmp(argv[2],"update"))image_io(argv[3],1);
        puts("PASS cross-version synthetic filesystem image, all 950 files and metadata");
        free(flash); return 0;
    }
    assert(mounted==0); SPIFFS_unmount(&fs); assert(SPIFFS_format(&fs)==0);
    assert(mount_fs()==0);
    if(argc==2 && capacity==0x1000000u) {
        fs.free_cursor_block_ix=fs.block_count-1;
        fs.free_cursor_obj_lu_entry=13; /* first header at page65534, then skip65535 */
        save(949,0); check(949,0);
        assert(flash[capacity-256]==0xff);
        SPIFFS_unmount(&fs); assert(mount_fs()==0); check(949,0);
        puts("PASS allocation across page65534, reserved sentinel65535 and wraparound");
    }
    for(unsigned i=0;i<950;i++)save(i,0);
    for(unsigned round=1;round<=6;round++)for(unsigned i=0;i<100;i++)save(i,round);
    SPIFFS_unmount(&fs); assert(mount_fs()==0);
    for(unsigned i=0;i<950;i++)check(i,i<100?6:0);
    spiffs_DIR dir; struct spiffs_dirent ent; unsigned count=0;
    assert(SPIFFS_opendir(&fs,"/",&dir));
    while(SPIFFS_readdir(&dir,&ent))count++;
    assert(SPIFFS_closedir(&dir)==0 && count==950);
    if(argc==4) {
        SPIFFS_unmount(&fs); image_io(argv[3],1);
        puts("PASS seeded legacy synthetic image with 950 files and metadata");
        free(flash); return 0;
    }
    /* At 65536 pages this must terminate and leave every file intact. */
    puts("BEGIN checker after 950 verified files"); fflush(stdout);
    assert(SPIFFS_check(&fs)==0);
    puts("END checker; verifying preserved files"); fflush(stdout);
    for(unsigned i=0;i<950;i++)check(i,i<100?6:0);
    damaged_name();
    if(capacity==4u*1024u*1024u)full_storage();
    printf("{\"capacity\":%u,\"files\":%u,\"writes\":%u,\"reads\":%u,\"erases\":%u,\"page_crossings\":%u,\"range_rejections\":%u,\"max_write\":%u,\"fd_count_host\":%u,\"result\":\"PASS\"}\n",
           capacity,count,writes,reads,erases,crossings,rejected,max_write,fs.fd_count);
    assert(crossings==0 && rejected==0); fflush(stdout);
    SPIFFS_unmount(&fs); free(flash); return 0;
}
