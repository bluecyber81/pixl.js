#include "df_proto_info.h"
#include "df_proto_vfs.h"
#include "df_buffer.h"
#include "utils2.h"
#include "ble_df_driver.h"
#include "mui_nav_diag.h"
#include "../runtime_diag.h"
#include "../boot_diag.h"

#include "nrf_log.h"
#include "ble_main.h"
#include "version2.h"
#include "ble_main.h"

void df_proto_handler_info_get_version(df_event_t *evt) {
    if (evt->type == DF_EVENT_DATA_RECEVIED) {
        df_frame_t out;

        NEW_BUFFER_ZERO(buff, out.data, sizeof(out.data));
        buff_put_string(&buff, version_get_version(version_get()));
        char ble_addr[24];
        ble_get_addr_str(ble_addr);
        buff_put_string(&buff, ble_addr);

        OUT_FRAME_WITH_DATA_0(out, DF_PROTO_CMD_INFO_VERSION_INFO, DF_STATUS_OK, buff_get_size(&buff));

        df_core_send_frame(&out);
    }
}

static bool dfu_pending;

void df_proto_info_cancel_pending(void) {
    if (dfu_pending) {
        dfu_pending = false;
        system_cancel_reset();
    }
}

void df_proto_handler_info_enter_dfu(df_event_t *evt) {
    if (evt->type == DF_EVENT_LINK_DISCONNECTED) {
        df_proto_info_cancel_pending();
    } else if (evt->type == DF_EVENT_DATA_RECEVIED) {
        df_proto_info_cancel_pending();
        /* Flush and reserve the exact current owner before acknowledging.
         * Errors and superseded requests must never reset on TX_READY. */
        dfu_pending = evt->df->length == 0 && evt->df->status == 0 && evt->df->chunk == 0 &&
                      df_proto_vfs_file_transfer_closed() && system_prepare_reset();
        df_frame_t out;
        OUT_FRAME_NO_DATA(out, DF_PROTO_CMD_INFO_ENTER_DFU, dfu_pending ? DF_STATUS_OK : DF_STATUS_ERR);
        df_core_send_frame(&out);
    } else if (evt->type == DF_EVENT_DATA_TRANSMIT_READY && dfu_pending) {
        dfu_pending = false;
        if (system_reset_prepared()) {
            NRF_LOG_INFO("enter dfu ...");
            (void)enter_dfu();
        } else {
            system_cancel_reset();
        }
    }
}

static void df_proto_handler_info_capabilities(df_event_t *evt) {
    if (evt->type != DF_EVENT_DATA_RECEVIED) return;
    df_frame_t out = {0};
    OUT_FRAME_NO_DATA(out, DF_PROTO_CMD_INFO_CAPABILITIES, DF_STATUS_ERR);
    if (evt->df->length == 0 && evt->df->status == 0 && evt->df->chunk == 0) {
        ble_df_driver_enable_framed_rx();
        /* Fits the minimum ATT MTU23: magic, format, RX/TX chunk flags,
         * maximum reassembled request payload and current GATT value capacity
         * (both little endian). ATT MTU is shared by RX and TX on this link. */
        size_t capacity = ble_nus_max_data_length();
        if (capacity < 20 || capacity > DF_MAX_LEN) capacity = 20;
        const uint8_t capabilities[] = {'P', 'X', 'D', 'F', 1, 3, DF_PAYLOAD_LEN, 0,
                                        (uint8_t)capacity, (uint8_t)(capacity >> 8)};
        memcpy(out.data, capabilities, sizeof(capabilities));
        out.status = DF_STATUS_OK;
        out.length = sizeof(capabilities);
    }
    df_core_send_frame(&out);
}

/* Diagnostic build only: a bounded RAM snapshot, no settings/file mutation.
 * Reading never clears the observations from the previous Settings session. */
static void df_proto_handler_info_ui_diagnostic(df_event_t *evt) {
    if (evt->type != DF_EVENT_DATA_RECEVIED) return;
    df_frame_t out = {0};
    OUT_FRAME_NO_DATA(out, DF_PROTO_CMD_INFO_UI_DIAGNOSTIC, DF_STATUS_ERR);
    if (evt->df->length == 0 && evt->df->status == 0 && evt->df->chunk == 0 &&
        mui_nav_diag_snapshot(out.data, sizeof(out.data))) {
        out.status = DF_STATUS_OK;
        out.length = MUI_NAV_DIAG_SNAPSHOT_SIZE;
    }
    df_core_send_frame(&out);
}

/* Empty query, or exactly "MTU!" + uint16 LE (23 or 250). The ACK uses the
 * current link; the test client must disconnect/reconnect to apply the value.
 * This is volatile diagnostics, not a persisted setting or a DFU request. */
