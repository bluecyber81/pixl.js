#include "df_proto_vfs.h"
#include "df_buffer.h"
#include "df_core.h"
#include "df_defines.h"
#include "nrf_log.h"
#include "vfs.h"
#include "boards.h"
#if defined(BOARD_LCD) && defined(VFS_SPIFFS_ENABLE)
#include "vfs_driver_fs.h"
#include "vfs_spiffs_diag.h"
#endif

static vfs_driver_t *get_driver_by_label(char label) {
    vfs_drive_t drive;
    if (label == 'I') {
        drive = VFS_DRIVE_INT;
    } else if (label == 'E') {
        drive = VFS_DRIVE_EXT;
    } else {
        return NULL;
    }
    return vfs_drive_enabled(drive) ? vfs_get_driver(drive) : NULL;
}

static vfs_driver_t *get_driver_by_path(char *path) {
    return strlen(path) >= 3 && path[1] == ':' && path[2] == '/' ? get_driver_by_label(path[0]) : NULL;
}

// Validate wire lengths before the legacy buffer helpers advance their cursor.
static bool read_path(buffer_t *buff, char *path, size_t capacity) {
    if (buff_get_remain_size(buff) < 2) {
        return false;
    }
    uint16_t length;
    memcpy(&length, buff_get_data_ptr_pos(buff), sizeof(length));
    buff->pos += sizeof(length);
    if (length < 3 || length >= capacity || length > buff_get_remain_size(buff) ||
        memchr(buff_get_data_ptr_pos(buff), 0, length) != NULL) {
        return false;
    }
    memcpy(path, buff_get_data_ptr_pos(buff), length);
    path[length] = 0;
    buff->pos += length;
    return path[1] == ':' && path[2] == '/' && (path[0] == 'I' || path[0] == 'E');
}

static void send_error(uint8_t command) {
    df_frame_t out = {0};
    OUT_FRAME_NO_DATA(out, command, DF_STATUS_ERR);
    df_core_send_frame(&out);
}

static char *get_file_path(char *path) { return path + VFS_DRIVE_LABEL_LEN; }

static uint8_t get_meta_size(uint8_t *meta) {
    uint8_t meta_size = meta[0];
    return meta_size == 0 || meta_size >= VFS_MAX_META_LEN ? 0 : meta_size;
}

static bool validate_path(char *path) {
    if (path[0] != 'I' && path[0] != 'E') {
        return false;
    }
    if (path[1] != ':' || path[2] != '/') {
        return false;
    }

    return true;
}

static bool file_transfer_closed(void);

void df_proto_handler_vfs_drive_list(df_event_t *evt) {
    if (evt->type != DF_EVENT_DATA_RECEVIED) {
        return;
    }
    df_frame_t out = {0};
    NEW_BUFFER_ZERO(buff, out.data, sizeof(out.data));
    buff_put_u8(&buff, vfs_drive_enabled(VFS_DRIVE_INT) + vfs_drive_enabled(VFS_DRIVE_EXT));
    for (vfs_drive_t drive = VFS_DRIVE_INT; drive < VFS_DRIVE_MAX; drive++) {
        if (!vfs_drive_enabled(drive)) {
            continue;
        }
        vfs_stat_t stat = {0};
        vfs_driver_t *driver = vfs_get_driver(drive);
        // Listing is read-only: do not mount or initialize unavailable storage.
        bool available = driver && driver->stat(&stat) == VFS_OK && stat.avaliable;
        buff_put_u8(&buff, available ? 0 : 1);
        buff_put_char(&buff, drive == VFS_DRIVE_INT ? 'I' : 'E');
        buff_put_string(&buff, drive == VFS_DRIVE_INT ? "Internal Flash" : "External Flash");
        buff_put_u32(&buff, available ? stat.total_bytes : 0);
        buff_put_u32(&buff, available ? stat.free_bytes : 0);
    }
    OUT_FRAME_WITH_DATA_0(out, evt->df->cmd, DF_STATUS_OK, buff_get_size(&buff));
    df_core_send_frame(&out);
}

