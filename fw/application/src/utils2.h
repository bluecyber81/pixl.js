/*
 * utils.h
 *
 *  Created on: 2021年10月10日
 *      Author: solos
 */

#ifndef UTILS2_H_
#define UTILS2_H_

#include "sdk_errors.h"
#include <stdint.h>
#include <stdbool.h>

ret_code_t utils_rand_bytes(uint8_t rand[], uint8_t bytes);
void int32_to_bytes_le(uint32_t val, uint8_t *data);
void utils_get_device_id(uint8_t *p_device_id);
/* A successful prepare reserves the current app until reset or cancellation. */
bool system_prepare_reset(void);
bool system_reset_prepared(void);
void system_cancel_reset(void);
bool enter_dfu(void);
bool system_reboot(void);
void go_sleep();

#endif /* UTILS_H_ */
