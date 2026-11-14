#include "vfs_meta.h"
#include "vfs_persist.h"

int32_t vfs_set_readonly(vfs_drive_t drive, const char *path, bool readonly) {
    vfs_driver_t *driver = vfs_get_driver(drive);
    if (!driver) return VFS_ERR_NODEV;
    int32_t result = vfs_persist_recover(driver);
    if (result != VFS_OK) return result;
    vfs_obj_t obj;
    result = driver->stat_file(path, &obj);
    if (result != VFS_OK) return result;
    if (obj.type != VFS_TYPE_REG || !vfs_meta_set_readonly((uint8_t *)obj.meta, sizeof(obj.meta), readonly))
        return VFS_ERR_CRPT;
    return driver->update_file_meta(path, obj.meta, sizeof(obj.meta));
}