void df_proto_handler_vfs_drive_format(df_event_t *evt) {
    if (evt->type == DF_EVENT_DATA_RECEVIED) {
        df_frame_t out;

        NEW_BUFFER_READ(buff, evt->df->data, evt->df->length);
        if (evt->df->length != 1) {
            send_error(evt->df->cmd);
            return;
        }
        char drv_label = (char)buff_get_u8(&buff);
        vfs_driver_t *p_driver = get_driver_by_label(drv_label);
        if (p_driver == NULL) {
            OUT_FRAME_NO_DATA(out, evt->df->cmd, DF_STATUS_ERR);
            df_core_send_frame(&out);
            return;
        }

        df_proto_vfs_cleanup();
        if (!file_transfer_closed()) {
            send_error(evt->df->cmd);
            return;
        }
        if (p_driver->format() == VFS_OK && p_driver->mount() == VFS_OK) {
            OUT_FRAME_NO_DATA(out, evt->df->cmd, DF_STATUS_OK);
        } else {
            OUT_FRAME_NO_DATA(out, evt->df->cmd, DF_STATUS_ERR);
        }
        df_core_send_frame(&out);
    } else if (evt->type == DF_EVENT_DATA_TRANSMIT_READY) {
    }
}

typedef struct {
    vfs_dir_t dir;
    vfs_obj_t obj;
    uint8_t obj_offset; /* UINT8_MAX: consumed; otherwise encoded byte offset. */
    bool dir_closed;
    uint16_t chunk;
    vfs_driver_t *driver;
} dir_chunk_state_t;

static dir_chunk_state_t dir_chunk_state = {.dir_closed = true};

_Static_assert((VFS_MAX_NAME_LEN - 1) + (VFS_MAX_META_LEN - 1) + 8 < UINT8_MAX,
               "directory record must fit in the existing one-byte offset");

static int32_t close_directory(dir_chunk_state_t *state) {
    if (state->dir_closed || state->driver == NULL) {
        return VFS_OK;
    }
    state->dir_closed = true;
    return state->driver->close_dir(&state->dir);
}

/* Append only the requested window of an encoded field. No second record or
 * response buffer is needed, including when ATT MTU is the minimum 23 bytes. */
static void dir_copy_field(buffer_t *out, const void *data, size_t length, size_t *skip) {
    if (*skip >= length) {
        *skip -= length;
        return;
    }
    size_t offset = *skip;
    *skip = 0;
    size_t count = length - offset;
    size_t available = buffer_get_available_cap(out);
    if (count > available) count = available;
    if (count) buff_put_byte_array(out, (const uint8_t *)data + offset, count);
}

