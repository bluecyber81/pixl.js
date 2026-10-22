#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "df_defines.h"
#include "df_proto_vfs.h"
#include "vfs.h"
static unsigned calls, sends;
static df_frame_t reply;
static size_t df_core_max_payload(void) { return 243; }
bool df_proto_vfs_is_idle(void) { return true; }
static bool vfs_spiffs_diag_generation_matches(uint8_t selection, uint16_t generation) {
    (void)selection; (void)generation; return false;
}
static void df_core_send_frame(df_frame_t *frame) { reply = *frame; ++sends; }
static void send_error(uint8_t command) {
    df_frame_t frame = {0}; OUT_FRAME_NO_DATA(frame, command, DF_STATUS_ERR); df_core_send_frame(&frame);
}
int32_t vfs_spiffs_storage_diagnose(uint8_t operation, uint8_t candidate,
                                   uint8_t *out, size_t capacity, size_t *length) {
    ++calls; assert(capacity == 243);
    if (operation > 2 || candidate > 1) return VFS_ERR_FAIL;
    *length = operation == 0 ? 170 : operation == 1 ? 91 : 235;
    memset(out, operation + 1, *length); return VFS_OK;
}
/* ACTUAL_HANDLER */
int main(void) {
    assert(DF_PROTO_CMD_VFS_STORAGE_DIAG == 0x1b);
    df_frame_t request = {.cmd=DF_PROTO_CMD_VFS_STORAGE_DIAG};
    df_event_t event = {.type=DF_EVENT_DATA_RECEVIED, .df=&request};
    for (unsigned op = 0; op <= 2; ++op) for (unsigned candidate = 0; candidate <= 1; ++candidate) {
        request.length = 2; request.data[0] = op; request.data[1] = candidate;
        unsigned before = calls; df_proto_handler_vfs_storage_diag(&event);
        assert(calls == before + 1 && reply.cmd == 0x1b && reply.status == 0 && reply.chunk == 0);
        assert(reply.length == (op == 0 ? 170 : op == 1 ? 91 : 235));
    }
    unsigned before = calls;
    for (unsigned len = 0; len <= 243; ++len) if (len != 2) {
        request.length = len; df_proto_handler_vfs_storage_diag(&event);
        assert(calls == before && reply.status == DF_STATUS_ERR && !reply.length && !reply.chunk);
    }
    request.length = 2; request.status = 1; df_proto_handler_vfs_storage_diag(&event);
    assert(calls == before && reply.status == DF_STATUS_ERR);
    request.status = 0; request.chunk = 0x8000; df_proto_handler_vfs_storage_diag(&event);
    assert(calls == before && reply.status == DF_STATUS_ERR);
    request.chunk = 0; request.data[0] = 3; df_proto_handler_vfs_storage_diag(&event);
    assert(reply.status == DF_STATUS_ERR && !reply.length);
    request.data[0] = 2; request.data[1] = 2; df_proto_handler_vfs_storage_diag(&event);
    assert(reply.status == DF_STATUS_ERR && !reply.length);
    before = sends; event.type = DF_EVENT_LINK_DISCONNECTED; df_proto_handler_vfs_storage_diag(&event);
    event.type = DF_EVENT_DATA_TRANSMIT_READY; df_proto_handler_vfs_storage_diag(&event);
    assert(sends == before);
    puts("PASS diagnostic handler: exact request length/status/chunk, all6 valid operation/candidate pairs, bounded single-frame replies, no actions on unrelated events");
    return 0;
}
