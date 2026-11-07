#ifndef UI_HOST_SDK_H
#define UI_HOST_SDK_H
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
#define NRF_SUCCESS 0u
#define NRF_ERROR_BUSY 17u
#define NRF_ERROR_INVALID_STATE 8u
#define NRF_ERROR_TIMEOUT 13u
#define NRF_ERROR_NO_MEM 4u
#define APP_IRQ_PRIORITY_LOW_MID 6u
#define NRF_DRV_SPI_PIN_NOT_USED 0xffu
#define NRF_DRV_SPI_MODE_0 0u
#define NRF_DRV_SPI_FREQ_8M 8000000u
#define NRF_DRV_SPI_BIT_ORDER_MSB_FIRST 0u
#define NRF_GPIO_PIN_PULLUP 3u
#define NRF_LOG_BACKEND_RTT 0
#define NRF_MODULE_ENABLED(x) (x)
#define NRF_BL_DFU_ENTER_METHOD_BUTTON_PIN 7u
#define MBR_SIZE 0x1000u
#define BOOTLOADER_START_ADDR 0x77000u
#define BOOTLOADER_SIZE 0x7000u
#define NRF_LOG_INIT(...) 0u
#define NRF_LOG_FINAL_FLUSH() ((void)0)
#define NRF_LOG_FLUSH() ((void)0)
#define NRF_LOG_DEFAULT_BACKENDS_INIT() ((void)0)
void host_log(const char *format, ...);
#define NRF_LOG_INFO(...) host_log(__VA_ARGS__)
#define NRF_LOG_ERROR(...) host_log(__VA_ARGS__)
#define NRF_BREAKPOINT_COND ((void)0)
#define APP_ERROR_CHECK(value) ((void)(value))
#define APP_ERROR_CHECK_BOOL(value) do { if (!(value)) __builtin_trap(); } while (0)
/* Values exactly match the SDK nrf_dfu_types.h event enumeration. */
typedef enum {
    NRF_DFU_EVT_DFU_INITIALIZED, NRF_DFU_EVT_TRANSPORT_ACTIVATED,
    NRF_DFU_EVT_TRANSPORT_DEACTIVATED, NRF_DFU_EVT_DFU_STARTED,
    NRF_DFU_EVT_OBJECT_RECEIVED, NRF_DFU_EVT_DFU_FAILED,
    NRF_DFU_EVT_DFU_COMPLETED, NRF_DFU_EVT_DFU_ABORTED
} nrf_dfu_evt_type_t;
typedef void (*nrf_dfu_observer_t)(nrf_dfu_evt_type_t);
typedef struct { unsigned instance; } nrf_drv_spi_t;
typedef struct { unsigned type; } nrf_drv_spi_evt_t;
typedef struct {
    unsigned ss_pin, sck_pin, miso_pin, mosi_pin, irq_priority, orc,
        mode, frequency, bit_order;
} nrf_drv_spi_config_t;
#define NRF_DRV_SPI_INSTANCE(value) ((nrf_drv_spi_t){value})
typedef void (*host_spi_handler_t)(nrf_drv_spi_evt_t const *, void *);
uint32_t nrf_drv_spi_init(nrf_drv_spi_t const *, nrf_drv_spi_config_t const *, host_spi_handler_t, void *);
void nrf_drv_spi_uninit(nrf_drv_spi_t const *);
uint32_t nrf_drv_spi_transfer(nrf_drv_spi_t const *, const uint8_t *, uint8_t, uint8_t *, uint8_t);
void nrf_drv_spi_abort(nrf_drv_spi_t const *);
void nrf_gpio_cfg_default(unsigned);
void nrf_gpio_cfg_output(unsigned);
void nrf_gpio_cfg_input(unsigned, unsigned);
void nrf_gpio_pin_write(unsigned, unsigned);
void nrf_gpio_pin_set(unsigned);
void nrf_gpio_pin_clear(unsigned);
unsigned nrf_gpio_pin_read(unsigned);
void nrf_delay_ms(uint32_t);
void NVIC_SystemReset(void);
uint32_t app_sched_event_put(void *, uint16_t, void (*)(void *, uint16_t));
void nrf_bootloader_mbr_addrs_populate(void);
uint32_t nrf_bootloader_flash_protect(uint32_t, uint32_t);
uint32_t nrf_bootloader_init(nrf_dfu_observer_t);
uint32_t nrf_bootloader_dfu_timer_counter_get(void);
#endif