static void dir_read_send_chunk(dir_chunk_state_t *state, df_frame_t *out) {
    if (state->dir_closed || state->driver == NULL) {
        return;
    }
    NEW_BUFFER_ZERO(buff, out->data, df_core_max_payload());
    out->cmd = DF_PROTO_CMD_VFS_DIR_READ;
    out->chunk = state->chunk;
    out->status = DF_STATUS_OK;
    if (buff.cap == 0) {
        close_directory(state);
        out->status = DF_STATUS_ERR;
    }
    while (out->status == DF_STATUS_OK) {
        if (state->obj_offset == UINT8_MAX) {
            int32_t result = state->driver->read_dir(&state->dir, &state->obj);
            if (result != VFS_OK) {
                int32_t close_result = close_directory(state);
                if (result != VFS_ERR_EOF || close_result != VFS_OK) {
                    out->status = DF_STATUS_ERR;
                }
                break;
            }
            state->obj_offset = 0;
        }
        size_t name_size = 0;
        while (name_size < sizeof(state->obj.name) && state->obj.name[name_size]) {
            name_size++;
        }
        if (name_size == sizeof(state->obj.name)) {
            close_directory(state);
            out->status = DF_STATUS_ERR;
            break;
        }
        uint8_t meta_size = get_meta_size((uint8_t *)state->obj.meta);
        size_t size_required = name_size + meta_size + 8;
        /* Keep the existing whole-record framing when an entry fits the link.
         * Only larger entries are continued across response chunks. */
        if (state->obj_offset == 0 && size_required <= buff.cap &&
            buffer_get_available_cap(&buff) < size_required) {
            out->chunk |= 0x8000;
            break;
        }
        uint16_t name_length = (uint16_t)name_size;
        uint32_t file_size = (uint32_t)state->obj.size;
        size_t skip = state->obj_offset;
        size_t before = buff_get_size(&buff);
        dir_copy_field(&buff, &name_length, sizeof(name_length), &skip);
        dir_copy_field(&buff, state->obj.name, name_size, &skip);
        dir_copy_field(&buff, &file_size, sizeof(file_size), &skip);
        dir_copy_field(&buff, &state->obj.type, sizeof(state->obj.type), &skip);
        dir_copy_field(&buff, &meta_size, sizeof(meta_size), &skip);
        dir_copy_field(&buff, state->obj.meta + 1, meta_size, &skip);
        state->obj_offset += (uint8_t)(buff_get_size(&buff) - before);
        if (state->obj_offset < size_required) {
            out->chunk |= 0x8000;
            break;
        }
        state->obj_offset = UINT8_MAX;
    }
    /* The wire protocol reserves bit 15 for MORE, so do not wrap a response's
     * sequence into that flag and leave clients waiting for a nonexistent end. */
    if ((out->chunk & 0x8000) && state->chunk == 0x7fff) {
        close_directory(state);
        out->status = DF_STATUS_ERR;
        out->chunk = state->chunk;
    }
    out->length = out->status == DF_STATUS_OK ? buff_get_size(&buff) : 0;
    state->chunk++;
    df_core_send_frame(out);
}

void df_proto_handler_vfs_dir_read(df_event_t *evt) {

    df_frame_t out;

    if (evt->type == DF_EVENT_DATA_RECEVIED) {

        NEW_BUFFER_READ(buff, evt->df->data, evt->df->length);

        char path[VFS_MAX_FULL_PATH_LEN];
        memset(path, 0, sizeof(path));
        if (!read_path(&buff, path, sizeof(path))) {
            send_error(evt->df->cmd);
            return;
        }

        if (close_directory(&dir_chunk_state) != VFS_OK) {
            send_error(evt->df->cmd);
            return;
        }
        dir_chunk_state.driver = get_driver_by_path(path);
        if (dir_chunk_state.driver == NULL) {
            OUT_FRAME_NO_DATA(out, evt->df->cmd, DF_STATUS_ERR);
            df_core_send_frame(&out);
            return;
        }

        int32_t err = dir_chunk_state.driver->open_dir(get_file_path(path), &dir_chunk_state.dir);
        if (err) {
            // TODO mapping error
            OUT_FRAME_NO_DATA(out, evt->df->cmd, DF_STATUS_ERR);
            df_core_send_frame(&out);
            return;
        }

        dir_chunk_state.chunk = 0;
        dir_chunk_state.dir_closed = false;
        dir_chunk_state.obj_offset = UINT8_MAX;

        dir_read_send_chunk(&dir_chunk_state, &out);
    } else if (evt->type == DF_EVENT_DATA_TRANSMIT_READY) {
        dir_read_send_chunk(&dir_chunk_state, &out);
    } else if (evt->type == DF_EVENT_LINK_DISCONNECTED) {
        close_directory(&dir_chunk_state);
    }
}

void df_proto_handler_vfs_dir_create(df_event_t *evt) {
    if (evt->type == DF_EVENT_DATA_RECEVIED) {
        df_frame_t out;

        NEW_BUFFER_READ(buff, evt->df->data, evt->df->length);
        char path[VFS_MAX_FULL_PATH_LEN];
        memset(path, 0, sizeof(path));
        if (!read_path(&buff, path, sizeof(path))) {
            send_error(evt->df->cmd);
            return;
        }

        vfs_driver_t *p_driver = get_driver_by_path(path);
        if (p_driver == NULL) {
            OUT_FRAME_NO_DATA(out, evt->df->cmd, DF_STATUS_ERR);
            df_core_send_frame(&out);
            return;
        }

        if (p_driver->create_dir(get_file_path(path)) == VFS_OK) {
            OUT_FRAME_NO_DATA(out, evt->df->cmd, DF_STATUS_OK);
        } else {
            OUT_FRAME_NO_DATA(out, evt->df->cmd, DF_STATUS_ERR);
        }
        df_core_send_frame(&out);
    } else if (evt->type == DF_EVENT_DATA_TRANSMIT_READY) {
    }
}

