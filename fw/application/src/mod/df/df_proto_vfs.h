#ifndef DF_PROTO_VFS_H
#define DF_PROTO_VFS_H

#include "df_defines.h"
#include <stdbool.h>

/** info proto command defines */
typedef enum {
    DF_PROTO_CMD_VFS_DRIVE_LIST = 0x10,
    DF_PROTO_CMD_VFS_DRIVE_FORMAT = 0x11,
    DF_PROTO_CMD_VFS_FILE_OPEN = 0x12,
    DF_PROTO_CMD_VFS_FILE_CLOSE = 0x13,
    DF_PROTO_CMD_VFS_FILE_READ = 0x14,
    DF_PROTO_CMD_VFS_FILE_WRITE = 0x15,
    DF_PROTO_CMD_VFS_DIR_READ = 0x16,
    DF_PROTO_CMD_VFS_DIR_CREATE = 0x17,
    DF_PROTO_CMD_VFS_REMOVE = 0x18,
    DF_PROTO_CMD_VFS_RENAME = 0x19,
    DF_PROTO_CMD_VFS_UPDATE_META = 0x1a,
    DF_PROTO_CMD_VFS_STORAGE_DIAG = 0x1b,
    DF_PROTO_CMD_VFS_STORAGE_INFO = 0x1c,
    DF_PROTO_CMD_VFS_RAW_META_READ = 0x1d,
    DF_PROTO_CMD_VFS_RAW_META_WRITE = 0x1e,
    DF_PROTO_CMD_VFS_PACKED_LAYOUT = 0x1f,
    DF_PROTO_CMD_VFS_IMPORT_STATE = 0x20
} df_proto_cmd_vfs_t;

extern const df_cmd_entry_t df_proto_handler_vfs_entries[];
void df_proto_vfs_cleanup(void);
/* False also for an abandoned descriptor whose cleanup has not succeeded. */
bool df_proto_vfs_file_transfer_closed(void);
/* Includes unfinished directory reads and failed/abandoned file ownership. */
bool df_proto_vfs_is_idle(void);

#endif
