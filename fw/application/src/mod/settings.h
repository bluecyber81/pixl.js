#ifndef SETTINGS_H
#define SETTINGS_H

#include <stddef.h>
#include <stdbool.h>
#include <stdint.h>

#include "app_amiibolink.h"
#include "i18n/language.h"

#define INVALID_SLOT_INDEX 0xFF
#define AMIIDB_SORT_COLUMN_DEFAULT 0
#define AMIIDB_SORT_COLUMN_NAME 1

typedef struct {
    uint8_t backlight; // legacy 0/1 = no idle dimming; explicit LCD opt-in uses a distinct tag
    uint8_t sleep_timeout_sec;
    bool dirty;
    bool auto_gen_amiibo;
    bool auto_gen_amiibolink; // deprecated, keep for capability issue
    bool skip_driver_select;
    bool bat_mode;
    ble_amiibolink_ver_t amiibo_link_ver;
    bool hibernate_enabled;
    bool show_mem_usage;
    uint8_t lcd_backlight;
    uint8_t oled_contrast;
    bool anim_enabled;
    bool qrcode_enabled;
    Language language;
    uint8_t amiidb_data_slot_num;
    uint8_t chameleon_default_slot_index;
    uint16_t app_enable_bits; // bitmask for app enable status (1: enabled, 0: disabled)
    uint8_t amiidb_sort_column;
    uint8_t chameleon_slot_num; // chameleon available slot count (8-50)
    ble_amiibolink_mode_t amiibolink_mode; // user's preferred AmiiboLink mode (0 = not set, use default)
    bool no_sleep_mode; // don't enter sleep mode while emulating a card (all modes) or in BLE transfer mode
    bool flip_display;  // rotate the UI 180 degrees (for right-handed use)
    bool swap_buttons;  // swap left/right buttons (to match a flipped/rotated device)
} settings_data_t;

/* User edits are remembered in RAM until a verified settings record is available.
 * These fields all have a one-byte on-disk representation. */
void settings_set_byte(uint8_t offset, uint8_t value);
void settings_toggle_byte(uint8_t offset);
void settings_toggle_app(uint32_t app_id);
#define SETTINGS_SET(field, value) settings_set_byte(offsetof(settings_data_t, field), (value))
#define SETTINGS_TOGGLE(field) settings_toggle_byte(offsetof(settings_data_t, field))

/* A checkpoint preserves an older pending choice without confusing startup
 * defaults with a settings record which becomes readable later. */
typedef struct {
    uint32_t save_generation;
    uint8_t value;
    bool edited;
} settings_byte_checkpoint_t;
typedef struct {
    uint32_t save_generation;
    uint32_t edited_fields;
    uint16_t edited_apps;
    settings_data_t values;
} settings_checkpoint_t;
#define SETTINGS_FIELD_MASK(field) (UINT32_C(1) << offsetof(settings_data_t, field))
void settings_checkpoint_byte(uint8_t offset, settings_byte_checkpoint_t *checkpoint);
void settings_discard_byte(uint8_t offset, const settings_byte_checkpoint_t *checkpoint);
void settings_checkpoint(settings_checkpoint_t *checkpoint);
/* Restore only this scope. No reads/writes; unrelated pending edits survive. */
void settings_discard_fields(uint32_t fields, uint16_t apps, const settings_checkpoint_t *checkpoint);
#define SETTINGS_CHECKPOINT(field, checkpoint) settings_checkpoint_byte(offsetof(settings_data_t, field), (checkpoint))
#define SETTINGS_DISCARD(field, checkpoint) settings_discard_byte(offsetof(settings_data_t, field), (checkpoint))

int32_t settings_init();
/* Resolve a temporarily unavailable settings record before using its slot count. */
int32_t settings_retry_load(void);
/* Reapply live preferences after verified late recovery or scoped discard. */
void settings_on_recovered(void (*apply)(const settings_data_t *previous));
int32_t settings_save();
int32_t settings_reset();
/* Restore only the Chameleon fields from the last accepted settings. No I/O. */
void settings_discard_chameleon_changes(void);
bool settings_get_lcd_dim(void);
uint8_t settings_lcd_dim_idle_seconds(void);
void settings_cycle_lcd_dim(void);
settings_data_t *settings_get_data();

#endif