void df_proto_handler_vfs_remove(df_event_t *evt) {
    if (evt->type == DF_EVENT_DATA_RECEVIED) {
        df_frame_t out;

        NEW_BUFFER_READ(buff, evt->df->data, evt->df->length);
        char path[VFS_MAX_FULL_PATH_LEN];
        memset(path, 0, sizeof(path));
        if (!read_path(&buff, path, sizeof(path))) {
            send_error(evt->df->cmd);
            return;
        }

        /* Removing an open file (including through its parent directory)
         * invalidates its SPIFFS descriptor behind the transfer owner. Keep
         * ownership intact until CLOSE or disconnect cleanup has completed. */
        if (!file_transfer_closed()) {
            send_error(evt->df->cmd);
            return;
        }

        vfs_driver_t *p_driver = get_driver_by_path(path);
        if (p_driver == NULL) {
            OUT_FRAME_NO_DATA(out, evt->df->cmd, DF_STATUS_ERR);
            df_core_send_frame(&out);
            return;
        }

        vfs_obj_t obj;
        if (p_driver->stat_file(get_file_path(path), &obj) != VFS_OK) {
            OUT_FRAME_NO_DATA(out, evt->df->cmd, DF_STATUS_ERR);
            df_core_send_frame(&out);
            return;
        }

        int32_t err = 0;
        if (obj.type == VFS_TYPE_DIR) {
            err = p_driver->remove_dir(get_file_path(path));
        } else {
            err = p_driver->remove_file(get_file_path(path));
        }

        if (err != VFS_OK) {
            OUT_FRAME_NO_DATA(out, evt->df->cmd, DF_STATUS_ERR);
            df_core_send_frame(&out);
            return;
        }
        OUT_FRAME_NO_DATA(out, evt->df->cmd, DF_STATUS_OK);
        df_core_send_frame(&out);

    } else if (evt->type == DF_EVENT_DATA_TRANSMIT_READY) {
    }
}

typedef struct {
    bool opened;
    bool abandoned;
    bool read_pending; /* Only an accepted READ may continue after TX_READY. */
    vfs_file_t vfs_fd;
    vfs_driver_t *vfs_driver;
    int32_t err_code;
    uint16_t chunk;
} file_chunk_state_t;

static file_chunk_state_t file_chunk_state = {0};

static bool file_transfer_closed(void) { return !file_chunk_state.opened; }

bool df_proto_vfs_file_transfer_closed(void) { return file_transfer_closed(); }

bool df_proto_vfs_is_idle(void) {
    return !file_chunk_state.opened && !file_chunk_state.abandoned &&
           !file_chunk_state.read_pending && dir_chunk_state.dir_closed;
}

void df_proto_vfs_cleanup(void) {
    file_chunk_state.read_pending = false;
    close_directory(&dir_chunk_state);
    dir_chunk_state.driver = NULL;
    if (file_chunk_state.opened && file_chunk_state.vfs_driver != NULL) {
        int32_t result = file_chunk_state.abandoned ? file_chunk_state.err_code :
            file_chunk_state.vfs_driver->close_file(&file_chunk_state.vfs_fd);
        if (result != VFS_OK) {
            NRF_LOG_INFO("VFS disconnect close failed: %d", result);
            file_chunk_state.abandoned = true;
            file_chunk_state.err_code = result;
            int32_t aborted = vfs_abort_file(file_chunk_state.vfs_driver, &file_chunk_state.vfs_fd);
            if (aborted != VFS_OK) {
                /* Retain ownership if an older driver cannot abandon safely.
                 * This handle is inaccessible to the next connection. */
                NRF_LOG_INFO("VFS disconnect abort failed: %d", aborted);
                return;
            }
        }
    }
    // Resources are released before forgetting a failed-close descriptor.
    memset(&file_chunk_state, 0, sizeof(file_chunk_state));
}


