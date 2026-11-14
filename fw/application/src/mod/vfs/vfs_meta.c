#include "vfs_meta.h"
#include "df_buffer.h"

static bool parse_fields(uint8_t *p_meta, uint8_t size, vfs_meta_t *decoded, uint8_t *flags_offset) {
    if (!p_meta || !size) return false;
    uint8_t meta_size = p_meta[0];
    if (meta_size == 0 || meta_size == 0xFF) return true;
    if (meta_size >= size) return false;
    // Commit only a complete, bounded record; malformed metadata stays empty.
    NEW_BUFFER_READ(buff, p_meta, (size_t)meta_size + 1);
    buff.pos = 1;
    while (buff_get_remain_size(&buff) > 0) {
        uint8_t type = buff_get_u8(&buff);
        if (type == VFS_META_TYPE_NOTES) {
            if (buff_get_remain_size(&buff) < 1) {
                return false;
            }
            uint8_t length = buff_get_u8(&buff);
            if (length > buff_get_remain_size(&buff)) {
                return false;
            }
            size_t copied = length < sizeof(decoded->notes) ? length : sizeof(decoded->notes) - 1;
            memcpy(decoded->notes, buff_get_data_ptr_pos(&buff), copied);
            decoded->notes[copied] = '\0';
            buff.pos += length;
            decoded->has_notes = true;
        } else if (type == VFS_META_TYPE_FLAGS) {
            if (buff_get_remain_size(&buff) < 1) {
                return false;
            }
            if (flags_offset) {
                if (*flags_offset) return false;
                *flags_offset = buff.pos;
            }
            decoded->flags = buff_get_u8(&buff);
            decoded->has_flags = true;
        } else if (type == VFS_META_TYPE_AMIIBO_ID) {
            if (buff_get_remain_size(&buff) < 8) {
                return false;
            }
            decoded->amiibo_head = buff_get_u32(&buff);
            decoded->amiibo_tail = buff_get_u32(&buff);
            decoded->has_amiibo_id = true;
        } else {
            // Unknown fields have no length prefix, so they cannot safely be skipped.
            return false;
        }
    }
    return true;
}

void vfs_meta_decode(uint8_t *p_meta, uint8_t size, vfs_meta_t *p_out) {
    if (!p_out) return;
    vfs_meta_t decoded = {0};
    if (parse_fields(p_meta, size, &decoded, NULL))
        *p_out = decoded;
    else
        memset(p_out, 0, sizeof(*p_out));
}

/* Preserve unrecognized records and all padding outside the one edited field.
 * An absent FLAGS field is appended only after the full record validates. */
bool vfs_meta_set_readonly(uint8_t *raw, uint8_t size, bool readonly) {
    uint8_t offset = 0;
    vfs_meta_t decoded = {0};
    if (!parse_fields(raw, size, &decoded, &offset)) return false;
    uint8_t length = raw[0];
    if (length == 0xff) {
        for (unsigned i = 1; i < size; i++)
            if (raw[i] != 0xff) return false;
        length = 0;
    }
    if (!offset) {
        if (!readonly) return true;
        if ((unsigned)length + 3 > size) return false;
        offset = length + 2;
        raw[offset - 1] = VFS_META_TYPE_FLAGS;
        raw[offset] = 0;
        raw[0] = offset;
    }
    if (readonly) raw[offset] |= VFS_OBJ_FLAG_READONLY;
    else raw[offset] &= ~VFS_OBJ_FLAG_READONLY;
    return true;
}

void vfs_meta_encode(uint8_t *p_meta, uint8_t size, vfs_meta_t *p_in) {
    if (p_meta == NULL || size == 0) {
        return;
    }
    memset(p_meta, 0, size);
    if (p_in == NULL) {
        return;
    }
    size_t notes_length = 0;
    if (p_in->has_notes) {
        while (notes_length + 1 < sizeof(p_in->notes) && p_in->notes[notes_length] != '\0') {
            notes_length++;
        }
    }
    size_t required = 1 + (p_in->has_notes ? 2 + notes_length : 0) +
                      (p_in->has_flags ? 2 : 0) + (p_in->has_amiibo_id ? 9 : 0);
    if (required > size) {
        // The existing void API cannot report an error; leave a valid empty record.
        return;
    }
    NEW_BUFFER(buff, p_meta, size);
    buff_put_u8(&buff, 0); // place holder
    if (p_in->has_notes) {
        buff_put_u8(&buff, VFS_META_TYPE_NOTES);
        buff_put_u8(&buff, notes_length);
        buff_put_byte_array(&buff, p_in->notes, notes_length);
    }

    if (p_in->has_flags) {
        buff_put_u8(&buff, VFS_META_TYPE_FLAGS);
        buff_put_u8(&buff, p_in->flags);
    }

    if(p_in->has_amiibo_id){
        buff_put_u8(&buff, VFS_META_TYPE_AMIIBO_ID);
        buff_put_u32(&buff, p_in->amiibo_head);
        buff_put_u32(&buff, p_in->amiibo_tail);
    }

    p_meta[0] = buff_get_size(&buff) - 1;
}
