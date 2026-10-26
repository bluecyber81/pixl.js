#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <setjmp.h>
#include "dfu_completion.h"

#define CHECK(c) do { if (!(c)) { fprintf(stderr, "CHECK failed: %s line %d\n", #c, __LINE__); exit(71); } } while (0)
#define UNUSED_PARAMETER(x) ((void)(x))
#define UNUSED_RETURN_VALUE(x) ((void)(x))
#define ASSERT(x) CHECK(x)
#define NRF_LOG_DEBUG(...) ((void)0)
#define NRF_LOG_INFO(...) ((void)0)
#define NRF_LOG_WARNING(...) ((void)0)
#define NRF_LOG_ERROR(...) (++errors)
#define NRF_DFU_IN_APP 0
#define NRF_DFU_PROTOCOL_REDUCED 1
#define NRF_DFU_SAVE_PROGRESS_IN_FLASH 1
#define NRF_BL_RESET_DELAY_MS 100
#define NRF_BL_DFU_INACTIVITY_TIMEOUT_MS 120000
#define NRF_BOOTLOADER_MS_TO_TICKS(ms) ((((uint64_t)(ms) * 32768)) / 1000)
#define NRF_SUCCESS 0
#define NRF_ERROR_INVALID_PARAM 7
typedef int ret_code_t;
typedef int nrf_dfu_result_t;
typedef void nrf_fstorage_evt_t;
typedef void (*nrf_dfu_flash_callback_t)(void *);
enum { NRF_DFU_RES_CODE_SUCCESS = 1, NRF_DFU_RES_CODE_OPERATION_NOT_PERMITTED = 8, NRF_DFU_RES_CODE_OP_CODE_NOT_SUPPORTED = 2 };
enum { NRF_DFU_OP_OBJECT_CREATE = 1, NRF_DFU_OP_RECEIPT_NOTIF_SET, NRF_DFU_OP_CRC_GET,
       NRF_DFU_OP_OBJECT_EXECUTE, NRF_DFU_OP_OBJECT_SELECT, NRF_DFU_OP_OBJECT_WRITE, NRF_DFU_OP_ABORT };
typedef enum { NRF_DFU_EVT_DFU_STARTED, NRF_DFU_EVT_OBJECT_RECEIVED, NRF_DFU_EVT_DFU_COMPLETED,
               NRF_DFU_EVT_DFU_ABORTED, NRF_DFU_EVT_TRANSPORT_DEACTIVATED, NRF_DFU_EVT_DFU_FAILED,
               NRF_DFU_EVT_TRANSPORT_ACTIVATED } nrf_dfu_evt_type_t;
typedef void (*nrf_dfu_observer_t)(nrf_dfu_evt_type_t);
typedef struct { int request, result; } nrf_dfu_response_t;
typedef struct {
    int request;
    struct { void (*response)(nrf_dfu_response_t *, void *); void (*write)(void *); } callback;
    struct { uint8_t const *p_data; unsigned len; } write;
    void *p_context;
} nrf_dfu_request_t;
static struct {
    struct { unsigned firmware_image_offset, firmware_image_offset_last, firmware_image_crc,
                      firmware_image_crc_last, data_object_size; } progress;
    bool valid_bank;
} s_dfu_settings;

static nrf_dfu_observer_t m_observer, m_user_observer;
static volatile bool m_flash_write_done;
#ifdef BASELINE
volatile bool g_dfu_finalizing, g_dfu_final_success;
static bool m_final_reset_ready;
static void final_reset_process(void) {}
#else
/* Production declarations are included below, not copied test state. */
#endif
static uint32_t m_firmware_start_addr = 0x19000, m_firmware_size_req = 128;
static unsigned resets, delays, flushes, backups, writes, responses, free_calls, mutations, user_events, reinit_calls;
static unsigned timer_calls, timer_ticks, pending_queries, errors, validate_calls;
static unsigned critical_depth, blocked_timer_irqs;
static bool pending_response, busy_flash, synchronous_write, synchronous_backup, interrupt_validation;
static bool inject_stale_compare;
static bool settings_error_leaves_flash_busy;
static int validation_result = NRF_DFU_RES_CODE_SUCCESS, settings_error;
static void (*timer_callback)(void), (*persist_callback)(void *), (*backup_callback)(void *);
static jmp_buf fault_jump;
static bool catch_fault;

