#include "vfs_persist.h"
#include <stddef.h>
#include <string.h>
#ifdef VFS_PACKED_LFS_ENABLE
#include "lfs_util.h"
#endif

#define RECORD_MAGIC 0x31524750u /* PGR1 */
#define PENDING_MAGIC 0x31545050u /* PPT1 */
#define OLD_RECORD "/.pixl_txn_old"
#define NEW_RECORD "/.pixl_txn_new"
#define PENDING_FILE "/.pixl_txn_pending"
#define RECORD_EXISTS 1u
#define COPY_SIZE 128

typedef struct {
    uint32_t magic, exists, size, data_crc;
    char path[VFS_MAX_PATH_LEN];
    uint8_t meta[VFS_MAX_META_LEN];
    uint32_t crc;
} record_t;
typedef struct {
    uint32_t magic, old_crc, new_crc;
    char path[VFS_MAX_PATH_LEN];
    uint32_t crc;
} pending_t;
_Static_assert(sizeof(record_t) == 212, "journal layout changed");
_Static_assert(sizeof(pending_t) == 80, "pending layout changed");

static const vfs_driver_t *public_fs, *raw_fs;
static bool busy;
static uint8_t external_writers;
#ifndef VFS_PACKED_LFS_ENABLE
static const uint8_t hidden_meta[VFS_MAX_META_LEN] = {2, 2, 3}; /* flags: hidden + system */
#endif

void vfs_persist_bind(const vfs_driver_t *driver, const vfs_driver_t *raw) {
    public_fs = driver;
    raw_fs = raw;
}
bool vfs_persist_active(const vfs_driver_t *driver) { return driver == public_fs && busy; }
void vfs_persist_unmounted(const vfs_driver_t *driver) {
    if (driver == public_fs && !busy) {
        external_writers = 0;
        public_fs = raw_fs = NULL;
    }
}

static uint32_t crc_step(uint32_t crc, const void *data, size_t size) {
#ifdef VFS_PACKED_LFS_ENABLE
    return lfs_crc(crc, data, size);
#else
    const uint8_t *p = data;
    while (size--) {
        crc ^= *p++;
        for (unsigned i = 0; i < 8; ++i) crc = (crc >> 1) ^ (0xEDB88320u & (0u - (crc & 1)));
    }
    return crc;
#endif
}
static uint32_t crc_bytes(const void *data, size_t size) { return ~crc_step(~0u, data, size); }

