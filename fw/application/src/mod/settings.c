#include "settings.h"
#include <stddef.h>
#include <string.h>
#include "nrf_error.h"
#include "runtime_diag.h"
#include "nrf_log.h"
#include "vfs.h"
#include "vfs_meta.h"
#include "vfs_persist.h"
#ifdef VFS_PACKED_LFS_ENABLE
#include "vfs_packed_runtime.h"
#endif

#include "tag_helper.h"
#include "ble_amiibolink.h"

#define SETTINGS_FILE_NAME "/settings.bin"

#ifdef OLED_SCREEN
// Though OLED doesn't necessarily imply rechargeable battery, it's usually the case.
#define DEFAULT_BAT_MODE 1
#else // !OLED_SCREEN
#define DEFAULT_BAT_MODE 0
#endif // OLED_SCREEN

const settings_data_t def_settings_data = {.backlight = 0,
                                           .auto_gen_amiibo = 0,
                                           .auto_gen_amiibolink = 0,
                                           .sleep_timeout_sec = 30,
                                           .skip_driver_select = 0,
                                           .bat_mode = DEFAULT_BAT_MODE,
                                           .amiibo_link_ver = BLE_AMIIBOLINK_VER_V1,
                                           .language = LANGUAGE_DE_DE,
                                           .hibernate_enabled = false,
                                           .show_mem_usage = false,
                                           .lcd_backlight = 0,
                                           .oled_contrast = 80,
                                           .anim_enabled = false,
                                           .amiidb_data_slot_num = 20,
                                           .qrcode_enabled = true,
                                           .chameleon_default_slot_index = INVALID_SLOT_INDEX,
                                            .app_enable_bits = 0xFFFF,
                                            .amiidb_sort_column = 0,
                                            .chameleon_slot_num = 8,
                                            .amiibolink_mode = 0, // 0 = not set, use default (manual)
                                            .no_sleep_mode = false,
                                            .flip_display = false,
                                            .swap_buttons = false,
                                        };

settings_data_t m_settings_data = {0};
static bool m_settings_save_allowed = false;
static bool m_settings_init_attempted;
static bool m_settings_file_absent;
static void (*m_recovered)(const settings_data_t *previous);

void settings_on_recovered(void (*apply)(const settings_data_t *previous)) {
    m_recovered = apply;
}
static uint8_t saved_chameleon_count, saved_chameleon_default;
static uint32_t edited_fields;
static uint16_t edited_apps;

static void settings_clear_edits(void) {
    edited_fields = 0;
    edited_apps = 0;
}

void settings_set_byte(uint8_t offset, uint8_t value) {
    if (offset >= sizeof(m_settings_data)) return;
    edited_fields |= UINT32_C(1) << offset;
    ((uint8_t *)&m_settings_data)[offset] = value;
}

void settings_toggle_byte(uint8_t offset) {
    if (offset >= sizeof(m_settings_data)) return;
    settings_set_byte(offset, !((uint8_t *)&m_settings_data)[offset]);
}

void settings_toggle_app(uint32_t app_id) {
    if (app_id >= 16) return;
    uint16_t bit = (uint16_t)(1u << app_id);
    edited_apps |= bit;
    m_settings_data.app_enable_bits ^= bit;
}

static void settings_remember_chameleon(void) {
    saved_chameleon_count = m_settings_data.chameleon_slot_num;
    saved_chameleon_default = m_settings_data.chameleon_default_slot_index;
}

void settings_discard_chameleon_changes(void) {
    edited_fields &= ~((UINT32_C(1) << offsetof(settings_data_t, chameleon_default_slot_index)) |
                       (UINT32_C(1) << offsetof(settings_data_t, chameleon_slot_num)));
    m_settings_data.chameleon_slot_num = saved_chameleon_count;
    m_settings_data.chameleon_default_slot_index = saved_chameleon_default;
}