void df_proto_handler_vfs_file_open(df_event_t *evt) {
    if (evt->type == DF_EVENT_DATA_RECEVIED) {
        df_frame_t out;
        uint32_t flags;
        int32_t err_code;

        NEW_BUFFER_READ(buff, evt->df->data, evt->df->length);
        char path[VFS_MAX_FULL_PATH_LEN];
        memset(path, 0, sizeof(path));
        if (!read_path(&buff, path, sizeof(path))) {
            send_error(evt->df->cmd);
            return;
        }
        size_t flag_size = buff_get_remain_size(&buff);
        if (flag_size != 1 && flag_size != sizeof(flags)) {
            send_error(evt->df->cmd);
            return;
        }
        // The official web client sends u8; other clients send u32 little-endian.
        flags = 0;
        memcpy(&flags, buff_get_data_ptr_pos(&buff), flag_size);

        vfs_driver_t *p_driver = get_driver_by_path(path);
        if (p_driver == NULL) {
            OUT_FRAME_NO_DATA(out, evt->df->cmd, DF_STATUS_ERR);
            df_core_send_frame(&out);
            return;
        }

        // A malformed replacement request must not close the current file.
        if (file_chunk_state.abandoned) {
            df_proto_vfs_cleanup();
            if (file_chunk_state.opened) {
                send_error(evt->df->cmd);
                return;
            }
        }
        if (file_chunk_state.opened) {
            err_code = file_chunk_state.vfs_driver->close_file(&file_chunk_state.vfs_fd);
            if (err_code != VFS_OK) {
                file_chunk_state.err_code = err_code;
                send_error(evt->df->cmd);
                return;
            }
            file_chunk_state.opened = false;
        }

        err_code = p_driver->open_file(get_file_path(path), &file_chunk_state.vfs_fd, flags);
        if (err_code != VFS_OK) {
            OUT_FRAME_NO_DATA(out, evt->df->cmd, DF_STATUS_ERR);
            df_core_send_frame(&out);
            return;
        }

        file_chunk_state.opened = true;
        file_chunk_state.vfs_driver = p_driver;
        file_chunk_state.err_code = VFS_OK;

        NEW_BUFFER_ZERO(out_buff, out.data, sizeof(out.data));
        buff_put_u8(&out_buff, 0); // always 0

        OUT_FRAME_WITH_DATA_0(out, evt->df->cmd, DF_STATUS_OK, buff_get_size(&out_buff));
        df_core_send_frame(&out);

        return;
    } else if (evt->type == DF_EVENT_DATA_TRANSMIT_READY) {
    }
}

void df_proto_handler_vfs_file_close(df_event_t *evt) {
    if (evt->type == DF_EVENT_DATA_RECEVIED) {
        df_frame_t out;
        int32_t err_code;

        NEW_BUFFER_READ(buff, evt->df->data, evt->df->length);

        if (evt->df->length < 1 || buff_get_u8(&buff) != 0) {
            send_error(evt->df->cmd);
            return;
        }
        if (!file_chunk_state.opened || file_chunk_state.abandoned) {
            OUT_FRAME_NO_DATA(out, evt->df->cmd, DF_STATUS_ERR);
            df_core_send_frame(&out);
            return;
        }

        err_code = file_chunk_state.vfs_driver->close_file(&file_chunk_state.vfs_fd);
        if (err_code != VFS_OK) {
            file_chunk_state.err_code = err_code;
            OUT_FRAME_NO_DATA(out, evt->df->cmd, DF_STATUS_ERR);
            df_core_send_frame(&out);
            return;
        }

        file_chunk_state.opened = false;
        file_chunk_state.vfs_driver = NULL;
        file_chunk_state.read_pending = false;
        OUT_FRAME_NO_DATA(out, evt->df->cmd, DF_STATUS_OK);
        df_core_send_frame(&out);
    } else if (evt->type == DF_EVENT_DATA_TRANSMIT_READY) {
    }
}

