#include "amiidb_api_fav.h"
#include <stdio.h>
#include <string.h>

static bool valid_component(const char *name, bool empty_allowed) {
    if (!name) return false;
    size_t n = 0;
    while (n < VFS_MAX_NAME_LEN && name[n]) {
        unsigned char c = name[n++];
        if (c < 32 || c == 127 || c == '/' || c == '\\' || c == ':') return false;
    }
    return n < VFS_MAX_NAME_LEN && (n || empty_allowed) && strcmp(name, ".") && strcmp(name, "..");
}

static int32_t format_folder(char path[VFS_MAX_PATH_LEN], const char *folder, bool empty_allowed) {
    path[0] = 0;
    if (!valid_component(folder, empty_allowed)) return VFS_ERR_MAXNM;
    int length = snprintf(path, VFS_MAX_PATH_LEN, "/amiibo/fav%s%s", *folder ? "/" : "", folder);
    if (length < 0 || length >= VFS_MAX_PATH_LEN) { path[0] = 0; return VFS_ERR_MAXNM; }
    return VFS_OK;
}

static int32_t format_filename(char path[VFS_MAX_PATH_LEN], const char *folder, const amiidb_fav_t *fav) {
    if (!fav || format_folder(path, folder, false) != VFS_OK) return VFS_ERR_MAXNM;
    size_t used = strlen(path);
    int length = snprintf(path + used, VFS_MAX_PATH_LEN - used, "/%u_%08lX_%08lX.fav",
                          (unsigned)fav->game_id, (unsigned long)fav->amiibo_head, (unsigned long)fav->amiibo_tail);
    if (length < 0 || (size_t)length >= VFS_MAX_PATH_LEN - used) { path[0] = 0; return VFS_ERR_MAXNM; }
    return VFS_OK;
}

bool amiidb_api_fav_parse_filename(const char *name, amiidb_fav_t *fav) {
    if (!name || !fav) return false;
    size_t length = 0;
    while (length < VFS_MAX_NAME_LEN && name[length]) length++;
    if (length < 23 || length > 25) return false;
    size_t pos = 0;
    unsigned game = 0;
    while (pos < 3 && name[pos] >= '0' && name[pos] <= '9') game = game * 10 + name[pos++] - '0';
    if (pos == 0 || game > 255 || name[pos++] != '_') return false;
    uint32_t words[2] = {0, 0};
    for (unsigned word = 0; word < 2; word++) {
        for (unsigned i = 0; i < 8; i++) {
            char c = name[pos++];
            unsigned digit;
            if (c >= '0' && c <= '9') digit = c - '0';
            else if (c >= 'a' && c <= 'f') digit = c - 'a' + 10;
            else if (c >= 'A' && c <= 'F') digit = c - 'A' + 10;
            else return false;
            words[word] = (words[word] << 4) | digit;
        }
        if (word == 0 && name[pos++] != '_') return false;
    }
    if (strcmp(name + pos, ".fav") != 0) return false;
    amiidb_fav_t result = {.game_id = game, .amiibo_head = words[0], .amiibo_tail = words[1]};
    *fav = result;
    return true;
}

static int32_t finish_directory(vfs_driver_t *driver, vfs_dir_t *dir, int32_t result) {
    int32_t close_result = driver->close_dir(dir);
    if (result == VFS_ERR_EOF) result = VFS_OK;
    return result == VFS_OK ? close_result : result;
}

