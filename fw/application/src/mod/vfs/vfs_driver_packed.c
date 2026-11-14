/* SPDX-License-Identifier: GPL-2.0-only */
#include "boards.h"
#ifdef VFS_PACKED_LFS_ENABLE
#include "hal_spi_flash.h"
#include "mui_mem.h"
#include "packed_fs.h"
#include "vfs_driver_fs.h"
#include "vfs_packed_runtime.h"
#include "vfs_persist.h"
#if defined(PIXL_RUNTIME_DIAGNOSTICS)
#include "app_timer.h"
#endif
#include <limits.h>
#include <string.h>

static pfs_t *store;
static uint32_t mount_epoch;
static bool geometry_valid;
static const vfs_driver_t persist_raw_driver;
/* Mount revisits CTZ links at block beginnings and directory metadata read
 * into the LittleFS global read buffer. Cache these pages only during this
 * read-only walk, so streaming record payloads do not evict them. Low two
 * tag bits store LRU rank (0 = most recent); the rest identify a flash page. */
typedef struct {
  uint16_t tag[4];
  uint8_t page[4][PFS_CACHE_SIZE];
} mount_pages_t;
static mount_pages_t *mount_pages;
typedef struct {
  pfs_file_t *file;
  bool external_writer;
} packed_handle_t;

#if defined(PIXL_RUNTIME_DIAGNOSTICS)
static uint32_t mount_tick(void) { return app_timer_cnt_get(); }
static uint32_t mount_elapsed_ms(uint32_t started) {
  uint32_t ticks = app_timer_cnt_diff_compute(app_timer_cnt_get(), started);
  uint64_t ms = (uint64_t)ticks * (APP_TIMER_CONFIG_RTC_FREQUENCY + 1u) * 1000u / APP_TIMER_CLOCK_FREQ;
  return ms > UINT32_MAX ? UINT32_MAX : (uint32_t)ms;
}
#else
static uint32_t mount_tick(void) { return 0; }
static uint32_t mount_elapsed_ms(uint32_t started) { (void)started; return 0; }
#endif
static int32_t map_error(int r) {
  switch (r) {
  case 0:
    return VFS_OK;
  case LFS_ERR_BADF:
    return pfs_mounted(store) ? VFS_ERR_FAIL : VFS_ERR_NODEV;
  case LFS_ERR_NOMEM:
    return VFS_ERR_NOMEM;
  case LFS_ERR_NOSPC:
  case LFS_ERR_FBIG:
    return VFS_ERR_NOSPC;
  case LFS_ERR_NAMETOOLONG:
    return VFS_ERR_MAXNM;
  case LFS_ERR_NOENT:
    return VFS_ERR_NOOBJ;
  case LFS_ERR_EXIST:
    return VFS_ERR_OBJEX;
  case LFS_ERR_CORRUPT:
    return VFS_ERR_CRPT;
  default:
    return VFS_ERR_FAIL;
  }
}
static bool range(const struct lfs_config *c, lfs_block_t b, lfs_off_t o,
                  lfs_size_t n) {
  return c && c->block_size == PFS_BLOCK_SIZE &&
         c->block_count == PFS_BLOCK_COUNT && b < c->block_count &&
         o <= c->block_size && n <= c->block_size - o;
}
enum { MOUNT_SLOTS = 4 };
_Static_assert(PFS_BLOCK_COUNT * (PFS_BLOCK_SIZE / PFS_CACHE_SIZE) <= UINT16_MAX >> 2,
               "page tag and LRU rank must fit");
