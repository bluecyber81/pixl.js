/* SPDX-License-Identifier: GPL-2.0-only
 * RAM-only capacity/readback harness over the UNMODIFIED production packed_fs
 * and pinned littlefs. File contents are synthetic; path and raw128 are exact.
 * No hardware, network, operating-system filesystem or arbitrary memory API.
 */
#include "packed_fs.h"
#include "sim_identity.h"
#include <string.h>
#define LIMIT 4096u
#define ARENA 65536u
#define DISK (PFS_BLOCK_SIZE*PFS_BLOCK_COUNT)
static uint8_t flash[DISK],path_in[66],meta_in[128],archive_in[32];
static const uint8_t engine_identity[32]=SIM_ENGINE_IDENTITY;
static union {uint64_t aligned;uint8_t bytes[ARENA];} arena;
typedef struct {uint32_t size,free;} allocation_t;
typedef struct {char path[64];uint8_t raw[128];uint32_t size,seed;uint8_t kind;} row_t;
static row_t rows[LIMIT];
static uint8_t seen[LIMIT];
static pfs_t *fs;
static uint32_t count,peak_blocks,heap_current,heap_peak,verified,phase;
static int sticky_error;
static void *allocate(size_t size){
    if(size>ARENA-16)return NULL;size=(size+7)&~(size_t)7;
    for(uint32_t off=0;off<ARENA;){allocation_t *h=(allocation_t*)(arena.bytes+off);
        if(h->free&&h->size>=size){if(h->size>=size+16){allocation_t *next=(allocation_t*)(arena.bytes+off+8+size);next->size=h->size-(uint32_t)size-8;next->free=1;h->size=(uint32_t)size;}
            h->free=0;heap_current+=h->size;if(heap_current>heap_peak)heap_peak=heap_current;return h+1;}off+=8+h->size;}
    return NULL;
}
static void release(void *ptr){if(!ptr)return;allocation_t *h=(allocation_t*)ptr-1;if(h->free)return;h->free=1;heap_current-=h->size;
    for(uint32_t off=0;off<ARENA;){h=(allocation_t*)(arena.bytes+off);uint32_t next=off+8+h->size;
        if(h->free&&next<ARENA&&((allocation_t*)(arena.bytes+next))->free){h->size+=8+((allocation_t*)(arena.bytes+next))->size;continue;}off=next;}
}
static int bounds(lfs_block_t b,lfs_off_t o,lfs_size_t n){return b<PFS_BLOCK_COUNT&&o<=PFS_BLOCK_SIZE&&n<=PFS_BLOCK_SIZE-o&&o%256==0&&n%256==0;}
static int read_flash(const struct lfs_config *c,lfs_block_t b,lfs_off_t o,void *p,lfs_size_t n){(void)c;if(!bounds(b,o,n))return LFS_ERR_IO;memcpy(p,flash+b*PFS_BLOCK_SIZE+o,n);return 0;}
static int prog_flash(const struct lfs_config *c,lfs_block_t b,lfs_off_t o,const void *p,lfs_size_t n){(void)c;if(!bounds(b,o,n))return LFS_ERR_IO;const uint8_t *src=p;uint8_t *d=flash+b*PFS_BLOCK_SIZE+o;
    for(uint32_t i=0;i<n;i++)if((d[i]&src[i])!=src[i])return LFS_ERR_IO;for(uint32_t i=0;i<n;i++)d[i]&=src[i];return 0;}
