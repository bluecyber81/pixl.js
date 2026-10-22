#include "vfs_meta.h"
#include "df_buffer.h"

void vfs_meta_decode(uint8_t *p_meta, uint8_t size, vfs_meta_t *p_out) {
    if (p_out == NULL) {
        return;
    }
    memset(p_out, 0, sizeof(*p_out));
    if (p_meta == NULL || size == 0) {
        return;
    }
    uint8_t meta_size = p_meta[0];
    if (meta_size == 0 || meta_size == 0xFF || (size_t)meta_size + 1 > size) {
        return;
    }

    // Commit only a complete, bounded record; malformed metadata stays empty.
    vfs_meta_t decoded = {0};
    NEW_BUFFER_READ(buff, p_meta, (size_t)meta_size + 1);
    buff.pos = 1;
    while (buff_get_remain_size(&buff) > 0) {
        uint8_t type = buff_get_u8(&buff);
        if (type == VFS_META_TYPE_NOTES) {
            if (buff_get_remain_size(&buff) < 1) {
                return;
            }
            uint8_t length = buff_get_u8(&buff);
            if (length > buff_get_remain_size(&buff)) {
                return;
            }
            size_t copied = length < sizeof(decoded.notes) ? length : sizeof(decoded.notes) - 1;
            memcpy(decoded.notes, buff_get_data_ptr_pos(&buff), copied);
            decoded.notes[copied] = '\0';
            buff.pos += length;
            decoded.has_notes = true;
        } else if (type == VFS_META_TYPE_FLAGS) {
            if (buff_get_remain_size(&buff) < 1) {
                return;
            }
            decoded.flags = buff_get_u8(&buff);
            decoded.has_flags = true;
        } else if (type == VFS_META_TYPE_AMIIBO_ID) {
            if (buff_get_remain_size(&buff) < 8) {
                return;
            }
            decoded.amiibo_head = buff_get_u32(&buff);
            decoded.amiibo_tail = buff_get_u32(&buff);
            decoded.has_amiibo_id = true;
        } else {
            // Unknown fields have no length prefix, so they cannot safely be skipped.
            return;
        }
    }
    *p_out = decoded;
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