static void mount_touch(unsigned slot, uint16_t id) {
  /* Empty slots are older than every valid entry. Only promote younger peers. */
  unsigned limit = mount_pages->tag[slot] ? (mount_pages->tag[slot] & 3u) : MOUNT_SLOTS;
  for (unsigned i = 0; i < MOUNT_SLOTS; ++i)
    if (mount_pages->tag[i] && (mount_pages->tag[i] & 3u) < limit)
      ++mount_pages->tag[i];
  mount_pages->tag[slot] = (uint16_t)(id << 2);
}
static int flash_read(const struct lfs_config *c, lfs_block_t b, lfs_off_t o,
                      void *data, lfs_size_t n) {
  if (!range(c, b, o, n) || (n && !data))
    return LFS_ERR_IO;
  bool eligible = n == PFS_CACHE_SIZE && o % PFS_CACHE_SIZE == 0 &&
                  (o == 0 || data == c->read_buffer);
  bool cacheable = mount_pages && eligible;
  uint16_t page = (uint16_t)(b * (PFS_BLOCK_SIZE / PFS_CACHE_SIZE) + o / PFS_CACHE_SIZE + 1);
  unsigned slot = 0;
  if (cacheable) {
    for (unsigned i = 0; i < MOUNT_SLOTS; ++i) {
      uint16_t tag = mount_pages->tag[i];
      if ((tag >> 2) == page) {
        memcpy(data, mount_pages->page[i], n);
        if (tag & 3u) mount_touch(i, page);
        runtime_diag_mount_cache(true, true);
        return 0;
      }
      if (!tag || (tag & 3u) == MOUNT_SLOTS - 1) slot = i;
    }
  }
  runtime_diag_mount_cache(false, eligible);
  bool success = hal_spi_flash_read(b * c->block_size + o, data, n) == NRF_SUCCESS;
  runtime_diag_mount_read(n, success);
  if (!success) return LFS_ERR_IO;
  if (cacheable) {
    memcpy(mount_pages->page[slot], data, n);
    mount_touch(slot, page);
  }
  return 0;
}
static int flash_prog(const struct lfs_config *c, lfs_block_t b, lfs_off_t o,
                      const void *data, lfs_size_t n) {
  if (!range(c, b, o, n) || (n && !data) || o % PFS_CACHE_SIZE ||
      n % PFS_CACHE_SIZE)
    return LFS_ERR_IO;
  return hal_spi_flash_prog(b * c->block_size + o, data, n) == NRF_SUCCESS
             ? 0
             : LFS_ERR_IO;
}
static int flash_erase(const struct lfs_config *c, lfs_block_t b) {
  if (!range(c, b, 0, c ? c->block_size : 0))
    return LFS_ERR_IO;
  return hal_spi_flash_erase(b * c->block_size) == NRF_SUCCESS ? 0 : LFS_ERR_IO;
}
/* HAL program/erase complete synchronously. */
static int flash_sync(const struct lfs_config *c) {
  (void)c;
  return 0;
}
static int32_t configure(void) {
  if (store)
    return VFS_OK;
  flash_info_t info;
  geometry_valid = false;
  if (hal_spi_flash_init() != NRF_SUCCESS ||
      hal_spi_flash_info(&info) != NRF_SUCCESS)
    return VFS_ERR_NODEV;
  if (info.page_size != PFS_CACHE_SIZE || info.block_size != PFS_BLOCK_SIZE ||
      info.block_count != PFS_BLOCK_COUNT)
    return VFS_ERR_UNSUPT;
  geometry_valid = true;
  struct lfs_config cfg = {0};
  cfg.read = flash_read;
  cfg.prog = flash_prog;
  cfg.erase = flash_erase;
  cfg.sync = flash_sync;
  cfg.read_size = cfg.prog_size = PFS_CACHE_SIZE;
  cfg.block_size = PFS_BLOCK_SIZE;
  cfg.block_count = PFS_BLOCK_COUNT;
  store = pfs_new(&cfg, mui_mem_malloc, mui_mem_free);
  return store ? VFS_OK : VFS_ERR_NOMEM;
}
bool vfs_packed_geometry_valid(void) { return geometry_valid; }
bool vfs_packed_import_pending(void) {
  return pfs_poisoned(store) || pfs_import_pending(store);
}
bool vfs_packed_import_identity(uint8_t out[32]) {
  return pfs_get_import_identity(store, out);
}
bool vfs_packed_handles_idle(void) {
  return pfs_idle(store) && !vfs_persist_active(&vfs_driver_fs);
}
int32_t vfs_packed_bind_import(const uint8_t digest[32]) {
  return !vfs_packed_handles_idle() ? VFS_ERR_FAIL
                                    : map_error(pfs_bind_import(store, digest));
}
int32_t vfs_packed_finish_import(void) {
  return !vfs_packed_handles_idle() ? VFS_ERR_FAIL
                                    : map_error(pfs_finish_import(store));
}
static bool packed_mounted(void) { return pfs_mounted(store); }
uint64_t vfs_packed_revision(void) {
  uint32_t generation = pfs_generation(store);
  return generation && mount_epoch && mount_epoch != UINT32_MAX
      ? ((uint64_t)mount_epoch << 32) | generation : 0;
}
static void mounted_revision(void) {
  /* Saturation disables caching instead of ever reusing an old token. */
  if (mount_epoch != UINT32_MAX) mount_epoch++;
}
static int32_t packed_mount(void) {
  if (pfs_mounted(store))
    return pfs_poisoned(store) ? VFS_ERR_CRPT : VFS_OK;
  runtime_diag_mount_begin();
  uint32_t started = mount_tick();
  int32_t r = configure();
  runtime_diag_mount_configured(mount_elapsed_ms(started));
  if (r) {
    runtime_diag_mount_complete(r, 0, false);
    return r;
  }
  mount_pages_t *pages = mui_mem_malloc(sizeof(*pages));
  if (pages) memset(pages->tag, 0, sizeof(pages->tag));
  mount_pages = pages;
  started = mount_tick();
  r = pfs_mount(store);
  runtime_diag_mount_complete(map_error(r), mount_elapsed_ms(started), pages != NULL);
  mount_pages = NULL;
  if (pages) mui_mem_free(pages);
  if (r)
    return map_error(r);
  mounted_revision();
  vfs_persist_unmounted(&vfs_driver_fs);
  vfs_persist_bind(&vfs_driver_fs, &persist_raw_driver);
  return VFS_OK;
}
static int32_t packed_umount(void) {
  if (!vfs_packed_handles_idle())
    return VFS_ERR_FAIL;
  if (!store)
    return VFS_OK;
  int32_t r = pfs_unmount(store);
  if (!r)
    vfs_persist_unmounted(&vfs_driver_fs);
  return map_error(r);
}
static int32_t packed_format(void) {
  if (!vfs_packed_handles_idle())
    return VFS_ERR_FAIL;
  int32_t r = configure();
  if (r)
    return r;
  r = pfs_format(store);
  vfs_packed_latch_recovery();
  if (r)
    return map_error(r);
  vfs_persist_unmounted(&vfs_driver_fs);
  vfs_persist_bind(&vfs_driver_fs, &persist_raw_driver);
  vfs_packed_latch_recovery();
  mounted_revision();
  return VFS_OK;
}
static int32_t packed_stat(vfs_stat_t *s) {
  if (!s)
    return VFS_ERR_FAIL;
  memset(s, 0, sizeof(*s));
  if (!pfs_mounted(store))
    return VFS_OK;
  int r = pfs_space(store, &s->total_bytes, &s->free_bytes);
  if (!r)
    s->avaliable = true;
  return map_error(r);
}
static int32_t to_obj(const pfs_info_t *info, vfs_obj_t *obj) {
  memset(obj, 0, sizeof(*obj));
  const char *leaf = strrchr(info->path, '/');
  leaf = leaf ? leaf + 1 : info->path;
  if (strlen(leaf) >= sizeof(obj->name))
    return VFS_ERR_MAXNM;
  memcpy(obj->name, leaf, strlen(leaf) + 1);
  obj->type = info->type == PFS_DIR ? VFS_TYPE_DIR : VFS_TYPE_REG;
  obj->size = info->size;
  memcpy(obj->meta, info->meta, sizeof(obj->meta));
  return VFS_OK;
}
static int32_t packed_stat_file(const char *path, vfs_obj_t *obj) {
  if (!obj)
    return VFS_ERR_FAIL;
  memset(obj, 0, sizeof(*obj));
  if (!pfs_mounted(store))
    return VFS_ERR_NODEV;
  pfs_info_t info;
  int r = pfs_stat(store, path, &info);
  return r ? map_error(r) : to_obj(&info, obj);
}
static int32_t packed_open_dir(const char *path, vfs_dir_t *fd) {
  if (!fd)
    return VFS_ERR_FAIL;
  fd->handle = NULL;
  if (!pfs_mounted(store))
    return VFS_ERR_NODEV;
  pfs_dir_t *dir;
  int r = pfs_opendir(store, path, &dir);
  if (r)
    return map_error(r);
  fd->handle = dir;
  memcpy(fd->path, path, strlen(path) + 1);
  return VFS_OK;
}
static int32_t packed_read_dir(vfs_dir_t *fd, vfs_obj_t *obj) {
  if (!fd || !fd->handle || !obj)
    return VFS_ERR_FAIL;
  memset(obj, 0, sizeof(*obj));
  pfs_info_t info;
  int r = pfs_readdir(fd->handle, &info);
  if (r <= 0)
    return r ? map_error(r) : VFS_ERR_EOF;
  r = to_obj(&info, obj);
  if (!r && vfs_persist_reserved(info.path)) {
    memset(obj->meta, 0, sizeof(obj->meta));
    obj->meta[0] = 2;
    obj->meta[1] = 2;
    obj->meta[2] = 3;
  }
  return r;
}
static int32_t packed_close_dir(vfs_dir_t *fd) {
  if (!fd || !fd->handle)
    return VFS_ERR_FAIL;
  int r = pfs_closedir(fd->handle);
  if (!r)
    fd->handle = NULL;
  return map_error(r);
}
static int32_t packed_create_dir(const char *path) {
  return map_error(pfs_mkdir(store, path));
}
static int32_t type_check(const char *path, bool dir) {
  pfs_info_t info;
  int r = pfs_stat(store, path, &info);
  return r                               ? map_error(r)
         : (info.type == PFS_DIR) == dir ? VFS_OK
                                         : VFS_ERR_FAIL;
}
static int32_t packed_remove_file(const char *path) {
  int r = type_check(path, false);
  return r ? r : map_error(pfs_remove(store, path, false));
}
static int32_t packed_remove_dir(const char *path) {
  int r = type_check(path, true);
  return r ? r : map_error(pfs_remove(store, path, true));
}
static int32_t packed_rename_file(const char *path, const char *to) {
  int r = type_check(path, false);
  return r ? r : map_error(pfs_rename(store, path, to));
}
static int32_t packed_rename_dir(const char *path, const char *to) {
  int r = type_check(path, true);
  return r ? r : map_error(pfs_rename(store, path, to));
}
static int32_t packed_open_file(const char *path, vfs_file_t *fd,
                                uint32_t flags) {
  if (!fd)
    return VFS_ERR_FAIL;
  fd->handle = NULL;
  if (!pfs_mounted(store))
    return VFS_ERR_NODEV;
  if (!vfs_packed_open_flags_valid(flags))
    return VFS_ERR_FAIL;
  int access = flags & VFS_MODE_WRITEONLY
                   ? (flags & VFS_MODE_READONLY ? LFS_O_RDWR : LFS_O_WRONLY)
                   : LFS_O_RDONLY;
  if (flags & VFS_MODE_APPEND)
    access |= LFS_O_APPEND;
  if (flags & VFS_MODE_TRUNC)
    access |= LFS_O_TRUNC;
  if (flags & VFS_MODE_CREATE)
    access |= LFS_O_CREAT;
  packed_handle_t *h = mui_mem_malloc(sizeof(*h));
  if (!h)
    return VFS_ERR_NOMEM;
  memset(h, 0, sizeof(*h));
  int r = pfs_open(store, path, access, &h->file);
  if (r) {
    mui_mem_free(h);
    return map_error(r);
  }
  fd->handle = h;
  return VFS_OK;
}
static int32_t close_file(vfs_file_t *fd, bool aborting) {
  if (!fd)
    return VFS_ERR_FAIL;
  if (!fd->handle)
    return aborting ? VFS_OK : VFS_ERR_FAIL;
  packed_handle_t *h = fd->handle;
  int r = aborting ? pfs_abort(h->file) : pfs_close(h->file);
  if (r)
    return map_error(r);
  if (h->external_writer)
    vfs_persist_writer_end(&vfs_driver_fs);
  mui_mem_free(h);
  fd->handle = NULL;
  return VFS_OK;
}
static int32_t packed_close_file(vfs_file_t *fd) {
  return close_file(fd, false);
}
static int32_t packed_abort_file(vfs_file_t *fd) {
  return close_file(fd, true);
}
static int32_t packed_read_file(vfs_file_t *fd, void *data, size_t size) {
  if (!fd || !fd->handle || (size && !data) || size > INT32_MAX)
    return VFS_ERR_FAIL;
  int r = pfs_read(((packed_handle_t *)fd->handle)->file, data, size);
  return r < 0 ? map_error(r) : r;
}
static int32_t packed_write_file(vfs_file_t *fd, void *data, size_t size) {
  if (!fd || !fd->handle || (size && !data) || size > INT32_MAX)
    return VFS_ERR_FAIL;
  int r = pfs_write(((packed_handle_t *)fd->handle)->file, data, size);
  return r < 0 ? map_error(r) : r;
}
int32_t vfs_packed_stage_meta(vfs_file_t *fd, const uint8_t meta[128]) {
  if (!fd || !fd->handle || !meta) return VFS_ERR_FAIL;
  packed_handle_t *h = fd->handle;
  if (!h->external_writer) return VFS_ERR_FAIL;
  return map_error(pfs_file_set_meta(h->file, meta));
}
static int32_t packed_update_file_meta(const char *path, void *data,
                                       size_t size) {
  if (size > VFS_MAX_META_LEN || (size && !data))
    return VFS_ERR_FAIL;
  uint8_t meta[VFS_MAX_META_LEN] = {0};
  if (size)
    memcpy(meta, data, size);
  return map_error(pfs_setattr(store, path, meta));
}
static int32_t transfer_data(const char *path, void *data, size_t size,
                             bool writing) {
  if ((size && !data) || size > INT32_MAX)
    return VFS_ERR_FAIL;
  vfs_file_t fd;
  int r = packed_open_file(path, &fd,
                           writing ? VFS_MODE_CREATE | VFS_MODE_TRUNC |
                                         VFS_MODE_WRITEONLY
                                   : VFS_MODE_READONLY);
  if (r)
    return r;
  r = writing ? packed_write_file(&fd, data, size)
              : packed_read_file(&fd, data, size);
  int closed = r < 0 ? packed_abort_file(&fd) : packed_close_file(&fd);
  if (closed)
    packed_abort_file(&fd);
  return r < 0 ? r : closed ? closed : r;
}
static int32_t packed_read_file_data(const char *p, void *b, size_t n) {
  return transfer_data(p, b, n, false);
}
static int32_t packed_write_file_data(const char *p, void *b, size_t n) {
  return transfer_data(p, b, n, true);
}