static void checked_error(int code) { if (code) { ++errors; CHECK(catch_fault); longjmp(fault_jump, 1); } }
#define APP_ERROR_CHECK(x) checked_error(x)
#define CRITICAL_REGION_ENTER() do { ++critical_depth; } while (0)
#define CRITICAL_REGION_EXIT() do { CHECK(critical_depth); --critical_depth; } while (0)
static void log_flush(void) { ++flushes; }
#define NRF_LOG_FINAL_FLUSH() log_flush()
static void nrf_delay_ms(unsigned ms) { CHECK(ms == NRF_BL_RESET_DELAY_MS); ++delays; }
static void NVIC_SystemReset(void) { ++resets; }
bool nrf_dfu_ble_response_pending(void) { ++pending_queries; return pending_response; }
static void nrf_bootloader_dfu_inactivity_timer_restart(unsigned ticks, void (*callback)(void)) {
    ++timer_calls; timer_ticks = ticks; timer_callback = callback;
    /* Model pending old compare after SDK installs the new callback but before
     * rtc_update clears its event. A critical region must block dispatch. */
    if (inject_stale_compare) {
        if (critical_depth) ++blocked_timer_irqs;
        else callback();
    }
}
static void nrf_dfu_settings_reinit(void) { ++reinit_calls; s_dfu_settings.valid_bank = false; }
static void nrf_dfu_settings_backup(void (*callback)(void *)) {
    ++backups; backup_callback = callback; if (synchronous_backup) callback(NULL);
}
static ret_code_t nrf_dfu_settings_write_and_backup(void (*callback)(void *)) {
    ++writes;
#ifndef BASELINE
    if (callback) {
        CHECK(timer_calls == 1 && timer_ticks == NRF_BOOTLOADER_MS_TO_TICKS(20000));
    }
#endif
    if (settings_error) {
        /* Model an erase successfully queued before a later settings step fails. */
        busy_flash = settings_error_leaves_flash_busy;
        return settings_error;
    }
    persist_callback = callback;
    if (synchronous_write && callback) callback(NULL);
    return NRF_SUCCESS;
}
static bool nrf_fstorage_is_busy(void *context) { (void)context; return busy_flash; }
static void dfu_observer(nrf_dfu_evt_type_t event);
static void inactivity_timeout(void);
static int nrf_dfu_validation_activation_prepare(unsigned address, unsigned size) {
    CHECK(address == m_firmware_start_addr && size == m_firmware_size_req); ++validate_calls;
#ifndef BASELINE
    CHECK(g_dfu_finalizing && !g_dfu_final_success);
#endif
    s_dfu_settings.valid_bank = (validation_result == NRF_DFU_RES_CODE_SUCCESS);
    if (interrupt_validation) {
        dfu_observer(NRF_DFU_EVT_TRANSPORT_DEACTIVATED);
        dfu_observer(NRF_DFU_EVT_DFU_ABORTED);
        dfu_observer(NRF_DFU_EVT_OBJECT_RECEIVED);
        inactivity_timeout();
    }
    return validation_result;
}
static int ext_err_code_handle(int result) { return result; }
static void response(nrf_dfu_response_t *value, void *context) {
    (void)context; ++responses; CHECK(value->request == NRF_DFU_OP_OBJECT_EXECUTE);
#ifndef BASELINE
    if (s_dfu_settings.progress.firmware_image_offset == m_firmware_size_req) {
        CHECK(g_dfu_finalizing);
        CHECK(g_dfu_final_success == (value->result == NRF_DFU_RES_CODE_SUCCESS));
    }
#endif
    pending_response = true;
}
static uint8_t write_buffer[8];
static void free_buffer(void *buffer) { CHECK(buffer == write_buffer); ++free_calls; }
static void user_observer(nrf_dfu_evt_type_t event) { (void)event; ++user_events; }
typedef struct { nrf_dfu_request_t req; void (*callback)(void *, uint16_t); } scheduled_t;
static scheduled_t queue[16];
static unsigned queued;
static ret_code_t app_sched_event_put(void *event, unsigned length, void (*callback)(void *, uint16_t)) {
    CHECK(length == sizeof(nrf_dfu_request_t) && queued < 16);
    queue[queued].req = *(nrf_dfu_request_t *)event; queue[queued++].callback = callback;
    return NRF_SUCCESS;
}
static bool nrf_dfu_obj_op(nrf_dfu_request_t *, nrf_dfu_response_t *);
static void on_prn_set_request(nrf_dfu_request_t *r, nrf_dfu_response_t *s) { (void)r; (void)s; ++mutations; }
static void on_abort_request(nrf_dfu_request_t *r, nrf_dfu_response_t *s) { (void)r; (void)s; ++mutations; }

/* ACTUAL_SOURCE */

