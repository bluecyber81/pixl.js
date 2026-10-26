#include "boards.h"

#if defined(VFS_LFS_ENABLE) && !defined(VFS_PACKED_LFS_ENABLE)
#include "vfs_driver_fs.h"
#include "vfs_persist.h"
#include "nrf_log.h"
#include "lfs.h"
#include "hal_spi_flash.h"
#include "mui_mem.h"
#include "cwalk2.h"
#include <limits.h>
#include <string.h>

#define LFS_CACHE_SIZE 256
#define LFS_BLOCK_SIZE 4096
#define LFS_ATTR_META 0xAA

static lfs_t lfs;
static struct lfs_config lfs_config;
static bool mounted;
static uint8_t lfs_read_buf[LFS_CACHE_SIZE];
static uint8_t lfs_prog_buf[LFS_CACHE_SIZE];
static uint8_t lfs_lookahead_buf[16];
static const vfs_driver_t persist_raw_driver;

/* All file storage belongs to the checked application heap. opencfg avoids
 * littlefs' default libc allocator and retains the config until close. */
typedef struct {
    lfs_file_t file;
    struct lfs_file_config config;
    uint8_t cache[LFS_CACHE_SIZE];
    bool external_writer;
} lfs_handle_t;

static int32_t vfs_lfs_map_error_code(int32_t err) {
    switch (err) {
    case LFS_ERR_OK: return VFS_OK;
    case LFS_ERR_NOMEM: return VFS_ERR_NOMEM;
    case LFS_ERR_NOSPC: return VFS_ERR_NOSPC;
    case LFS_ERR_NAMETOOLONG: return VFS_ERR_MAXNM;
    case LFS_ERR_NOENT: return VFS_ERR_NOOBJ;
    case LFS_ERR_EXIST: return VFS_ERR_OBJEX;
    case LFS_ERR_CORRUPT: return VFS_ERR_CRPT;
    default: return VFS_ERR_FAIL;
    }
}

static bool block_range(const struct lfs_config *c, lfs_block_t block,
                        lfs_off_t off, lfs_size_t size) {
    return c && c->block_size == LFS_BLOCK_SIZE && c->block_count &&
        c->block_count <= 0x1000000u / LFS_BLOCK_SIZE && block < c->block_count &&
        off <= c->block_size && size <= c->block_size - off;
}
static int block_device_read(const struct lfs_config *c, lfs_block_t block,
                             lfs_off_t off, void *buffer, lfs_size_t size) {
    if (!block_range(c, block, off, size) || (size && !buffer)) return LFS_ERR_IO;
    return hal_spi_flash_read(block * c->block_size + off, buffer, size) == NRF_SUCCESS ? 0 : LFS_ERR_IO;
}
static int block_device_prog(const struct lfs_config *c, lfs_block_t block,
                             lfs_off_t off, const void *buffer, lfs_size_t size) {
    if (!block_range(c, block, off, size) || (size && !buffer) ||
        off % LFS_CACHE_SIZE || size % LFS_CACHE_SIZE) return LFS_ERR_IO;
    return hal_spi_flash_prog(block * c->block_size + off, buffer, size) == NRF_SUCCESS ? 0 : LFS_ERR_IO;
}
static int block_device_erase(const struct lfs_config *c, lfs_block_t block) {
    if (!block_range(c, block, 0, c ? c->block_size : 0)) return LFS_ERR_IO;
    return hal_spi_flash_erase(block * c->block_size) == NRF_SUCCESS ? 0 : LFS_ERR_IO;
}
/* The HAL waits for completion of every program/erase before returning. */
static int block_device_sync(const struct lfs_config *c) { (void)c; return 0; }