int32_t vfs_packed_persist_replace(const char *path, const void *data,
                                 size_t size, const uint8_t *meta) {
  /* vfs_persist owns the busy/external-writer guards and legacy recovery.
   * Do not expose this raw operation as an alternative public writer. */
  if (!vfs_persist_active(&vfs_driver_fs) || size > VFS_PERSIST_MAX_DATA ||
      (size && !data) || !meta)
    return VFS_ERR_FAIL;
  lfs_ssize_t r = pfs_replace(store, path, data, (lfs_size_t)size, meta);
  return r < 0 ? map_error((int)r) : (int32_t)r;
}

static const vfs_driver_t persist_raw_driver = {
    .stat_file = packed_stat_file,
    .open_file = packed_open_file,
    .close_file = packed_close_file,
    .abort_file = packed_abort_file,
    .read_file = packed_read_file,
    .write_file = packed_write_file,
    .update_file_meta = packed_update_file_meta,
    .read_file_data = packed_read_file_data,
    .write_file_data = packed_write_file_data,
    .remove_file = packed_remove_file,
};
static int32_t guarded_open(const char *path, vfs_file_t *fd, uint32_t flags) {
  if (!fd)
    return VFS_ERR_FAIL;
  fd->handle = NULL;
  bool writing = flags & (VFS_MODE_WRITEONLY | VFS_MODE_APPEND |
                          VFS_MODE_TRUNC | VFS_MODE_CREATE);
  if (!writing)
    return packed_open_file(path, fd, flags);
  int32_t result = vfs_persist_writer_begin(&vfs_driver_fs, path);
  if (result != VFS_OK)
    return result;
  result = packed_open_file(path, fd, flags);
  if (result == VFS_OK)
    ((packed_handle_t *)fd->handle)->external_writer = true;
  else
    vfs_persist_writer_end(&vfs_driver_fs);
  return result;
}
static int32_t guarded_write_data(const char *path, void *data, size_t size) {
  int32_t result = vfs_persist_writer_begin(&vfs_driver_fs, path);
  if (result != VFS_OK)
    return result;
  result = packed_write_file_data(path, data, size);
  vfs_persist_writer_end(&vfs_driver_fs);
  return result;
}
static int32_t guarded_meta(const char *path, void *meta, size_t size) {
  int32_t result = vfs_persist_before_mutation(&vfs_driver_fs, path);
  return result == VFS_OK ? packed_update_file_meta(path, meta, size) : result;
}
static int32_t guarded_remove(const char *path) {
  int32_t result = vfs_persist_before_mutation(&vfs_driver_fs, path);
  return result == VFS_OK ? packed_remove_file(path) : result;
}
static int32_t guarded_remove_dir(const char *path) {
  int32_t result = vfs_persist_before_mutation(&vfs_driver_fs, path);
  return result == VFS_OK ? packed_remove_dir(path) : result;
}
static int32_t guarded_create_dir(const char *path) {
  int32_t result = vfs_persist_before_mutation(&vfs_driver_fs, path);
  return result == VFS_OK ? packed_create_dir(path) : result;
}
static int32_t guarded_rename(const char *path, const char *target) {
  int32_t result = vfs_persist_before_mutation(&vfs_driver_fs, path);
  if (result == VFS_OK)
    result = vfs_persist_before_mutation(&vfs_driver_fs, target);
  return result == VFS_OK ? packed_rename_file(path, target) : result;
}
static int32_t guarded_rename_dir(const char *path, const char *target) {
  int32_t result = vfs_persist_before_mutation(&vfs_driver_fs, path);
  if (result == VFS_OK)
    result = vfs_persist_before_mutation(&vfs_driver_fs, target);
  return result == VFS_OK ? packed_rename_dir(path, target) : result;
}
const vfs_driver_t vfs_driver_fs = {
    .mount = packed_mount,
    .umount = packed_umount,
    .format = packed_format,
    .mounted = packed_mounted,
    .stat = packed_stat,
    .stat_file = packed_stat_file,
    .open_dir = packed_open_dir,
    .read_dir = packed_read_dir,
    .close_dir = packed_close_dir,
    .create_dir = guarded_create_dir,
    .remove_dir = guarded_remove_dir,
    .rename_dir = guarded_rename_dir,
    .open_file = guarded_open,
    .close_file = packed_close_file,
    .abort_file = packed_abort_file,
    .read_file = packed_read_file,
    .write_file = packed_write_file,
    .update_file_meta = guarded_meta,
    .write_file_data = guarded_write_data,
    .read_file_data = packed_read_file_data,
    .rename_file = guarded_rename,
    .remove_file = guarded_remove,
};
#endif
