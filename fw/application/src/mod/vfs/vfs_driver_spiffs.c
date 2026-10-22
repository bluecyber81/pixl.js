#include "boards.h"

#ifdef VFS_SPIFFS_ENABLE

#include "vfs_driver_fs.h"
#include "vfs_persist.h"

#include "hal_spi_flash.h"

#include "nrf_log.h"
#include "nrf_log_ctrl.h"

#include "cwalk.h"
#include "cwalk2.h"
#include "spiffs.h"
#if defined(BOARD_LCD)
#include "vfs_spiffs_diag.h"
#endif

#include "mui_mem.h"

#define LOG_PAGE_SIZE 256
#define LOG_BLOCK_SIZE 4096
#define LOG_FLASH_SIZE
#define IFS_MAX_FD 4

#define VFS_SPIFFS_FOLDER_NAME ".folder"

static spiffs fs;
static const vfs_driver_t persist_raw_driver;
static void *writer_handles[IFS_MAX_FD];
static bool writer_used[IFS_MAX_FD];
static void reset_writer_tracking(void) {
    memset(writer_handles, 0, sizeof(writer_handles));
    memset(writer_used, 0, sizeof(writer_used));
    vfs_persist_unmounted(&vfs_driver_fs);
#if defined(BOARD_LCD)
    vfs_spiffs_diag_reset();
#endif
}
static u8_t spiffs_work_buf[LOG_PAGE_SIZE * 2];
static u8_t spiffs_fds[32 * IFS_MAX_FD];
static u8_t spiffs_cache_buf[(LOG_PAGE_SIZE + 32) * 4];

typedef struct {
    spiffs_DIR d;
    struct spiffs_dirent e;
    struct spiffs_dirent *pe;
    char dir[SPIFFS_OBJ_NAME_LEN];
    uint8_t seg;
} vfs_spiffs_dir_t;

/// help functions ///
static s32_t vfs_spiffs_map_error_code(s32_t err) {
    static const s32_t err_code[][2] = {{SPIFFS_OK, VFS_OK},
                                        {SPIFFS_ERR_FULL, VFS_ERR_NOSPC},
                                        {SPIFFS_ERR_NAME_TOO_LONG, VFS_ERR_MAXNM},
                                        {SPIFFS_ERR_NOT_FOUND, VFS_ERR_NOOBJ}};
    for (uint32_t i = 0; i < sizeof(err_code) / sizeof(err_code[0]); i++) {
        if (err_code[i][0] == err) {
            return err_code[i][1];
        }
    }
    return VFS_ERR_FAIL;
}

static int32_t vfs_check_file_path(const char *file_path) {
    if (strlen(file_path) >= VFS_MAX_PATH_LEN) {
        return VFS_ERR_MAXNM;
    }
    const char *basename;
    size_t length;
    cwk_path_get_basename(file_path, &basename, &length);
    if (length <= 0 || length >= VFS_MAX_NAME_LEN) {
        return VFS_ERR_MAXNM;
    }
    return VFS_OK;
}

static int32_t vfs_check_folder_path(const char *file_path) {
    int32_t ret = vfs_check_file_path(file_path);
    if (ret != VFS_OK) {
        return ret;
    }
    if (strlen(file_path) + strlen(VFS_SPIFFS_FOLDER_NAME) + 1 >= VFS_MAX_PATH_LEN) {
        return VFS_ERR_MAXNM;
    }

    return VFS_OK;
}

static s32_t spiffs_block_read(u32_t addr, u32_t size, u8_t *dst) {
    uint32_t result = hal_spi_flash_read(addr, dst, size);
#if defined(BOARD_LCD)
    vfs_spiffs_diag_hal_read(result, addr, size);
#endif
    return result == NRF_SUCCESS ? SPIFFS_OK : SPIFFS_ERR_INTERNAL;
}

static s32_t spiffs_block_write(u32_t addr, u32_t size, u8_t *src) {
    return hal_spi_flash_prog(addr, src, size) == NRF_SUCCESS ? SPIFFS_OK : SPIFFS_ERR_INTERNAL;
}

static s32_t spiffs_block_erase(u32_t addr, u32_t size) {
    return hal_spi_flash_erase(addr) == NRF_SUCCESS ? SPIFFS_OK : SPIFFS_ERR_INTERNAL;
}

