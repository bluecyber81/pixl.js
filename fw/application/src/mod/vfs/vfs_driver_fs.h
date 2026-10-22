
#ifndef VFS_DRIVER_FS_H
#define VFS_DRIVER_FS_H

#include "vfs.h"

extern const vfs_driver_t vfs_driver_fs;
int32_t vfs_spiffs_storage_diagnose(uint8_t operation, uint8_t candidate,
                                   uint8_t *out, size_t capacity, size_t *length);

#endif
