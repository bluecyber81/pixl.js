#pragma once
#include <stdint.h>
#include <stdbool.h>
#include <assert.h>
#define APP_TIMER_IDLE_VAL UINT64_MAX
typedef struct { void *next; } nrf_sortlist_item_t;
typedef void (*app_timer_timeout_handler_t)(void *);
typedef struct { nrf_sortlist_item_t list_item; uint64_t end_val; uint32_t repeat_period;
                 app_timer_timeout_handler_t handler; void *p_context; } app_timer_t;
typedef app_timer_t *app_timer_id_t;
typedef int ret_code_t;
typedef int app_timer_mode_t;
#define APP_TIMER_DEF(id) static app_timer_t id##_data = {.end_val = APP_TIMER_IDLE_VAL}; static const app_timer_id_t id = &id##_data
#define APP_TIMER_MODE_REPEATED 1
#define APP_TIMER_TICKS(x) (x)
#define APP_TIMER_IS_IDLE(t) ((t)->end_val == APP_TIMER_IDLE_VAL)
#define NRF_SUCCESS 0
#define NRF_ERROR_INVALID_PARAM 1
#define NRF_ERROR_NO_MEM 2
#define APP_TIMER_WITH_PROFILER 0
#define APP_TIMER_CONFIG_USE_SCHEDULER 0
#define ASSERT(x) assert(x)
#define CRITICAL_REGION_ENTER() do {} while (0)
#define CRITICAL_REGION_EXIT() do {} while (0)
#define NRF_LOG_DEBUG(...) /* SDK use omits a semicolon */
#define NRF_LOG_INFO(...) ((void)0)
#define NRF_LOG_WARNING(...) ((void)0)
#define NRF_LOG_INST_DEBUG(...) ((void)0)
#define UNUSED_RETURN_VALUE(x) ((void)(x))
static ret_code_t app_timer_create(app_timer_id_t const *, app_timer_mode_t, app_timer_timeout_handler_t);
static ret_code_t app_timer_start(app_timer_t *, uint32_t, void *);
static ret_code_t app_timer_stop(app_timer_t *);