void df_proto_handler_vfs_file_write(df_event_t *evt) {
    if (evt->type == DF_EVENT_DATA_RECEVIED) {
        df_frame_t out;

        NEW_BUFFER_READ(buff, evt->df->data, evt->df->length);

        if (evt->df->length < 1 || buff_get_u8(&buff) != 0) {
            send_error(evt->df->cmd);
            return;
        }

        bool chunk_eof = !(evt->df->chunk & 0x8000);

        if (file_chunk_state.opened && !file_chunk_state.abandoned && file_chunk_state.err_code == VFS_OK) {
            void *data_buff = buff_get_data_ptr_pos(&buff);
            size_t data_size = buff_get_remain_size(&buff);

            int32_t bytes_written =
                file_chunk_state.vfs_driver->write_file(&file_chunk_state.vfs_fd, data_buff, data_size);
            if (bytes_written < 0 || (size_t)bytes_written != data_size) {
                file_chunk_state.err_code = bytes_written < 0 ? bytes_written : VFS_ERR_FAIL;
            }
        }

        if (chunk_eof) {
            if (file_chunk_state.opened && !file_chunk_state.abandoned && file_chunk_state.err_code == VFS_OK) {
                OUT_FRAME_NO_DATA(out, evt->df->cmd, DF_STATUS_OK);
            } else {
                OUT_FRAME_NO_DATA(out, evt->df->cmd, DF_STATUS_ERR);
            }

            df_core_send_frame(&out);
        }
    } else if (evt->type == DF_EVENT_DATA_TRANSMIT_READY) {
    }
}

void file_read_send_chunk(file_chunk_state_t *chunk_state, df_frame_t *out) {
    if (!chunk_state->opened || chunk_state->abandoned || chunk_state->err_code != VFS_OK) {
        chunk_state->read_pending = false;
        return;
    }

    void *data_buff = out->data;
    size_t data_size = df_core_max_payload();
    bool chunk_eof = false;

    int32_t bytes_read = data_size ?
        chunk_state->vfs_driver->read_file(&chunk_state->vfs_fd, data_buff, data_size) : VFS_ERR_FAIL;
    if (bytes_read > (int32_t)data_size ||
        (chunk_state->chunk == 0x7fff && bytes_read == (int32_t)data_size)) {
        bytes_read = VFS_ERR_FAIL;
    }
    if (bytes_read < 0) {
        chunk_state->read_pending = false;
        chunk_state->err_code = bytes_read;
        out->status = DF_STATUS_ERR;
        chunk_eof = true;
        out->length = 0;
    } else if (bytes_read < data_size) {
        chunk_state->read_pending = false;
        chunk_state->err_code = VFS_ERR_EOF;
        out->status = DF_STATUS_OK;
        chunk_eof = true;
        out->length = bytes_read;
    } else {
        chunk_state->err_code = VFS_OK;
        out->status = DF_STATUS_OK;
        out->length = data_size;
    }

    out->cmd = DF_PROTO_CMD_VFS_FILE_READ;
    if (chunk_eof) {
        out->chunk = chunk_state->chunk;
    } else {
        out->chunk = chunk_state->chunk | 0x8000;
    }

    chunk_state->chunk++;
    df_core_send_frame(out);
}