/* The persisted ABI uses short enums and one-byte bools. Read bytes before
 * interpreting bool objects: an invalid bool representation is not a value
 * which a C compiler is required to preserve through a bool comparison. */
_Static_assert(sizeof(bool) == 1, "settings bool ABI changed");
_Static_assert(sizeof(settings_data_t) == 26, "settings file ABI changed");
_Static_assert(offsetof(settings_data_t, backlight) == 0, "legacy dim preference moved");
_Static_assert(offsetof(settings_data_t, no_sleep_mode) == 23, "legacy settings ABI changed");
#define LEGACY_SETTINGS_SIZE 24
/* Legacy firmware validated this unused byte as a boolean. Preserve the
 * original file size and both legal old values. Only an explicit opt-in
 * uses the new tag. Older firmware normalizes it to its legacy default. */
#define LCD_DIM_BEFORE_SLEEP 0xd3u
/* Only these four tags are valid. Physical and remote key events reset the
 * independent idle timer. Background BLE/NFC traffic only feeds standby. */
#define LCD_DIM_IDLE_5   0xd4u
#define LCD_DIM_IDLE_15  0xd5u
#define LCD_DIM_IDLE_30  0xd6u
bool settings_get_lcd_dim(void) {
    uint8_t mode = m_settings_data.backlight;
    return mode >= LCD_DIM_BEFORE_SLEEP && mode <= LCD_DIM_IDLE_30;
}
uint8_t settings_lcd_dim_idle_seconds(void) {
    switch (m_settings_data.backlight) {
    case LCD_DIM_IDLE_5:  return 5;
    case LCD_DIM_IDLE_15: return 15;
    case LCD_DIM_IDLE_30: return 30;
    default:              return 0;
    }
}
void settings_cycle_lcd_dim(void) {
    edited_fields |= UINT32_C(1) << offsetof(settings_data_t, backlight);
    if (!settings_get_lcd_dim()) m_settings_data.backlight = LCD_DIM_IDLE_5;
    else if (m_settings_data.backlight == LCD_DIM_BEFORE_SLEEP) m_settings_data.backlight = 0;
    else if (m_settings_data.backlight == LCD_DIM_IDLE_30) m_settings_data.backlight = LCD_DIM_BEFORE_SLEEP;
    else ++m_settings_data.backlight;
}

#define BOOL_VALIDATE(expr, default_val)                                                                               \
    do {                                                                                                             \
        unsigned char *raw_bool = (unsigned char *)&(expr);                                                           \
        if (*raw_bool > 1) {                                                                                         \
            *raw_bool = (default_val) ? 1 : 0;                                                                       \
        }                                                                                                           \
    } while (0)
#define INT8_VALIDATE(expr, min, max, default_val)                                                                     \
    if ((expr) < (min) || (expr) > (max)) {                                                                            \
        (expr) = (default_val);                                                                                        \
    }