static int32_t configure(void) {
    flash_info_t info;
    if (hal_spi_flash_init() != NRF_SUCCESS || hal_spi_flash_info(&info) != NRF_SUCCESS)
        return VFS_ERR_NODEV;
    if (info.page_size != LFS_CACHE_SIZE || info.block_size != LFS_BLOCK_SIZE ||
        info.block_count < 2 || info.block_count > 0x1000000u / LFS_BLOCK_SIZE)
        return VFS_ERR_UNSUPT;
    memset(&lfs_config, 0, sizeof(lfs_config));
    lfs_config.read = block_device_read;
    lfs_config.prog = block_device_prog;
    lfs_config.erase = block_device_erase;
    lfs_config.sync = block_device_sync;
    lfs_config.read_size = info.page_size;
    lfs_config.prog_size = info.page_size;
    lfs_config.block_size = info.block_size;
    lfs_config.block_count = info.block_count;
    lfs_config.cache_size = LFS_CACHE_SIZE;
    lfs_config.lookahead_size = sizeof(lfs_lookahead_buf);
    lfs_config.block_cycles = 500;
    lfs_config.read_buffer = lfs_read_buf;
    lfs_config.prog_buffer = lfs_prog_buf;
    lfs_config.lookahead_buffer = lfs_lookahead_buf;
    lfs_config.name_max = VFS_MAX_NAME_LEN - 1;
    lfs_config.attr_max = VFS_MAX_META_LEN;
    return VFS_OK;
}

int32_t vfs_lfs_mount(void) {
    if (mounted) return VFS_OK;
    int32_t result = configure();
    if (result != VFS_OK) return result;
    result = lfs_mount(&lfs, &lfs_config);
    /* Never format/migrate on mount failure: existing SPIFFS or damaged data
     * must remain recoverable with the previous application and PC backup. */
    if (result != LFS_ERR_OK) return vfs_lfs_map_error_code(result);
    mounted = true;
    vfs_persist_unmounted(&vfs_driver_fs);
    vfs_persist_bind(&vfs_driver_fs, &persist_raw_driver);
    return VFS_OK;
}
int32_t vfs_lfs_umount(void) {
    if (vfs_persist_active(&vfs_driver_fs) || (mounted && lfs.mlist)) return VFS_ERR_FAIL;
    if (!mounted) return VFS_OK;
    int32_t result = lfs_unmount(&lfs);
    if (result == LFS_ERR_OK) {
        mounted = false;
        vfs_persist_unmounted(&vfs_driver_fs);
    }
    return vfs_lfs_map_error_code(result);
}
int32_t vfs_lfs_format(void) {
    /* Only the explicit format command reaches this destructive operation. */
    int32_t result = vfs_lfs_umount();
    if (result != VFS_OK) return result;
    result = configure();
    if (result != VFS_OK) return result;
    return vfs_lfs_map_error_code(lfs_format(&lfs, &lfs_config));
}
bool vfs_lfs_mounted(void) { return mounted; }
int32_t vfs_lfs_stat(vfs_stat_t *stat) {
    if (!stat) return VFS_ERR_FAIL;
    memset(stat, 0, sizeof(*stat));
    if (!mounted) return VFS_OK;
    lfs_ssize_t blocks = lfs_fs_size(&lfs);
    if (blocks < 0) return vfs_lfs_map_error_code(blocks);
    if ((uint32_t)blocks > lfs_config.block_count) return VFS_ERR_CRPT;
    stat->avaliable = true;
    stat->total_bytes = lfs_config.block_count * lfs_config.block_size;
    stat->free_bytes = (lfs_config.block_count - (uint32_t)blocks) * lfs_config.block_size;
    return VFS_OK;
}

