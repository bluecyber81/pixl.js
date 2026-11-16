/* Exercise leading owner data, metadata and files using real filesystem engines.
 * No hardware or firmware-signing operations occur in this program. */
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "vfs.h"
#include "vfs_persist.h"
#include "hal_spi_flash.h"
#include "lfs.h"
#include "spiffs.h"

#define BLOCKS 512u
#define SIZE (BLOCKS * 4096u)
static uint8_t disk[SIZE], original[SIZE], figure[540], meta[128];
static unsigned programs, erases, reads, allocations, alloc_calls, fail_alloc, fail_read;
static vfs_driver_t *driver;
typedef union { size_t requested; max_align_t alignment; } allocation_header;
static size_t heap_bytes, peak;
void *mui_mem_malloc(size_t bytes) {
    if (++alloc_calls == fail_alloc) return NULL;
    allocation_header *memory = malloc(sizeof(*memory)+bytes);
    assert(memory); memory->requested=bytes; ++allocations; heap_bytes+=bytes;
    if (heap_bytes>peak) peak=heap_bytes;
    return memory+1;
}
void mui_mem_free(void *memory) {
    if (memory) {
        allocation_header *header=(allocation_header *)memory-1;
        assert(allocations && heap_bytes>=header->requested);
        --allocations; heap_bytes-=header->requested; free(header);
    }
}
int hal_spi_flash_init(void) { return 0; }
int hal_spi_flash_info(flash_info_t *info) {
    info->block_count = BLOCKS; info->block_size = 4096; info->page_size = 256; return 0;
}
int hal_spi_flash_read(uint32_t address, void *data, size_t n) {
    if (++reads == fail_read) return 1;
    assert(address <= SIZE && n <= SIZE-address); memcpy(data,disk+address,n); return 0;
}
int hal_spi_flash_prog(uint32_t address, const void *data, size_t n) {
    assert(address <= SIZE && n <= SIZE-address);
    for (size_t i=0; i<n; ++i) disk[address+i] &= ((const uint8_t *)data)[i];
    ++programs; return 0;
}
int hal_spi_flash_erase(uint32_t address) {
    assert(address % 4096 == 0 && address < SIZE); memset(disk+address,255,4096); ++erases; return 0;
}
static int32_t sr(uint32_t address, uint32_t n, uint8_t *data) {return hal_spi_flash_read(address,data,n);}
static int32_t sw(uint32_t address, uint32_t n, uint8_t *data) {return hal_spi_flash_prog(address,data,n);}
static int32_t se(uint32_t address, uint32_t n) {assert(n==4096);return hal_spi_flash_erase(address);}
static void seed_spiffs(int empty) {
    spiffs fs = {0}; spiffs_config cfg = {0};
    uint8_t work[512], fds[256], cache[1152];
    cfg.phys_size=SIZE; cfg.phys_erase_block=cfg.log_block_size=4096; cfg.log_page_size=256;
    cfg.hal_read_f=sr; cfg.hal_write_f=sw; cfg.hal_erase_f=se;
    memset(disk,255,SIZE);
    assert(!SPIFFS_mount(&fs,&cfg,work,fds,sizeof(fds),cache,sizeof(cache),NULL));
    SPIFFS_unmount(&fs); assert(!SPIFFS_format(&fs));
    assert(!SPIFFS_mount(&fs,&cfg,work,fds,sizeof(fds),cache,sizeof(cache),NULL));
    if (empty != 1) {
        spiffs_file fd = SPIFFS_open(&fs,"/figure.bin", SPIFFS_CREAT|SPIFFS_WRONLY,0);
        assert(fd>=0); assert(SPIFFS_write(&fs,fd,figure,sizeof(figure))==(int)sizeof(figure));
        assert(!SPIFFS_close(&fs,fd)); assert(!SPIFFS_update_meta(&fs,"/figure.bin",meta));
        if (empty == 2) assert(!SPIFFS_remove(&fs,"/figure.bin"));
        else {
            assert(!SPIFFS_creat(&fs,"/Figuren/.folder",0));
            assert(!SPIFFS_creat(&fs,"/Figuren/Nested.bin",0));
        }
    }
    SPIFFS_unmount(&fs);
}
static int lr(const struct lfs_config *c,lfs_block_t b,lfs_off_t o,void *p,lfs_size_t n){return hal_spi_flash_read(b*c->block_size+o,p,n);}
static int lw(const struct lfs_config *c,lfs_block_t b,lfs_off_t o,const void *p,lfs_size_t n){return hal_spi_flash_prog(b*c->block_size+o,p,n);}
static int le(const struct lfs_config *c,lfs_block_t b){return hal_spi_flash_erase(b*c->block_size);}
static int ls(const struct lfs_config *c){(void)c;return 0;}
static void seed_lfs(int packed, int oversized_attr) {
    lfs_t fs;
    uint8_t rd[256], wr[256], la[16], file_cache[256], big_meta[160]={0};
    struct lfs_config cfg={.read=lr,.prog=lw,.erase=le,.sync=ls,.block_count=BLOCKS,.block_size=4096,
        .read_size=256,.prog_size=256,.cache_size=256,.block_cycles=500,.lookahead_size=16,
        .read_buffer=rd,.prog_buffer=wr,.lookahead_buffer=la};
    struct lfs_file_config fc={.buffer=file_cache};
    memset(disk,255,SIZE); assert(!lfs_format(&fs,&cfg)); assert(!lfs_mount(&fs,&cfg));
    lfs_file_t f; const char *path = packed ? "/.pfs_manifest" : "/figure.bin";
    assert(!lfs_file_opencfg(&fs,&f,path,LFS_O_WRONLY|LFS_O_CREAT,&fc));
    assert(lfs_file_write(&fs,&f,figure,sizeof(figure))==sizeof(figure));
    assert(!lfs_file_close(&fs,&f)); assert(!lfs_setattr(&fs,path,0xaa,oversized_attr?big_meta:meta,oversized_attr?sizeof(big_meta):sizeof(meta)));
    if (!packed) {
        assert(!lfs_mkdir(&fs,"/Figuren"));
        assert(!lfs_file_opencfg(&fs,&f,"/Figuren/Nested.bin",LFS_O_WRONLY|LFS_O_CREAT,&fc));
        assert(!lfs_file_close(&fs,&f));
    }
    assert(!lfs_unmount(&fs));
}
static void fill_payloads(void) {
    for(unsigned i=0;i<sizeof(figure);++i)figure[i]=(uint8_t)(i*13+7);
    for(unsigned i=0;i<sizeof(meta);++i)meta[i]=(uint8_t)(i*11+1);
}
#ifdef OLED_REFERENCE_GENERATOR
int main(int argc, char **argv) {
    assert(argc == 3); fill_payloads();
    for (int type=1; type<=2; ++type) {
        if (type==1) seed_spiffs(0); else seed_lfs(0,0);
        FILE *out = fopen(argv[type], "wb");
        assert(out && fwrite(disk,1,SIZE,out)==SIZE && fclose(out)==0);
    }
    return 0;
}
#else
static void snapshot(void) { memcpy(original,disk,SIZE); programs=erases=0; }
static void unchanged(void) { assert(!memcmp(original,disk,SIZE)); assert(programs==0 && erases==0); }
static void stop(void) { assert(!driver->umount()); assert(!vfs_oled_backend() && !allocations); }
static void reject(void) {
    snapshot(); assert(driver->mount()<0); assert(!driver->mounted() && !vfs_oled_backend());
    assert(driver->format()<0); vfs_file_t f={0};
    assert(driver->open_file("/new.bin",&f,VFS_MODE_WRITEONLY|VFS_MODE_CREATE)<0);
    unchanged(); assert(!allocations);
}
static void check_volume(unsigned type) {
    peak=0;
    snapshot(); assert(!driver->mount()); assert(vfs_oled_backend()==type); assert(driver->mounted());
    const size_t mounted_bytes=heap_bytes;
    assert(mounted_bytes==(type==1 ? 1792u : 528u));
    assert(driver==vfs_get_default_driver() && driver==vfs_get_driver(VFS_DRIVE_EXT));
    assert(!vfs_persist_recover(driver));
    uint8_t readback[540];
    assert(driver->read_file_data("/figure.bin",readback,sizeof(readback))==sizeof(readback));
    assert(!memcmp(figure,readback,sizeof(figure)));
    vfs_obj_t obj;
    assert(!driver->stat_file("/figure.bin",&obj) && !memcmp(obj.meta,meta,sizeof(meta)));
    vfs_file_t f; assert(!driver->open_file("/figure.bin",&f,VFS_MODE_READONLY));
    assert(driver->umount()<0 && driver->format()<0); assert(!driver->close_file(&f));
    vfs_dir_t d; assert(!driver->open_dir("/",&d)); assert(driver->umount()<0);
    assert(!driver->close_dir(&d));
    assert(!driver->open_dir("/Figuren",&d));
    assert(!driver->read_dir(&d,&obj) && strcmp(obj.name,"Nested.bin")==0);
    assert(driver->read_dir(&d,&obj)==VFS_ERR_EOF); assert(!driver->close_dir(&d)); unchanged();
    assert(driver->write_file_data("/roundtrip",figure,17)==17);
    stop(); assert(!driver->mount() && vfs_oled_backend()==type);
    assert(driver->read_file_data("/roundtrip",readback,sizeof(readback))==17);
    assert(!memcmp(figure,readback,17));
    assert(!driver->stat_file("/figure.bin",&obj) && !memcmp(obj.meta,meta,sizeof(meta)));
    assert(!driver->rename_file("/roundtrip","/moved"));
    assert(!driver->remove_file("/moved")); stop();
    printf("storage model %s: mounted cache %zu B; peak requested heap during roundtrip %zu B\n",
           type==1 ? "SPIFFS" : "LittleFS", mounted_bytes, peak);
}
int main(int argc, char **argv) {
    fill_payloads();
    driver=vfs_get_default_driver(); assert(driver && !driver->mounted());
    if (argc == 3) {
        for (int type=1; type<=2; ++type) {
            FILE *image = fopen(argv[type],"rb");
            assert(image && fread(disk,1,SIZE,image)==SIZE && fgetc(image)==EOF && fclose(image)==0);
            check_volume(type);
        }
        puts("PASS images created with cylin577 v2.21.0 SPIFFS and v2.27.11 LittleFS pinned engines");
    }
    seed_spiffs(0); check_volume(1); puts("PASS SPIFFS populated: file, metadata, read-only mount, open handles, write and remount");
    seed_lfs(0,0); check_volume(2); puts("PASS LittleFS default-limit image: file, metadata, read-only mount, open handles, write and remount");
    seed_spiffs(1); snapshot(); assert(!driver->mount() && vfs_oled_backend()==1); unchanged(); stop();
    puts("PASS explicitly formatted empty SPIFFS");
    seed_spiffs(2); snapshot(); assert(!driver->mount() && vfs_oled_backend()==1); unchanged(); stop();
    puts("PASS used SPIFFS after deletion of last file");
    memset(disk,255,SIZE); reject(); memset(disk,0x32,SIZE); reject();
    seed_lfs(1,0); reject(); puts("PASS erased, unknown, PackedFS reserved root: untouched, format refused");
    seed_lfs(0,1); snapshot(); assert(!driver->mount());
    assert(driver->update_file_meta("/figure.bin",meta,sizeof(meta))<0); unchanged(); stop();
    seed_spiffs(0); disk[31]=0; reject();
    seed_spiffs(0); fail_read=reads+1; reject(); fail_read=0;
    seed_lfs(0,0); fail_read=reads+1; reject(); fail_read=0;
    seed_lfs(0,0); fail_alloc=alloc_calls+1; reject(); fail_alloc=0;
    seed_spiffs(0); fail_alloc=alloc_calls+2; reject(); fail_alloc=0;
    puts("PASS malformed SPIFFS, oversized attributes, I/O and allocation faults: no flash writes or cache leaks");
    return 0;
}
#endif