bool vfs_persist_reserved(const char *path) {
    return path && strncmp(path, "/.pixl_txn", 10) == 0;
}
static bool valid_path(const char *path) {
    if (!path || path[0] != '/' || path[1] == 0) return false;
    size_t length = 0;
    while (length < VFS_MAX_PATH_LEN && path[length]) ++length;
    if (length >= VFS_MAX_PATH_LEN || path[length - 1] == '/' || vfs_persist_reserved(path)) return false;
    const char *segment = path + 1;
    for (const char *p = segment;; ++p) {
        if (*p == '/' || *p == 0) {
            size_t n = (size_t)(p - segment);
            if (n == 0 || (n == 1 && segment[0] == '.') ||
                (n == 2 && segment[0] == '.' && segment[1] == '.')) return false;
            if (*p == 0) return n < VFS_MAX_NAME_LEN;
            segment = p + 1;
        }
    }
}
static int32_t close_result(vfs_file_t *file, int32_t result) {
    int32_t closed = raw_fs->close_file(file);
    /* These operation-local handles have no retrying owner after return.
     * Abandon resources, but never turn the failed write/close into success. */
    if (closed != VFS_OK) vfs_abort_file(raw_fs, file);
    return result == VFS_OK ? closed : result;
}
static int32_t exact_read(vfs_file_t *file, void *data, size_t size) {
    int32_t n = raw_fs->read_file(file, data, size);
    return n < 0 ? n : (size_t)n == size ? VFS_OK : VFS_ERR_CRPT;
}
static int32_t exact_write(vfs_file_t *file, const void *data, size_t size) {
    int32_t n = raw_fs->write_file(file, (void *)data, size);
    return n < 0 ? n : (size_t)n == size ? VFS_OK : VFS_ERR_FAIL;
}
static int32_t file_crc(const char *path, size_t skip, size_t size, uint32_t *crc) {
    uint8_t buffer[COPY_SIZE];
    vfs_file_t file;
    int32_t result = raw_fs->open_file(path, &file, VFS_MODE_READONLY);
    if (result != VFS_OK) return result;
    while (skip && result == VFS_OK) {
        size_t n = skip < sizeof(buffer) ? skip : sizeof(buffer);
        result = exact_read(&file, buffer, n);
        skip -= n;
    }
    uint32_t value = ~0u;
    while (size && result == VFS_OK) {
        size_t n = size < sizeof(buffer) ? size : sizeof(buffer);
        result = exact_read(&file, buffer, n);
        if (result == VFS_OK) value = crc_step(value, buffer, n);
        size -= n;
    }
    if (result == VFS_OK) {
        int32_t extra = raw_fs->read_file(&file, buffer, 1);
        result = extra < 0 ? extra : extra == 0 ? VFS_OK : VFS_ERR_CRPT;
    }
    result = close_result(&file, result);
    if (result == VFS_OK) *crc = ~value;
    return result;
}
static int32_t read_record(const char *name, record_t *record, uint32_t expected_crc, const char *path) {
    int32_t n = raw_fs->read_file_data(name, record, sizeof(*record));
    if (n < 0) return n;
    if (n != sizeof(*record) || record->magic != RECORD_MAGIC || record->exists > 1 ||
        record->size > VFS_PERSIST_MAX_DATA || (!record->exists && record->size != 0) ||
        !memchr(record->path, 0, sizeof(record->path)) || !valid_path(record->path) ||
        record->crc != expected_crc || record->crc != crc_bytes(record, offsetof(record_t, crc)) ||
        strcmp(record->path, path) != 0) return VFS_ERR_CRPT;
    uint32_t crc;
    int32_t result = file_crc(name, sizeof(*record), record->size, &crc);
    return result != VFS_OK ? result : crc == record->data_crc ? VFS_OK : VFS_ERR_CRPT;
}
static int32_t read_pending(pending_t *pending) {
    /* Extra byte rejects a valid prefix in an oversized or damaged marker. */
    uint8_t bytes[sizeof(*pending) + 1];
    int32_t n = raw_fs->read_file_data(PENDING_FILE, bytes, sizeof(bytes));
    if (n < 0) return n;
    if (n != sizeof(*pending)) return VFS_ERR_CRPT;
    memcpy(pending, bytes, sizeof(*pending));
    if (pending->magic != PENDING_MAGIC || !memchr(pending->path, 0, sizeof(pending->path)) ||
        !valid_path(pending->path) || pending->crc != crc_bytes(pending, offsetof(pending_t, crc)))
        return VFS_ERR_CRPT;
    return VFS_OK;
}
static int32_t clear_pending(void) {
    int32_t result = raw_fs->remove_file(PENDING_FILE);
    if (result != VFS_OK) return result;
    vfs_obj_t obj;
    result = raw_fs->stat_file(PENDING_FILE, &obj);
    return result == VFS_ERR_NOOBJ ? VFS_OK : result == VFS_OK ? VFS_ERR_FAIL : result;
}
static int32_t reusable_record(const char *name) {
    uint32_t magic = 0;
    int32_t n = raw_fs->read_file_data(name, &magic, sizeof(magic));
    if (n == VFS_ERR_NOOBJ) return VFS_OK;
    if (n < 0) return n;
    /* A failed create/header write may have left an empty or partial magic.
     * Never truncate a pre-existing unrelated file occupying a reserved name. */
    const uint32_t expected = RECORD_MAGIC;
    return n <= sizeof(magic) && memcmp(&magic, &expected, (size_t)n) == 0 ? VFS_OK : VFS_ERR_CRPT;
}
#ifndef VFS_PACKED_LFS_ENABLE
static int32_t write_record(const char *name, const record_t *record, const void *data, bool from_file) {
    vfs_file_t out, in;
    bool opened_in = false;
    int32_t result = raw_fs->open_file(name, &out, VFS_MODE_CREATE | VFS_MODE_TRUNC | VFS_MODE_WRITEONLY);
    if (result != VFS_OK) return result;
    result = exact_write(&out, record, sizeof(*record));
    if (from_file && record->size && result == VFS_OK) {
        result = raw_fs->open_file(record->path, &in, VFS_MODE_READONLY);
        opened_in = result == VFS_OK;
    }
    uint8_t buffer[COPY_SIZE];
    size_t offset = 0;
    while (offset < record->size && result == VFS_OK) {
        size_t n = record->size - offset;
        if (n > sizeof(buffer)) n = sizeof(buffer);
        const void *source = from_file ? NULL : (const uint8_t *)data + offset;
        if (from_file) {
            result = exact_read(&in, buffer, n);
            source = buffer;
        }
        if (result == VFS_OK) result = exact_write(&out, source, n);
        offset += n;
    }
    if (opened_in) result = close_result(&in, result);
    result = close_result(&out, result);
    if (result == VFS_OK) result = raw_fs->update_file_meta(name, (void *)hidden_meta, sizeof(hidden_meta));
    return result;
}
#endif
static int32_t verify_file(const char *path, size_t size, uint32_t expected_crc,
                           const uint8_t *meta) {
    uint32_t crc;
    int32_t result = file_crc(path, 0, size, &crc);
    if (result == VFS_OK && crc != expected_crc) result = VFS_ERR_CRPT;
    if (result == VFS_OK) {
        vfs_obj_t obj;
        result = raw_fs->stat_file(path, &obj);
        if (result == VFS_OK && (obj.type != VFS_TYPE_REG || obj.size != size ||
            memcmp(obj.meta, meta, VFS_MAX_META_LEN))) result = VFS_ERR_CRPT;
    }
    return result;
}
static int32_t apply_record(const char *name, const record_t *record) {
    if (!record->exists) {
        int32_t result = raw_fs->remove_file(record->path);
        return result == VFS_ERR_NOOBJ ? VFS_OK : result;
    }
    vfs_file_t in, out;
    int32_t result = raw_fs->open_file(name, &in, VFS_MODE_READONLY);
    if (result != VFS_OK) return result;
    uint8_t buffer[COPY_SIZE];
    size_t skip = sizeof(*record);
    while (skip && result == VFS_OK) {
        size_t n = skip < sizeof(buffer) ? skip : sizeof(buffer);
        result = exact_read(&in, buffer, n);
        skip -= n;
    }
    if (result != VFS_OK) return close_result(&in, result);
    result = raw_fs->open_file(record->path, &out, VFS_MODE_CREATE | VFS_MODE_TRUNC | VFS_MODE_WRITEONLY);
    if (result != VFS_OK) return close_result(&in, result);
    size_t left = record->size;
    while (left && result == VFS_OK) {
        size_t n = left < sizeof(buffer) ? left : sizeof(buffer);
        result = exact_read(&in, buffer, n);
        if (result == VFS_OK) result = exact_write(&out, buffer, n);
        left -= n;
    }
    result = close_result(&in, result);
    result = close_result(&out, result);
    if (result != VFS_OK) return result;
    result = raw_fs->update_file_meta(record->path, (void *)record->meta, sizeof(record->meta));
    if (result != VFS_OK) return result;
    return verify_file(record->path, record->size, record->data_crc, record->meta);
}
static int32_t recover_locked(void) {
    pending_t pending;
    int32_t result = read_pending(&pending);
    if (result == VFS_ERR_NOOBJ) return VFS_OK;
    if (result != VFS_OK) return result;
    record_t record;
    const char *name = NEW_RECORD;
    result = read_record(name, &record, pending.new_crc, pending.path);
    /* An I/O failure is not proof of corruption. Never turn it into rollback. */
    if (result == VFS_ERR_CRPT || result == VFS_ERR_NOOBJ) {
        name = OLD_RECORD;
        result = read_record(name, &record, pending.old_crc, pending.path);
    }
    if (result != VFS_OK) return result;
    result = apply_record(name, &record);
    return result == VFS_OK ? clear_pending() : result;
}
int32_t vfs_persist_recover(vfs_driver_t *driver) {
    if (!driver || driver != public_fs || !raw_fs) return VFS_ERR_UNSUPT;
    if (busy || external_writers) return VFS_ERR_FAIL;
    busy = true;
    int32_t result = recover_locked();
    busy = false;
    return result;
}
int32_t vfs_persist_before_mutation(const vfs_driver_t *driver, const char *path) {
    if (!path || vfs_persist_reserved(path) || strcmp(path, "/") == 0) return VFS_ERR_FAIL;
    if (driver != public_fs || !raw_fs) return VFS_OK;
    if (busy) return VFS_ERR_FAIL;
    busy = true;
    pending_t pending;
    int32_t result = read_pending(&pending);
    if (result == VFS_ERR_NOOBJ) result = VFS_OK;
    else if (result == VFS_OK) {
        size_t n = strlen(path);
        while (n > 1 && path[n - 1] == '/') --n;
        if (strncmp(path, pending.path, n) == 0 && (pending.path[n] == 0 || pending.path[n] == '/')) {
            /* Finish the interrupted canonical copy before retiring its marker.
             * If the subsequent external rename/write fails, a partial old
             * target must not be stranded without its recovery information. */
            result = recover_locked();
        }
    }
    busy = false;
    return result;
}
int32_t vfs_persist_writer_begin(const vfs_driver_t *driver, const char *path) {
    int32_t result = vfs_persist_before_mutation(driver, path);
    if (result == VFS_OK && driver == public_fs) {
        if (external_writers == 255) return VFS_ERR_FAIL;
        ++external_writers;
    }
    return result;
}
void vfs_persist_writer_end(const vfs_driver_t *driver) {
    if (driver == public_fs && external_writers) --external_writers;
}
#ifdef VFS_PACKED_LFS_ENABLE
/* Only the PackedFS adapter implements this private, ownership-checked entry.
 * It stages data and all metadata before one manifest publication. */