void df_proto_handler_vfs_rename(df_event_t *evt) {
    if (evt->type == DF_EVENT_DATA_RECEVIED) {
        df_frame_t out;

        NEW_BUFFER_READ(buff, evt->df->data, evt->df->length);
        char old_path[VFS_MAX_FULL_PATH_LEN] = {0};
        char new_path[VFS_MAX_FULL_PATH_LEN] = {0};

        if (!read_path(&buff, old_path, sizeof(old_path)) || !read_path(&buff, new_path, sizeof(new_path))) {
            send_error(evt->df->cmd);
            return;
        }

        if (!validate_path(old_path) || !validate_path(new_path)) {
            NRF_LOG_INFO("path error");
            OUT_FRAME_NO_DATA(out, DF_PROTO_CMD_VFS_RENAME, DF_STATUS_ERR);
            df_core_send_frame(&out);
            return;
        }

        if (get_driver_by_path(old_path) != get_driver_by_path(new_path)) {
            NRF_LOG_INFO("different drive");
            OUT_FRAME_NO_DATA(out, DF_PROTO_CMD_VFS_RENAME, DF_STATUS_ERR);
            df_core_send_frame(&out);
            return;
        }

        vfs_driver_t *p_driver = get_driver_by_path(old_path);
        if (p_driver == NULL) {
            NRF_LOG_INFO("vfs driver is not found");
            OUT_FRAME_NO_DATA(out, DF_PROTO_CMD_VFS_RENAME, DF_STATUS_ERR);
            df_core_send_frame(&out);
            return;
        }

        vfs_obj_t obj;
        int32_t err;

        err = p_driver->stat_file(get_file_path(old_path), &obj);

        if (err != VFS_OK) {
            NRF_LOG_INFO("stat file error");
            OUT_FRAME_NO_DATA(out, DF_PROTO_CMD_VFS_RENAME, DF_STATUS_ERR);
            df_core_send_frame(&out);
            return;
        }

        ;
        if (obj.type == VFS_TYPE_DIR) {
            err = p_driver->rename_dir(get_file_path(old_path), get_file_path(new_path));
        } else {
            err = p_driver->rename_file(get_file_path(old_path), get_file_path(new_path));
        }

        if (err != VFS_OK) {
            NRF_LOG_INFO("rename file error: %d", err);
            OUT_FRAME_NO_DATA(out, DF_PROTO_CMD_VFS_RENAME, DF_STATUS_ERR);
            df_core_send_frame(&out);
            return;
        }

        OUT_FRAME_NO_DATA(out, DF_PROTO_CMD_VFS_RENAME, DF_STATUS_OK);
        df_core_send_frame(&out);
    }
}

void df_proto_handler_vfs_file_read(df_event_t *evt) {
    df_frame_t out;
    if (evt->type == DF_EVENT_DATA_RECEVIED) {
        /* An ERR reply is also followed by TX_READY. It must not read from an
         * otherwise healthy open file or alter that file's write/error state. */
        file_chunk_state.read_pending = false;

        NEW_BUFFER_READ(buff, evt->df->data, evt->df->length);

        if (evt->df->length < 1 || buff_get_u8(&buff) != 0) {
            send_error(evt->df->cmd);
            return;
        }

        if (!file_chunk_state.opened || file_chunk_state.abandoned) {
            OUT_FRAME_NO_DATA(out, DF_PROTO_CMD_VFS_FILE_READ, DF_STATUS_ERR);
            df_core_send_frame(&out);
            return;
        }

        file_chunk_state.chunk = 0;
        file_chunk_state.err_code = VFS_OK;
        file_chunk_state.read_pending = true;

        file_read_send_chunk(&file_chunk_state, &out);

    } else if (evt->type == DF_EVENT_DATA_TRANSMIT_READY && file_chunk_state.read_pending) {
        file_read_send_chunk(&file_chunk_state, &out);
    }
}

