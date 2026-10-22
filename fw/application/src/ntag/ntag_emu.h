/*
 * ntag_emu.h
 *
 *  Created on: 2021年9月1日
 *      Author: solos
 */

#ifndef NTAG_EMU_H_
#define NTAG_EMU_H_

#include "ntag_def.h"
#include "nrfx.h"

typedef enum {
    NTAG_EVENT_TYPE_WRITTEN,
    NTAG_EVENT_TYPE_READ
} ntag_event_type_t;

typedef void (*ntag_update_cb_t)(ntag_event_type_t type, void* context, ntag_t* ntag);
ret_code_t ntag_emu_init(const ntag_t* tag);
void ntag_emu_uninit(void);
/* Main context only. Complete old writes before changing an app's tag buffer or
 * persistence target. Reception stays paused until set_tag/set_update_cb. */
void ntag_emu_prepare_change(void);
void ntag_emu_process_pending(void);
/* IRQ-safe timer handoff. The action is cancelled on tag/owner change. */
uint32_t ntag_emu_get_generation(void);
void ntag_emu_request_action(void (*action)(void *), void *context, uint32_t generation);
void ntag_emu_set_tag(const ntag_t* tag);
void ntag_emu_set_uuid_only(const ntag_t* ntag);
void ntag_emu_set_update_cb(ntag_update_cb_t cb, void* context);
ntag_t* ntag_emu_get_current_tag();




#endif /* NTAG_EMU_H_ */