static void validate_settings() {
    if (m_settings_data.sleep_timeout_sec > 180) {
        m_settings_data.sleep_timeout_sec = 30;
    }

    if (m_settings_data.amiibo_link_ver != BLE_AMIIBOLINK_VER_V1 &&
        m_settings_data.amiibo_link_ver != BLE_AMIIBOLINK_VER_V2 && m_settings_data.amiibo_link_ver != BLE_AMILOOP) {
        m_settings_data.amiibo_link_ver = BLE_AMIIBOLINK_VER_V1;
    }

    BOOL_VALIDATE(m_settings_data.dirty, 0);
    BOOL_VALIDATE(m_settings_data.skip_driver_select, 0);
    BOOL_VALIDATE(m_settings_data.show_mem_usage, 0);
    BOOL_VALIDATE(m_settings_data.hibernate_enabled, 0);
    BOOL_VALIDATE(m_settings_data.bat_mode, 0);
    BOOL_VALIDATE(m_settings_data.auto_gen_amiibo, 0);
    BOOL_VALIDATE(m_settings_data.auto_gen_amiibolink, 0);
    if (m_settings_data.backlight > 1 && !settings_get_lcd_dim()) m_settings_data.backlight = 0;
    INT8_VALIDATE(m_settings_data.lcd_backlight, 0, 100, 0);
    INT8_VALIDATE(m_settings_data.oled_contrast, 0, 100, 80);
    /* Observed legacy value 03 was displayed as ON but could never toggle OFF.
     * Preserve that visible preference while restoring a canonical bool. */
    unsigned char *animation = (unsigned char *)&m_settings_data.anim_enabled;
    if (*animation == 3) {
        *animation = 1;
    }
    BOOL_VALIDATE(m_settings_data.anim_enabled, 0);
    BOOL_VALIDATE(m_settings_data.qrcode_enabled, 0);
    INT8_VALIDATE(m_settings_data.language, 0, LANGUAGE_COUNT - 1, LANGUAGE_DE_DE);
    INT8_VALIDATE(m_settings_data.amiidb_data_slot_num, 1, 50, 20);
    INT8_VALIDATE(m_settings_data.chameleon_slot_num, 8, 50, 8);
    if (m_settings_data.chameleon_default_slot_index >= m_settings_data.chameleon_slot_num) {
        m_settings_data.chameleon_default_slot_index = INVALID_SLOT_INDEX;
    }
    INT8_VALIDATE(m_settings_data.amiidb_sort_column, AMIIDB_SORT_COLUMN_DEFAULT, AMIIDB_SORT_COLUMN_NAME,
                  AMIIDB_SORT_COLUMN_DEFAULT);
    
    // Validate amiibolink_mode: 0 = not set, 1-4 are valid modes
    if (m_settings_data.amiibolink_mode != 0 && 
        m_settings_data.amiibolink_mode != BLE_AMIIBOLINK_MODE_RANDOM &&
        m_settings_data.amiibolink_mode != BLE_AMIIBOLINK_MODE_CYCLE &&
        m_settings_data.amiibolink_mode != BLE_AMIIBOLINK_MODE_NTAG &&
        m_settings_data.amiibolink_mode != BLE_AMIIBOLINK_MODE_RANDOM_AUTO_GEN) {
        m_settings_data.amiibolink_mode = 0; // Reset to "not set" if invalid
    }

    BOOL_VALIDATE(m_settings_data.no_sleep_mode, 0);
    BOOL_VALIDATE(m_settings_data.flip_display, 0);
    BOOL_VALIDATE(m_settings_data.swap_buttons, 0);
}

static void settings_apply_record(const unsigned char *raw, size_t length) {
    memcpy(&m_settings_data, &def_settings_data, sizeof(m_settings_data));
    if (length == LEGACY_SETTINGS_SIZE) {
        /* Stock 2.16 has trailing padding at byte 23. It must not become the
         * newly introduced no-sleep flag. DE1/DE2 use the 26-byte layout. */
        memcpy(&m_settings_data, raw, offsetof(settings_data_t, no_sleep_mode));
        if (m_settings_data.backlight > 1) m_settings_data.backlight = 0;
    } else {
        memcpy(&m_settings_data, raw, sizeof(settings_data_t));
    }

    validate_settings();
    settings_remember_chameleon();
}

/* Explicit choices override the recovered file even when equal to a default.
 * Also preserve non-default RAM edits made by existing callers of settings_get_data.
 * Padding and unedited flags retain their values from the recovered file. */
static void settings_merge_initial_edits(const settings_data_t *pending) {
    const uint8_t *edits = (const uint8_t *)pending;
    const uint8_t *defaults = (const uint8_t *)&def_settings_data;
    uint8_t *merged = (uint8_t *)&m_settings_data;
    for (size_t i = 0; i < sizeof(*pending); i++) {
        if (i > offsetof(settings_data_t, chameleon_default_slot_index) &&
            i < offsetof(settings_data_t, amiidb_sort_column)) continue;
        if ((edited_fields & (UINT32_C(1) << i)) || edits[i] != defaults[i]) merged[i] = edits[i];
    }
    uint16_t changed = edited_apps | (pending->app_enable_bits ^ def_settings_data.app_enable_bits);
    m_settings_data.app_enable_bits = (m_settings_data.app_enable_bits & ~changed) |
                                      (pending->app_enable_bits & changed);
    validate_settings();
}