int32_t vfs_spiffs_mount() {
    if (SPIFFS_mounted(&fs)) {
        vfs_persist_bind(&vfs_driver_fs, &persist_raw_driver);
        return VFS_OK;
    }
    flash_info_t flash_info;
    ret_code_t err_code;

    err_code = hal_spi_flash_init();
    if (err_code) {
        return VFS_ERR_NODEV;
    }

    // read flash info
    err_code = hal_spi_flash_info(&flash_info);
    if (err_code) {
        return VFS_ERR_NODEV;
    }

    /* This backend uses three-byte wire addresses and uint16 page indices.
     * A larger chip needs an explicit migration; never mount a wrapped view. */
    if (flash_info.page_size != LOG_PAGE_SIZE || flash_info.block_size != LOG_BLOCK_SIZE ||
        flash_info.block_count == 0 || flash_info.block_count > 0x1000000u / LOG_BLOCK_SIZE) {
        return VFS_ERR_UNSUPT;
    }

    spiffs_config cfg;
    cfg.phys_size = flash_info.block_count * flash_info.block_size;
    cfg.phys_addr = 0;                            // start spiffs at start of spi flash
    cfg.phys_erase_block = flash_info.block_size; // according to datasheet
    cfg.log_block_size = flash_info.block_size;   // let us not complicate things
    cfg.log_page_size = flash_info.page_size;     // as we said

    cfg.hal_read_f = spiffs_block_read;
    cfg.hal_write_f = spiffs_block_write;
    cfg.hal_erase_f = spiffs_block_erase;

    int res = SPIFFS_mount(&fs, &cfg, spiffs_work_buf, spiffs_fds, sizeof(spiffs_fds), spiffs_cache_buf,
                           sizeof(spiffs_cache_buf), 0);
    NRF_LOG_INFO("external fs mount: %d", res);
    if (res == SPIFFS_OK) {
        reset_writer_tracking();
        vfs_persist_bind(&vfs_driver_fs, &persist_raw_driver);
    }

    // A failed mount may be an I/O error or damaged existing data. Only the
    // explicit format operation is allowed to erase the filesystem.

    // test only
    // int32_t vfs_spiffs_create_dir(const char*);
    //      res = vfs_spiffs_create_dir("/amiibo");
    //       res = vfs_spiffs_create_dir("/hello");
    //      NRF_LOG_INFO("create amiibo dir: %d", res);
    // SPIFFS_creat(&fs, "/amiibo/.folder", 0);
    // SPIFFS_creat(&fs, "/hello/.folder", 0);
    // SPIFFS_creat(&fs, "/hello/塞尔达/.folder", 0);
    return res;
}

int32_t vfs_spiffs_umount() {
    if (vfs_persist_active(&vfs_driver_fs)) return VFS_ERR_FAIL;
    if (SPIFFS_mounted(&fs)) {
        SPIFFS_unmount(&fs);
        reset_writer_tracking();
    }
    return VFS_OK;
}

int32_t vfs_spiffs_format() {
    if (vfs_persist_active(&vfs_driver_fs)) return VFS_ERR_FAIL;
    if (SPIFFS_mounted(&fs)) {
        SPIFFS_unmount(&fs);
    }
    reset_writer_tracking();
    int res = SPIFFS_format(&fs);
    if (res == 0) {
        return VFS_OK;
    } else {
        return VFS_ERR_FAIL;
    }
}

bool vfs_spiffs_mounted() { return SPIFFS_mounted(&fs); }

int32_t vfs_spiffs_stat(vfs_stat_t *p_stat) {
    memset(p_stat, 0, sizeof(*p_stat));
    p_stat->avaliable = SPIFFS_mounted(&fs);
    if (!p_stat->avaliable) {
        return VFS_OK;
    }
    int res = SPIFFS_info(&fs, &p_stat->total_bytes, &p_stat->free_bytes);
    if (res != SPIFFS_OK || p_stat->free_bytes > p_stat->total_bytes) {
        memset(p_stat, 0, sizeof(*p_stat));
        return res != SPIFFS_OK ? vfs_spiffs_map_error_code(res) : VFS_ERR_FAIL;
    }
    p_stat->free_bytes = p_stat->total_bytes - p_stat->free_bytes;
    return VFS_OK;
}