static int32_t check_path(const char *path, bool allow_root) {
    if (!path || path[0] != '/') return VFS_ERR_FAIL;
    size_t n = 0;
    while (n < VFS_MAX_PATH_LEN && path[n]) ++n;
    if (n >= VFS_MAX_PATH_LEN) return VFS_ERR_MAXNM;
    if (n == 1) return allow_root ? VFS_OK : VFS_ERR_FAIL;
    const char *start = path + 1;
    for (const char *p = start;; ++p) {
        if (*p == '/' || !*p) {
            size_t length = (size_t)(p - start);
            if (!length || (length == 1 && start[0] == '.') ||
                (length == 2 && start[0] == '.' && start[1] == '.')) return VFS_ERR_FAIL;
            if (length >= VFS_MAX_NAME_LEN) return VFS_ERR_MAXNM;
            if (!*p) return VFS_OK;
            start = p + 1;
        }
    }
}
static int32_t ready_path(const char *path, bool allow_root) {
    if (!mounted) return VFS_ERR_NODEV;
    return check_path(path, allow_root);
}
static int32_t read_meta(const char *path, uint8_t *meta) {
    memset(meta, 0, VFS_MAX_META_LEN);
    int32_t result = lfs_getattr(&lfs, path, LFS_ATTR_META, meta, VFS_MAX_META_LEN);
    if (result < 0 && result != LFS_ERR_NOATTR) return vfs_lfs_map_error_code(result);
    if (result > VFS_MAX_META_LEN) return VFS_ERR_CRPT;
    return VFS_OK;
}
int32_t vfs_lfs_stat_file(const char *path, vfs_obj_t *obj) {
    if (!obj) return VFS_ERR_FAIL;
    memset(obj, 0, sizeof(*obj));
    int32_t result = ready_path(path, true);
    if (result != VFS_OK) return result;
    struct lfs_info info;
    result = lfs_stat(&lfs, path, &info);
    if (result < 0) return vfs_lfs_map_error_code(result);
    size_t length = strlen(info.name);
    if (length >= sizeof(obj->name)) return VFS_ERR_MAXNM;
    result = read_meta(path, (uint8_t *)obj->meta);
    if (result != VFS_OK) return result;
    obj->type = info.type == LFS_TYPE_DIR ? VFS_TYPE_DIR : VFS_TYPE_REG;
    obj->size = info.size;
    memcpy(obj->name, info.name, length + 1);
    return VFS_OK;
}
int32_t vfs_lfs_open_dir(const char *path, vfs_dir_t *fd) {
    if (!fd) return VFS_ERR_FAIL;
    fd->handle = NULL;
    int32_t result = ready_path(path, true);
    if (result != VFS_OK) return result;
    lfs_dir_t *dir = mui_mem_malloc(sizeof(*dir));
    if (!dir) return VFS_ERR_NOMEM;
    result = lfs_dir_open(&lfs, dir, path);
    if (result < 0) { mui_mem_free(dir); return vfs_lfs_map_error_code(result); }
    memcpy(fd->path, path, strlen(path) + 1);
    fd->handle = dir;
    return VFS_OK;
}
int32_t vfs_lfs_read_dir(vfs_dir_t *fd, vfs_obj_t *obj) {
    if (!mounted || !fd || !fd->handle || !obj) return VFS_ERR_FAIL;
    memset(obj, 0, sizeof(*obj));
    struct lfs_info info;
    int32_t result;
    do {
        result = lfs_dir_read(&lfs, fd->handle, &info);
        if (result <= 0) return result == 0 ? VFS_ERR_EOF : vfs_lfs_map_error_code(result);
    } while (!strcmp(info.name, ".") || !strcmp(info.name, ".."));
    if (strlen(info.name) >= sizeof(obj->name)) return VFS_ERR_MAXNM;
    char path[VFS_MAX_PATH_LEN];
    if (!cwalk_append_segment(path, fd->path, info.name)) return VFS_ERR_MAXNM;
    result = read_meta(path, (uint8_t *)obj->meta);
    if (result != VFS_OK) return result;
    /* Same catalog-only hiding as SPIFFS; stat_file remains a raw metadata read. */
    if (vfs_persist_reserved(path)) {
        memset(obj->meta, 0, sizeof(obj->meta));
        obj->meta[0] = 2; obj->meta[1] = 2; obj->meta[2] = 3;
    }
    obj->type = info.type == LFS_TYPE_DIR ? VFS_TYPE_DIR : VFS_TYPE_REG;
    obj->size = info.size;
    memcpy(obj->name, info.name, strlen(info.name) + 1);
    return VFS_OK;
}
int32_t vfs_lfs_close_dir(vfs_dir_t *fd) {
    if (!mounted || !fd || !fd->handle) return VFS_ERR_FAIL;
    int32_t result = lfs_dir_close(&lfs, fd->handle);
    mui_mem_free(fd->handle);
    fd->handle = NULL;
    return vfs_lfs_map_error_code(result);
}
int32_t vfs_lfs_create_dir(const char *path) {
    int32_t result = ready_path(path, false);
    return result == VFS_OK ? vfs_lfs_map_error_code(lfs_mkdir(&lfs, path)) : result;
}
int32_t vfs_lfs_remove_file(const char *path) {
    int32_t result = ready_path(path, false);
    if (result != VFS_OK) return result;
    struct lfs_info info;
    result = lfs_stat(&lfs, path, &info);
    if (result < 0) return vfs_lfs_map_error_code(result);
    if (info.type != LFS_TYPE_REG) return VFS_ERR_FAIL;
    return vfs_lfs_map_error_code(lfs_remove(&lfs, path));
}
int32_t vfs_lfs_remove_dir(const char *path) {
    int32_t result = ready_path(path, false);
    if (result != VFS_OK) return result;
    /* Iterative postorder traversal: no recursive stack growth. Like SPIFFS,
     * deletion is not atomic; a later error is reported without further work. */
    char current[VFS_MAX_PATH_LEN];
    memcpy(current, path, strlen(path) + 1);
    size_t root_length = strlen(path);
    for (;;) {
        vfs_dir_t dir;
        result = vfs_lfs_open_dir(current, &dir);
        if (result != VFS_OK) return result;
        vfs_obj_t obj;
        result = vfs_lfs_read_dir(&dir, &obj);
        int32_t closed = vfs_lfs_close_dir(&dir);
        if (closed != VFS_OK) return closed;
        if (result == VFS_ERR_EOF) {
            result = vfs_lfs_map_error_code(lfs_remove(&lfs, current));
            if (result != VFS_OK || strlen(current) == root_length) return result;
            *strrchr(current, '/') = 0;
        } else if (result == VFS_OK) {
            char child[VFS_MAX_PATH_LEN];
            if (!cwalk_append_segment(child, current, obj.name)) return VFS_ERR_MAXNM;
            if (obj.type == VFS_TYPE_DIR) memcpy(current, child, strlen(child) + 1);
            else {
                result = vfs_lfs_remove_file(child);
                if (result != VFS_OK) return result;
            }
        } else return result;
    }
}
static int32_t rename_path(const char *path, const char *target, bool directory) {
    int32_t result = ready_path(path, false);
    if (result == VFS_OK) result = check_path(target, false);
    if (result != VFS_OK) return result;
    struct lfs_info info;
    result = lfs_stat(&lfs, path, &info);
    if (result < 0) return vfs_lfs_map_error_code(result);
    if ((info.type == LFS_TYPE_DIR) != directory) return VFS_ERR_FAIL;
    size_t length = strlen(path);
    if (directory && !strncmp(path, target, length) && (target[length] == '/' || !target[length]))
        return VFS_ERR_FAIL;
    result = lfs_stat(&lfs, target, &info);
    if (result != LFS_ERR_NOENT) return result == LFS_ERR_OK ? VFS_ERR_OBJEX : vfs_lfs_map_error_code(result);
    return vfs_lfs_map_error_code(lfs_rename(&lfs, path, target));
}
int32_t vfs_lfs_rename_file(const char *path, const char *target) { return rename_path(path, target, false); }
int32_t vfs_lfs_rename_dir(const char *path, const char *target) { return rename_path(path, target, true); }

