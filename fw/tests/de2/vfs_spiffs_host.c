/* Fault injection into actual current SPIFFS wrapper functions. */
#include <assert.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "vfs.h"
/* Journal backend binding is orthogonal to these original SPIFFS tests. */
static const vfs_driver_t vfs_driver_fs, persist_raw_driver;
static void vfs_persist_bind(const vfs_driver_t*a,const vfs_driver_t*b) {(void)a;(void)b;}
static bool vfs_persist_active(const vfs_driver_t*d) {(void)d;return false;}
static void reset_writer_tracking(void) {}
#define NRF_LOG_INFO(...) ((void)0)
#define SPIFFS_OK 0
#define SPIFFS_ERR_FULL (-10001)
#define SPIFFS_ERR_NAME_TOO_LONG (-10002)
#define SPIFFS_ERR_NOT_FOUND (-10003)
#define SPIFFS_OBJ_NAME_LEN 64
#define SPIFFS_WRONLY 16
#define SPIFFS_RDONLY 8
#define SPIFFS_CREAT 4
#define SPIFFS_TRUNC 2
#define VFS_SPIFFS_FOLDER_NAME ".folder"
#define LOG_PAGE_SIZE 256
#define LOG_BLOCK_SIZE 4096
typedef int32_t s32_t;
typedef uint32_t u32_t;
typedef uint8_t u8_t;
typedef uint32_t ret_code_t;
typedef int spiffs_file;
typedef struct {bool mounted;} spiffs;
typedef struct {int unused;} spiffs_DIR;
typedef struct {char name[64]; uint8_t meta[128]; size_t size;} spiffs_stat;
struct spiffs_dirent {char name[64];};
typedef struct {spiffs_DIR d; struct spiffs_dirent e,*pe; char dir[64]; uint8_t seg;} vfs_spiffs_dir_t;
typedef struct {uint32_t block_size,block_count,page_size;} flash_info_t;
typedef struct {
    uint32_t phys_size,phys_addr,phys_erase_block,log_block_size,log_page_size;
    s32_t (*hal_read_f)(u32_t,u32_t,u8_t*);
    s32_t (*hal_write_f)(u32_t,u32_t,u8_t*);
    s32_t (*hal_erase_f)(u32_t,u32_t);
} spiffs_config;
static spiffs fs;
static uint8_t spiffs_work_buf[512],spiffs_fds[128],spiffs_cache_buf[1152];
static int init_error,info_error,mount_error,format_error,stat_error,open_error,close_error;
static flash_info_t geometry;
static int write_result,read_result,rename_result,readdir_error,fs_error;
static unsigned mount_calls,format_calls,init_calls,info_calls,close_calls,write_calls,dir_calls;
static uint32_t total_bytes,used_bytes;
static int target_check;
static int stat_file_error, stat_file_calls;
static int SPIFFS_stat(spiffs*f,const char*p,spiffs_stat*s) {
    stat_file_calls++; memset(s,0,sizeof(*s));
    assert(strlen(p)<sizeof(s->name)); strcpy(s->name,p); return stat_file_error;
}
static void cwk_path_get_basename(const char*p,const char**b,size_t*n) {
    *b=strrchr(p,'/');*b=*b?*b+1:p;*n=strlen(*b);
}
static bool SPIFFS_mounted(spiffs *f) {return f->mounted;}
static void SPIFFS_unmount(spiffs *f) {f->mounted=false;}
static int SPIFFS_mount(spiffs*f,spiffs_config*c,void*w,void*d,size_t ds,void*cache,size_t cs,void*cb) {
    mount_calls++; if(!mount_error) f->mounted=true; return mount_error;
}
static int SPIFFS_format(spiffs *f) {assert(!f->mounted);format_calls++;return format_error;}
static int SPIFFS_info(spiffs*f,uint32_t*t,uint32_t*u) {info_calls++;*t=total_bytes;*u=used_bytes;return stat_error;}
static ret_code_t hal_spi_flash_init(void) {init_calls++;return init_error;}
static ret_code_t hal_spi_flash_info(flash_info_t*f) {*f=geometry;return info_error;}
static s32_t spiffs_block_read(u32_t a,u32_t n,u8_t*p) {return 0;}
static s32_t spiffs_block_write(u32_t a,u32_t n,u8_t*p) {return 0;}
static s32_t spiffs_block_erase(u32_t a,u32_t n) {return 0;}
static int SPIFFS_open(spiffs*f,const char*p,int flags,int mode) {return open_error?open_error:1;}
static int SPIFFS_close(spiffs*f,spiffs_file fd) {close_calls++;return close_error;}
static int SPIFFS_abort(spiffs*f,spiffs_file fd) {(void)f;(void)fd;return SPIFFS_OK;}
static int SPIFFS_write(spiffs*f,spiffs_file fd,void*b,size_t n) {write_calls++;return write_result==999?(int)n:write_result;}
static int SPIFFS_read(spiffs*f,spiffs_file fd,void*b,size_t n) {return read_result;}
static int vfs_check_file_path(const char*p) {return strlen(p)<64?0:VFS_ERR_MAXNM;}
static int vfs_check_folder_path(const char*p) {return !strcmp(p,"/target")?target_check:0;}
static bool cwalk_dir_prefix_match(char*d,const char*s) {strcpy(d,s);strcat(d,"/");return true;}
static bool cwalk_same_prefix_segment(const char*a,const char*b) {return true;}
static spiffs_DIR*SPIFFS_opendir(spiffs*f,const char*p,spiffs_DIR*d) {dir_calls++;return d;}
static struct spiffs_dirent*SPIFFS_readdir(spiffs_DIR*d,struct spiffs_dirent*e) {assert(e);fs_error=readdir_error;return NULL;}
static int SPIFFS_closedir(spiffs_DIR*d) {return close_error;}
static int SPIFFS_rename(spiffs*f,const char*a,const char*b) {return rename_result;}
static void SPIFFS_clearerr(spiffs*f) {fs_error=0;}
static int SPIFFS_errno(spiffs*f) {return fs_error;}