int32_t vfs_spiffs_stat_file(const char *file, vfs_obj_t *obj) {
    spiffs_stat s;
    const char *basename;
    size_t length;
    char path[SPIFFS_OBJ_NAME_LEN];
    memset(obj, 0, sizeof(vfs_obj_t));

    int res = vfs_check_file_path(file);
    if (res != VFS_OK) {
        return res;
    }

    res = SPIFFS_stat(&fs, file, &s);
    if (res == SPIFFS_OK) {
        cwk_path_get_basename(s.name, &basename, &length);
        if (length >= sizeof(obj->name)) {
            return VFS_ERR_MAXNM;
        }

        obj->type = VFS_TYPE_REG;
        obj->size = s.size;
        strncpy(obj->name, basename, length);
        memcpy(obj->meta, s.meta, sizeof(obj->meta));

        return VFS_OK;
    } else if (res == SPIFFS_ERR_NOT_FOUND) {
        // The fallback needs room for '/.folder' and its terminator.
        if (snprintf(path, sizeof(path), "%s%s%s", file, file[strlen(file) - 1] == '/' ? "" : "/",
                     VFS_SPIFFS_FOLDER_NAME) >= sizeof(path)) {
            return VFS_ERR_MAXNM;
        }
        NRF_LOG_INFO("stat file: %s", nrf_log_push(path));
        res = SPIFFS_stat(&fs, path, &s);
        if (res == SPIFFS_OK) {
            cwk_path_get_basename(s.name, &basename, &length);
            if (length >= sizeof(obj->name)) {
                return VFS_ERR_MAXNM;
            }
            obj->type = VFS_TYPE_DIR;
            obj->size = 0;
            strncpy(obj->name, basename, length);
            memcpy(obj->meta, s.meta, sizeof(obj->meta));
            return VFS_OK;
        }
    }

    return vfs_spiffs_map_error_code(res);
}

/**directory operations*/
int32_t vfs_spiffs_open_dir(const char *dir, vfs_dir_t *fd) {
    fd->handle = NULL;
    size_t length = strlen(dir);
    if (length == 0 || length + (dir[length - 1] == '/' ? 0 : 1) >= VFS_MAX_PATH_LEN) {
        return VFS_ERR_MAXNM;
    }
    vfs_spiffs_dir_t *p_dir = mui_mem_malloc(sizeof(vfs_spiffs_dir_t));
    if (!p_dir) {
        return VFS_ERR_NOMEM;
    }
    fd->handle = p_dir;
    p_dir->pe = &p_dir->e;
    if (!cwalk_dir_prefix_match(p_dir->dir, dir)) {
        mui_mem_free(p_dir);
        fd->handle = NULL;
        return VFS_ERR_MAXNM;
    }
    p_dir->seg = cwalk_get_segment_size(dir);

    if (!SPIFFS_opendir(&fs, "/", &p_dir->d)) {
        mui_mem_free(p_dir);
        fd->handle = NULL;
        return VFS_ERR_NOOBJ;
    }
#if defined(BOARD_LCD)
    vfs_spiffs_diag_list_begin(dir);
#endif

    NRF_LOG_INFO("open dir %s\n", nrf_log_push((char *)dir));

    return VFS_OK;
}

