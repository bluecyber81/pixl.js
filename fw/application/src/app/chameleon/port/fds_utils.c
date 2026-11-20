//
// Created by solos on 8/27/2023.
//
#include "nrf_log.h"
#include "vfs.h"
#include "vfs_meta.h"
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "fds_ids.h"
#include "fds_utils.h"
#include "tag_helper.h"

#include "settings.h"

/* Chameleon saves are synchronous on the application thread. Each initiating
 * action clears the observation so a validation failure cannot show stale I/O. */
static chameleon_save_issue_t m_save_issue;

void chameleon_save_begin(void) {
    m_save_issue = (chameleon_save_issue_t){.stage = CHAMELEON_SAVE_CARD};
}

const chameleon_save_issue_t *chameleon_last_save_issue(void) {
    return &m_save_issue;
}

bool chameleon_save_settings(void) {
    int32_t result = settings_save();
    if (result == NRF_SUCCESS) return true;
    m_save_issue = (chameleon_save_issue_t){CHAMELEON_SAVE_SETTINGS, result};
    return false;
}

/* Keep the shared card/config error path out of each synchronous I/O branch. */
static __attribute__((noinline)) int32_t fds_save_failure(uint16_t id, bool writing, int32_t code) {
    bool config = id == FDS_EMULATION_CONFIG_FILE_ID;
    chameleon_save_stage_t stage = writing ? (config ? CHAMELEON_WRITE_CONFIG : CHAMELEON_WRITE_CARD)
                                           : (config ? CHAMELEON_READ_CONFIG : CHAMELEON_READ_CARD);
    m_save_issue = (chameleon_save_issue_t){stage, code};
    return -1; /* Retain the exact-compare API's unreadable result. */
}

static void fds_map_file_name(uint16_t id, uint16_t key, char *path) {
    if (id == FDS_EMULATION_CONFIG_FILE_ID) {
        strcpy(path, "/chameleon/slots/config.bin");
    } else if (id >= FDS_SLOT_TAG_DUMP_FILE_ID_BASE && id < FDS_SLOT_TAG_DUMP_FILE_ID_BASE + SLOT_MAX) {
        sprintf(path, "/chameleon/slots/%02d.bin", id - FDS_SLOT_TAG_DUMP_FILE_ID_BASE);
    } else {
        sprintf(path, "/chameleon/slots/%d_%d.bin", id, key);
    }
}

bool fds_read_sync(uint16_t id, uint16_t key, uint16_t* max_length, uint8_t *buffer) {
    char path[VFS_MAX_PATH_LEN];
    fds_map_file_name(id, key, path);
    vfs_driver_t *driver = vfs_get_default_driver();
    if (!max_length || !buffer || !driver || !driver->mounted()) {
        if (max_length) *max_length = 0;
        return false;
    }
    int32_t bytes_read = driver->read_file_data(path, buffer, *max_length);
    if (bytes_read <= 0 || bytes_read > *max_length) {
        *max_length = 0;
        return false;
    }
    *max_length = (uint16_t)bytes_read;
    NRF_LOG_INFO("fds_read_sync: id=%X, key=%d, bytes_read=%d", id, key, bytes_read);
    return bytes_read > 0;
}
bool fds_write_sync(uint16_t id, uint16_t key, uint16_t data_length_words, void *buffer) {
    char path[VFS_MAX_PATH_LEN];
    fds_map_file_name(id, key, path);

    //优化下 配置文件大小，基于设置里面的slot数量决定保存的文件大小，以减少读取的时间
    if (id == FDS_EMULATION_CONFIG_FILE_ID) {
        settings_data_t *  settings_data = settings_get_data();
        data_length_words = TAG_SLOT_CONFIG_SIZE(settings_data->chameleon_slot_num);
        NRF_LOG_INFO("optimize config file size: data_length_words=%d", data_length_words);
    }

    vfs_driver_t *driver = vfs_get_default_driver();
    if (!driver || !driver->mounted() || !buffer || data_length_words == 0) {
        fds_save_failure(id, true, 0);
        return false;
    }
    int32_t bytes_written = driver->write_file_data(path, buffer, data_length_words);
    NRF_LOG_INFO("fds_write_sync: id=%X, key=%d, bytes_written=%d", id, key, bytes_written);
    if (bytes_written == data_length_words) return true;
    fds_save_failure(id, true, bytes_written < 0 ? bytes_written : 0);
    return false;
}

/* Exact no-op check: 1 equal, 0 absent/different, -1 unreadable. One bounded
 * stack block, no heap copy of the card. The shortened config representation
 * must be identical to fds_write_sync's length convention. */