static void df_proto_handler_info_mtu_diagnostic(df_event_t *evt) {
    if (evt->type != DF_EVENT_DATA_RECEVIED) return;
    df_frame_t out = {0};
    OUT_FRAME_NO_DATA(out, DF_PROTO_CMD_INFO_MTU_DIAGNOSTIC, DF_STATUS_ERR);
    if (evt->df->status == 0 && evt->df->chunk == 0) {
        bool idle = df_proto_vfs_is_idle();
        uint16_t requested = 0;
        bool valid = evt->df->length == 0;
        if (evt->df->length == 6 && memcmp(evt->df->data, "MTU!", 4) == 0) {
            requested = (uint16_t)evt->df->data[4] | ((uint16_t)evt->df->data[5] << 8);
            valid = idle && (requested == 23 || requested == 250);
        }
        if (valid && ble_mtu_diagnostic(requested, out.data, sizeof(out.data))) {
            if (idle) out.data[5] |= 4; /* no open/abandoned file or directory transfer */
            out.status = DF_STATUS_OK;
            out.length = BLE_MTU_DIAGNOSTIC_SIZE;
        }
    }
    df_core_send_frame(&out);
}

static void df_proto_handler_info_runtime_diagnostic(df_event_t *evt) {
    if (evt->type != DF_EVENT_DATA_RECEVIED) return;
    df_frame_t out = {0};
    OUT_FRAME_NO_DATA(out, DF_PROTO_CMD_INFO_RUNTIME_DIAGNOSTIC, DF_STATUS_ERR);
    if (evt->df->length == 0 && evt->df->status == 0 && evt->df->chunk == 0 &&
        runtime_diag_snapshot(out.data, sizeof(out.data))) {
        out.status = DF_STATUS_OK;
        out.length = RUNTIME_DIAG_SIZE;
    }
    df_core_send_frame(&out);
}

/* Fixed read-only report; malformed requests cannot select memory addresses.
 * Avoid interleaving the bounded hash with an unfinished storage transfer. */
static void df_proto_handler_info_boot_diagnostic(df_event_t *evt) {
    if (evt->type != DF_EVENT_DATA_RECEVIED) return;
    df_frame_t out = {0};
    OUT_FRAME_NO_DATA(out, DF_PROTO_CMD_INFO_BOOT_DIAGNOSTIC, DF_STATUS_ERR);
    if (evt->df->length == 0 && evt->df->status == 0 && evt->df->chunk == 0 &&
        df_proto_vfs_is_idle() && boot_diag_snapshot(out.data, sizeof(out.data))) {
        out.status = DF_STATUS_OK;
        out.length = BOOT_DIAG_SIZE;
    }
    df_core_send_frame(&out);
}

/* Optional cached observations only: no ADC conversion, GPIO write or reset. */
static void df_proto_handler_info_power_diagnostic(df_event_t *evt) {
    if (evt->type != DF_EVENT_DATA_RECEVIED) return;
    df_frame_t out = {0};
    OUT_FRAME_NO_DATA(out, DF_PROTO_CMD_INFO_POWER_DIAGNOSTIC, DF_STATUS_ERR);
    if (evt->df->length == 0 && evt->df->status == 0 && evt->df->chunk == 0 &&
        runtime_diag_power_snapshot(out.data, sizeof(out.data))) {
        out.status = DF_STATUS_OK;
        out.length = POWER_DIAG_SIZE;
    }
    df_core_send_frame(&out);
}

/* A cached startup trace. Reading cannot restart, mount, mutate or clear it. */
static void df_proto_handler_info_startup_diagnostic(df_event_t *evt) {
    if (evt->type != DF_EVENT_DATA_RECEVIED) return;
    df_frame_t out = {0};
    OUT_FRAME_NO_DATA(out, DF_PROTO_CMD_INFO_STARTUP_DIAGNOSTIC, DF_STATUS_ERR);
    bool detail = evt->df->length == 1 && evt->df->data[0] == 1;
    if ((!evt->df->length || detail) && !evt->df->status && !evt->df->chunk &&
        runtime_diag_startup_snapshot(out.data, sizeof(out.data), detail)) {
        out.status = DF_STATUS_OK;
        out.length = detail ? STARTUP_STORAGE_DIAG_SIZE : STARTUP_DIAG_SIZE;
    }
    df_core_send_frame(&out);
}

const df_cmd_entry_t df_proto_handler_info_entries[] = {
    {DF_PROTO_CMD_INFO_VERSION_INFO, df_proto_handler_info_get_version},
    {DF_PROTO_CMD_INFO_ENTER_DFU, df_proto_handler_info_enter_dfu},
    {DF_PROTO_CMD_INFO_CAPABILITIES, df_proto_handler_info_capabilities},
    {DF_PROTO_CMD_INFO_UI_DIAGNOSTIC, df_proto_handler_info_ui_diagnostic},
    {DF_PROTO_CMD_INFO_MTU_DIAGNOSTIC, df_proto_handler_info_mtu_diagnostic},
    {DF_PROTO_CMD_INFO_RUNTIME_DIAGNOSTIC, df_proto_handler_info_runtime_diagnostic},
    {DF_PROTO_CMD_INFO_BOOT_DIAGNOSTIC, df_proto_handler_info_boot_diagnostic},
    {DF_PROTO_CMD_INFO_POWER_DIAGNOSTIC, df_proto_handler_info_power_diagnostic},
    {DF_PROTO_CMD_INFO_STARTUP_DIAGNOSTIC, df_proto_handler_info_startup_diagnostic},
    {0, NULL}};
