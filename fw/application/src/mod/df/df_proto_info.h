#ifndef DF_PROTO_INFO_H
#define DF_PROTO_INFO_H

#include "df_core.h"


/** info proto command defines */
typedef enum {
    DF_PROTO_CMD_INFO_VERSION_INFO = 0x01,
    DF_PROTO_CMD_INFO_ENTER_DFU = 0x02,
    DF_PROTO_CMD_INFO_CAPABILITIES = 0x03,
    DF_PROTO_CMD_INFO_UI_DIAGNOSTIC = 0x04,
    DF_PROTO_CMD_INFO_MTU_DIAGNOSTIC = 0x05,
    DF_PROTO_CMD_INFO_RUNTIME_DIAGNOSTIC = 0x06,
    DF_PROTO_CMD_INFO_BOOT_DIAGNOSTIC = 0x07,
    DF_PROTO_CMD_INFO_POWER_DIAGNOSTIC = 0x08
} df_proto_cmd_info_t;



extern const df_cmd_entry_t df_proto_handler_info_entries[];

#endif