/* Only the first verified read after a missing or unavailable startup file
 * adopts a new base. This preserves a restore performed before the first save. */
static int32_t settings_resolve_record(vfs_driver_t *driver, const unsigned char *raw, int32_t length) {
    if (m_settings_save_allowed && !m_settings_file_absent) return NRF_SUCCESS;
    if ((!m_settings_init_attempted && !m_settings_save_allowed) || !driver->stat_file)
        return NRF_ERROR_INVALID_STATE;
    if (length < 0 && length != VFS_ERR_NOOBJ) return length;
    vfs_obj_t object;
    int32_t status = driver->stat_file(SETTINGS_FILE_NAME, &object);
    if (status == VFS_ERR_NOOBJ && length == VFS_ERR_NOOBJ && m_settings_file_absent)
        return NRF_SUCCESS;
    if (status != VFS_OK) return status;
    if (object.type != VFS_TYPE_REG ||
        (length != LEGACY_SETTINGS_SIZE && length != sizeof(settings_data_t)) ||
        (size_t)length != object.size) return NRF_ERROR_INVALID_STATE;

    settings_data_t pending = m_settings_data;
    settings_apply_record(raw, object.size);
    settings_merge_initial_edits(&pending);
    m_settings_file_absent = false;
    m_settings_save_allowed = true;
    if (m_recovered) m_recovered(&pending);
    return NRF_SUCCESS;
}

int32_t settings_retry_load(void) {
    if (m_settings_save_allowed && !m_settings_file_absent) return NRF_SUCCESS;
    vfs_driver_t *driver = vfs_get_default_driver();
    if (!driver || !driver->mounted()) return NRF_ERROR_INVALID_STATE;
#ifdef VFS_PACKED_LFS_ENABLE
    if (vfs_packed_recovery_required()) return NRF_ERROR_INVALID_STATE;
#endif
    int32_t result = vfs_persist_recover(driver);
    if (result != VFS_OK) return result;
    unsigned char raw[sizeof(settings_data_t) + 1];
    result = driver->read_file_data(SETTINGS_FILE_NAME, raw, sizeof(raw));
    return settings_resolve_record(driver, raw, result);
}

int32_t settings_init() {
    settings_clear_edits();
    m_settings_init_attempted = true;
    m_settings_file_absent = false;
    m_settings_save_allowed = false;
    memcpy(&m_settings_data, &def_settings_data, sizeof(settings_data_t));
    settings_remember_chameleon();
    vfs_driver_t *p_driver = vfs_get_default_driver();
    if (p_driver == NULL) {
        return NRF_ERROR_NOT_SUPPORTED;
    }
    int32_t err = 0;
    if (!p_driver->mounted()) {
        err = p_driver->mount();
    }

    if (!p_driver->mounted()) {
        return NRF_ERROR_INVALID_STATE;
    }
    startup_storage_checkpoint(STARTUP_MOUNT_READY);
#ifdef VFS_PACKED_LFS_ENABLE
    if (vfs_packed_recovery_required()) return NRF_ERROR_INVALID_STATE;
#endif
    if (vfs_persist_recover(p_driver) != VFS_OK) {
        return NRF_ERROR_INVALID_STATE;
    }

    startup_storage_checkpoint(STARTUP_JOURNAL_READY);

    /* One extra byte detects oversized files without truncating them into a
     * seemingly valid configuration. Unknown/partial files stay untouched. */
    unsigned char raw[sizeof(settings_data_t) + 1] = {0};
    err = p_driver->read_file_data(SETTINGS_FILE_NAME, raw, sizeof(raw));
    if (err == VFS_ERR_NOOBJ) {
        m_settings_file_absent = true;
        m_settings_save_allowed = true;
        return NRF_SUCCESS;
    }
    if (err != LEGACY_SETTINGS_SIZE && err != sizeof(settings_data_t)) {
        return NRF_ERROR_INVALID_STATE;
    }

    settings_apply_record(raw, (size_t)err);
    m_settings_save_allowed = true;

    NRF_LOG_INFO("settings loaded!");
    return NRF_SUCCESS;
}

