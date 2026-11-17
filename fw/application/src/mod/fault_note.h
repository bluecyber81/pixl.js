#ifndef PIXL_FAULT_NOTE_H
#define PIXL_FAULT_NOTE_H

#include <stdint.h>

enum { FAULT_NOTE_NONE, FAULT_NOTE_SDK, FAULT_NOTE_HARD, FAULT_NOTE_EXIT };
typedef struct {
    uint32_t kind;
    uint32_t sdk_id;
    uint32_t pc;
} fault_note_t;

/* Once at main entry. A later read never clears the current boot's snapshot. */
void fault_note_on_boot(void);
const fault_note_t *fault_note_previous(void);

#endif