static bool nrf_dfu_obj_op(nrf_dfu_request_t *r, nrf_dfu_response_t *s) {
    if (r->request == NRF_DFU_OP_OBJECT_EXECUTE) return on_data_obj_execute_request(r, s);
    ++mutations; return true;
}
static nrf_dfu_request_t req(int opcode) {
    nrf_dfu_request_t result = { .request = opcode, .callback = {response, free_buffer}, .write = {write_buffer, 8} };
    return result;
}
static void run_one(void) {
    CHECK(queued); scheduled_t next = queue[0];
    memmove(queue, queue + 1, --queued * sizeof(queue[0])); next.callback(&next.req, sizeof(next.req));
}
static void begin(void) {
    m_observer = dfu_observer; m_user_observer = user_observer;
    s_dfu_settings.progress.firmware_image_offset = m_firmware_size_req;
    s_dfu_settings.progress.data_object_size = m_firmware_size_req;
}
static void final_execute(void) { nrf_dfu_request_t r = req(NRF_DFU_OP_OBJECT_EXECUTE); nrf_dfu_req_handler_req_process(&r); }
static void scenario(char const *name) {
    begin();
    if (!strcmp(name, "sync_ack") || !strcmp(name, "timeout") || !strcmp(name, "deactivate_validation")) {
        synchronous_write = synchronous_backup = true;
        interrupt_validation = !strcmp(name, "deactivate_validation");
        final_execute();
        CHECK(responses == 1 && writes == 1 && backups == 1);
        CHECK(!resets && !delays && !flushes);
        CHECK(s_dfu_settings.valid_bank && !reinit_calls);
        CHECK(user_events == 1 && timer_calls == 2 && timer_ticks == NRF_BOOTLOADER_MS_TO_TICKS(2000));
        final_reset_process(); CHECK(!resets && pending_queries == 1);
        if (!strcmp(name, "timeout")) {
            timer_callback(); CHECK(!resets && !delays && !flushes);
        } else pending_response = false;
        final_reset_process(); CHECK(resets == 1 && delays == 1 && flushes == 1);
        final_reset_process(); CHECK(resets == 1);
    } else if (!strcmp(name, "flash_not_idle_after_ready")) {
        synchronous_write = synchronous_backup = true; final_execute();
        busy_flash = true; pending_response = false;
        final_reset_process(); CHECK(!resets && !pending_queries);
        timer_callback(); final_reset_process(); CHECK(!resets && !pending_queries);
        busy_flash = false; final_reset_process(); CHECK(resets == 1);
        final_reset_process(); CHECK(resets == 1);
    } else if (!strcmp(name, "async_flash")) {
        final_execute(); CHECK(responses == 1 && !backups && !resets && timer_calls == 1);
        pending_response = false; final_reset_process(); CHECK(!resets && !pending_queries);
        CHECK(persist_callback); persist_callback(NULL); CHECK(backups == 1 && !resets && timer_calls == 1);
        final_reset_process(); CHECK(!resets);
        CHECK(backup_callback); backup_callback(NULL); CHECK(!resets && timer_calls == 2);
        final_reset_process(); CHECK(resets == 1);
    } else if (!strcmp(name, "commit_callback_missing") || !strcmp(name, "backup_callback_missing") ||
               !strcmp(name, "commit_timeout_flash_busy") || !strcmp(name, "invalid_commit_callback_missing")) {
        bool invalid = !strcmp(name, "invalid_commit_callback_missing");
        if (invalid) validation_result = 8;
        final_execute(); CHECK(responses == 1 && !backups && !resets && !m_final_reset_ready);
        CHECK(timer_calls == 1 && timer_ticks == NRF_BOOTLOADER_MS_TO_TICKS(20000));
        CHECK(g_dfu_final_success == !invalid && s_dfu_settings.valid_bank == !invalid);
        if (!strcmp(name, "backup_callback_missing")) { persist_callback(NULL); CHECK(backups == 1); }
        unsigned expected_backups = backups;
        pending_response = false; final_reset_process(); CHECK(!resets && !pending_queries);
        busy_flash = !strcmp(name, "commit_timeout_flash_busy");
        timer_callback(); CHECK(!resets && !delays && !flushes && !m_final_reset_ready);
        if (busy_flash) { final_reset_process(); CHECK(!resets && !pending_queries); }
        busy_flash = false; final_reset_process(); CHECK(resets == 1 && !m_final_reset_ready);
        CHECK(backups == expected_backups && writes == 1 && !pending_queries);
        CHECK(s_dfu_settings.valid_bank == !invalid && !reinit_calls);
        final_reset_process(); CHECK(resets == 1);
    } else if (!strcmp(name, "commit_timeout_then_callback")) {
        final_execute(); CHECK(timer_calls == 1 && !m_final_reset_ready);
        busy_flash = true; timer_callback(); final_reset_process(); CHECK(!resets);
        persist_callback(NULL); backup_callback(NULL); CHECK(m_final_reset_ready && timer_calls == 2);
        CHECK(timer_ticks == NRF_BOOTLOADER_MS_TO_TICKS(2000));
        busy_flash = false; final_reset_process(); CHECK(!resets && pending_queries == 1);
        pending_response = false; final_reset_process(); CHECK(resets == 1);
    } else if (!strcmp(name, "stale_timer_during_rearm")) {
        inject_stale_compare = true; final_execute();
        CHECK(!resets && !m_final_reset_ready && !critical_depth);
        final_reset_process(); CHECK(!resets && blocked_timer_irqs == 1);
        persist_callback(NULL); backup_callback(NULL);
        CHECK(m_final_reset_ready && !critical_depth && blocked_timer_irqs == 2);
        final_reset_process(); CHECK(!resets && pending_queries == 1);
        pending_response = false; final_reset_process(); CHECK(resets == 1);
    } else if (!strcmp(name, "terminal_requests")) {
        nrf_dfu_request_t w = req(NRF_DFU_OP_OBJECT_WRITE), e = req(NRF_DFU_OP_OBJECT_EXECUTE);
        CHECK(nrf_dfu_req_handler_on_req(&w) == NRF_SUCCESS && queued == 1);
        busy_flash = true; on_data_obj_execute_request_sched(&e, 0); CHECK(queued == 2);
        busy_flash = false; final_execute(); CHECK(g_dfu_finalizing && !resets);
        while (queued) run_one(); CHECK(free_calls == 1 && !mutations && validate_calls == 1);
        CHECK(nrf_dfu_req_handler_on_req(&w) == NRF_SUCCESS); CHECK(free_calls == 2 && !queued);
        for (int code = NRF_DFU_OP_OBJECT_CREATE; code <= NRF_DFU_OP_ABORT; ++code) {
            nrf_dfu_request_t r = req(code); nrf_dfu_req_handler_req_process(&r);
        }
        CHECK(free_calls == 3 && responses == 1 && writes == 1 && !mutations && validate_calls == 1);
        unsigned before = user_events;
        dfu_observer(NRF_DFU_EVT_TRANSPORT_DEACTIVATED); dfu_observer(NRF_DFU_EVT_DFU_ABORTED);
        dfu_observer(NRF_DFU_EVT_OBJECT_RECEIVED); inactivity_timeout();
        CHECK(!reinit_calls && !backups && user_events == before && timer_calls == 1);
    } else if (!strcmp(name, "validation_failure")) {
        synchronous_write = synchronous_backup = true; validation_result = 8;
        final_execute(); CHECK(!s_dfu_settings.valid_bank && !g_dfu_final_success);
        CHECK(resets == 1 && backups == 1 && writes == 1 && timer_calls == 1 && !pending_queries);
        final_reset_process(); CHECK(resets == 1);
    } else if (!strcmp(name, "settings_immediate_error") || !strcmp(name, "settings_immediate_error_flash_busy")) {
        settings_error = 17;
        settings_error_leaves_flash_busy = !strcmp(name, "settings_immediate_error_flash_busy");
        final_execute();
        CHECK(errors == 1 && !backups && !resets && timer_calls == 1);
        CHECK(busy_flash == settings_error_leaves_flash_busy && writes == 1 && validate_calls == 1);
        final_reset_process(); CHECK(!resets);
        timer_callback(); CHECK(!resets && !delays && !flushes && !m_final_reset_ready);
        if (busy_flash) { final_reset_process(); CHECK(!resets && !delays && !flushes); }
        busy_flash = false; final_reset_process(); CHECK(resets == 1 && !backups);
        final_reset_process(); CHECK(resets == 1);
    } else if (!strcmp(name, "early_reset")) {
        synchronous_backup = true; bootloader_reset(true);
        CHECK(backups == 1 && resets == 1 && !timer_calls && !pending_queries);
        bootloader_reset(false); CHECK(resets == 2);
    } else if (!strcmp(name, "ordinary_events")) {
        dfu_observer(NRF_DFU_EVT_TRANSPORT_DEACTIVATED); CHECK(reinit_calls == 1);
        dfu_observer(NRF_DFU_EVT_OBJECT_RECEIVED); CHECK(timer_calls == 1);
        CHECK(timer_ticks == NRF_BOOTLOADER_MS_TO_TICKS(NRF_BL_DFU_INACTIVITY_TIMEOUT_MS));
        timer_callback(); CHECK(backups == 1 && !resets);
        backup_callback(NULL); CHECK(resets == 1);
    } else if (!strcmp(name, "partial_execute")) {
        s_dfu_settings.progress.firmware_image_offset = 64; s_dfu_settings.progress.data_object_size = 64;
        final_execute(); CHECK(!g_dfu_finalizing && !g_dfu_final_success && !validate_calls);
        CHECK(responses == 1 && writes == 1 && !backups && !resets);
    } else CHECK(!"unknown test case");
}
int main(int argc, char **argv) { CHECK(argc == 2); scenario(argv[1]); printf("PASS %s (mock BLE/flash/RTC; no hardware)\n", argv[1]); return 0; }
