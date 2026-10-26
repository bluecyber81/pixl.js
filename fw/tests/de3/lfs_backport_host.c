/* Regression tests against the real LittleFS C source, with synchronous NOR.
 * Including lfs.c also lets the fault fixture decode genuine metadata tags;
 * no production operation, allocation, cache or error return is mocked. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "lfs.c"
#include "packed_fs.h"

#define CHECK(x) do { if (!(x)) { fprintf(stderr, "CHECK line %d: %s\n", __LINE__, #x); return 1; } } while (0)
#define MAX_BLOCK 4096u
#define BLOCKS 512u
static unsigned char disk[BLOCKS * MAX_BLOCK];
static unsigned char rcache[256], pcache[256], lookahead[8], filecache[256];
static lfs_off_t fcrc_off[2];
static int fail_fcrc, fault_hits;
static struct lfs_config cfg;

static int read_cb(const struct lfs_config *c, lfs_block_t b, lfs_off_t o, void *p, lfs_size_t n) {
    if (b >= BLOCKS || o+n > c->block_size) return LFS_ERR_IO;
    if (fail_fcrc && b < 2 && o == fcrc_off[b] && --fail_fcrc == 0) {
        fault_hits++;
        return LFS_ERR_IO;
    }
    memcpy(p, disk + b*c->block_size + o, n);
    return 0;
}
static int prog_cb(const struct lfs_config *c, lfs_block_t b, lfs_off_t o, const void *p, lfs_size_t n) {
    if (b >= BLOCKS || o+n > c->block_size || o%c->prog_size || n%c->prog_size) return LFS_ERR_IO;
    const unsigned char *src = p;
    for (lfs_size_t i=0; i<n; i++) {
        unsigned char *dst = &disk[b*c->block_size + o+i];
        if ((*dst & src[i]) != src[i]) return LFS_ERR_IO;
        *dst &= src[i];
    }
    return 0;
}
static int erase_cb(const struct lfs_config *c, lfs_block_t b) {
    if (b >= BLOCKS) return LFS_ERR_IO;
    memset(disk+b*c->block_size, 255, c->block_size);
    return 0;
}
static int sync_cb(const struct lfs_config *c) { (void)c; return 0; }
static void init(unsigned block, unsigned cache) {
    memset(disk, 255, sizeof(disk));
    memset(&cfg, 0, sizeof(cfg));
    cfg.read=read_cb; cfg.prog=prog_cb; cfg.erase=erase_cb; cfg.sync=sync_cb;
    cfg.read_size=cache; cfg.prog_size=cache; cfg.block_size=block; cfg.block_count=BLOCKS;
    cfg.block_cycles=500; cfg.cache_size=cache; cfg.lookahead_size=sizeof(lookahead);
    cfg.read_buffer=rcache; cfg.prog_buffer=pcache; cfg.lookahead_buffer=lookahead;
    fault_hits=0; fail_fcrc=0; fcrc_off[0]=fcrc_off[1]=(lfs_off_t)-1;
}
static int fcrc_test(void) {
    /* Four-byte cache makes the FCRC body a distinct physical read. It is a
     * supported geometry; it targets a normally cache-hidden I/O error. */
    init(512, 4);
    lfs_t fs;
    CHECK(lfs_format(&fs, &cfg)==0);
    unsigned found=0;
    for (unsigned b=0; b<2; b++) {
        lfs_tag_t previous=0xffffffff;
        for (lfs_off_t off=4; off+4<cfg.block_size;) {
            lfs_tag_t raw;
            memcpy(&raw, disk+b*cfg.block_size+off, 4);
            lfs_tag_t tag=lfs_frombe32(raw)^previous;
            if (!lfs_tag_isvalid(tag)) break;
            if (lfs_tag_type3(tag)==LFS_TYPE_FCRC) {
                fcrc_off[b]=off+4; found++; break;
            }
            off+=lfs_tag_dsize(tag); previous=tag;
        }
    }
    CHECK(found>0);
    /* First body read belongs to the commit CRC calculation; the second
     * belongs to the FCRC decode whose error was previously discarded. */
    fail_fcrc=2;
    int status=lfs_mount(&fs, &cfg);
    printf("{\"case\":\"fcrc_read_error\",\"fault_hits\":%d,\"status\":%d,\"expected\":%d}\n",fault_hits,status,LFS_ERR_IO);
    CHECK(fault_hits==1);
    if (status==0) CHECK(lfs_unmount(&fs)==0);
    CHECK(status==LFS_ERR_IO);
    fail_fcrc=0;
    CHECK(lfs_mount(&fs, &cfg)==0);
    CHECK(lfs_unmount(&fs)==0);
    return 0;
}
static unsigned char payload[MAX_BLOCK*3], actual[33];
static int read_at(lfs_t *fs, lfs_file_t *f, lfs_off_t pos, unsigned n) {
    CHECK(lfs_file_seek(fs,f,(lfs_soff_t)pos,LFS_SEEK_SET)==(lfs_soff_t)pos);
    CHECK(lfs_file_read(fs,f,actual,n)==(lfs_ssize_t)n);
    if (memcmp(payload+pos,actual,n)!=0) {
        fprintf(stderr,"seek/read mismatch at %lu, n=%u, first actual=%u expected=%u, block=%lu off=%lu\n",
            (unsigned long)pos,n,actual[0],payload[pos],(unsigned long)f->block,(unsigned long)f->off);
        return 1;
    }
    return 0;
}
static int seek_test(unsigned block) {
    init(block, 256);
    lfs_t fs; lfs_file_t file;
    struct lfs_file_config fc={.buffer=filecache};
    unsigned len=block*3-40;
    for (unsigned i=0; i<len; i++) payload[i]=(unsigned char)((i*17u)^(i>>8)^((i>>5)*53u));
    CHECK(lfs_format(&fs,&cfg)==0 && lfs_mount(&fs,&cfg)==0);
    CHECK(lfs_file_opencfg(&fs,&file,"kitty",LFS_O_CREAT|LFS_O_WRONLY,&fc)==0);
    CHECK(lfs_file_write(&fs,&file,payload,len)==(lfs_ssize_t)len);
    CHECK(lfs_file_close(&fs,&file)==0 && lfs_unmount(&fs)==0 && lfs_mount(&fs,&cfg)==0);
    CHECK(lfs_file_opencfg(&fs,&file,"kitty",LFS_O_RDONLY,&fc)==0);
    /* With the production 256-byte cache, end block A then seek to the last
     * cache-sized region of block B. Logical CTZ indices match although the
     * retained cache still belongs to block A. This must re-resolve B. */
    CHECK(read_at(&fs,&file,block-10,10)==0);
    CHECK(read_at(&fs,&file,2*block-14,10)==0);
    unsigned offsets[]={block,2*block-4,block+1,2*block-3,block-1,2*block-5,
        block-10,2*block-14,block-9,2*block-13,block-11,2*block-15,len-21};
    unsigned checks=2;
    for (unsigned round=0; round<2; round++) {
        for (unsigned i=0;i<sizeof(offsets)/sizeof(offsets[0]);i++) {
            unsigned pos=offsets[i];
            CHECK(read_at(&fs,&file,pos,10)==0); checks++;
            if (round) CHECK(lfs_file_sync(&fs,&file)==0);
            CHECK(read_at(&fs,&file,pos+11,10)==0); checks++;
            if (round) CHECK(lfs_file_sync(&fs,&file)==0);
            CHECK(read_at(&fs,&file,pos-11,10)==0); checks++;
            CHECK(read_at(&fs,&file,0,10)==0); checks++;
        }
    }
    CHECK(lfs_file_close(&fs,&file)==0 && lfs_unmount(&fs)==0);
    printf("{\"case\":\"seek_boundary\",\"block_size\":%u,\"cache_size\":256,\"verified_reads\":%u}\n",block,checks);
    return 0;
}
static int pfs_read_at(pfs_file_t *file,unsigned pos) {
    CHECK(pfs_seek(file,(lfs_soff_t)pos,LFS_SEEK_SET)==(lfs_soff_t)pos);
    CHECK(pfs_read(file,actual,10)==10);
    if (memcmp(payload+pos,actual,10)) {
        fprintf(stderr,"PFS seek/read mismatch at %u, first actual=%u expected=%u\n",pos,actual[0],payload[pos]);
        return 1;
    }
    return 0;
}
static int pfs_test(void) {
    /* Public PFS API, actual production geometry, raw metadata and remount.
     * Sweep a complete block to reach the boundary without using private
     * shard offsets or changing PFS's implementation. */
    init(PFS_BLOCK_SIZE,PFS_CACHE_SIZE);
    unsigned len=sizeof(payload)-40;
    for(unsigned i=0;i<len;i++) payload[i]=(unsigned char)((i*17u)^(i>>8)^((i>>5)*53u));
    uint8_t identity[32]={0x36}, meta[PFS_META_SIZE];
    for(unsigned i=0;i<sizeof(meta);i++) meta[i]=(uint8_t)(i^0xa5u);
    pfs_t *fs=pfs_new(&cfg,malloc,free);
    CHECK(fs && pfs_format(fs)==0);
    if (!pfs_mounted(fs)) CHECK(pfs_mount(fs)==0);
    CHECK(pfs_bind_import(fs,identity)==0);
    CHECK(pfs_replace(fs,"/boundary.bin",payload,len,meta)==(lfs_ssize_t)len);
    CHECK(pfs_finish_import(fs)==0);
    CHECK(pfs_unmount(fs)==0 && pfs_mount(fs)==0);
    pfs_info_t info;
    CHECK(pfs_stat(fs,"/boundary.bin",&info)==0 && info.size==len && !memcmp(info.meta,meta,sizeof(meta)));
    pfs_file_t *file=NULL;
    CHECK(pfs_open(fs,"/boundary.bin",LFS_O_RDONLY,&file)==0);
    unsigned checks=0;
    for(unsigned pos=0;pos<PFS_BLOCK_SIZE;pos++) {
        CHECK(pfs_read_at(file,pos)==0); checks++;
        CHECK(pfs_read_at(file,pos+PFS_BLOCK_SIZE-4)==0); checks++;
        CHECK(pfs_read_at(file,0)==0); checks++;
    }
    CHECK(pfs_close(file)==0);
    CHECK(pfs_unmount(fs)==0 && pfs_destroy(fs)==0);
    printf("{\"case\":\"packed_fs_boundary\",\"block_size\":4096,\"cache_size\":256,\"verified_reads\":%u,\"raw128_metadata_match\":true}\n",checks);
    return 0;
}
int main(int argc,char **argv) {
    CHECK(argc==2);
    if (!strcmp(argv[1],"fcrc")) return fcrc_test();
    if (!strcmp(argv[1],"seek512")) return seek_test(512);
    if (!strcmp(argv[1],"seek4096")) return seek_test(4096);
    if (!strcmp(argv[1],"pfs")) return pfs_test();
    return 2;
}
