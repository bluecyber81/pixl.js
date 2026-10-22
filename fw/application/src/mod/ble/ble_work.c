#include "ble_work.h"
#include "app_util_platform.h"
#include <string.h>

typedef struct {
    uint16_t length;
    bool tx_ready;
    uint8_t data[BLE_WORK_DATA_SIZE];
} ble_work_item_t;

static ble_work_item_t queue[BLE_WORK_CAPACITY];
static uint8_t head, count;
static bool accepting, cleanup_pending, dispatching;
static uint32_t generation, dispatch_generation;
static ble_work_rx_t rx_handler;
static ble_work_notify_t tx_handler;

/* Called with the application IRQ critical region held. Invalidate old work,
 * but defer file-close/flush until the current foreground operation returns. */
static void invalidate(void) {
    head = count = 0;
    generation++;
    cleanup_pending = true;
}

void ble_work_set_handlers(ble_work_rx_t rx, ble_work_notify_t tx) {
    CRITICAL_REGION_ENTER();
    invalidate();
    rx_handler = rx;
    tx_handler = tx;
    CRITICAL_REGION_EXIT();
}

void ble_work_connected(void) {
    CRITICAL_REGION_ENTER();
    invalidate();
    accepting = true;
    CRITICAL_REGION_EXIT();
}

void ble_work_disconnected(void) {
    CRITICAL_REGION_ENTER();
    invalidate();
    accepting = false;
    CRITICAL_REGION_EXIT();
}

static bool enqueue(const uint8_t *data, size_t length, bool tx_ready) {
    bool ok = true;
    CRITICAL_REGION_ENTER();
    if (!accepting || (tx_ready ? tx_handler == NULL : rx_handler == NULL)) {
        /* No consumer: ignore events during app transitions. */
    } else if ((!tx_ready && (data == NULL || length > BLE_WORK_DATA_SIZE)) ||
               count == BLE_WORK_CAPACITY) {
        /* Never silently lose a request or allocate in an IRQ. The caller
         * disconnects; main closes the old stream before another session. */
        invalidate();
        accepting = false;
        ok = false;
    } else {
        ble_work_item_t *item = &queue[(head + count) % BLE_WORK_CAPACITY];
        item->tx_ready = tx_ready;
        item->length = length;
        if (length) {
            memcpy(item->data, data, length);
        }
        count++;
    }
    CRITICAL_REGION_EXIT();
    return ok;
}

bool ble_work_receive(const uint8_t *data, size_t length) { return enqueue(data, length, false); }
bool ble_work_tx_ready(void) { return enqueue(NULL, 0, true); }

bool ble_work_can_send(void) {
    bool result;
    CRITICAL_REGION_ENTER();
    result = accepting && (!dispatching || dispatch_generation == generation);
    CRITICAL_REGION_EXIT();
    return result;
}

void ble_work_process(ble_work_notify_t cleanup) {
    /* Bounded work per main iteration keeps UI/power handling responsive.
     * The local copy survives IRQ queue resets while a handler uses it. */
    for (unsigned budget = 0; budget < BLE_WORK_CAPACITY + 1; budget++) {
        ble_work_item_t item;
        ble_work_rx_t rx = NULL;
        ble_work_notify_t tx = NULL;
        bool do_cleanup = false, have_item = false;
        CRITICAL_REGION_ENTER();
        if (dispatching) {
            /* Reject accidental foreground recursion as well. */
        } else if (cleanup_pending) {
            cleanup_pending = false;
            do_cleanup = true;
            dispatching = true;
            dispatch_generation = generation;
        } else if (count) {
            item = queue[head];
            head = (head + 1) % BLE_WORK_CAPACITY;
            count--;
            rx = rx_handler;
            tx = tx_handler;
            dispatch_generation = generation;
            dispatching = true;
            have_item = true;
        }
        CRITICAL_REGION_EXIT();
        if (!do_cleanup && !have_item) {
            return;
        }
        if (do_cleanup) {
            if (cleanup) cleanup();
        } else if (item.tx_ready) {
            if (tx) tx();
        } else if (rx) {
            rx(item.data, item.length);
        }
        CRITICAL_REGION_ENTER();
        dispatching = false;
        CRITICAL_REGION_EXIT();
    }
}