int32_t amiidb_api_fav_list_dir(const char *folder, amiidb_fav_cb_t cb, void *ctx) {
    char path[VFS_MAX_PATH_LEN];
    int32_t result = format_folder(path, folder, true);
    if (result != VFS_OK || !cb) return result != VFS_OK ? result : VFS_ERR_FAIL;
    vfs_driver_t *driver = vfs_get_driver(VFS_DRIVE_EXT);
    if (!driver) return VFS_ERR_NODEV;
    vfs_dir_t dir;
    if ((result = driver->open_dir(path, &dir)) != VFS_OK) return result;
    vfs_obj_t obj;
    while ((result = driver->read_dir(&dir, &obj)) == VFS_OK) {
        amiidb_fav_info_t info = {0};
        if (!valid_component(obj.name, false)) { result = VFS_ERR_CRPT; break; }
        if (obj.type == VFS_TYPE_DIR) {
            info.fav_type = FAV_TYPE_FOLDER;
            memcpy(info.fav_data.folder_name, obj.name, strlen(obj.name) + 1);
            cb(&info, ctx);
        } else if (obj.type == VFS_TYPE_REG && amiidb_api_fav_parse_filename(obj.name, &info.fav_data.fav)) {
            info.fav_type = FAV_TYPE_FAV;
            cb(&info, ctx);
        }
    }
    return finish_directory(driver, &dir, result);
}

int32_t amiidb_api_fav_create_dir(const char *folder) {
    char path[VFS_MAX_PATH_LEN];
    int32_t result = format_folder(path, folder, false);
    if (result != VFS_OK) return result;
    if (strlen(folder) > AMIIDB_FAV_NEW_FOLDER_MAX_BYTES) return VFS_ERR_MAXNM;
    vfs_driver_t *driver = vfs_get_driver(VFS_DRIVE_EXT);
    return driver ? driver->create_dir(path) : VFS_ERR_NODEV;
}

int32_t amiidb_api_fav_remove_dir(const char *folder) {
    char path[VFS_MAX_PATH_LEN];
    int32_t result = format_folder(path, folder, false);
    if (result != VFS_OK) return result;
    vfs_driver_t *driver = vfs_get_driver(VFS_DRIVE_EXT);
    return driver ? driver->remove_dir(path) : VFS_ERR_NODEV;
}

int32_t amiidb_api_fav_empty_dir(const char *folder) {
    char path[VFS_MAX_PATH_LEN], child[VFS_MAX_PATH_LEN];
    int32_t result = format_folder(path, folder, false);
    if (result != VFS_OK) return result;
    vfs_driver_t *driver = vfs_get_driver(VFS_DRIVE_EXT);
    if (!driver) return VFS_ERR_NODEV;
    vfs_dir_t dir;
    if ((result = driver->open_dir(path, &dir)) != VFS_OK) return result;
    vfs_obj_t obj;
    while ((result = driver->read_dir(&dir, &obj)) == VFS_OK) {
        if (!valid_component(obj.name, false)) { result = VFS_ERR_CRPT; break; }
        int length = snprintf(child, sizeof(child), "%s/%s", path, obj.name);
        if (length < 0 || (size_t)length >= sizeof(child)) { result = VFS_ERR_MAXNM; break; }
        result = obj.type == VFS_TYPE_DIR ? driver->remove_dir(child) : driver->remove_file(child);
        if (result != VFS_OK) break;
    }
    return finish_directory(driver, &dir, result);
}

int32_t amiidb_api_fav_add(const char *folder, const amiidb_fav_t *fav) {
    char path[VFS_MAX_PATH_LEN];
    int32_t result = format_filename(path, folder, fav);
    if (result != VFS_OK) return result;
    vfs_driver_t *driver = vfs_get_driver(VFS_DRIVE_EXT);
    if (!driver) return VFS_ERR_NODEV;
    result = driver->write_file_data(path, NULL, 0);
    return result == 0 ? VFS_OK : result < 0 ? result : VFS_ERR_FAIL;
}

int32_t amiidb_api_fav_remove(const char *folder, const amiidb_fav_t *fav) {
    char path[VFS_MAX_PATH_LEN];
    int32_t result = format_filename(path, folder, fav);
    if (result != VFS_OK) return result;
    vfs_driver_t *driver = vfs_get_driver(VFS_DRIVE_EXT);
    return driver ? driver->remove_file(path) : VFS_ERR_NODEV;
}
