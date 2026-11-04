/* Register-level host check, not a physical System OFF / wake test.
 * The GPIO HAL, GPIOTE uninit, BSP wake, and product shutdown chain are real
 * source extractions. Timers, GPIOTE bookkeeping and other devices are mocks.
 */
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#define __STATIC_INLINE static inline
#define NRFX_ASSERT(x) assert(x)
#define NRF_SUCCESS 0
#define NRF_ERROR_NOT_SUPPORTED 6
#define GPIO_COUNT 1
#define P0_PIN_NUM 32
typedef struct { uint32_t PIN_CNF[32]; } NRF_GPIO_Type;
static NRF_GPIO_Type gpio;
#define NRF_P0 (&gpio)
static bool nrf_gpio_pin_present_check(uint32_t pin) { return pin < 32; }
/* SDK_GPIO_CONSTANTS */
/* SDK_GPIO_ENUMS */
/* SDK_GPIO_FUNCTIONS */
/* ACTUAL_BOARD_INCLUDE */
typedef uint32_t nrfx_gpiote_pin_t;
static bool owned[32], configured[32];
static bool pin_in_use_by_gpiote(uint32_t pin) { return owned[pin]; }
static bool pin_in_use_by_port(uint32_t pin) { return owned[pin]; }
static bool pin_in_use_by_te(uint32_t pin) { (void)pin; return false; }
static bool pin_configured_check(uint32_t pin) { return configured[pin]; }
static void pin_configured_clear(uint32_t pin) { configured[pin] = false; }
static void pin_in_use_clear(uint32_t pin) { owned[pin] = false; }
static uint32_t channel_port_get(uint32_t pin) { return pin; }
static void channel_free(uint8_t channel) { (void)channel; }
static void nrf_gpiote_te_default(uint32_t channel) { (void)channel; assert(false); }
static void nrf_gpiote_event_disable(uint32_t channel) { (void)channel; assert(false); }
static void nrf_gpiote_int_disable(uint32_t mask) { (void)mask; assert(false); }
/* SDK_GPIOTE_FUNCTIONS */
#define nrf_drv_gpiote_in_uninit nrfx_gpiote_in_uninit
static uint32_t bsp_board_button_idx_to_pin(uint32_t index) {
    const uint32_t pins[] = BUTTONS_LIST;
    assert(index < BUTTONS_NUMBER);
    return pins[index];
}
/* SDK_BSP_FUNCTIONS */

typedef struct { bool running; } timer_node_t;
typedef timer_node_t *app_timer_id_t;
#define APP_TIMER_DEF(x) static timer_node_t x##_node; static const app_timer_id_t x = &x##_node
#define APP_TIMER_TICKS(x) (x)
#define APP_TIMER_MODE_SINGLE_SHOT 0
#define APP_TIMER_MODE_REPEATED 1
#define APP_BUTTON_PUSH 1
#define APP_BUTTON_RELEASE 0
#define NRF_LOG_WARNING(...) ((void)0)
#define NRF_LOG_DEBUG(...) ((void)0)
#define APP_ERROR_CHECK(x) assert((x) == NRF_SUCCESS)
typedef struct {
    uint8_t pin_no; bool active_state; nrf_gpio_pin_pull_t pull_cfg;
    void (*button_handler)(uint8_t, uint8_t);
} app_button_cfg_t;
static const app_button_cfg_t *sdk_buttons;
static uint8_t sdk_button_count;
static uint32_t app_button_init(const app_button_cfg_t *buttons, uint8_t count, uint32_t delay) {
    (void)delay; sdk_buttons = buttons; sdk_button_count = count;
    /* SDK app_button_init uses TOGGLE(false), skip_gpio_setup=false, and pull_cfg.
     * Simulate allocation; use the actual SDK GPIO configuration implementation. */
    for (uint8_t i = 0; i < count; i++) {
        uint32_t pin = buttons[i].pin_no;
        assert(!owned[pin]); owned[pin] = configured[pin] = true;
        nrf_gpio_cfg_input(pin, buttons[i].pull_cfg);
    }
    return NRF_SUCCESS;
}
static uint32_t app_button_enable(void) { return NRF_SUCCESS; }
static uint32_t app_button_disable(void) {
    for (uint8_t i = 0; i < sdk_button_count; i++) nrfx_gpiote_in_event_disable(sdk_buttons[i].pin_no);
    return NRF_SUCCESS;
}
static uint32_t app_timer_create(app_timer_id_t const *timer, int mode, void (*callback)(void *)) {
    (void)mode; (void)callback; (*timer)->running = false; return NRF_SUCCESS;
}
static uint32_t app_timer_start(app_timer_id_t timer, uint32_t ticks, void *context) {
    (void)ticks; (void)context; timer->running = true; return NRF_SUCCESS;
}
static uint32_t app_timer_stop(app_timer_id_t timer) { timer->running = false; return NRF_SUCCESS; }
static void nrf_pwr_mgmt_feed(void) {}
/* ACTUAL_BUTTON_INCLUDE */

