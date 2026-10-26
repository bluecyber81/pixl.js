#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#define HAL_NFC_ENGINEERING_BC_FTPAN_WORKAROUND 1
#define USE_TIMER_WORKAROUND 1
#define NRF_LOG_INFO(...) ((void)0)
#define NRFX_LOG_INFO(...) ((void)0)
#define NRF_SUCCESS 0
#define NRF_ERROR_INVALID_STATE 8
#define NRFX_DRV_STATE_UNINITIALIZED 0
#define NFCT_CONFIG_IRQ_PRIORITY 6
#define NFCT_IRQn 0
#define NRF_NFCT_TASK_DISABLE 4
#define NRF_NFCT_DISABLE_ALL_INT UINT32_MAX
#define NRF_NFCT_ERRORSTATUS_ALL UINT32_MAX
#define NFCT_INTENSET_FIELDDETECTED_Enabled 1
#define NFCT_INTENSET_FIELDDETECTED_Pos 0
#define NFCT_INTENSET_ERROR_Enabled 1
#define NFCT_INTENSET_ERROR_Pos 1
#define NFCT_INTENSET_SELECTED_Enabled 1
#define NFCT_INTENSET_SELECTED_Pos 2
#define NFCT_FRAMEDELAYMODE_FRAMEDELAYMODE_WindowGrid 3
#define NFCT_FRAMEDELAYMODE_FRAMEDELAYMODE_Pos 0
#define NFCT_FRAMEDELAYMODE_FRAMEDELAYMODE_Msk 3
typedef uint32_t ret_code_t;
static struct {
    uint32_t FRAMEDELAYMAX, FRAMEDELAYMODE, INTENSET, INTENCLR;
    uint32_t TASKS_DISABLE, TASKS_SENSE, ERRORSTATUS;
} nfct;
#define NRF_NFCT (&nfct)
static struct { unsigned state; } m_nfct_cb;
static struct { unsigned timer; } m_timer_workaround;
static unsigned nrfx_timer_stops, identity_setups, timer_setups;
static bool m_nrfx_irq_enabled, m_custom_enabled, irq_enabled, irq_pending;
static void nrf_nfct_int_disable(uint32_t mask) { nfct.INTENCLR = mask; }
static void nrf_nfct_task_trigger(unsigned task) {
    assert(task == NRF_NFCT_TASK_DISABLE);
    /* DISABLE changes the peripheral state, not the configuration registers. */
    nfct.TASKS_DISABLE = 1;
}
static void NVIC_EnableIRQ(unsigned irq) { assert(irq == 0); irq_enabled = true; }
static void NVIC_DisableIRQ(unsigned irq) { assert(irq == 0); irq_enabled = false; }
static void NVIC_ClearPendingIRQ(unsigned irq) { assert(irq == 0); irq_pending = false; }
static void NVIC_SetPriority(unsigned irq, unsigned priority) { assert(irq == 0 && priority == 6); }
#define NRFX_IRQ_DISABLE(irq) NVIC_DisableIRQ(irq)
#define NRFX_IRQ_PENDING_CLEAR(irq) NVIC_ClearPendingIRQ(irq)
static void nrfx_timer_uninit(unsigned *timer) { assert(timer == &m_timer_workaround.timer); ++nrfx_timer_stops; }
static void hal_nfc_nfcid1_registers_setup(void) { ++identity_setups; }
static void hal_nfc_events_clear(void) {}
static void field_timer_with_callback_config(void) { ++timer_setups; }

/* ACTUAL_SOURCE */

int main(void) {
    /* Real nrfx cleanup must leave the inherited transmitter value intact,
     * otherwise this fixture would conceal the ownership-transition defect. */
    nfct.FRAMEDELAYMAX = INHERITED_DELAY;
    nfct.FRAMEDELAYMODE = 0;
    m_nfct_cb.state = 1;
    irq_enabled = irq_pending = true;
    nrfx_nfct_uninit();
    assert(nfct.FRAMEDELAYMAX == 65535 && nfct.TASKS_DISABLE == 1);
    assert(!irq_enabled && !irq_pending && nrfx_timer_stops == 1 && m_nfct_cb.state == 0);
    m_nrfx_irq_enabled = false;
    assert(hal_nfc_start() == NRF_SUCCESS);
    if (nfct.FRAMEDELAYMAX != 0x1000) {
        fprintf(stderr, "FAIL inherited FRAMEDELAYMAX=%lu reaches custom sensing (expected 4096)\n",
                (unsigned long)nfct.FRAMEDELAYMAX);
        return 1;
    }
    assert(nfct.FRAMEDELAYMODE == 3 && nfct.TASKS_SENSE == 1);
    assert(m_custom_enabled && irq_enabled && identity_setups == 1 && timer_setups == 1);
    puts("PASS actual nrfx cleanup retains65535; actual custom start restores4096");

    /* Reject starts while nrfx owns NFCT without touching its active timing. */
    m_nrfx_irq_enabled = true;
    nfct.FRAMEDELAYMAX = 65535;
    assert(hal_nfc_start() == NRF_ERROR_INVALID_STATE);
    assert(nfct.FRAMEDELAYMAX == 65535 && identity_setups == 1);
    puts("PASS rejected cross-owner start preserves active Chameleon timing");

    /* The existing field-loss re-setup shares the safe initialization path. */
    m_nrfx_irq_enabled = false;
    hal_nfc_re_setup();
    assert(nfct.FRAMEDELAYMAX == 0x1000 && identity_setups == 2);
    hal_nfc_common_hw_setup();
    assert(nfct.FRAMEDELAYMAX == 0x1000 && identity_setups == 3);
    puts("PASS re-setup and repeated setup restore/default timing idempotently");
    return 0;
}
