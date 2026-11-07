#include "lcd_comm.h"
#include <string.h>
#include "nrf_delay.h"
#include "nrf_drv_spi.h"
#include "nrf_gpio.h"

#define DATAINTERFACE_WAIT_TICKS        	0x5000

/* One full display page, including the 132-column SH1106 variant. */
#define LCD_SPI_CHUNK_SIZE 132u
typedef struct {
    volatile bool   enable;
    volatile bool   xfer_done;
    bool            faulted;
    uint16_t        event_wait;
    nrf_drv_spi_t   instance;
    uint8_t         tx_buff[LCD_SPI_CHUNK_SIZE];
}   lcd_spi_t;

static lcd_spi_t m_lcd_spi;

static void tft_spi_event(nrf_drv_spi_evt_t const * p_event, void * p_context)
{
    m_lcd_spi.xfer_done = true;
}

static uint32_t lcd_spi_init(void)
{
    if (m_lcd_spi.enable)
        return NRF_ERROR_BUSY;

    uint32_t err_code = NRF_SUCCESS;
    nrf_drv_spi_config_t spi_1_cfg = {  .ss_pin       = NRF_DRV_SPI_PIN_NOT_USED,             		\
                                        .sck_pin      = LCD_SPI_SCL_PIN,            		\
                                        .miso_pin     = FLASH_SPI_MISO_PIN,          									\
                                        .mosi_pin     = LCD_SPI_MOSI_PIN,           		\
                                        .irq_priority = APP_IRQ_PRIORITY_LOW_MID,  			\
                                        .orc          = 0xFF,                           \
                                        .mode         = NRF_DRV_SPI_MODE_0,             \
                                        .frequency    = NRF_DRV_SPI_FREQ_8M,            \
                                        .bit_order    = NRF_DRV_SPI_BIT_ORDER_MSB_FIRST,\
                                     };
    
    memset(&m_lcd_spi, 0x00, sizeof(lcd_spi_t));
    
    nrf_drv_spi_t spi_instance = NRF_DRV_SPI_INSTANCE(0);
    m_lcd_spi.instance = spi_instance;
    err_code = nrf_drv_spi_init(&m_lcd_spi.instance, &spi_1_cfg, tft_spi_event, NULL);
    if (err_code != NRF_SUCCESS)
        return err_code;
    
    m_lcd_spi.enable = true;
    return err_code;
}

static void lcd_spi_uninit(void)
{
    if (m_lcd_spi.enable == false)
        return;
    nrf_drv_spi_uninit(&m_lcd_spi.instance);
    nrf_gpio_cfg_default(LCD_SPI_CS_PIN);
    nrf_gpio_cfg_default(LCD_SPI_SCL_PIN);
    //nrf_gpio_cfg_default(LCD_SPI_MISO_PIN);
    nrf_gpio_cfg_default(LCD_SPI_MOSI_PIN);
    nrf_gpio_cfg_default(LCD_BL_PIN);
    memset(&m_lcd_spi, 0x00, sizeof(lcd_spi_t));
}

static uint32_t lcd_spi_write(const uint8_t * data, const uint8_t len)
{
    if (!m_lcd_spi.enable || m_lcd_spi.faulted)
        return NRF_ERROR_INVALID_STATE;

    if (len == 0)
        return NRF_SUCCESS;

    uint32_t err_code;
		
    if (data != NULL)
        memcpy(m_lcd_spi.tx_buff, data, len);
    else
        memset(m_lcd_spi.tx_buff, 0xff, len);
    m_lcd_spi.xfer_done = false;
    m_lcd_spi.event_wait = DATAINTERFACE_WAIT_TICKS;
    err_code = nrf_drv_spi_transfer(&m_lcd_spi.instance, m_lcd_spi.tx_buff, len, NULL, 0);
    if (err_code == NRF_SUCCESS)
    {
        while (!m_lcd_spi.xfer_done && m_lcd_spi.event_wait)
            m_lcd_spi.event_wait--;

        if (!m_lcd_spi.xfer_done)
        {
            /* A software timeout does not stop EasyDMA. Stop the transfer
             * before the shared buffer can be reused, then stop drawing for
             * this DFU session. A display failure must not reset BLE DFU. */
            nrf_drv_spi_abort(&m_lcd_spi.instance);
            m_lcd_spi.faulted = true;
            return NRF_ERROR_TIMEOUT;
        }
    }
    else
    {
        if (err_code == NRF_ERROR_BUSY)
            nrf_drv_spi_abort(&m_lcd_spi.instance);
        m_lcd_spi.faulted = true;
    }
    return err_code;
}


void lcd_comm_init(void)
{
        if (lcd_spi_init() != NRF_SUCCESS)
            return;
        /* Preload inactive selects before making the pins outputs. This
         * avoids a low select pulse during GPIO direction changes. */
        nrf_gpio_pin_set(FALSH_SPI_CS_PIN);
        nrf_gpio_pin_set(LCD_SPI_CS_PIN);
        nrf_gpio_cfg_output(LCD_RST_PIN);
		nrf_gpio_cfg_output(LCD_DC_RS_PIN);
        nrf_gpio_cfg_output(LCD_BL_PIN);
        nrf_gpio_cfg_output(LED_1);

        nrf_gpio_cfg_output(FALSH_SPI_CS_PIN);
          nrf_gpio_cfg_output(LCD_SPI_CS_PIN);

		nrf_gpio_pin_set(LCD_RST_PIN);
		nrf_gpio_pin_clear(LCD_DC_RS_PIN);
        nrf_gpio_pin_clear(LCD_BL_PIN);
        nrf_gpio_pin_set(LED_1);
}

void lcd_comm_uninit(void)
{
		lcd_spi_uninit();
		nrf_gpio_cfg_default(LCD_RST_PIN);
		nrf_gpio_cfg_default(LCD_DC_RS_PIN);
        nrf_gpio_cfg_default(LCD_BL_PIN);
        nrf_gpio_cfg_default(LED_1);
}

void lcd_reset(void)
{
        if (!m_lcd_spi.enable || m_lcd_spi.faulted)
            return;
		nrf_delay_ms(50);
		LCD_RST_SET(ON);
		nrf_delay_ms(100);
		LCD_RST_SET(OFF);
		nrf_delay_ms(120);
		LCD_RST_SET(ON);
}

void lcd_write_command(uint8_t data)
{  
        if (!m_lcd_spi.enable || m_lcd_spi.faulted)
            return;
        nrf_gpio_pin_write(LCD_SPI_CS_PIN, 0);
		LCD_DC_RS_SET(LCD_RS);
		lcd_spi_write(&data, 1);
        nrf_gpio_pin_write(LCD_SPI_CS_PIN, 1);
}

void lcd_write_data(uint8_t *data, uint8_t len)
{
      if (!m_lcd_spi.enable || m_lcd_spi.faulted || len == 0)
          return;
      nrf_gpio_pin_write(LCD_SPI_CS_PIN, 0);
		LCD_DC_RS_SET(LCD_DC);
      /* A uint8_t length needs at most two chunks; hold CS across both. */
      if (len > LCD_SPI_CHUNK_SIZE) {
          if (lcd_spi_write(data, LCD_SPI_CHUNK_SIZE) == NRF_SUCCESS) {
              lcd_spi_write(data ? data + LCD_SPI_CHUNK_SIZE : NULL, len - LCD_SPI_CHUNK_SIZE);
          }
      } else {
          lcd_spi_write(data, len);
      }
        nrf_gpio_pin_write(LCD_SPI_CS_PIN, 1);
}



