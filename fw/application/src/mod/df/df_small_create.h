/* SPDX-License-Identifier: GPL-2.0-only */
#ifndef DF_SMALL_CREATE_H
#define DF_SMALL_CREATE_H
#include "df_defines.h"
#include <stdbool.h>
void df_small_create_capability(df_event_t *evt);
/* Zero when recovery, import, another handle or an unavailable drive prevents
 * a revision-bound operation. Does not inspect the caller's response buffer. */
uint64_t df_small_available_revision(void);
void df_small_create_request(df_event_t *evt);
bool df_small_create_pending(void);
void df_small_create_cancel(void);
#endif