void df_proto_handler_vfs_update_meta(df_event_t *evt) {
    df_frame_t out;
    if (evt->type == DF_EVENT_DATA_RECEVIED) {

        NEW_BUFFER_READ(buff, evt->df->data, evt->df->length);

        char path[VFS_MAX_FULL_PATH_LEN];
        memset(path, 0, sizeof(path));
        if (!read_path(&buff, path, sizeof(path))) {
            send_error(evt->df->cmd);
            return;
        }

        uint8_t meta[VFS_MAX_META_LEN];
        memset(meta, 0, sizeof(meta));
        if (buff_get_remain_size(&buff) < 1) {
            send_error(evt->df->cmd);
            return;
        }
        uint8_t meta_size = buff_get_u8(&buff);
        if (meta_size >= sizeof(meta) || meta_size != buff_get_remain_size(&buff)) {
            send_error(evt->df->cmd);
            return;
        }
        if (meta_size > 0) {
            buff_get_byte_array(&buff, meta + 1, meta_size);
        }
        meta[0] = meta_size;
        vfs_driver_t *p_driver = get_driver_by_path(path);
        if (p_driver == NULL) {
            OUT_FRAME_NO_DATA(out, evt->df->cmd, DF_STATUS_ERR);
            df_core_send_frame(&out);
            return;
        }

        if (p_driver->update_file_meta(get_file_path(path), meta, meta_size + 1) != VFS_OK) {
            OUT_FRAME_NO_DATA(out, evt->df->cmd, DF_STATUS_ERR);
            df_core_send_frame(&out);
            return;
        }

        OUT_FRAME_NO_DATA(out, evt->df->cmd, DF_STATUS_OK);
        df_core_send_frame(&out);
    }
}

#if defined(BOARD_LCD) && defined(VFS_SPIFFS_ENABLE)
void df_proto_handler_vfs_storage_diag(df_event_t *evt) {
    if (evt->type != DF_EVENT_DATA_RECEVIED) return;
    df_frame_t out;
    if (evt->df->length < 2 || evt->df->status != 0 || evt->df->chunk != 0) {
        send_error(evt->df->cmd);
        return;
    }
    uint8_t operation = evt->df->data[0];
    bool generation_request = operation == 5 || operation == 6;
    if (evt->df->length != (generation_request ? 4 : 2) || operation > 6 ||
        (operation >= 3 && !df_proto_vfs_is_idle())) {
        send_error(evt->df->cmd);
        return;
    }
    if (generation_request) {
        uint16_t generation = (uint16_t)evt->df->data[2] | (uint16_t)evt->df->data[3] << 8;
        if (!vfs_spiffs_diag_generation_matches(evt->df->data[1], generation)) {
            send_error(evt->df->cmd);
            return;
        }
    }
    size_t length = 0;
    /* One logical chunk0 reply; the BLE driver fragments it when needed. */
    int32_t result = vfs_spiffs_storage_diagnose(evt->df->data[0], evt->df->data[1],
                                               out.data, sizeof(out.data), &length);
    OUT_FRAME_WITH_DATA_0(out, evt->df->cmd, result == VFS_OK ? DF_STATUS_OK : DF_STATUS_ERR,
                         result == VFS_OK ? length : 0);
    df_core_send_frame(&out);
}
#endif

const df_cmd_entry_t df_proto_handler_vfs_entries[] = {
    {DF_PROTO_CMD_VFS_DRIVE_LIST, df_proto_handler_vfs_drive_list},
    {DF_PROTO_CMD_VFS_DRIVE_FORMAT, df_proto_handler_vfs_drive_format},
    {DF_PROTO_CMD_VFS_DIR_READ, df_proto_handler_vfs_dir_read},
    {DF_PROTO_CMD_VFS_DIR_CREATE, df_proto_handler_vfs_dir_create},
    {DF_PROTO_CMD_VFS_REMOVE, df_proto_handler_vfs_remove},
    {DF_PROTO_CMD_VFS_RENAME, df_proto_handler_vfs_rename},
    {DF_PROTO_CMD_VFS_FILE_OPEN, df_proto_handler_vfs_file_open},
    {DF_PROTO_CMD_VFS_FILE_CLOSE, df_proto_handler_vfs_file_close},
    {DF_PROTO_CMD_VFS_FILE_WRITE, df_proto_handler_vfs_file_write},
    {DF_PROTO_CMD_VFS_FILE_READ, df_proto_handler_vfs_file_read},
    {DF_PROTO_CMD_VFS_UPDATE_META, df_proto_handler_vfs_update_meta},
#if defined(BOARD_LCD) && defined(VFS_SPIFFS_ENABLE)
    {DF_PROTO_CMD_VFS_STORAGE_DIAG, df_proto_handler_vfs_storage_diag},
#endif
    {0, NULL}};
