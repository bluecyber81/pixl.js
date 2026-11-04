/* Synthetic bytes only. Longjmp models a reset after a VFS operation; it does
 * not model SPIFFS page-level failure or the physical flash power rail. */
#include <assert.h>
#include <setjmp.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "PERSIST_SOURCE"

#define FILE_COUNT 10
#define FILE_CAP 4096
typedef struct {bool exists;char name[64];uint8_t bytes[FILE_CAP],meta[128];size_t size;} fake_file;
typedef struct {bool used;int file;size_t pos;} fake_handle;
static fake_file files[FILE_COUNT];
static fake_handle handles[4];
static unsigned operations, stop_at, fail_at, short_at;
static size_t disk_limit;
static jmp_buf reset_jump;
static bool reset_armed;
static bool close_keep_on_error;
static const char *fail_read_path;
static int changed_canonical;
static vfs_driver_t driver;

static bool fail(void) {return ++operations == fail_at;}
static void checkpoint(void) {if(reset_armed && operations == stop_at)longjmp(reset_jump,1);}
static int lookup(const char *name) {
    for(int i=0;i<FILE_COUNT;i++)if(files[i].exists&&!strcmp(files[i].name,name))return i;
    return -1;
}
static size_t used(void) {size_t n=0;for(int i=0;i<FILE_COUNT;i++)if(files[i].exists)n+=files[i].size;return n;}
static int32_t stat_fake(const char *path,vfs_obj_t *obj) {
    if(fail())return VFS_ERR_FAIL;
    int i=lookup(path);if(i<0){checkpoint();return VFS_ERR_NOOBJ;}
    memset(obj,0,sizeof(*obj));obj->type=VFS_TYPE_REG;obj->size=files[i].size;
    memcpy(obj->meta,files[i].meta,128);checkpoint();return VFS_OK;
}
static int32_t open_fake(const char *path,vfs_file_t *fd,uint32_t flags) {
    if(fail())return VFS_ERR_FAIL;
    int slot=0;while(slot<4&&handles[slot].used)slot++;if(slot==4)return VFS_ERR_NOMEM;
    int i=lookup(path);
    if(i<0 && (flags&VFS_MODE_CREATE)) {
        i=0;while(i<FILE_COUNT&&files[i].exists)i++;
        if(i==FILE_COUNT)return VFS_ERR_NOSPC;
        files[i]=(fake_file){.exists=true};strcpy(files[i].name,path);
    }
    if(i<0){checkpoint();return VFS_ERR_NOOBJ;}
    if(flags&VFS_MODE_TRUNC){files[i].size=0;if(!strcmp(path,"/settings.bin"))changed_canonical++;}
    handles[slot]=(fake_handle){true,i,0};fd->handle=(void*)(intptr_t)(slot+1);
    checkpoint();return VFS_OK;
}
static fake_handle *fh(vfs_file_t *fd) {int h=(int)(intptr_t)fd->handle-1;assert(h>=0&&h<4&&handles[h].used);return &handles[h];}
static int32_t close_fake(vfs_file_t *fd) {
    bool error=fail();if(!error || !close_keep_on_error)fh(fd)->used=false;checkpoint();return error?VFS_ERR_FAIL:VFS_OK;
}
static int32_t read_fake(vfs_file_t *fd,void *data,size_t size) {
    if(fail())return VFS_ERR_FAIL;
    fake_handle*h=fh(fd);fake_file*f=&files[h->file];
    if(fail_read_path&&!strcmp(f->name,fail_read_path))return VFS_ERR_FAIL;
    size_t n=f->size-h->pos;if(n>size)n=size;
    memcpy(data,f->bytes+h->pos,n);h->pos+=n;checkpoint();return (int32_t)n;
}
static int32_t write_fake(vfs_file_t *fd,void *data,size_t size) {
    if(fail())return VFS_ERR_FAIL;
    fake_handle*h=fh(fd);fake_file*f=&files[h->file];size_t n=size;
    if(short_at==operations&&n)n--;
    if(h->pos+n>FILE_CAP || used()+n>disk_limit)return VFS_ERR_NOSPC;
    memcpy(f->bytes+h->pos,data,n);h->pos+=n;if(h->pos>f->size)f->size=h->pos;
    checkpoint();return (int32_t)n;
}
static int32_t meta_fake(const char*p,void*m,size_t size) {
    if(fail())return VFS_ERR_FAIL;
    int i=lookup(p);assert(i>=0&&size==128);memcpy(files[i].meta,m,128);checkpoint();return VFS_OK;
}
static int32_t read_data(const char*p,void*b,size_t size) {
    vfs_file_t fd;int32_t r=open_fake(p,&fd,VFS_MODE_READONLY);if(r)return r;
    r=read_fake(&fd,b,size);int32_t c=close_fake(&fd);return r<0?r:c<0?c:r;
}
static int32_t write_data(const char*p,void*b,size_t size) {
    vfs_file_t fd;int32_t r=open_fake(p,&fd,VFS_MODE_CREATE|VFS_MODE_TRUNC|VFS_MODE_WRITEONLY);if(r)return r;
    r=write_fake(&fd,b,size);int32_t c=close_fake(&fd);return r<0?r:c<0?c:r;
}
static int32_t remove_fake(const char*p) {
    if(fail())return VFS_ERR_FAIL;
    int i=lookup(p);if(i<0){checkpoint();return VFS_ERR_NOOBJ;}
    files[i].exists=false;checkpoint();return VFS_OK;
}
static const vfs_driver_t raw={.stat_file=stat_fake,.open_file=open_fake,.close_file=close_fake,
 .read_file=read_fake,.write_file=write_fake,.update_file_meta=meta_fake,
 .read_file_data=read_data,.write_file_data=write_data,.remove_file=remove_fake};

