#ifndef MUI_ALLOC_H
#define MUI_ALLOC_H

#include "mlib_common.h"

/* Mlib's ordinary growth functions abort on allocation failure. These bounded
 * UI helpers retain the old value on failure, without changing that global
 * contract. The pinned Mlib string/array layouts are trivially movable. */
static inline bool mui_string_try_set_str(m_string_ptr value, const char *text) {
    if (!text) return false;
    size_t length = strlen(text);
    if (length < string_capacity(value)) {
        /* The existing capacity suffices: this cannot allocate. */
        memmove(m_str1ng_get_cstr(value), text, length + 1);
        m_str1ng_set_size(value, length);
        return true;
    }
    if (length == SIZE_MAX) return false;
    char *copy = mui_mem_malloc(length + 1);
    if (!copy) return false;
    memcpy(copy, text, length + 1);
    string_clear(value);
    value->ptr = copy;
    value->u.heap.size = length;
    value->u.heap.alloc = length + 1;
    return true;
}

static inline void *mui_array_try_grow(void *data, size_t *capacity,
                                     size_t needed, size_t item_size) {
    if (needed <= *capacity) return data;
    if (!item_size || needed > SIZE_MAX / item_size) return NULL;
    size_t base = *capacity < 8 ? 8 : *capacity;
    size_t next = base <= SIZE_MAX / 2 ? base * 2 : needed;
    if (next < needed || next > SIZE_MAX / item_size) next = needed;
    void *grown = mui_mem_realloc(data, next * item_size);
    if (!grown) return NULL;
    *capacity = next;
    return grown;
}

static inline bool mui_string_array_try_push_str(string_array_t array, const char *text) {
    string_t copy;
    string_init(copy);
    if (!mui_string_try_set_str(copy, text)) return false;
    if (array->size == SIZE_MAX) {
        string_clear(copy);
        return false;
    }
    string_t *grown = mui_array_try_grow(array->ptr, &array->alloc,
                                       array->size + 1, sizeof(*array->ptr));
    if (!grown) {
        string_clear(copy);
        return false;
    }
    array->ptr = grown;
    memcpy(&array->ptr[array->size], copy, sizeof(copy));
    array->size++;
    return true;
}

#endif