int32_t vfs_spiffs_read_dir(vfs_dir_t *fd, vfs_obj_t *obj) {
    vfs_spiffs_dir_t *p_dir = fd->handle;
    if (!p_dir) {
        return VFS_ERR_FAIL;
    }
    memset(obj, 0, sizeof(vfs_obj_t));
    SPIFFS_clearerr(&fs);
    while ((p_dir->pe = SPIFFS_readdir(&p_dir->d, &p_dir->e))) {
#if defined(BOARD_LCD)
        vfs_spiffs_diag_list_entry(p_dir->dir, p_dir->pe);
#endif

        // NRF_LOG_INFO("list folder %s [%04x] %d size:%i\n", nrf_log_push(p_dir->pe->name), p_dir->pe->obj_id,
        //              p_dir->pe->type, p_dir->pe->size);
        // NRF_LOG_FLUSH();

        // strcpy(obj->name, p_dir->pe->name);
        //         obj->size = p_dir->pe->size;
        //         obj->type = VFS_TYPE_REG;
        //         return VFS_OK;

        // prefix compare
        if (cwalk_same_prefix_segment(p_dir->dir, p_dir->pe->name)) {

            uint8_t seg;
            const char *basename;
            size_t length;
            bool is_folder;

            // /amiibo/.folder
            // /amiibo/zelda/.folder
            // /amiibo/link.bin
            // /amiibo/zelda/mifa.bin

            cwk_path_get_basename(p_dir->pe->name, &basename, &length);

            is_folder = length == sizeof(VFS_SPIFFS_FOLDER_NAME) - 1 &&
                        memcmp(basename, VFS_SPIFFS_FOLDER_NAME, length) == 0;

            seg = cwalk_get_segment_size(p_dir->pe->name);
            // next dir level
            if (seg == p_dir->seg + 1 && !is_folder) {
                // /amiibo/.folder
                // /amiibo/link.bin

                // not a .folder, it's a file!!
                struct cwk_segment segment;
                cwk_path_get_last_segment(p_dir->pe->name, &segment); //.folder
                if (segment.size >= sizeof(obj->name)) {
                    return VFS_ERR_MAXNM;
                }
                strncpy(obj->name, segment.begin, segment.size);
                obj->name[sizeof(obj->name) - 1] = '\0';

                memcpy(obj->meta, p_dir->pe->meta, sizeof(obj->meta));
                /* Even an interrupted journal creation (before its metadata
                 * write) stays hidden in normal catalogs. Read-only system
                 * backups may still enumerate and read these records. */
                if (vfs_persist_reserved(p_dir->pe->name)) {
                    memset(obj->meta, 0, sizeof(obj->meta));
                    obj->meta[0] = 2;
                    obj->meta[1] = 2; /* VFS_META_TYPE_FLAGS */
                    obj->meta[2] = 3; /* HIDDEN | SYSTEM */
                }

                obj->size = p_dir->pe->size;
                obj->type = VFS_TYPE_REG;

                return VFS_OK;

            } else if (seg == p_dir->seg + 2 && is_folder) {
                // /amiibo/zelda/.folder
                // /amiibo/zelda/mifa.bin

                struct cwk_segment segment;
                cwk_path_get_last_segment(p_dir->pe->name, &segment); //.folder
                cwk_path_get_previous_segment(&segment);              // zelda
                if (segment.size >= sizeof(obj->name)) {
                    return VFS_ERR_MAXNM;
                }
                strncpy(obj->name, segment.begin, segment.size);
                obj->name[sizeof(obj->name) - 1] = '\0';

                memcpy(obj->meta, p_dir->pe->meta, sizeof(obj->meta));

                obj->size = p_dir->pe->size;
                obj->type = VFS_TYPE_DIR;

                return VFS_OK;
            }
        }
    }

    int err = SPIFFS_errno(&fs);
#if defined(BOARD_LCD)
    vfs_spiffs_diag_list_end(p_dir->dir, err);
#endif
    return err == SPIFFS_OK ? VFS_ERR_EOF : vfs_spiffs_map_error_code(err);
}

int32_t vfs_spiffs_close_dir(vfs_dir_t *fd) {
    vfs_spiffs_dir_t *p_dir = fd->handle;
    if (!p_dir) {
        return VFS_ERR_FAIL;
    }
#if defined(BOARD_LCD)
    vfs_spiffs_diag_list_closed(p_dir->dir);
#endif
    int res = SPIFFS_closedir(&p_dir->d);
    mui_mem_free(fd->handle);
    fd->handle = NULL;
    return vfs_spiffs_map_error_code(res);
}

int32_t vfs_spiffs_create_dir(const char *dir) {
    char path[VFS_MAX_PATH_LEN];

    NRF_LOG_INFO("create dir %s, %d\n", nrf_log_push((char *)dir), strlen(dir));
    int res = vfs_check_folder_path(dir);
    if (res != VFS_OK) {
        NRF_LOG_INFO("folder path check failed: %d", res);
        return res;
    }

    snprintf(path, sizeof(path), "%s/%s", dir, VFS_SPIFFS_FOLDER_NAME);

    res = SPIFFS_creat(&fs, path, 0);
    return vfs_spiffs_map_error_code(res);
}

int32_t vfs_spiffs_remove_dir(const char *dir_name) {
    int ret = vfs_check_folder_path(dir_name);
    if (ret != VFS_OK) {
        return ret;
    }

    vfs_spiffs_dir_t dir;
    vfs_spiffs_dir_t *p_dir = &dir;
    p_dir->pe = &p_dir->e;
    strncpy(p_dir->dir, dir_name, sizeof(p_dir->dir));
    strcat(p_dir->dir, "/");

    NRF_LOG_INFO("remove dir %s\n", nrf_log_push((char *)dir_name));

    if (!SPIFFS_opendir(&fs, "/", &p_dir->d)) {
        return VFS_ERR_NOOBJ;
    }

    SPIFFS_clearerr(&fs);
    while ((p_dir->pe = SPIFFS_readdir(&p_dir->d, &p_dir->e))) {
        // prefix compare
        if (cwalk_same_prefix_segment(p_dir->dir, p_dir->pe->name)) {
            int res = SPIFFS_remove(&fs, p_dir->pe->name);
            NRF_LOG_INFO("remove file %d: %s\n", res, nrf_log_push(p_dir->pe->name));
            if (res != SPIFFS_OK) {
                SPIFFS_closedir(&dir.d);
                return vfs_spiffs_map_error_code(res);
            }
        }
    }

    int err = SPIFFS_errno(&fs);
    int close_err = SPIFFS_closedir(&dir.d);
    return vfs_spiffs_map_error_code(err != SPIFFS_OK ? err : close_err);
}