/* Compile the actual public SPIFFS guard/lifecycle functions against the same
 * fault VFS. Physical mount/format is represented only by handle invalidation. */
#define IFS_MAX_FD 4
#define vfs_driver_fs driver
#define vfs_spiffs_open_file open_fake
#define vfs_spiffs_close_file close_fake
#define vfs_spiffs_write_file_data write_data
#define vfs_spiffs_stat_file stat_fake
#define vfs_spiffs_map_error_code(n) (n)
#define SPIFFS_OBJ_NAME_LEN 64
#define VFS_SPIFFS_FOLDER_NAME ".folder"
#define NRF_LOG_INFO(...) ((void)0)
#define vfs_spiffs_remove_file remove_fake
static int32_t raw_dir(const char *p) {(void)p;return VFS_OK;}
static int32_t raw_rename(const char *p,const char*q) {(void)p;(void)q;return VFS_OK;}
#define vfs_spiffs_create_dir raw_dir
#define vfs_spiffs_remove_dir raw_dir
#define vfs_spiffs_rename_dir raw_rename
#define vfs_spiffs_rename_file raw_rename
static void *writer_handles[IFS_MAX_FD];
static bool writer_used[IFS_MAX_FD];
static bool fs=true;
static int32_t SPIFFS_update_meta(bool*f,const char*p,void*m) {(void)f;return meta_fake(p,m,128);}
static bool SPIFFS_mounted(bool*f) {return *f;}
static void SPIFFS_unmount(bool*f) {*f=false;memset(handles,0,sizeof(handles));}
static int32_t SPIFFS_format(bool*f) {(void)f;memset(files,0,sizeof(files));return 0;}
/* ACTUAL_GUARD_FUNCTIONS */

#include "SETTINGS_SOURCE"
#include "vfs_meta.c"
vfs_driver_t *vfs_get_default_driver(void) {return &driver;}
static bool mounted_fake(void) {return fs;}
static int32_t mount_fake(void) {fs=true;return VFS_OK;}

