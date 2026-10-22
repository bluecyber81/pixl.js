#include "df_core.h"

#include "ble_df_driver.h"
#include "ble_main.h"
#include "df_driver.h"

#include "df_proto_info.h"
#include "df_proto_vfs.h"

#include "nrf_log.h"
#include "nrf_pwr_mgmt.h"

#define PROTO_HANDLER_MAX_GROUP 2

typedef struct {
    df_driver_t *driver;
    df_cmd_entry_t const *cmd;
    df_cmd_entry_t const *cmd_entries[PROTO_HANDLER_MAX_GROUP];
} df_context_t;

static df_context_t m_df_ctx;

static const df_cmd_entry_t *df_core_find_proto_handler_entry(uint8_t cmd) {
    for (int32_t i = 0; i < PROTO_HANDLER_MAX_GROUP; i++) {
       const df_cmd_entry_t *e = m_df_ctx.cmd_entries[i];
        while (e->cmd > 0) {
            if (e->cmd == cmd) {
                return e;
            }
            e++;
        }
    }

    return NULL;
}

static void df_core_default_handler(df_event_t *evt) {
    if (evt->type == DF_EVENT_DATA_RECEVIED) {
        df_frame_t out;
        out.cmd = evt->df->cmd;
        out.chunk = 0;
        out.status = 255;
        out.length = 0;

        df_core_send_frame(&out);
    }
}

static void df_core_on_event(df_event_t *evt) {
    if (evt->type == DF_EVENT_LINK_DISCONNECTED) {
        // Close all VFS state, not only the handler of the last command (which
        // may have been GET_VERSION while a file was still open).
        df_proto_vfs_cleanup();
        m_df_ctx.cmd = NULL;
    } else if (evt->type == DF_EVENT_DATA_RECEVIED) {
        m_df_ctx.cmd = df_core_find_proto_handler_entry(evt->df->cmd);
        NRF_LOG_INFO("cmd entry:%X", m_df_ctx.cmd);
        if (m_df_ctx.cmd) {
            m_df_ctx.cmd->handler(evt);
        } else {
            df_core_default_handler(evt);
        }
    } else {
        if (m_df_ctx.cmd) {
            m_df_ctx.cmd->handler(evt);
        } else {
            df_core_default_handler(evt);
        }
    }
}

void df_core_init() {
    m_df_ctx.driver = ble_get_df_driver();
    m_df_ctx.driver->init(df_core_on_event);
    m_df_ctx.cmd_entries[0] = df_proto_handler_info_entries;
    m_df_ctx.cmd_entries[1] = df_proto_handler_vfs_entries;
    // m_df_ctx.handler_entries[2] = df_proto_handler_amii_entries;
}
size_t df_core_max_payload(void) {
    size_t length = ble_nus_max_data_length();
    if (length <= DF_HEADER_LEN) return 0;
    length -= DF_HEADER_LEN;
    return length < DF_PAYLOAD_LEN ? length : DF_PAYLOAD_LEN;
}

void df_core_send_frame(df_frame_t *out) {
    /* The driver copies a complete logical frame into its existing RX/TX
     * buffer and segments large one-shot replies at the negotiated capacity. */
    if (m_df_ctx.driver->send(out) != 0) {
        /* The stack frame cannot be retried asynchronously. End this session
         * before TX_READY could consume the next file/directory chunk. */
        ble_nus_abort_transfer();
    }
}