int32_t fds_compare_sync(uint16_t id, uint16_t key, uint16_t length, const uint8_t *buffer) {
    if (!buffer || !length) return fds_save_failure(id, false, 0);
    if (id == FDS_EMULATION_CONFIG_FILE_ID) {
        uint16_t stored_length = TAG_SLOT_CONFIG_SIZE(settings_get_data()->chameleon_slot_num);
        if (stored_length > length) return fds_save_failure(id, false, 0);
        length = stored_length;
    }
    vfs_driver_t *driver = vfs_get_default_driver();
    if (!driver || !driver->mounted() || !driver->stat_file || !driver->open_file ||
        !driver->read_file || !driver->close_file) return fds_save_failure(id, false, 0);
    char path[VFS_MAX_PATH_LEN];
    fds_map_file_name(id, key, path);
    vfs_obj_t object;
    int32_t result = driver->stat_file(path, &object);
    if (result == VFS_ERR_NOOBJ) return 0;
    if (result != VFS_OK) return fds_save_failure(id, false, result);
    if (object.type != VFS_TYPE_REG || object.size != length) return 0;
    vfs_file_t file = {0};
    result = driver->open_file(path, &file, VFS_MODE_READONLY);
    if (result != VFS_OK) return fds_save_failure(id, false, result);
    uint8_t chunk[128];
    uint16_t offset = 0;
    result = 1;
    while (offset < length) {
        size_t wanted = length - offset;
        if (wanted > sizeof(chunk)) wanted = sizeof(chunk);
        int32_t count = driver->read_file(&file, chunk, wanted);
        if (count <= 0 || count > (int32_t)wanted) {
            result = fds_save_failure(id, false, count < 0 ? count : 0);
            break;
        }
        if (memcmp(chunk, buffer + offset, (size_t)count)) { result = 0; break; }
        offset += (uint16_t)count;
    }
    int32_t closed = driver->close_file(&file);
    if (closed != VFS_OK) {
        vfs_abort_file(driver, &file);
        if (result >= 0) result = fds_save_failure(id, false, closed);
    }
    return result;
}

bool fds_is_exists(uint16_t id, uint16_t key) {
    char path[VFS_MAX_PATH_LEN];
    vfs_obj_t obj;
    fds_map_file_name(id, key, path);
    int32_t ret = vfs_get_default_driver()->stat_file(path, &obj);
    NRF_LOG_INFO("fds_is_exists: id=%X, key=%d, ret=%d", id, key, ret);
    return ret == 0;
}

bool fds_config_file_exists() { return fds_is_exists(FDS_EMULATION_CONFIG_FILE_ID, FDS_EMULATION_CONFIG_RECORD_KEY); }

/* Unlike the generic slot reader, a configuration read must distinguish a new
 * device from a damaged/unreadable file and must reject oversize/short reads. */
int32_t fds_read_config(uint8_t *buffer, uint16_t capacity) {
    vfs_driver_t *driver = vfs_get_default_driver();
    vfs_obj_t obj;
    const char *path = "/chameleon/slots/config.bin";
    if (!buffer || !capacity || !driver || !driver->mounted()) return -1;
    int32_t result = driver->stat_file(path, &obj);
    if (result == VFS_ERR_NOOBJ) return 0;
    if (result != VFS_OK || obj.type != VFS_TYPE_REG || obj.size == 0 || obj.size > capacity) return -1;
    result = driver->read_file_data(path, buffer, capacity);
    return result == (int32_t)obj.size ? result : -1;
}

int32_t fds_read_meta(uint16_t id, uint16_t key, vfs_meta_t *meta) {
    char path[VFS_MAX_PATH_LEN];
    vfs_obj_t obj;
    fds_map_file_name(id, key, path);
    int32_t ret = vfs_get_default_driver()->stat_file(path, &obj);
    if (ret == VFS_OK) {
        vfs_meta_decode(obj.meta, sizeof(obj.meta), meta);
        return 0;
    } else {
        return -1;
    }
}

int32_t fds_write_meta(uint16_t id, uint16_t key, vfs_meta_t *meta) {
    char path[VFS_MAX_PATH_LEN];
    uint8_t meta_buf[VFS_MAX_META_LEN];
    vfs_obj_t obj;
    fds_map_file_name(id, key, path);

    vfs_meta_encode(meta_buf, sizeof(meta_buf), meta);
    return vfs_get_default_driver()->update_file_meta(path, meta_buf, sizeof(meta_buf));
}
