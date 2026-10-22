#ifndef DF_CORE_H
#define DF_CORE_H

#include "df_defines.h"
#include <stddef.h>

void df_core_init();
void df_core_send_frame(df_frame_t *out);
size_t df_core_max_payload(void);

#endif