int32_t vfs_spiffs_rename_dir_internal(const char *dir_name, const char *new_dir_name, bool check_only) {
    vfs_spiffs_dir_t dir;
    vfs_spiffs_dir_t *p_dir = &dir;
    int32_t err_code = VFS_OK;

    int ret = vfs_check_folder_path(dir_name);
    if (ret != VFS_OK) {
        return ret;
    }

    int ret2 = vfs_check_folder_path(new_dir_name);
    if (ret2 != VFS_OK) {
        return ret2;
    }

    p_dir->pe = &p_dir->e;
    if (!cwalk_dir_prefix_match(p_dir->dir, dir_name)) {
        return VFS_ERR_MAXNM;
    }
    char new_prefix[SPIFFS_OBJ_NAME_LEN];
    if (!cwalk_dir_prefix_match(new_prefix, new_dir_name)) {
        return VFS_ERR_MAXNM;
    }

    if (!SPIFFS_opendir(&fs, "/", &p_dir->d)) {
        int error = SPIFFS_errno(&fs);
        return error == SPIFFS_OK ? VFS_ERR_FAIL : vfs_spiffs_map_error_code(error);
    }

    SPIFFS_clearerr(&fs);
    while ((p_dir->pe = SPIFFS_readdir(&p_dir->d, &p_dir->e))) {
        /* SPIFFS has a flat namespace: any child (including .folder) makes
         * the destination an existing directory. Never merge directories. */
        if (check_only && cwalk_same_prefix_segment(new_prefix, p_dir->pe->name)) {
            err_code = VFS_ERR_OBJEX;
            break;
        }
        // prefix compare
        if (cwalk_same_prefix_segment(p_dir->dir, p_dir->pe->name)) {

            char new_path[SPIFFS_OBJ_NAME_LEN];
            const char *file_suffix = p_dir->pe->name + strlen(p_dir->dir);

            uint32_t new_path_len = strlen(new_dir_name) + strlen(file_suffix) + 1;
            NRF_LOG_INFO("path len check: %d", new_path_len);
            if (new_path_len >= sizeof(new_path)) {
                err_code = VFS_ERR_MAXNM;
                NRF_LOG_INFO("rename folder name too long");
                break;
            }

            strcpy(new_path, new_dir_name);
            strcat(new_path, "/");
            strcat(new_path, file_suffix);

            if (check_only) {
                spiffs_stat target;
                int res = SPIFFS_stat(&fs, new_path, &target);
                if (res != SPIFFS_ERR_NOT_FOUND) {
                    err_code = res == SPIFFS_OK ? VFS_ERR_OBJEX : vfs_spiffs_map_error_code(res);
                    break;
                }
                /* NOT_FOUND is the expected preflight result, not an error
                 * from the subsequent directory traversal. */
                SPIFFS_clearerr(&fs);
            } else {
                int res = SPIFFS_rename(&fs, p_dir->pe->name, new_path);
                if (res != SPIFFS_OK) {
                    err_code = vfs_spiffs_map_error_code(res);
                    break;
                }
            }
        }
    }

    int read_err = SPIFFS_errno(&fs);
    int close_err = SPIFFS_closedir(&dir.d);
    if (err_code == VFS_OK) {
        err_code = vfs_spiffs_map_error_code(read_err != SPIFFS_OK ? read_err : close_err);
    }
    return err_code;
}

int32_t vfs_spiffs_rename_dir(const char *dir_name, const char *new_dir_name) {
    int32_t err_code = vfs_check_folder_path(dir_name);
    if (err_code != VFS_OK) return err_code;
    err_code = vfs_check_folder_path(new_dir_name);
    if (err_code != VFS_OK) return err_code;
    char source[VFS_MAX_PATH_LEN], target[VFS_MAX_PATH_LEN];
    strcpy(source, dir_name);
    strcpy(target, new_dir_name);
    size_t source_length = strlen(source), target_length = strlen(target);
    while (source_length > 1 && source[source_length - 1] == '/') source[--source_length] = 0;
    while (target_length > 1 && target[target_length - 1] == '/') target[--target_length] = 0;
    /* A directory cannot be renamed to itself or inside its own subtree. */
    if (cwalk_same_prefix_segment(source, target)) return VFS_ERR_FAIL;
    spiffs_stat existing;
    int result = SPIFFS_stat(&fs, target, &existing);
    if (result != SPIFFS_ERR_NOT_FOUND)
        return result == SPIFFS_OK ? VFS_ERR_OBJEX : vfs_spiffs_map_error_code(result);
    SPIFFS_clearerr(&fs);
    err_code = vfs_spiffs_rename_dir_internal(source, target, true);
    if (err_code == VFS_OK) {
        /* Preflight is read-only; later I/O failure/power loss can still leave
         * a partial multi-file rename. This is not an atomic transaction. */
        err_code = vfs_spiffs_rename_dir_internal(source, target, false);
    }
    return err_code;
}