int32_t vfs_lfs_open_file(const char *path, vfs_file_t *fd, uint32_t flags) {
    if (!fd) return VFS_ERR_FAIL;
    fd->handle = NULL;
    int32_t result = ready_path(path, false);
    if (result != VFS_OK) return result;
    if (flags & ~(VFS_MODE_APPEND | VFS_MODE_TRUNC | VFS_MODE_CREATE | VFS_MODE_READONLY | VFS_MODE_WRITEONLY))
        return VFS_ERR_FAIL;
    if ((flags & (VFS_MODE_APPEND | VFS_MODE_TRUNC | VFS_MODE_CREATE)) && !(flags & VFS_MODE_WRITEONLY))
        return VFS_ERR_FAIL;
    int access = flags & VFS_MODE_WRITEONLY ? (flags & VFS_MODE_READONLY ? LFS_O_RDWR : LFS_O_WRONLY) : LFS_O_RDONLY;
    if (flags & VFS_MODE_APPEND) access |= LFS_O_APPEND;
    if (flags & VFS_MODE_TRUNC) access |= LFS_O_TRUNC;
    if (flags & VFS_MODE_CREATE) access |= LFS_O_CREAT;
    lfs_handle_t *handle = mui_mem_malloc(sizeof(*handle));
    if (!handle) return VFS_ERR_NOMEM;
    memset(handle, 0, sizeof(*handle));
    handle->config.buffer = handle->cache;
    result = lfs_file_opencfg(&lfs, &handle->file, path, access, &handle->config);
    if (result < 0) { mui_mem_free(handle); return vfs_lfs_map_error_code(result); }
    fd->handle = handle;
    return VFS_OK;
}
static int32_t close_file(vfs_file_t *fd, bool aborting) {
    if (!fd) return VFS_ERR_FAIL;
    if (!fd->handle) return aborting ? VFS_OK : VFS_ERR_FAIL;
    if (!mounted) return VFS_ERR_NODEV;
    lfs_handle_t *handle = fd->handle;
    /* Preserve the VFS retry/abandon contract: a failed sync keeps the
     * handle and external-writer exclusion alive until explicit abort. */
    if (!aborting) {
        if (handle->file.flags & LFS_F_ERRED) return VFS_ERR_FAIL;
        int32_t synced = lfs_file_sync(&lfs, &handle->file);
        if (synced < 0) return vfs_lfs_map_error_code(synced);
    }
    /* Pinned littlefs 2.8: rawsync skips an ERRED file; rawclose still removes
     * it from mlist. Abandon releases RAM without committing a failed cache. */
    if (aborting) handle->file.flags |= LFS_F_ERRED;
    int32_t result = lfs_file_close(&lfs, &handle->file);
    if (handle->external_writer) vfs_persist_writer_end(&vfs_driver_fs);
    mui_mem_free(handle);
    fd->handle = NULL;
    return vfs_lfs_map_error_code(result);
}
int32_t vfs_lfs_close_file(vfs_file_t *fd) { return close_file(fd, false); }
int32_t vfs_lfs_abort_file(vfs_file_t *fd) { return close_file(fd, true); }
int32_t vfs_lfs_read_file(vfs_file_t *fd, void *buffer, size_t size) {
    if (!mounted || !fd || !fd->handle || (size && !buffer) || size > INT32_MAX) return VFS_ERR_FAIL;
    lfs_handle_t *handle = fd->handle;
    if (!(handle->file.flags & LFS_O_RDONLY)) return VFS_ERR_FAIL;
    int32_t result = lfs_file_read(&lfs, &handle->file, buffer, size);
    return result < 0 ? vfs_lfs_map_error_code(result) : result;
}
int32_t vfs_lfs_write_file(vfs_file_t *fd, void *buffer, size_t size) {
    if (!mounted || !fd || !fd->handle || (size && !buffer) || size > INT32_MAX) return VFS_ERR_FAIL;
    lfs_handle_t *handle = fd->handle;
    if (!(handle->file.flags & LFS_O_WRONLY) || (handle->file.flags & LFS_F_ERRED)) return VFS_ERR_FAIL;
    int32_t result = lfs_file_write(&lfs, &handle->file, buffer, size);
    return result < 0 ? vfs_lfs_map_error_code(result) : result;
}
int32_t vfs_lfs_update_file_meta(const char *path, void *meta, size_t size) {
    int32_t result = ready_path(path, false);
    if (result != VFS_OK) return result;
    if (size > VFS_MAX_META_LEN || (size && !meta)) return VFS_ERR_FAIL;
    uint8_t padded[VFS_MAX_META_LEN] = {0};
    if (size) memcpy(padded, meta, size);
    return vfs_lfs_map_error_code(lfs_setattr(&lfs, path, LFS_ATTR_META, padded, sizeof(padded)));
}
static int32_t transfer_data(const char *path, void *buffer, size_t size, bool writing) {
    if ((size && !buffer) || size > INT32_MAX) return VFS_ERR_FAIL;
    vfs_file_t fd;
    int32_t result = vfs_lfs_open_file(path, &fd, writing ?
        VFS_MODE_CREATE | VFS_MODE_TRUNC | VFS_MODE_WRITEONLY : VFS_MODE_READONLY);
    if (result != VFS_OK) return result;
    result = writing ? vfs_lfs_write_file(&fd, buffer, size) : vfs_lfs_read_file(&fd, buffer, size);
    int32_t closed = result < 0 ? vfs_lfs_abort_file(&fd) : vfs_lfs_close_file(&fd);
    if (closed != VFS_OK) vfs_lfs_abort_file(&fd);
    return result < 0 ? result : closed != VFS_OK ? closed : result;
}
int32_t vfs_lfs_read_file_data(const char *p, void *b, size_t n) { return transfer_data(p, b, n, false); }
int32_t vfs_lfs_write_file_data(const char *p, void *b, size_t n) { return transfer_data(p, b, n, true); }

