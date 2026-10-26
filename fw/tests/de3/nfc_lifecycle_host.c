#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "ntag_def.h"
typedef uint32_t ret_code_t;
typedef enum { NTAG_EVENT_TYPE_WRITTEN, NTAG_EVENT_TYPE_READ } ntag_event_type_t;
typedef void (*ntag_update_cb_t)(ntag_event_type_t, void *, ntag_t *);
typedef enum { HAL_NFC_EVENT_FIELD_ON, HAL_NFC_EVENT_FIELD_OFF,
    HAL_NFC_EVENT_DATA_TRANSMITTED, HAL_NFC_EVENT_COMMAND } hal_nfc_event_t;
typedef void (*hal_nfc_callback_t)(void *, hal_nfc_event_t, const uint8_t *, size_t);
static unsigned critical_depth, tx_length, parameter_writes, start_count, stop_count;
static uint8_t tx[255], uid[7];
static int ack;
#define CRITICAL_REGION_ENTER() do { ++critical_depth;
#define CRITICAL_REGION_EXIT() --critical_depth; } while (0)
#define NRF_SUCCESS 0
#define NRF_ERROR_BUSY 17
#define NRF_LOG_INFO(...) ((void)0)
#define APP_ERROR_CHECK(x) assert((x) == 0)
#define BSP_BOARD_LED_0 0
static void bsp_board_led_on(int n) { (void)n; }
static void bsp_board_led_off(int n) { (void)n; }
static void nrf_pwr_mgmt_feed(void) {}
static void hal_send_ack_nack(uint8_t v) { ack = v; }
static ret_code_t hal_nfc_passive_ack(void) { return 0; }
static ret_code_t hal_nfc_send(const uint8_t *data, size_t size) {
    assert(size <= sizeof(tx)); memcpy(tx, data, size); tx_length = (unsigned)size; return 0;
}
static ret_code_t hal_nfc_parameter_set(int id, const uint8_t *data, size_t size) {
    (void)id; assert(size == 7); memcpy(uid, data, 7); ++parameter_writes; return 0;
}
static ret_code_t hal_nfc_setup(hal_nfc_callback_t cb, void *ctx) { (void)cb; (void)ctx; return 0; }
static ret_code_t hal_nfc_start(void) { assert(parameter_writes > 0); ++start_count; return 0; }
static ret_code_t hal_nfc_stop(void) { ++stop_count; return 0; }
bool ntag_emu_set_tag(const ntag_t *);
void ntag_emu_set_uuid_only(const ntag_t *);
bool ntag_emu_prepare_change(void);
void ntag_emu_process_pending(void);

/* ACTUAL_SOURCE */

static ntag_t tag_a, tag_b;
static unsigned callbacks, writes, reads, actions;
static uint8_t saved_uid, saved_page;
static void *saved_context;
static enum { NORMAL, WRITE_DURING_SAVE, CHANGE_DURING_SAVE, DETACH_DURING_SAVE,
              CHANGE_DURING_READ, FIELD_OFF_DURING_SAVE } behavior;