/**file operations*/
int32_t vfs_spiffs_open_file(const char *file, vfs_file_t *fd, uint32_t flags) {
    int ret = vfs_check_file_path(file);
    if (ret != VFS_OK) {
        return ret;
    }
#if defined(BOARD_LCD)
    vfs_spiffs_diag_open_begin(file);
#endif
    spiffs_file handle = SPIFFS_open(&fs, file, flags, 0);
#if defined(BOARD_LCD)
    vfs_spiffs_diag_open_end(handle, handle < 0 ? SPIFFS_errno(&fs) : 0);
#endif
    fd->handle = (void *)(intptr_t)handle;
    if (handle < 0) {
        return vfs_spiffs_map_error_code(handle);
    }

    return VFS_OK;
}

#if defined(BOARD_LCD)
int32_t vfs_spiffs_storage_diagnose(uint8_t operation, uint8_t candidate,
                                   uint8_t *out, size_t capacity, size_t *length) {
    return vfs_spiffs_diag_query(&fs, operation, candidate, out, capacity, length);
}
#endif

int32_t vfs_spiffs_close_file(vfs_file_t *fd) {
    if ((intptr_t)fd->handle < 0) {
        return VFS_ERR_FAIL;
    }
    int res = SPIFFS_close(&fs, (spiffs_file)(intptr_t)fd->handle);
    if (res == SPIFFS_OK) {
        fd->handle = (void *)(intptr_t)-1;
    }
    return vfs_spiffs_map_error_code(res);
}

int32_t vfs_spiffs_abort_file(vfs_file_t *fd) {
    if (!fd || (intptr_t)fd->handle < 0) return VFS_ERR_FAIL;
    int res = SPIFFS_abort(&fs, (spiffs_file)(intptr_t)fd->handle);
    if (res == SPIFFS_OK) fd->handle = (void *)(intptr_t)-1;
    return vfs_spiffs_map_error_code(res);
}

int32_t vfs_spiffs_read_file(vfs_file_t *fd, void *buff, size_t buff_size) {
    if ((intptr_t)fd->handle < 0) {
        return VFS_ERR_FAIL;
    }
    NRF_LOG_INFO("read file %d with %d bytes", fd->handle, buff_size);
    int32_t read_size = SPIFFS_read(&fs, (spiffs_file)(intptr_t)fd->handle, buff, buff_size);
    if (read_size < 0) {
        return vfs_spiffs_map_error_code(read_size);
    }
    return read_size;
}

int32_t vfs_spiffs_write_file(vfs_file_t *fd, void *buff, size_t buff_size) {
    if ((intptr_t)fd->handle < 0) {
        return VFS_ERR_FAIL;
    }
    NRF_LOG_INFO("write file %d with %d bytes", fd->handle, buff_size);
    int32_t written_size = SPIFFS_write(&fs, (spiffs_file)(intptr_t)fd->handle, buff, buff_size);
    if (written_size < 0) {
        return vfs_spiffs_map_error_code(written_size);
    }
    return written_size;
}

int32_t vfs_spiffs_update_file_meta(const char *file, void *meta, size_t meta_size) {
    if (meta_size > VFS_MAX_META_LEN || (meta_size && !meta)) return VFS_ERR_FAIL;
    /* SPIFFS consumes its configured fixed metadata width, not meta_size. */
    uint8_t padded_meta[VFS_MAX_META_LEN] = {0};
    if (meta_size) memcpy(padded_meta, meta, meta_size);
    vfs_obj_t obj;
    int32_t err = vfs_spiffs_stat_file(file, &obj);
    if (err != VFS_OK) {
        return err;
    }
    if (obj.type == VFS_TYPE_DIR) {
        char path[SPIFFS_OBJ_NAME_LEN];
        if (snprintf(path, sizeof(path), "%s%s%s", file, file[strlen(file) - 1] == '/' ? "" : "/",
                     VFS_SPIFFS_FOLDER_NAME) >= sizeof(path)) {
            return VFS_ERR_MAXNM;
        }
        err = SPIFFS_update_meta(&fs, path, padded_meta);
    } else {
        err = SPIFFS_update_meta(&fs, file, padded_meta);
    }

    NRF_LOG_INFO("update file meta: %s, size:%d res: %d", nrf_log_push((char *)file), meta_size, err);
    return vfs_spiffs_map_error_code(err);
}

