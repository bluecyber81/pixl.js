#include "ble_remote_protocol.h"
#include <string.h>
static uint16_t sequence(const uint8_t *b) { return (uint16_t)b[4] | (uint16_t)b[5] << 8; }
static void response(ble_remote_protocol_t *p, uint8_t status, uint8_t state) {
    const uint8_t bytes[REMOTE_REPLY_SIZE] = {80,88,1,(uint8_t)(128u|p->request[3]),
        p->request[4],p->request[5],status,state,31,0,0,0};
    memcpy(p->reply, bytes, sizeof(bytes)); p->replying = true;
}
void ble_remote_protocol_session(ble_remote_protocol_t *p, uint32_t generation, bool active) {
    if (p->generation == generation && p->active == active) return;
    memset(p, 0, sizeof(*p)); p->generation = generation; p->active = active; p->next_sequence = 1;
}
bool ble_remote_protocol_receive(ble_remote_protocol_t *p, const uint8_t *data, size_t length,
                                 uint32_t local_generation) {
    if (!p->active || !data || length != REMOTE_REQUEST_SIZE ||
        data[0] != 80 || data[1] != 88 || data[2] != 1 || data[3] > 127) return false;
    if (p->pending || p->replying) {
        /* Only an exact duplicate can share an outstanding reply. */
        return memcmp(data, p->request, REMOTE_REQUEST_SIZE) == 0;
    }
    memcpy(p->request, data, REMOTE_REQUEST_SIZE);
    p->local_generation = local_generation;
    p->action_reply = false;
    if (p->have_last && !memcmp(data, p->last_request, REMOTE_REQUEST_SIZE)) {
        memcpy(p->reply, p->last_reply, REMOTE_REPLY_SIZE); p->replying = true; return true;
    }
    p->pending = true;
    return true;
}
void ble_remote_protocol_poll(ble_remote_protocol_t *p, uint32_t generation, uint32_t local_generation,
                             void *context, remote_execute_fn execute, remote_state_fn state,
                             remote_send_fn send, remote_sent_fn sent) {
    if (!p->active || p->generation != generation) {
        ble_remote_protocol_session(p, generation, false); return;
    }
    if (p->pending) {
        uint8_t executing_request[REMOTE_REQUEST_SIZE];
        memcpy(executing_request, p->request, sizeof(executing_request));
        uint16_t seq = sequence(p->request);
        uint8_t op = p->request[3], arg = p->request[6], result;
        bool consumes = seq && seq == p->next_sequence;
        if (!consumes) result = REMOTE_SEQUENCE;
        else if (p->request[7] || (op != REMOTE_TAP && arg) || (op == REMOTE_TAP && arg > 2))
            result = REMOTE_INVALID;
        else if (op > REMOTE_OPEN_FILE_LINK || (op != REMOTE_STATUS && !p->handshake)) result = REMOTE_UNSUPPORTED;
        else if (op != REMOTE_STATUS && p->local_generation != local_generation) result = REMOTE_BUSY;
        else result = execute(context, op, arg, p->local_generation);
        /* UI callbacks may shut down/reinitialize the session synchronously. */
        if (!p->active || p->generation != generation || !p->pending ||
            memcmp(executing_request, p->request, sizeof(executing_request))) return;
        p->pending = false;
        response(p, result, state(context));
        if (consumes) {
            p->next_sequence = seq == UINT16_MAX ? 1 : (uint16_t)(seq + 1);
            memcpy(p->last_request, p->request, REMOTE_REQUEST_SIZE);
            memcpy(p->last_reply, p->reply, REMOTE_REPLY_SIZE); p->have_last = true;
            if (op == REMOTE_STATUS && result == REMOTE_DONE && p->reply[7] == REMOTE_ACTIVE) p->handshake = true;
            p->action_reply = true;
        }
    }
    if (p->replying) {
        int result = send(context, p->reply, REMOTE_REPLY_SIZE);
        if (result == 0) {
            p->replying = false;
            if (p->action_reply && sent) sent(context, p->request[3], p->reply[6]);
            p->action_reply = false;
        } else if (result != 1) ble_remote_protocol_session(p, generation, false);
    }
}