int32_t settings_save() {
    vfs_driver_t *p_driver = vfs_get_default_driver();
    int32_t err;

    if (p_driver == NULL) {
        return NRF_ERROR_NOT_SUPPORTED;
    }

    if (!p_driver->mounted()
#ifdef VFS_PACKED_LFS_ENABLE
        || vfs_packed_recovery_required()
#endif
    ) {
        return NRF_ERROR_INVALID_STATE;
    }
    err = vfs_persist_recover(p_driver);
    if (err != VFS_OK) return err;

    unsigned char old_settings_data[sizeof(settings_data_t) + 1] = {0};
    bool needs_write = false;
    bool needs_meta_update = false;

    err = p_driver->read_file_data(SETTINGS_FILE_NAME, old_settings_data, sizeof(old_settings_data));
    int32_t state = settings_resolve_record(p_driver, old_settings_data, err);
    if (state != NRF_SUCCESS) return state;
    validate_settings();
    if (err == VFS_ERR_NOOBJ) {
        needs_write = true;
        needs_meta_update = true;
    } else if (err < 0) {
        NRF_LOG_WARNING("settings read failed (%d), preserving existing file", err);
        return err;
    } else if (err == LEGACY_SETTINGS_SIZE) {
        needs_write = true;
    } else if ((size_t)err != sizeof(settings_data_t)) {
        NRF_LOG_WARNING("unknown settings size (%d), preserving existing file", err);
        return NRF_ERROR_INVALID_STATE;
    } else if (memcmp(&m_settings_data, old_settings_data, sizeof(settings_data_t)) != 0) {
        needs_write = true;
    }

    if (needs_write) {
        uint8_t meta_data[VFS_MAX_META_LEN];
        if (needs_meta_update) {
            vfs_meta_t meta;
            memset(&meta, 0, sizeof(meta));
            meta.has_flags = true;
            meta.flags = VFS_OBJ_FLAG_HIDDEN;

            vfs_meta_encode(meta_data, sizeof(meta_data), &meta);
        }
        err = vfs_persist_write_meta(p_driver, SETTINGS_FILE_NAME, &m_settings_data, sizeof(settings_data_t),
                                     needs_meta_update ? meta_data : NULL);
        if (err != sizeof(settings_data_t)) {
            return err < 0 ? err : NRF_ERROR_INVALID_STATE;
        }

        NRF_LOG_INFO("settings saved!");
    }

    m_settings_file_absent = false;
    settings_remember_chameleon();
    return NRF_SUCCESS;
}

settings_data_t *settings_get_data() { return &m_settings_data; }

int32_t settings_reset() {
    vfs_driver_t *p_driver = vfs_get_default_driver();
    if (p_driver == NULL || !p_driver->mounted()) {
        return NRF_ERROR_INVALID_STATE;
    }
    int32_t err = p_driver->remove_file(SETTINGS_FILE_NAME);
    if (err != VFS_OK && err != VFS_ERR_NOOBJ) {
        return NRF_ERROR_INVALID_STATE;
    }
    settings_clear_edits();
    memcpy(&m_settings_data, &def_settings_data, sizeof(settings_data_t));
    settings_remember_chameleon();
    m_settings_file_absent = true;
    m_settings_save_allowed = true;
    return NRF_SUCCESS;
}