/* ACTUAL_SPIFFS_FUNCTIONS */

static void reset(void) {
    fs=(spiffs){0}; init_error=info_error=mount_error=format_error=stat_error=open_error=close_error=0;
    read_result=0;write_result=999;rename_result=readdir_error=fs_error=target_check=0;
    mount_calls=format_calls=init_calls=info_calls=close_calls=write_calls=dir_calls=0;
    total_bytes=1000;used_bytes=300;
    stat_file_error=stat_file_calls=0;
    geometry=(flash_info_t){4096,64,256};
}
int main(void) {
    reset(); geometry.block_count=4096;
    assert(vfs_spiffs_mount()==0 && mount_calls==1);
    reset(); geometry.block_count=8192;
    assert(vfs_spiffs_mount()==VFS_ERR_UNSUPT && !mount_calls && !format_calls);
    reset(); geometry.block_count=0;
    assert(vfs_spiffs_mount()==VFS_ERR_UNSUPT && !mount_calls && !format_calls);
    reset(); geometry.page_size=512;
    assert(vfs_spiffs_mount()==VFS_ERR_UNSUPT && !mount_calls && !format_calls);
    reset(); geometry.block_size=65536;
    assert(vfs_spiffs_mount()==VFS_ERR_UNSUPT && !mount_calls && !format_calls);
    puts("PASS 16 MiB allowed; oversized or incompatible geometry rejected before filesystem access");

    reset(); mount_error=-10099; assert(vfs_spiffs_mount()!=0 && mount_calls==1 && !format_calls && !fs.mounted);
    assert(vfs_spiffs_format()==0 && format_calls==1);
    mount_error=0;assert(vfs_spiffs_mount()==0 && fs.mounted);
    unsigned before=mount_calls;assert(vfs_spiffs_mount()==0 && mount_calls==before);
    assert(vfs_spiffs_format()==0 && format_calls==2 && !fs.mounted);
    puts("PASS failed mount never formats; explicit format remains usable; mount idempotent");

    reset(); vfs_stat_t s={99,99,99};assert(vfs_spiffs_stat(&s)==0 && !s.avaliable && !s.total_bytes && !s.free_bytes && !info_calls);
    fs.mounted=true;assert(vfs_spiffs_stat(&s)==0 && s.avaliable && s.total_bytes==1000 && s.free_bytes==700);
    used_bytes=1001;assert(vfs_spiffs_stat(&s)<0 && !s.avaliable && !s.free_bytes);
    stat_error=-10099;assert(vfs_spiffs_stat(&s)<0 && !s.avaliable);
    assert(!mount_calls && !format_calls);
    puts("PASS read-only storage status, unavailable/error handling, no capacity underflow");

    reset();vfs_obj_t obj;stat_file_error=-10099;
    assert(vfs_spiffs_stat_file("/test",&obj)==VFS_ERR_FAIL && stat_file_calls==1);
    stat_file_error=SPIFFS_ERR_NOT_FOUND;
    assert(vfs_spiffs_stat_file("/test",&obj)==VFS_ERR_NOOBJ && stat_file_calls==3);
    char longest[64];memset(longest,'x',63);longest[0]='/';longest[30]='/';longest[63]=0;
    assert(vfs_spiffs_stat_file(longest,&obj)==VFS_ERR_MAXNM && stat_file_calls==4);
    puts("PASS stat preserves I/O error and rejects overflowing folder fallback");

    reset(); uint8_t b[26]={0}; close_error=-10099;
    assert(vfs_spiffs_write_file_data("/settings.bin",b,sizeof(b))<0 && close_calls==1);
    close_error=0;write_result=25;assert(vfs_spiffs_write_file_data("/settings.bin",b,sizeof(b))<0);
    write_result=999;assert(vfs_spiffs_write_file_data("/settings.bin",b,sizeof(b))==26);
    assert(vfs_spiffs_write_file_data("/empty",NULL,0)==0);
    write_result=SPIFFS_ERR_FULL;assert(vfs_spiffs_write_file_data("/settings.bin",b,sizeof(b))==VFS_ERR_NOSPC);
    read_result=26;close_error=-10099;assert(vfs_spiffs_read_file_data("/settings.bin",b,sizeof(b))<0);
    close_error=0;assert(vfs_spiffs_read_file_data("/settings.bin",b,sizeof(b))==26);
    puts("PASS cached-write close failure, positive short write and read-close error propagated");

    reset();vfs_file_t f={(void*)1};close_error=-10099;assert(vfs_spiffs_close_file(&f)<0 && f.handle==(void*)1);
    close_error=0;assert(vfs_spiffs_close_file(&f)==0 && (intptr_t)f.handle==-1);
    before=close_calls;assert(vfs_spiffs_close_file(&f)<0 && close_calls==before);
    f.handle=(void*)1;read_result=SPIFFS_ERR_NOT_FOUND;write_result=SPIFFS_ERR_FULL;
    assert(vfs_spiffs_read_file(&f,b,sizeof(b))==VFS_ERR_NOOBJ);
    assert(vfs_spiffs_write_file(&f,b,sizeof(b))==VFS_ERR_NOSPC);
    puts("PASS close invalidation and error-code mapping use actual operation result");

    reset();target_check=VFS_ERR_MAXNM;
    assert(vfs_spiffs_rename_dir_internal("/source","/target",true)==VFS_ERR_MAXNM && !dir_calls);
    target_check=0;readdir_error=-10099;
    assert(vfs_spiffs_rename_dir_internal("/source","/target",true)<0);
    readdir_error=0;close_error=-10099;
    assert(vfs_spiffs_rename_dir_internal("/source","/target",true)<0);
    close_error=0;assert(vfs_spiffs_rename_dir_internal("/source","/target",true)==0);
    puts("PASS directory rename target validation and enumeration/close failures");
    return 0;
}
