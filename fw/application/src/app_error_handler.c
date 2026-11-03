#include "app_error.h"
#include "app_util_platform.h"
#include "cache.h"

/* Error recovery must not depend on a usable UI, logger, heap or fault frame.
 * The retained cache may describe the operation that failed: invalidate it
 * with one RAM store, without CRC work or modifying the persistent files. */
static void fault_stop(void) {
    __disable_irq();
    cache_invalidate();
    __DSB();
#ifdef DEBUG
    /* Do not call app_error_save_and_stop: it dereferences the fault's info
     * pointer for SDK errors. Raw registers remain available to a debugger. */
    NRF_BREAKPOINT_COND;
    while (1) {
    }
#else
    NVIC_SystemReset();
#endif
}

void app_error_fault_handler(uint32_t id, uint32_t pc, uint32_t info) {
    (void)id;
    (void)pc;
    (void)info;
    fault_stop();
}

void HardFault_Handler(void) {
    /* No guessed MSP offset: the exception may use PSP or an extended frame. */
    fault_stop();
}

void _exit(int status) {
    (void)status;
    fault_stop();
}