static int erase_flash(const struct lfs_config *c,lfs_block_t b){(void)c;if(b>=PFS_BLOCK_COUNT)return LFS_ERR_IO;memset(flash+b*PFS_BLOCK_SIZE,255,PFS_BLOCK_SIZE);return 0;}
static int sync_flash(const struct lfs_config *c){(void)c;return 0;}
static int measure(void){uint32_t total,free_bytes;int r=pfs_space(fs,&total,&free_bytes);if(r)return r;if(total!=DISK||free_bytes>DISK)return LFS_ERR_CORRUPT;uint32_t used=(DISK-free_bytes)/PFS_BLOCK_SIZE;if(used>peak_blocks)peak_blocks=used;return 0;}
static int record_error(int result){if(result<0&&!sticky_error)sticky_error=result;return result;}
static uint32_t path_seed(const char *p){uint32_t h=2166136261u;for(;*p;p++){h^=(uint8_t)*p;h*=16777619u;}return h;}
static uint8_t sample(uint32_t seed,uint32_t offset){return (uint8_t)((seed^(offset*131u)^(offset>>8))&255u);}
static int data_verify(const char *path,const row_t *row){
    pfs_file_t *file=NULL;int r=pfs_open(fs,path,LFS_O_RDONLY,&file);if(r)return r;uint8_t bytes[256];
    for(uint32_t offset=0;!r&&offset<row->size;){uint32_t n=row->size-offset;if(n>sizeof(bytes))n=sizeof(bytes);lfs_ssize_t got=pfs_read(file,bytes,n);if(got!=(lfs_ssize_t)n){r=got<0?(int)got:LFS_ERR_CORRUPT;break;}
        for(uint32_t j=0;j<n;j++)if(bytes[j]!=sample(row->seed,offset+j)){r=LFS_ERR_CORRUPT;break;}offset+=n;}
    if(!r&&pfs_read(file,bytes,1)!=0)r=LFS_ERR_CORRUPT;int closed=pfs_close(file);return r?r:closed;
}
static int data_write(const char *path,const row_t *row){pfs_file_t *file=NULL;int r=pfs_open(fs,path,LFS_O_WRONLY|LFS_O_CREAT|LFS_O_EXCL,&file);if(r)return r;uint8_t bytes[256];
    for(uint32_t offset=0;!r&&offset<row->size;){uint32_t n=row->size-offset;if(n>sizeof(bytes))n=sizeof(bytes);for(uint32_t j=0;j<n;j++)bytes[j]=sample(row->seed,offset+j);
        lfs_ssize_t wrote=pfs_write(file,bytes,n);if(wrote!=(lfs_ssize_t)n)r=wrote<0?(int)wrote:LFS_ERR_IO;offset+=n;}
    if(!r){r=pfs_close(file);if(!r)file=NULL;}if(file)pfs_abort(file);if(!r)r=measure();return r;
}
static int temporary(const char *path,char *stage,char *backup){const char *slash=strrchr(path,'/');if(!slash)return LFS_ERR_INVAL;size_t prefix=(size_t)(slash-path)+1,available=63-prefix;if(!available)return LFS_ERR_NAMETOOLONG;
    static const char alphabet[]="0123456789abcdefghijklmnopqrstuvwxyz",hex[]="0123456789abcdef";
    for(uint32_t attempt=0;attempt<36;attempt++){
        memcpy(stage,path,prefix);memcpy(backup,path,prefix);size_t n=prefix;
        if(available>=3){stage[n]='~';backup[n++]='~';stage[n]='u';backup[n++]='b';size_t digits=available-2;if(digits>12)digits=12;
            for(size_t j=0;j<digits;j++){char c=hex[(attempt>>(4*(j%4)))&15];stage[n]=c;backup[n++]=c;}}
        else {if(available==2){stage[n]='~';backup[n++]='~';}stage[n]=alphabet[attempt];backup[n++]=alphabet[(attempt+1)%36];}
        stage[n]=backup[n]=0;pfs_info_t info;if(strcmp(stage,path)&&strcmp(backup,path)&&pfs_stat(fs,stage,&info)==LFS_ERR_NOENT&&pfs_stat(fs,backup,&info)==LFS_ERR_NOENT)return 0;
    }return LFS_ERR_EXIST;
}
static int upload(const row_t *row,bool replace){char stage[64],backup[64];int r=temporary(row->path,stage,backup);if(r)return r;
    r=data_write(stage,row);if(!r)r=data_verify(stage,row);uint8_t defaults[128]={0};
    if(!r)r=pfs_setattr(fs,stage,defaults);if(!r)r=measure();
    if(!r&&replace){r=pfs_rename(fs,row->path,backup);if(!r)r=measure();}
    if(!r)r=pfs_rename(fs,stage,row->path);if(!r)r=measure();if(!r)r=data_verify(row->path,row);
    if(!r&&replace){r=pfs_remove(fs,backup,false);if(!r)r=measure();}
    if(!r)r=pfs_setattr(fs,row->path,row->raw);if(!r)r=measure();return r;
}
int begin(void){if(fs){int r=pfs_destroy(fs);if(r)return r;fs=NULL;}memset(flash,255,sizeof(flash));memset(&arena,0,sizeof(arena));allocation_t *h=(allocation_t*)arena.bytes;h->size=ARENA-8;h->free=1;
    count=peak_blocks=heap_current=heap_peak=verified=phase=0;sticky_error=0;
    struct lfs_config cfg={0};cfg.read=read_flash;cfg.prog=prog_flash;cfg.erase=erase_flash;cfg.sync=sync_flash;cfg.read_size=cfg.prog_size=256;cfg.block_size=4096;cfg.block_count=512;
    cfg.cache_size=256;cfg.lookahead_size=64;cfg.block_cycles=500;cfg.name_max=47;cfg.attr_max=128;
    fs=pfs_new(&cfg,allocate,release);if(!fs)return record_error(LFS_ERR_NOMEM);int r=pfs_format(fs);if(!r)r=pfs_bind_import(fs,archive_in);if(!r)r=measure();return record_error(r);
}
uintptr_t path_buffer(void){return (uintptr_t)path_in;}
uintptr_t metadata_buffer(void){return (uintptr_t)meta_in;}
uintptr_t archive_buffer(void){return (uintptr_t)archive_in;}
uintptr_t engine_identity_buffer(void){return (uintptr_t)engine_identity;}
int add(uint32_t kind,uint32_t size){if(sticky_error)return sticky_error;if(!fs||phase||count>=LIMIT||kind>1||size>DISK||(kind&&size)||!memchr(path_in,0,64))return record_error(LFS_ERR_INVAL);
    row_t *row=&rows[count];memset(row,0,sizeof(*row));memcpy(row->path,path_in,strlen((char*)path_in)+1);memcpy(row->raw,meta_in,128);row->size=size;row->kind=(uint8_t)kind;row->seed=path_seed(row->path);
    int r=kind?pfs_mkdir(fs,row->path):upload(row,false);if(!r)r=measure();if(!r)count++;return record_error(r);
}
int finish(void){if(sticky_error)return sticky_error;if(!fs||phase)return record_error(LFS_ERR_INVAL);phase=1;int r=0;
    for(uint32_t i=count;i&&!r;i--)if(rows[i-1].kind){r=pfs_setattr(fs,rows[i-1].path,rows[i-1].raw);if(!r)r=measure();}
    /* Exercise coexistence of old, staged and backup data for the largest file. */
    uint32_t largest=LIMIT;for(uint32_t i=0;i<count;i++)if(!rows[i].kind&&(largest==LIMIT||rows[i].size>rows[largest].size))largest=i;
    if(!r&&largest!=LIMIT)r=upload(&rows[largest],true);
    if(!r)r=pfs_gc(fs);if(!r)r=measure();if(!r)r=pfs_unmount(fs);if(!r)r=pfs_mount(fs);
    for(uint32_t i=0;!r&&i<count;i++){pfs_info_t info;r=pfs_stat(fs,rows[i].path,&info);if(!r&&(info.type!=(rows[i].kind?PFS_DIR:PFS_FILE)||info.size!=rows[i].size||memcmp(info.meta,rows[i].raw,128)))r=LFS_ERR_CORRUPT;
        if(!r&&!rows[i].kind)r=data_verify(rows[i].path,&rows[i]);if(!r)verified++;}
    memset(seen,0,sizeof(seen));uint32_t listed=0;
    for(uint32_t parent=0;!r&&parent<=count;parent++){
        if(parent&&!rows[parent-1].kind)continue;pfs_dir_t *dir=NULL;r=pfs_opendir(fs,parent?rows[parent-1].path:"/",&dir);if(r)break;
        pfs_info_t info;int next=0;while((next=pfs_readdir(dir,&info))>0){uint32_t i=0;for(;i<count;i++)if(!strcmp(rows[i].path,info.path))break;
            if(i==count||seen[i]){r=LFS_ERR_CORRUPT;break;}seen[i]=1;listed++;}
        if(!r&&next<0)r=next;int closed=pfs_closedir(dir);if(!r)r=closed;
    }
    if(!r&&listed!=count)r=LFS_ERR_CORRUPT;
    if(!r)r=pfs_finish_import(fs);if(!r)r=measure();if(!r)r=pfs_unmount(fs);if(!r)r=pfs_mount(fs);
    uint8_t binding[32];if(!r&&(pfs_import_pending(fs)||!pfs_get_import_identity(fs,binding)||memcmp(binding,archive_in,32)))r=LFS_ERR_CORRUPT;
    if(!r)r=measure();phase=r?3:2;return record_error(r);
}
int used_blocks(void){if(sticky_error)return sticky_error;uint32_t total,free_bytes;int r=pfs_space(fs,&total,&free_bytes);return r?r:(int)((total-free_bytes)/PFS_BLOCK_SIZE);}
uint32_t peak_used_blocks(void){return peak_blocks;}
uint32_t total_blocks(void){return PFS_BLOCK_COUNT;}
uint32_t block_size(void){return PFS_BLOCK_SIZE;}
uint32_t verified_entries(void){return verified;}
uint32_t core_heap_peak_bytes(void){return heap_peak;}
uint32_t simulator_phase(void){return phase;}