static uint8_t original[2048],updated[2048];
static void boot(void) {
    memset(handles,0,sizeof(handles));busy=false;external_writers=0;
    stop_at=fail_at=short_at=0;reset_armed=false;fail_read_path=NULL;
    close_keep_on_error=false;memset(writer_used,0,sizeof(writer_used));fs=true;
    driver=(vfs_driver_t){.mounted=mounted_fake,.mount=mount_fake,.read_file_data=read_data,
        .write_file_data=guarded_write_data,.remove_file=guarded_remove,.update_file_meta=guarded_meta};
    vfs_persist_bind(&driver,&raw);
}
static void setup(size_t n) {
    memset(files,0,sizeof(files));operations=0;disk_limit=65536;changed_canonical=0;boot();
    for(unsigned i=0;i<2048;i++){original[i]=(uint8_t)(i*7+3);updated[i]=(uint8_t)(i*13+11);}
    files[0].exists=true;strcpy(files[0].name,"/settings.bin");files[0].size=n;
    memcpy(files[0].bytes,original,n);memset(files[0].meta,0x5a,128);
}
static bool equals(const void *p,size_t n) {
    int i=lookup("/settings.bin");return i>=0&&files[i].size==n&&!memcmp(files[i].bytes,p,n);
}
static unsigned complete_steps(size_t n) {
    setup(n);assert(vfs_persist_write(&driver,"/settings.bin",updated,n)==(int32_t)n);
    assert(equals(updated,n)&&lookup(PENDING_FILE)<0);return operations;
}
static void preserve_pending(size_t n) {
    unsigned steps=complete_steps(n);
    bool found=false;
    for(unsigned step=1;step<=steps&&!found;step++) {
        setup(n);stop_at=step;reset_armed=true;
        if(!setjmp(reset_jump))vfs_persist_write(&driver,"/settings.bin",updated,n);
        reset_armed=false;
        pending_t p;
        stop_at=0;
        if(lookup(PENDING_FILE)>=0 && read_pending(&p)==0 && changed_canonical){found=true;break;}
    }
    assert(found);boot();
}
int main(void) {
    assert(crc_bytes("123456789",9)==0xcbf43926u);
    const size_t sizes[]={0,24,26,532,540,572,2048};
    volatile unsigned interruptions=0, errors=0, shorts=0;
    for(volatile unsigned s=0;s<sizeof(sizes)/sizeof(*sizes);s++) {
        size_t n=sizes[s];unsigned steps=complete_steps(n);
        for(volatile unsigned step=1;step<=steps;step++) {
            setup(n);stop_at=step;reset_armed=true;
            if(!setjmp(reset_jump))vfs_persist_write(&driver,"/settings.bin",updated,n);
            boot();int32_t r=vfs_persist_recover(&driver);
            /* A marker interrupted before its bytes exist is intentionally
             * fail-closed. It cannot authorize destruction of the original. */
            if(r!=0){assert(r==VFS_ERR_CRPT);assert(equals(original,n));}
            else assert(equals(original,n)||equals(updated,n));
            interruptions++;
        }
        for(unsigned step=1;step<=steps;step++) {
            setup(n);fail_at=step;int32_t r=vfs_persist_write(&driver,"/settings.bin",updated,n);
            assert(r==(int32_t)n || r<0);boot();r=vfs_persist_recover(&driver);
            if(r<0){assert(r==VFS_ERR_CRPT);assert(equals(original,n));}
            else assert(equals(original,n)||equals(updated,n));
            errors++;
            setup(n);short_at=step;r=vfs_persist_write(&driver,"/settings.bin",updated,n);
            assert(r==(int32_t)n || r<0);boot();r=vfs_persist_recover(&driver);
            if(r<0){assert(r==VFS_ERR_CRPT);assert(equals(original,n));}
            else assert(equals(original,n)||equals(updated,n));
            shorts++;
        }
    }
    printf("PASS every VFS-operation reset/error/short-write point: %u/%u/%u, 0/24/26/532/540/572/2048B\n",interruptions,errors,shorts);

    preserve_pending(540);int idx=lookup(NEW_RECORD);assert(idx>=0);files[idx].bytes[sizeof(record_t)+5]^=1;
    assert(vfs_persist_recover(&driver)==0 && equals(original,540));
    preserve_pending(540);idx=lookup(NEW_RECORD);files[idx].bytes[sizeof(record_t)+5]^=1;
    idx=lookup(OLD_RECORD);files[idx].bytes[sizeof(record_t)+5]^=1;
    int before=changed_canonical;assert(vfs_persist_recover(&driver)==VFS_ERR_CRPT&&changed_canonical==before);
    preserve_pending(540);idx=lookup(PENDING_FILE);files[idx].bytes[3]^=1;
    before=changed_canonical;assert(vfs_persist_recover(&driver)==VFS_ERR_CRPT&&changed_canonical==before);
    assert(vfs_persist_before_mutation(&driver,"/settings.bin")==VFS_ERR_CRPT);
    preserve_pending(540);fail_read_path=NEW_RECORD;before=changed_canonical;
    assert(vfs_persist_recover(&driver)==VFS_ERR_FAIL&&changed_canonical==before);
    puts("PASS CRC corruption only falls back to fully verified old generation; corrupt marker and IO never overwrite");

    preserve_pending(540);assert(vfs_persist_before_mutation(&driver,"/unrelated.bin")==0&&lookup(PENDING_FILE)>=0);
    assert(vfs_persist_before_mutation(&driver,"/settings.bin")==0&&lookup(PENDING_FILE)<0);
    memset(files[0].bytes,0xdd,540);uint8_t external[540];memset(external,0xdd,540);
    files[0].size=540;assert(vfs_persist_recover(&driver)==0&&equals(external,540));
    preserve_pending(540);fail_at=operations+4; /* pending open/read/close then remove */
    assert(vfs_persist_before_mutation(&driver,"/settings.bin")<0&&lookup(PENDING_FILE)>=0);
    boot();assert(vfs_persist_recover(&driver)==0);
    assert(vfs_persist_before_mutation(&driver,OLD_RECORD)<0&&vfs_persist_before_mutation(&driver,"/")<0);
    assert(vfs_persist_before_mutation(&driver,"/.pixl_txn_new/child")<0);
    assert(vfs_persist_writer_begin(&driver,"/upload.bin")==0);
    assert(vfs_persist_write(&driver,"/settings.bin",updated,540)<0&&vfs_persist_recover(&driver)<0);
    vfs_persist_writer_end(&driver);assert(vfs_persist_write(&driver,"/settings.bin",updated,540)==540);
    puts("PASS external mutation cancels matching transaction first, invalidation errors block, streamed writers exclude saves");

    for(size_t limit=540;limit<2100;limit+=31){setup(540);disk_limit=limit;assert(vfs_persist_write(&driver,"/settings.bin",updated,540)<0);assert(equals(original,540));}
    setup(24);assert(vfs_persist_recover(&driver)==0&&equals(original,24)&&changed_canonical==0);
    setup(26);assert(vfs_persist_recover(&driver)==0&&equals(original,26)&&changed_canonical==0);
    char longest[64];memset(longest,'a',63);longest[0]='/';longest[31]='/';longest[63]=0;
    assert(vfs_persist_write(&driver,longest,updated,2048)==2048);
    assert(vfs_persist_write(&driver,"/a/../settings.bin",updated,26)==VFS_ERR_MAXNM);
    assert(vfs_persist_write(&driver,"/a//settings.bin",updated,26)==VFS_ERR_MAXNM);
    assert(vfs_persist_write(&driver,"/settings.bin",updated,2049)==VFS_ERR_UNSUPT);
    assert(vfs_persist_write(&driver,"/settings.bin",NULL,26)==VFS_ERR_UNSUPT);
    assert(vfs_persist_recover(NULL)==VFS_ERR_UNSUPT);
    puts("PASS full disk preserves original, absent Pending leaves legacy24/26 untouched, max paths and sizes bounded");

    uint8_t new_meta[128];memset(new_meta,0x37,sizeof(new_meta));
    setup(24);assert(vfs_persist_write_meta(&driver,"/settings.bin",updated,26,new_meta)==26);
    assert(equals(updated,26)&&!memcmp(files[0].meta,new_meta,128));
    unsigned meta_steps=operations;
    for(volatile unsigned step=1;step<=meta_steps;step++) {
        setup(24);stop_at=step;reset_armed=true;
        if(!setjmp(reset_jump))vfs_persist_write_meta(&driver,"/settings.bin",updated,26,new_meta);
        boot();int32_t r=vfs_persist_recover(&driver);
        if(r!=0)assert(r==VFS_ERR_CRPT&&equals(original,24));
        else {
            assert(equals(original,24)||equals(updated,26));
            if(equals(updated,26))assert(!memcmp(files[0].meta,new_meta,128));
            else for(unsigned j=0;j<128;j++)assert(files[0].meta[j]==0x5a);
        }
    }
    puts("PASS 24-to-26 data+metadata transition remains a matching generation after every interrupted operation");

    for(int lifecycle=0;lifecycle<2;lifecycle++) {
        setup(26);vfs_file_t fd;assert(guarded_open("/upload.bin",&fd,VFS_MODE_WRITEONLY|VFS_MODE_CREATE)==0);
        assert(external_writers==1&&vfs_persist_write(&driver,"/settings.bin",updated,26)<0);
        close_keep_on_error=true;fail_at=operations+1;
        assert(guarded_close(&fd)<0&&external_writers==1);
        vfs_persist_bind(&driver,&raw);assert(external_writers==1); /* no-op mount must not clear live writer */
        fail_at=0;
        assert((lifecycle?vfs_spiffs_format():vfs_spiffs_umount())==0);
        assert(external_writers==0);for(unsigned j=0;j<4;j++)assert(!writer_used[j]);
        fs=true;vfs_persist_bind(&driver,&raw);
        assert(vfs_persist_write(&driver,"/settings.bin",updated,26)==26);
        assert(guarded_open(NEW_RECORD,&fd,VFS_MODE_READONLY)==0&&external_writers==0);
        assert(guarded_close(&fd)==0);
        assert(guarded_open(NEW_RECORD,&fd,VFS_MODE_WRITEONLY)<0);
        assert(guarded_write_data(OLD_RECORD,updated,26)<0);
        assert(guarded_meta(PENDING_FILE,new_meta,128)<0);
        assert(guarded_remove(OLD_RECORD)<0&&guarded_remove_dir("/")<0);
        assert(guarded_create_dir("/.pixl_txn_dir")<0);
        assert(guarded_rename("/settings.bin",NEW_RECORD)<0);
        assert(guarded_rename_dir("/a","/.pixl_txn_dir")<0);
        busy=true;assert(vfs_spiffs_format()<0&&vfs_spiffs_umount()<0);busy=false;
    }
    puts("PASS actual SPIFFS guards reserve journal namespace, preserve read-only backups and reset failed-close tracking only after real unmount/format");
    setup(26);uint8_t one=5,small[127];memset(small,0x81,127);
    assert(vfs_spiffs_update_file_meta("/settings.bin",&one,1)==0);
    assert(files[0].meta[0]==5);for(unsigned i=1;i<128;i++)assert(files[0].meta[i]==0);
    assert(vfs_spiffs_update_file_meta("/settings.bin",small,127)==0&&files[0].meta[127]==0);
    assert(vfs_spiffs_update_file_meta("/settings.bin",NULL,0)==0);
    assert(vfs_spiffs_update_file_meta("/settings.bin",small,129)<0);
    assert(vfs_spiffs_update_file_meta("/settings.bin",NULL,1)<0);
    files[1].exists=true;strcpy(files[1].name,OLD_RECORD);files[1].size=10;memcpy(files[1].bytes,"user bytes",10);
    assert(vfs_persist_write(&driver,"/settings.bin",updated,26)==VFS_ERR_CRPT&&equals(original,26));
    assert(files[1].size==10&&!memcmp(files[1].bytes,"user bytes",10));
    puts("PASS actual SPIFFS metadata padding bounds and pre-existing reserved-name collision protection");

    setup(24);assert(settings_init()==0 && equals(original,24));
    assert(settings_save()==0);uint8_t expected_settings[26];memcpy(expected_settings,&m_settings_data,26);
    assert(equals(expected_settings,26));
    setup(26);memcpy(files[0].bytes,expected_settings,26);
    assert(settings_init()==0&&settings_save()==0&&changed_canonical==0);
    setup(24);assert(settings_init()==0);operations=0;assert(settings_save()==0);
    unsigned settings_steps=operations;
    for(volatile unsigned step=1;step<=settings_steps;step++) {
        setup(24);assert(settings_init()==0);operations=0;stop_at=step;reset_armed=true;
        if(!setjmp(reset_jump))settings_save();
        boot();int32_t r=settings_init();
        if(r!=0)assert(equals(original,24)&&!m_settings_save_allowed);
        else assert(equals(original,24)||equals(expected_settings,26));
    }
    printf("PASS actual settings.c + journal: unchanged legacy/current loads, exact migration, %u save/reboot interruption points\n",settings_steps);
    setup(0);files[0].exists=false;
    assert(vfs_persist_write(&driver,"/settings.bin",updated,540)==540);unsigned create_steps=operations;
    for(volatile unsigned step=1;step<=create_steps;step++) {
        setup(0);files[0].exists=false;stop_at=step;reset_armed=true;
        if(!setjmp(reset_jump))vfs_persist_write(&driver,"/settings.bin",updated,540);
        boot();int32_t r=vfs_persist_recover(&driver);
        if(r<0)assert(r==VFS_ERR_CRPT&&lookup("/settings.bin")<0);
        else assert(lookup("/settings.bin")<0 || equals(updated,540));
    }
    printf("PASS new absent canonical creation: %u reset points keep absence or complete new contents\n",create_steps);
    return 0;
}