extern int32_t vfs_packed_persist_replace(const char *path, const void *data,
                                         size_t size, const uint8_t *meta);
static int32_t write_locked(const char *path, const void *data, size_t size, const uint8_t *meta) {
    /* Upgrades may retain an interrupted journal from older applications.
     * Finish that exact recovery contract before any new atomic replacement. */
    int32_t result = recover_locked();
    if (result != VFS_OK) return result;
    result = reusable_record(OLD_RECORD);
    if (result == VFS_OK) result = reusable_record(NEW_RECORD);
    if (result != VFS_OK) return result;
    vfs_obj_t obj;
    uint8_t committed_meta[VFS_MAX_META_LEN] = {0};
    result = raw_fs->stat_file(path, &obj);
    if (result == VFS_OK) {
        if (obj.type != VFS_TYPE_REG || obj.size > VFS_PERSIST_MAX_DATA) return VFS_ERR_UNSUPT;
        memcpy(committed_meta, obj.meta, sizeof(committed_meta));
    } else if (result != VFS_ERR_NOOBJ) return result;
    if (meta) memcpy(committed_meta, meta, sizeof(committed_meta));
    /* PackedFS validates every old record during rebuild, including the one
     * being replaced. No old payload CRC is skipped by avoiding the journal. */
    result = vfs_packed_persist_replace(path, data, size, committed_meta);
    if (result < 0) return result;
    if ((size_t)result != size) return VFS_ERR_FAIL;
    /* Publication is already durable. A failed readback is an error, never a
     * signal to roll back, re-publish, or pretend the old value is installed. */
    result = verify_file(path, size, crc_bytes(data, size), committed_meta);
    return result == VFS_OK ? (int32_t)size : result;
}
#else
static int32_t write_locked(const char *path, const void *data, size_t size, const uint8_t *meta) {
    int32_t result = recover_locked();
    if (result != VFS_OK) return result;
    result = reusable_record(OLD_RECORD);
    if (result == VFS_OK) result = reusable_record(NEW_RECORD);
    if (result != VFS_OK) return result;
    record_t record = {0};
    record.magic = RECORD_MAGIC;
    strcpy(record.path, path);
    vfs_obj_t obj;
    result = raw_fs->stat_file(path, &obj);
    if (result == VFS_OK) {
        if (obj.type != VFS_TYPE_REG || obj.size > VFS_PERSIST_MAX_DATA) return VFS_ERR_UNSUPT;
        record.exists = RECORD_EXISTS;
        record.size = obj.size;
        memcpy(record.meta, obj.meta, sizeof(record.meta));
        result = file_crc(path, 0, record.size, &record.data_crc);
    } else if (result == VFS_ERR_NOOBJ) {
        result = VFS_OK;
        record.data_crc = crc_bytes(NULL, 0);
    }
    if (result != VFS_OK) return result;
    record.crc = crc_bytes(&record, offsetof(record_t, crc));
    pending_t pending = {0};
    pending.magic = PENDING_MAGIC;
    strcpy(pending.path, path);
    pending.old_crc = record.crc;
    result = write_record(OLD_RECORD, &record, NULL, true);
    if (result == VFS_OK) result = read_record(OLD_RECORD, &record, pending.old_crc, path);
    if (result != VFS_OK) return result;
    record.exists = RECORD_EXISTS;
    record.size = size;
    if (meta) memcpy(record.meta, meta, sizeof(record.meta));
    record.data_crc = crc_bytes(data, size);
    record.crc = crc_bytes(&record, offsetof(record_t, crc));
    pending.new_crc = record.crc;
    result = write_record(NEW_RECORD, &record, data, false);
    if (result == VFS_OK) result = read_record(NEW_RECORD, &record, pending.new_crc, path);
    if (result != VFS_OK) return result;
    pending.crc = crc_bytes(&pending, offsetof(pending_t, crc));
    result = raw_fs->write_file_data(PENDING_FILE, &pending, sizeof(pending));
    if (result < 0) return result;
    if (result != sizeof(pending)) return VFS_ERR_FAIL;
    result = raw_fs->update_file_meta(PENDING_FILE, (void *)hidden_meta, sizeof(hidden_meta));
    if (result != VFS_OK) return result;
    pending_t verified;
    result = read_pending(&verified);
    if (result == VFS_OK && memcmp(&pending, &verified, sizeof(pending))) result = VFS_ERR_CRPT;
    if (result != VFS_OK) return result;
    result = apply_record(NEW_RECORD, &record);
    if (result == VFS_OK) result = clear_pending();
    return result == VFS_OK ? (int32_t)size : result;
}
#endif
int32_t vfs_persist_write_meta(vfs_driver_t *driver, const char *path, const void *data, size_t size,
                               const uint8_t *meta) {
    if (!driver || driver != public_fs || !raw_fs) return VFS_ERR_UNSUPT;
    if (!valid_path(path)) return VFS_ERR_MAXNM;
    if (size > VFS_PERSIST_MAX_DATA || (size && !data)) return VFS_ERR_UNSUPT;
    if (busy || external_writers) return VFS_ERR_FAIL;
    busy = true;
    int32_t result = write_locked(path, data, size, meta);
    busy = false;
    return result;
}
int32_t vfs_persist_write(vfs_driver_t *driver, const char *path, const void *data, size_t size) {
    return vfs_persist_write_meta(driver, path, data, size, NULL);
}
