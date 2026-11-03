#include "hal_spi_bus.h"

#include "app_error.h"
#include "app_timer.h"
#include "app_util_platform.h"
#include "boards.h"
#include <stdio.h>

#include <nrfx_spim.h>

#include "nrf_delay.h"

#include "nrf_gpio.h"
#include "nrf_log.h"

#define SPI_INSTANCE 0
#define SPI_XFER_TIMEOUT_MS 100
#define SPI_EVENT_POLL_LIMIT 1000000u

static const nrfx_spim_t m_spi = NRFX_SPIM_INSTANCE(SPI_INSTANCE);
static spi_device_t *m_active_device;
static bool m_bus_faulted;

/* A non-NULL handler selects the SDK's nonblocking path. Every transfer uses
 * NO_XFER_EVT_HANDLER, which disables END IRQs and leaves the SDK busy flag
 * clear. Completion is polled while our whole-transaction IRQ guard is held. */
static void spi_event_handler(nrfx_spim_evt_t const *event, void *context) {
    (void)event;
    (void)context;
}

static bool spi_wait_event(nrf_spim_event_t event) {
    uint32_t started = app_timer_cnt_get();
    for (uint32_t polls = 0; polls < SPI_EVENT_POLL_LIMIT; ++polls) {
        if (nrf_spim_event_check(m_spi.p_reg, event)) {
            return true;
        }
        if (app_timer_cnt_diff_compute(app_timer_cnt_get(), started) >= APP_TIMER_TICKS(SPI_XFER_TIMEOUT_MS)) {
            break;
        }
    }
    return nrf_spim_event_check(m_spi.p_reg, event);
}

static ret_code_t spi_wait_complete(void) {
    if (spi_wait_event(NRF_SPIM_EVENT_END)) {
        return NRF_SUCCESS;
    }

    /* SDK abort/uninit may wait forever. STOPPED confirms DMA has stopped;
     * do not return stack-backed DMA buffers to callers before confirmation. */
    nrf_spim_task_trigger(m_spi.p_reg, NRF_SPIM_TASK_STOP);
    if (spi_wait_event(NRF_SPIM_EVENT_STOPPED)) {
        return NRF_ERROR_TIMEOUT;
    }

    m_bus_faulted = true;
    if (nrf_spim_event_check(m_spi.p_reg, NRF_SPIM_EVENT_END)) {
        /* END alone proves both DMA buffers are free, but STOP was not
         * acknowledged. Reject further transfers until a device restart. */
        return NRF_ERROR_INTERNAL;
    }

    /* Neither END nor STOPPED arrived: DMA ownership is unknown. Disabling
     * ENABLE alone is not a documented substitute for STOPPED on nRF52832.
     * Keep the IRQ guard, deselect the slave and use the existing fatal reset
     * path. Never return and let DMA overwrite a caller's reused stack. */
    if (m_active_device) {
        nrf_gpio_pin_set(m_active_device->cs_pin);
    }
    APP_ERROR_HANDLER(NRF_ERROR_INTERNAL);
    NVIC_SystemReset(); /* Also non-returning if an error handler returns. */
}

void hal_spi_bus_init() {
    ret_code_t err_code;

    nrfx_spim_config_t spi_oled_config = NRFX_SPIM_DEFAULT_CONFIG;

    spi_oled_config.sck_pin = NRFX_SPIM_SCK_PIN;
    spi_oled_config.mosi_pin = NRFX_SPIM_MOSI_PIN;
    spi_oled_config.miso_pin = NRFX_SPIM_MISO_PIN;
    spi_oled_config.frequency = NRF_SPIM_FREQ_8M; // The SSD1326 can go up to 10 MHz clock
    spi_oled_config.mode = NRF_SPIM_MODE_0;
    spi_oled_config.ss_active_high = false;

    err_code = nrfx_spim_init(&m_spi, &spi_oled_config, spi_event_handler, NULL);
    APP_ERROR_CHECK(err_code);
}

void hal_spi_bus_attach(spi_device_t *p_dev) {
    nrf_gpio_cfg_output(p_dev->cs_pin);
    nrf_gpio_pin_set(p_dev->cs_pin);
}

/* Protect the whole CS transaction, including command/data and 128-byte
 * chunks. SOFTDEVICE_PRESENT makes this mask application IRQs only: radio
 * interrupts remain enabled. NO_XFER_EVT_HANDLER does not set the busy flag.
 * Callers must pair acquire/release for the same device without nesting SPI
 * devices. Flash busy polling is deliberately outside these transactions. */
void hal_spi_bus_aquire(spi_device_t *p_dev) {
    app_util_critical_region_enter(&p_dev->critical_region_nested);
    m_active_device = p_dev;
    nrf_gpio_pin_clear(p_dev->cs_pin);
}

void hal_spi_bus_release(spi_device_t *p_dev) {
    /* Copy before restoring IRQs: a pending handler may reuse this device. */
    uint8_t nested = p_dev->critical_region_nested;
    nrf_gpio_pin_set(p_dev->cs_pin);
    m_active_device = NULL;
    app_util_critical_region_exit(nested);
}

uint32_t hal_spi_bus_xfer(spi_transaction_t *p_trans) {
    if (m_bus_faulted) {
        return NRF_ERROR_INTERNAL;
    }
    uint32_t err_code = NRF_SUCCESS;
    nrfx_spim_xfer_desc_t spim_xfer_desc;

    uint32_t max_xfer_bytes = p_trans->tx_length > p_trans->rx_length ? p_trans->tx_length : p_trans->rx_length;
    for (uint32_t i = 0; i < max_xfer_bytes; i += 128) {

        if (i < p_trans->tx_length) {
            spim_xfer_desc.p_tx_buffer = (const uint8_t *)p_trans->p_tx_buffer + i;
            spim_xfer_desc.tx_length = p_trans->tx_length - i < 128 ? p_trans->tx_length - i : 128;
        } else {
            spim_xfer_desc.p_tx_buffer = NULL;
            spim_xfer_desc.tx_length = 0;
        }
        if (i < p_trans->rx_length) {
            spim_xfer_desc.p_rx_buffer = (uint8_t *)p_trans->p_rx_buffer + i;
            spim_xfer_desc.rx_length = p_trans->rx_length - i < 128 ? p_trans->rx_length - i : 128;
        } else {
            spim_xfer_desc.p_rx_buffer = NULL;
            spim_xfer_desc.rx_length = 0;
        }

        nrf_spim_event_clear(m_spi.p_reg, NRF_SPIM_EVENT_STOPPED);
        err_code = nrfx_spim_xfer(&m_spi, &spim_xfer_desc, NRFX_SPIM_FLAG_NO_XFER_EVT_HANDLER);
        if (err_code != NRF_SUCCESS) {
            return err_code;
        }
        err_code = spi_wait_complete();
        if (err_code != NRF_SUCCESS) {
            return err_code;
        }
        if (m_spi.p_reg->TXD.AMOUNT != spim_xfer_desc.tx_length ||
            m_spi.p_reg->RXD.AMOUNT != spim_xfer_desc.rx_length) {
            return NRF_ERROR_DATA_SIZE;
        }
    }

    return err_code;
}
