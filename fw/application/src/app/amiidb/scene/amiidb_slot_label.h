#ifndef AMIIDB_SLOT_LABEL_H
#define AMIIDB_SLOT_LABEL_H

#include <stddef.h>
#include <string.h>

/* Keep the scrolling row and the two-line confirmation valid UTF-8, even
 * if the length limit falls inside a German or other multi-byte character. */
static inline void amiidb_slot_caption(char *dest, size_t capacity, const char *name) {
    size_t length = strlen(name);
    if (length < capacity) {
        memcpy(dest, name, length + 1);
        return;
    }
    size_t keep = capacity - 4; /* all callers reserve at least four bytes */
    while (keep && ((unsigned char)name[keep] & 0xc0u) == 0x80u) keep--;
    memcpy(dest, name, keep);
    memcpy(dest + keep, "...", 4);
}

#endif