static const vfs_driver_t persist_raw_driver = {
    .stat_file = vfs_lfs_stat_file, .open_file = vfs_lfs_open_file,
    .close_file = vfs_lfs_close_file, .abort_file = vfs_lfs_abort_file,
    .read_file = vfs_lfs_read_file, .write_file = vfs_lfs_write_file,
    .update_file_meta = vfs_lfs_update_file_meta,
    .read_file_data = vfs_lfs_read_file_data, .write_file_data = vfs_lfs_write_file_data,
    .remove_file = vfs_lfs_remove_file,
};
static int32_t guarded_open(const char *path, vfs_file_t *fd, uint32_t flags) {
    if (!fd) return VFS_ERR_FAIL;
    fd->handle = NULL;
    bool writing = flags & (VFS_MODE_WRITEONLY | VFS_MODE_APPEND | VFS_MODE_TRUNC | VFS_MODE_CREATE);
    if (!writing) return vfs_lfs_open_file(path, fd, flags);
    int32_t result = vfs_persist_writer_begin(&vfs_driver_fs, path);
    if (result != VFS_OK) return result;
    result = vfs_lfs_open_file(path, fd, flags);
    if (result == VFS_OK) ((lfs_handle_t *)fd->handle)->external_writer = true;
    else vfs_persist_writer_end(&vfs_driver_fs);
    return result;
}
static int32_t guarded_write_data(const char *path, void *data, size_t size) {
    int32_t result = vfs_persist_writer_begin(&vfs_driver_fs, path);
    if (result != VFS_OK) return result;
    result = vfs_lfs_write_file_data(path, data, size);
    vfs_persist_writer_end(&vfs_driver_fs);
    return result;
}
static int32_t guarded_meta(const char *path, void *meta, size_t size) {
    int32_t result = vfs_persist_before_mutation(&vfs_driver_fs, path);
    return result == VFS_OK ? vfs_lfs_update_file_meta(path, meta, size) : result;
}
static int32_t guarded_remove(const char *path) {
    int32_t result = vfs_persist_before_mutation(&vfs_driver_fs, path);
    return result == VFS_OK ? vfs_lfs_remove_file(path) : result;
}
static int32_t guarded_remove_dir(const char *path) {
    int32_t result = vfs_persist_before_mutation(&vfs_driver_fs, path);
    return result == VFS_OK ? vfs_lfs_remove_dir(path) : result;
}
static int32_t guarded_create_dir(const char *path) {
    int32_t result = vfs_persist_before_mutation(&vfs_driver_fs, path);
    return result == VFS_OK ? vfs_lfs_create_dir(path) : result;
}
static int32_t guarded_rename(const char *path, const char *target) {
    int32_t result = vfs_persist_before_mutation(&vfs_driver_fs, path);
    if (result == VFS_OK) result = vfs_persist_before_mutation(&vfs_driver_fs, target);
    return result == VFS_OK ? vfs_lfs_rename_file(path, target) : result;
}
static int32_t guarded_rename_dir(const char *path, const char *target) {
    int32_t result = vfs_persist_before_mutation(&vfs_driver_fs, path);
    if (result == VFS_OK) result = vfs_persist_before_mutation(&vfs_driver_fs, target);
    return result == VFS_OK ? vfs_lfs_rename_dir(path, target) : result;
}
const vfs_driver_t vfs_driver_fs = {
    .mount = vfs_lfs_mount, .umount = vfs_lfs_umount, .format = vfs_lfs_format,
    .mounted = vfs_lfs_mounted, .stat = vfs_lfs_stat, .stat_file = vfs_lfs_stat_file,
    .open_dir = vfs_lfs_open_dir, .read_dir = vfs_lfs_read_dir, .close_dir = vfs_lfs_close_dir,
    .create_dir = guarded_create_dir, .remove_dir = guarded_remove_dir, .rename_dir = guarded_rename_dir,
    .open_file = guarded_open, .close_file = vfs_lfs_close_file, .abort_file = vfs_lfs_abort_file,
    .read_file = vfs_lfs_read_file, .write_file = vfs_lfs_write_file,
    .update_file_meta = guarded_meta, .write_file_data = guarded_write_data,
    .read_file_data = vfs_lfs_read_file_data, .rename_file = guarded_rename, .remove_file = guarded_remove,
};
#endif