static void write_page(uint8_t value, int expected_ack) {
    const uint8_t command[] = {NFC_CMD_WRITE, 4, value, value, value, value};
    ack = -1; nfc_callback(NULL, HAL_NFC_EVENT_COMMAND, command, sizeof(command));
    assert(ack == expected_ack);
}
static void field_off(void) { nfc_callback(NULL, HAL_NFC_EVENT_FIELD_OFF, NULL, 0); }
static void field_on(void) { nfc_callback(NULL, HAL_NFC_EVENT_FIELD_ON, NULL, 0); }
static void callback(ntag_event_type_t type, void *context, ntag_t *tag) {
    assert(critical_depth == 0);
    ++callbacks; saved_context = context;
    if (type == NTAG_EVENT_TYPE_WRITTEN) {
        ++writes; saved_uid = tag->data[0]; saved_page = tag->data[16];
        if (behavior == WRITE_DURING_SAVE) {
            write_page(0x77, 0);  /* Explicit NAK, never an ACK followed by silent loss. */
            assert(tag->data[16] == 0x55 && ntag_emu.ntag.data[16] == 0x55);
        } else if (behavior == CHANGE_DURING_SAVE) {
            assert(!ntag_emu_set_tag(&tag_b));
            assert(tag->data[0] == 0x41 && ntag_emu.ntag.data[0] == 0x41);
            write_page(0x77, 0);
        } else if (behavior == DETACH_DURING_SAVE) {
            assert(!ntag_emu_set_update_cb(NULL, NULL));
            assert(tag->data[0] == 0x41);
        } else if (behavior == FIELD_OFF_DURING_SAVE) {
            field_off();
        }
        ntag_emu_process_pending(); /* Reentrant pump does not overwrite snapshot. */
    } else {
        ++reads;
        if (behavior == CHANGE_DURING_READ) ntag_emu_set_tag(&tag_b);
    }
}
static void action(void *context) { assert(!critical_depth && context == (void *)1); ++actions; }
static void reset(void) {
    memset(&ntag_emu, 0, sizeof(ntag_emu));
    callbacks = writes = reads = actions = 0; saved_uid = saved_page = 0;
    critical_depth = tx_length = parameter_writes = start_count = stop_count = 0;
    behavior = NORMAL;
    ntag_emu_set_tag(&tag_a); ntag_emu_set_update_cb(callback, (void *)1);
}
int main(void) {
    memset(&tag_a, 0, sizeof(tag_a)); tag_a.type = NTAG_215; tag_a.data[0] = 0x41;
    tag_b = tag_a; tag_b.data[0] = 0x42;
    reset(); write_page(0x55, 0xa); field_off(); assert(callbacks == 0);
    ntag_emu_process_pending(); assert(writes == 1 && saved_uid == 0x41 && saved_page == 0x55);
    ntag_emu_process_pending(); assert(callbacks == 1);
    puts("PASS pending field-off executes exactly once outside IRQ/critical region");

    reset(); write_page(0x55, 0xa); field_off();
    ntag_emu_prepare_change(); assert(writes == 1 && saved_uid == 0x41);
    write_page(0x66, 0); /* Transition remains paused. */
    ntag_emu_set_tag(&tag_b); ntag_emu_set_update_cb(callback, (void *)2);
    ntag_emu_process_pending(); assert(callbacks == 1 && saved_context == (void *)1);
    puts("PASS old A write flushed before B selection; stale event does not reach B");

    reset(); field_on(); write_page(0x55, 0xa);
    ntag_emu_process_pending(); assert(callbacks == 0);
    ntag_emu_prepare_change(); assert(writes == 1 && saved_page == 0x55 && ntag_emu.paused);
    ntag_emu_prepare_change(); assert(writes == 1); write_page(0x66, 0);
    puts("PASS shutdown/app-change with field still ON flushes once before retain/free");

    reset(); write_page(0x55, 0xa); field_off(); ntag_emu_set_update_cb(NULL, NULL);
    assert(writes == 1); unsigned before = parameter_writes;
    ntag_emu_process_pending(); field_off(); ntag_emu_process_pending();
    assert(callbacks == 1 && parameter_writes == before);
    puts("PASS detach persists old write and prevents deferred HAL/callback access");

    reset(); write_page(0x55, 0xa); field_off(); behavior = WRITE_DURING_SAVE;
    ntag_emu_process_pending(); assert(writes == 1 && saved_page == 0x55 && !ntag_emu.dirty);
    behavior = NORMAL; write_page(0x77, 0xa); field_off(); ntag_emu_process_pending();
    assert(writes == 2 && saved_page == 0x77);
    puts("PASS busy WRITE explicitly NAKs; retried WRITE ACKs and is persisted");

    reset(); write_page(0x55, 0xa); field_off(); behavior = CHANGE_DURING_SAVE;
    ntag_emu_process_pending(); assert(writes == 1 && saved_uid == 0x41 && ntag_emu.ntag.data[0] == 0x41);
    behavior = NORMAL; write_page(0x77, 0xa); field_off(); ntag_emu_process_pending();
    assert(writes == 2 && saved_uid == 0x41 && saved_page == 0x77);
    reset(); write_page(0x55, 0xa); field_off(); behavior = DETACH_DURING_SAVE;
    ntag_emu_process_pending(); assert(writes == 1 && !ntag_emu.paused && ntag_emu.update_cb==callback);
    reset(); write_page(0x55, 0xa); behavior = CHANGE_DURING_SAVE;
    ntag_emu_prepare_change(); assert(writes == 1 && ntag_emu.paused && ntag_emu.ntag.data[0] == 0x41);
    write_page(0x77, 0);
    puts("PASS write callback cannot replace its undecided tag or detach its owner");

    reset(); behavior = CHANGE_DURING_READ; field_off(); ntag_emu_process_pending();
    assert(reads == 1 && ntag_emu.ntag.data[0] == 0x42);
    behavior = NORMAL; write_page(0x77, 0xa); field_off(); ntag_emu_process_pending();
    assert(writes == 1 && saved_uid == 0x42 && saved_page == 0x77);
    reset(); behavior = FIELD_OFF_DURING_SAVE; write_page(0x55, 0xa); field_off(); ntag_emu_process_pending();
    assert(writes == 1 && reads == 0 && ntag_emu.pending);
    behavior = NORMAL; ntag_emu_process_pending(); assert(writes == 1 && reads == 1);
    puts("PASS READ-triggered tag change and FIELD_OFF arriving during a save");

    reset(); field_off(); ntag_emu_set_tag(&tag_b); ntag_emu_process_pending(); assert(callbacks == 0);
    ntag_emu.generation = UINT32_MAX; field_off(); ntag_emu_set_tag(&tag_a);
    ntag_emu_process_pending(); assert(callbacks == 0 && ntag_emu.generation == 0);
    puts("PASS stale READ and generation wrap cannot target a later tag");

    reset(); ntag_emu_request_action(action, (void *)2, ntag_emu_get_generation()); ntag_emu_process_pending(); assert(actions == 0);
    ntag_emu_request_action(action, (void *)1, ntag_emu_get_generation()); assert(actions == 0);
    field_on(); ntag_emu_process_pending(); assert(actions == 0);
    field_off(); ntag_emu_process_pending(); assert(actions == 1);
    ntag_emu_request_action(action, (void *)1, ntag_emu_get_generation()); ntag_emu_set_tag(&tag_b);
    ntag_emu_process_pending(); assert(actions == 1);
    uint32_t timer_started_for = ntag_emu_get_generation();
    ntag_emu_set_tag(&tag_a); /* Timer A has not fired when selection changes. */
    ntag_emu_request_action(action, (void *)1, timer_started_for);
    ntag_emu_process_pending(); assert(actions == 1);
    ntag_emu_request_action(action, (void *)1, ntag_emu_get_generation()); write_page(0x55, 0xa); field_off();
    ntag_emu_process_pending(); assert(actions == 1);
    ntag_emu_request_action(action, (void *)1, ntag_emu_get_generation()); ntag_emu_set_update_cb(NULL, NULL);
    ntag_emu_process_pending(); assert(actions == 1);
    puts("PASS deferred timers bind to owner/generation, wait for field loss, cancel on write/change");

    reset(); const uint8_t sector[] = {NFC_CMD_SECTOR_SELECT, 0xff};
    nfc_received_process(sector, sizeof(sector), ntag_emu.ntag.data);
    assert(ntag_emu.is_selecting_sector); ntag_emu.sector = 1;
    field_off(); assert(!ntag_emu.is_selecting_sector && ntag_emu.sector == 0);
    ntag_emu_init(&tag_b); assert(start_count == 1 && stop_count == 1 && uid[0] == 0x42);
    ntag_emu_uninit(); assert(stop_count == 2 && ntag_emu.paused && !ntag_emu.field_on);
    puts("PASS immediate sector reset and init/uninit ordering");
    assert(sizeof(m_snapshot) == sizeof(ntag_t));
    printf("Snapshot bytes: %zu; emulator state bytes: %zu\n", sizeof(m_snapshot), sizeof(ntag_emu));
    return 0;
}