/**short opearation*/
int32_t vfs_spiffs_write_file_data(const char *file, void *buff, size_t buff_size) {

    NRF_LOG_INFO("write file data %s\n", nrf_log_push((char *)file));

    int ret = vfs_check_file_path(file);
    if (ret != VFS_OK) {
        return ret;
    }

    spiffs_file fd = SPIFFS_open(&fs, file, SPIFFS_WRONLY | SPIFFS_CREAT | SPIFFS_TRUNC, 0);
    if (fd < 0) {
        return vfs_spiffs_map_error_code(fd);
    }
    int res = VFS_OK;
    if (buff != NULL && buff_size > 0) {
        res = SPIFFS_write(&fs, fd, buff, buff_size);
    }
    int close_res = SPIFFS_close(&fs, fd);
    /* The local descriptor cannot be retried after this operation returns. */
    if (close_res != SPIFFS_OK) SPIFFS_abort(&fs, fd);
    if (res >= 0 && close_res != SPIFFS_OK) {
        return vfs_spiffs_map_error_code(close_res);
    }
    if (res >= 0 && (size_t)res != buff_size) {
        return VFS_ERR_FAIL;
    }
    if (res > 0) {
        return res;
    } else {
        return vfs_spiffs_map_error_code(res);
    }
}

int32_t vfs_spiffs_read_file_data(const char *file, void *buff, size_t buff_size) {
    spiffs_file fd = SPIFFS_open(&fs, file, SPIFFS_RDONLY, 0);
    if (fd < 0) {
        return vfs_spiffs_map_error_code(fd);
    }
    int res = SPIFFS_read(&fs, fd, buff, buff_size);
    int close_res = SPIFFS_close(&fs, fd);
    if (close_res != SPIFFS_OK) SPIFFS_abort(&fs, fd);
    if (res >= 0 && close_res != SPIFFS_OK) {
        return vfs_spiffs_map_error_code(close_res);
    }
    if (res > 0) {
        return res;
    } else {
        return vfs_spiffs_map_error_code(res);
    }
}

int32_t vfs_spiffs_rename_file(const char *file, const char *new_file) {
    int32_t ret = vfs_check_file_path(file);
    if (ret != VFS_OK) {
        return ret;
    }

    ret = vfs_check_file_path(new_file);
    if (ret != VFS_OK) {
        return ret;
    }

    NRF_LOG_INFO("rename file %s => %s\n", nrf_log_push((char *)file), nrf_log_push((char *)new_file));
    int res = SPIFFS_rename(&fs, file, new_file);
    return vfs_spiffs_map_error_code(res);
}

int32_t vfs_spiffs_remove_file(const char *file) {
    int res = SPIFFS_remove(&fs, file);
    return vfs_spiffs_map_error_code(res);
}

/* The journal uses only this private, unguarded backend. Public mutations go
 * through wrappers below, including non-BLE UI rename/delete operations. */
static const vfs_driver_t persist_raw_driver = {
    .stat_file = vfs_spiffs_stat_file,
    .open_file = vfs_spiffs_open_file,
    .close_file = vfs_spiffs_close_file,
    .abort_file = vfs_spiffs_abort_file,
    .read_file = vfs_spiffs_read_file,
    .write_file = vfs_spiffs_write_file,
    .update_file_meta = vfs_spiffs_update_file_meta,
    .read_file_data = vfs_spiffs_read_file_data,
    .write_file_data = vfs_spiffs_write_file_data,
    .remove_file = vfs_spiffs_remove_file,
};