typedef struct { bool initialized; uint32_t event_queue, u8g2; } mui_t;
static mui_t ui;
static unsigned release_count;
static void mui_event_queue_deinit(uint32_t *queue) { (void)queue; release_count++; }
static void mui_u8g2_deinit(uint32_t *display) { (void)display; release_count++; }
static void mui_mem_deinit(void) { release_count++; }
/* ACTUAL_INPUT_DEINIT */
/* ACTUAL_MUI_DEINIT */
typedef int ret_code_t;
typedef int nrf_pwr_mgmt_evt_t;
#define NRF_PWR_MGMT_EVT_PREPARE_WAKEUP 1
/* ACTUAL_SLEEP_ID */
typedef struct { uint8_t bytes[4]; } ntag_t;
typedef struct { ntag_t ntag; } cache_data_t;
static cache_data_t cache;
static ntag_t tag;
/* This fixture checks the established normal shutdown GPIO path. Recovery
 * cache/NFC behavior is covered by the separate recovery integration tests. */
static const ntag_t default_ntag215 = {{0}};
static bool vfs_packed_recovery_required(void) { return false; }
static int save_result;
static void nrf_pwr_mgmt_cancel_shutdown(void) {}
static bool ntag_emu_prepare_change(void) {return true;}
static void ble_remote_shutdown(void) {}
static void ble_disable(void) {}
static void ble_process_pending(void) {}
static void *mini_app_launcher(void) { return NULL; }
enum { MINI_APP_EXIT_SLEEP };
static bool mini_app_launcher_prepare_exit(void *app,int reason) {(void)app;(void)reason;return ntag_emu_prepare_change();}
static void mini_app_launcher_cancel_exit(void *app) {(void)app;}
static bool mini_app_launcher_sleep(void *app) { (void)app; return true; }
static cache_data_t *cache_get_data(void) { return &cache; }
static ntag_t *ntag_emu_get_current_tag(void) { return &tag; }
static void cache_save(void) {}
static int32_t settings_save(void) { return save_result; }
static mui_t *mui(void) { return &ui; }
static void hal_spi_flash_sleep(void) {}
static int bsp_nfc_sleep_mode_prepare(void) { return NRF_SUCCESS; }
static void bsp_board_leds_off(void) {}
/* ACTUAL_SHUTDOWN */

static int check_wake_fields(unsigned cycle) {
    uint32_t pin = bsp_board_button_idx_to_pin(BTN_ID_SLEEP), cfg = gpio.PIN_CNF[pin];
    uint32_t input = (cfg & GPIO_PIN_CNF_INPUT_Msk) >> GPIO_PIN_CNF_INPUT_Pos;
    uint32_t pull = (cfg & GPIO_PIN_CNF_PULL_Msk) >> GPIO_PIN_CNF_PULL_Pos;
    uint32_t sense = (cfg & GPIO_PIN_CNF_SENSE_Msk) >> GPIO_PIN_CNF_SENSE_Pos;
    uint32_t dir = (cfg & GPIO_PIN_CNF_DIR_Msk) >> GPIO_PIN_CNF_DIR_Pos;
    if (pin != 6 || input != GPIO_PIN_CNF_INPUT_Connect ||
        pull != GPIO_PIN_CNF_PULL_Pullup || sense != GPIO_PIN_CNF_SENSE_Low ||
        dir != GPIO_PIN_CNF_DIR_Input) {
        fprintf(stderr, "FAIL wake GPIO cycle=%u P0.%02u PIN_CNF=0x%08x INPUT=%u PULL=%u SENSE=%u DIR=%u; expected INPUT=0 PULL=3 SENSE=3 DIR=0\n",
                cycle, pin, cfg, input, pull, sense, dir);
        return 1;
    }
    printf("PASS cycle=%u P0.%02u PIN_CNF=0x%08x INPUT=CONNECT PULL=UP SENSE=LOW\n", cycle, pin, cfg);
    return 0;
}
int main(void) {
    const int results[] = {0, -91, 8};
    const uint32_t other_config = 0x00000101;
    for (unsigned cycle = 0; cycle < 12; cycle++) {
        ui.initialized = true; release_count = 0;
        gpio.PIN_CNF[30] = other_config; owned[30] = configured[30] = true;
        bsp_btn_init(NULL);
        for (uint32_t index = 0; index < BUTTONS_NUMBER; index++) {
            m_bsp_btns[index].long_timer->running = true;
            m_bsp_btns[index].repeat_timer->running = true;
        }
        /* An unrelated shutdown event must leave active inputs and ownership alone. */
        uint32_t before[32]; memcpy(before, gpio.PIN_CNF, sizeof before);
        assert(shutdown_handler(0)); assert(memcmp(before, gpio.PIN_CNF, sizeof before) == 0);
        assert(ui.initialized && release_count == 0 && owned[6]);
        save_result = results[cycle % 3];
        assert(shutdown_handler(NRF_PWR_MGMT_EVT_PREPARE_WAKEUP));
        assert(!ui.initialized && release_count == 3 && !m_enabled && !m_inputs_initialized);
        for (uint32_t index = 0; index < BUTTONS_NUMBER; index++) {
            uint32_t pin = bsp_board_button_idx_to_pin(index);
            assert(!owned[pin] && !configured[pin]);
            assert(!m_bsp_btns[index].long_timer->running && !m_bsp_btns[index].repeat_timer->running);
            if (index != BTN_ID_SLEEP) assert(gpio.PIN_CNF[pin] == (GPIO_PIN_CNF_INPUT_Disconnect << GPIO_PIN_CNF_INPUT_Pos));
        }
        assert(owned[30] && configured[30] && gpio.PIN_CNF[30] == other_config);
        if (check_wake_fields(cycle)) return 1;
    }
    puts("PASS actual shutdown/UI/input/BSP teardown chain, SDK GPIO/GPIOTE/wake semantics, 12 cycles, three save outcomes, other pins preserved; hardware wake NOT tested");
    return 0;
}
