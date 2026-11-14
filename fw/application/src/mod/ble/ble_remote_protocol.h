#ifndef BLE_REMOTE_PROTOCOL_H
#define BLE_REMOTE_PROTOCOL_H
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#define REMOTE_REQUEST_SIZE 8u
#define REMOTE_REPLY_SIZE 12u
#define REMOTE_LCD_CHUNK_MAX 128u
#ifdef BOARD_LCD
#define REMOTE_CAPABILITIES 63u
#define REMOTE_MAX_REPLY_SIZE (REMOTE_REPLY_SIZE + REMOTE_LCD_CHUNK_MAX)
#else
#define REMOTE_CAPABILITIES 31u
#define REMOTE_MAX_REPLY_SIZE REMOTE_REPLY_SIZE
#endif
enum { REMOTE_STATUS, REMOTE_OPEN_FILE, REMOTE_TAP, REMOTE_BACK, REMOTE_OPEN_FILE_LINK,
       REMOTE_LCD_READ };
enum { REMOTE_DONE, REMOTE_BUSY, REMOTE_INVALID, REMOTE_DISABLED, REMOTE_UNSUPPORTED,
       REMOTE_UNSAFE, REMOTE_NO_MEMORY, REMOTE_SEQUENCE, REMOTE_REQUESTED };
enum { REMOTE_OFF, REMOTE_ACTIVE, REMOTE_TRANSITION, REMOTE_FILE, REMOTE_SUSPENDED };
/* Foreground-only protocol. Transport-generation changes discard all commands.
 * No allocator, held keys, retry of an action, or pointers to application views. */
typedef struct {
    uint32_t generation, local_generation;
    uint16_t next_sequence;
    uint8_t request[REMOTE_REQUEST_SIZE], last_request[REMOTE_REQUEST_SIZE];
    /* Only an accepted, new LCD read can overwrite the payload. Keep its
     * 128 bytes once; an invalid sequence or replay only changes the header. */
    uint8_t reply[REMOTE_MAX_REPLY_SIZE], last_reply[REMOTE_REPLY_SIZE];
    bool active, pending, replying, have_last, handshake, action_reply;
} ble_remote_protocol_t;
typedef uint8_t (*remote_execute_fn)(void *, uint8_t, uint8_t, uint32_t);
typedef uint8_t (*remote_state_fn)(void *);
/* send: 0 accepted by transport, 1 bounded backpressure, other = link lost. */
typedef int (*remote_send_fn)(void *, const uint8_t *, size_t);
typedef void (*remote_sent_fn)(void *, uint8_t, uint8_t);
void ble_remote_protocol_session(ble_remote_protocol_t *, uint32_t, bool);
bool ble_remote_protocol_receive(ble_remote_protocol_t *, const uint8_t *, size_t, uint32_t);
void ble_remote_protocol_poll(ble_remote_protocol_t *, uint32_t, uint32_t, void *,
                             remote_execute_fn, remote_state_fn, remote_send_fn, remote_sent_fn);
#endif