static int32_t guarded_open(const char *path, vfs_file_t *fd, uint32_t flags) {
    bool writing = flags & (VFS_MODE_WRITEONLY | VFS_MODE_APPEND | VFS_MODE_TRUNC | VFS_MODE_CREATE);
    if (!writing) return vfs_spiffs_open_file(path, fd, flags);
    size_t slot = 0;
    while (slot < IFS_MAX_FD && writer_used[slot]) ++slot;
    if (slot == IFS_MAX_FD) return VFS_ERR_NOMEM;
    int32_t result = vfs_persist_writer_begin(&vfs_driver_fs, path);
    if (result != VFS_OK) return result;
    result = vfs_spiffs_open_file(path, fd, flags);
    if (result != VFS_OK) {
        vfs_persist_writer_end(&vfs_driver_fs);
        return result;
    }
    writer_used[slot] = true;
    writer_handles[slot] = fd->handle;
    return VFS_OK;
}
static int32_t guarded_close(vfs_file_t *fd) {
    void *handle = fd->handle;
    int32_t result = vfs_spiffs_close_file(fd);
    if (result == VFS_OK) {
        for (size_t i = 0; i < IFS_MAX_FD; ++i) {
            if (writer_used[i] && writer_handles[i] == handle) {
                writer_used[i] = false;
                vfs_persist_writer_end(&vfs_driver_fs);
                break;
            }
        }
    }
    return result;
}
static int32_t guarded_abort(vfs_file_t *fd) {
    void *handle = fd->handle;
    int32_t result = vfs_spiffs_abort_file(fd);
    if (result == VFS_OK) {
        for (size_t i = 0; i < IFS_MAX_FD; ++i) {
            if (writer_used[i] && writer_handles[i] == handle) {
                writer_used[i] = false;
                vfs_persist_writer_end(&vfs_driver_fs);
                break;
            }
        }
    }
    return result;
}
static int32_t guarded_write_data(const char *path, void *data, size_t size) {
    int32_t result = vfs_persist_writer_begin(&vfs_driver_fs, path);
    if (result != VFS_OK) return result;
    result = vfs_spiffs_write_file_data(path, data, size);
    vfs_persist_writer_end(&vfs_driver_fs);
    return result;
}
static int32_t guarded_meta(const char *path, void *meta, size_t size) {
    int32_t result = vfs_persist_before_mutation(&vfs_driver_fs, path);
    return result == VFS_OK ? vfs_spiffs_update_file_meta(path, meta, size) : result;
}
static int32_t guarded_remove(const char *path) {
    int32_t result = vfs_persist_before_mutation(&vfs_driver_fs, path);
    return result == VFS_OK ? vfs_spiffs_remove_file(path) : result;
}
static int32_t guarded_remove_dir(const char *path) {
    int32_t result = vfs_persist_before_mutation(&vfs_driver_fs, path);
    return result == VFS_OK ? vfs_spiffs_remove_dir(path) : result;
}
static int32_t guarded_create_dir(const char *path) {
    int32_t result = vfs_persist_before_mutation(&vfs_driver_fs, path);
    return result == VFS_OK ? vfs_spiffs_create_dir(path) : result;
}
static int32_t guarded_rename(const char *path, const char *new_path) {
    int32_t result = vfs_persist_before_mutation(&vfs_driver_fs, path);
    if (result == VFS_OK) result = vfs_persist_before_mutation(&vfs_driver_fs, new_path);
    return result == VFS_OK ? vfs_spiffs_rename_file(path, new_path) : result;
}
static int32_t guarded_rename_dir(const char *path, const char *new_path) {
    int32_t result = vfs_persist_before_mutation(&vfs_driver_fs, path);
    if (result == VFS_OK) result = vfs_persist_before_mutation(&vfs_driver_fs, new_path);
    return result == VFS_OK ? vfs_spiffs_rename_dir(path, new_path) : result;
}

const vfs_driver_t vfs_driver_fs = {.mount = vfs_spiffs_mount,
                                    .umount = vfs_spiffs_umount,
                                    .format = vfs_spiffs_format,
                                    .mounted = vfs_spiffs_mounted,
                                    .stat = vfs_spiffs_stat,

                                    .stat_file = vfs_spiffs_stat_file,

                                    .open_dir = vfs_spiffs_open_dir,
                                    .read_dir = vfs_spiffs_read_dir,
                                    .close_dir = vfs_spiffs_close_dir,
                                    .create_dir = guarded_create_dir,
                                    .remove_dir = guarded_remove_dir,
                                    .rename_dir = guarded_rename_dir,

                                    .open_file = guarded_open,
                                    .close_file = guarded_close,
                                    .abort_file = guarded_abort,
                                    .read_file = vfs_spiffs_read_file,
                                    .write_file = vfs_spiffs_write_file,
                                    .update_file_meta = guarded_meta,

                                    .write_file_data = guarded_write_data,
                                    .read_file_data = vfs_spiffs_read_file_data,

                                    .rename_file = guarded_rename,
                                    .remove_file = guarded_remove};
#endif
