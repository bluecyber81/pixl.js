/* Synthetic LCD card files through the same FDS, settings, PackedFS and
 * LittleFS code as the firmware. Only the board HAL/allocator are simulated. */
#define main packed_storage_contract
#include "packed_vfs_persistence_de344.c"
#undef main
#include "settings.h"
#include "fds_util.h"
#include "fds_ids.h"
#include "tag_helper.h"

vfs_driver_t *vfs_get_default_driver(void) { return driver(); }
bool vfs_packed_recovery_required(void) { return false; }

typedef int (*nor_read_fn)(const struct lfs_config *, lfs_block_t, lfs_off_t, void *, lfs_size_t);
static nor_read_fn physical_read;

/* Model controllers that already transferred bytes before reporting an I/O error. */
static int partial_once(const struct lfs_config *cfg, lfs_block_t block,
                        lfs_off_t off, void *buffer, lfs_size_t size) {
    (void)cfg; (void)block; (void)off;
    memset(buffer, 0xa5, size < 37 ? size : 37);
    media.config.read = physical_read;
    return LFS_ERR_IO;
}

static int unavailable(const struct lfs_config *cfg, lfs_block_t block,
                       lfs_off_t off, void *buffer, lfs_size_t size) {
    (void)cfg; (void)block; (void)off; (void)buffer; (void)size;
    return LFS_ERR_IO;
}

void check_packed_settings_recovery(void);

int main(void) {
    const uint16_t card_id = FDS_SLOT_TAG_DUMP_FILE_ID_BASE;
    const uint16_t config_id = FDS_EMULATION_CONFIG_FILE_ID;
    const uint16_t key = FDS_EMULATION_CONFIG_RECORD_KEY;
    uint8_t card[594], edited[594], loaded[594];
    tag_slot_config_t config = { .version = TAG_SLOT_CONFIG_CURRENT_VERSION };
    config.slots[0].enabled_hf = true;
    config.slots[0].tag_hf = TAG_TYPE_MIFARE_Mini;
    for (size_t i = 0; i < sizeof(card); ++i) card[i] = (uint8_t)(3 * i + 7);
    memcpy(edited, card, sizeof(edited));
    edited[sizeof(edited) - 1] ^= 1;

    baseline();
    reset_baseline();
    REQUIRE(driver()->create_dir("/chameleon") == VFS_OK);
    REQUIRE(driver()->create_dir("/chameleon/slots") == VFS_OK);
    REQUIRE(settings_init() == 0 && settings_get_data()->chameleon_slot_num == 8);
    settings_get_data()->lcd_backlight = 42;
    REQUIRE(settings_save() == 0);
    REQUIRE(fds_write_sync(config_id, key, sizeof(config), &config));
    REQUIRE(fds_write_sync(card_id, TAG_SENSE_HF, sizeof(card), card));
    drop();
    REQUIRE(driver()->mount() == VFS_OK && settings_init() == 0);
    tag_slot_config_t restored;
    REQUIRE(fds_read_config((uint8_t *)&restored, sizeof(restored)) == 68);
    REQUIRE(memcmp(&restored, &config, 68) == 0);
    uint16_t size = sizeof(loaded);
    REQUIRE(fds_read_sync(card_id, TAG_SENSE_HF, &size, loaded));
    REQUIRE(size == sizeof(card) && memcmp(card, loaded, size) == 0);
    REQUIRE(fds_compare_sync(card_id, TAG_SENSE_HF, size, card) == 1);
    REQUIRE(fds_compare_sync(config_id, key, sizeof(config), (uint8_t *)&config) == 1);
    REQUIRE(fds_compare_sync(card_id, TAG_SENSE_HF, size, edited) == 0);

    /* One missed read must report failure, leave no handle open and allow an
     * immediate repeat to compare the same two bytestrings correctly. */
    read_fail_at = read_calls + 1;
    REQUIRE(fds_compare_sync(card_id, TAG_SENSE_HF, size, card) < 0);
    read_fail_at = 0;
    REQUIRE(vfs_packed_handles_idle());
    REQUIRE(fds_compare_sync(card_id, TAG_SENSE_HF, size, card) == 1);

    /* Prime the cache with a different record. Partial bytes returned alongside
     * an error must never masquerade as the next valid card page. */
    REQUIRE(fds_compare_sync(config_id, key, sizeof(config), (uint8_t *)&config) == 1);
    physical_read = media.config.read;
    unsigned writes_before = media.stats.event_count;
    media.config.read = partial_once;
    REQUIRE(fds_compare_sync(card_id, TAG_SENSE_HF, size, card) < 0);
    REQUIRE(media.config.read == physical_read);
    REQUIRE(fds_compare_sync(card_id, TAG_SENSE_HF, size, card) == 1);
    REQUIRE(media.stats.event_count == writes_before);

    /* With reads unavailable, multiple requests must fail and leave the
     * previously successful card/config/settings values intact on remount. */
    media.config.read = unavailable;
    settings_get_data()->chameleon_default_slot_index = 0;
    for (unsigned attempt = 0; attempt < 2; ++attempt) {
        REQUIRE(!fds_write_sync(card_id, TAG_SENSE_HF, size, edited));
        REQUIRE(settings_save() != 0);
        REQUIRE(vfs_packed_handles_idle());
    }
    media.config.read = physical_read;
    drop();
    REQUIRE(driver()->mount() == VFS_OK && settings_init() == 0);
    REQUIRE(settings_get_data()->chameleon_default_slot_index == INVALID_SLOT_INDEX);
    REQUIRE(fds_compare_sync(card_id, TAG_SENSE_HF, size, card) == 1);
    REQUIRE(fds_compare_sync(config_id, key, sizeof(config), (uint8_t *)&config) == 1);

    REQUIRE(fds_write_sync(card_id, TAG_SENSE_HF, size, edited));
    settings_get_data()->chameleon_default_slot_index = 0;
    REQUIRE(settings_save() == 0);
    drop();
    REQUIRE(driver()->mount() == VFS_OK && settings_init() == 0);
    REQUIRE(settings_get_data()->chameleon_default_slot_index == 0);
    REQUIRE(fds_compare_sync(card_id, TAG_SENSE_HF, size, edited) == 1);
    REQUIRE(fds_compare_sync(config_id, key, sizeof(config), (uint8_t *)&config) == 1);
    /* A boot-time media read error temporarily leaves defaults in RAM. Once
     * the real settings can be verified, retry only the user's pending change. */
    drop();
    REQUIRE(driver()->mount() == VFS_OK);
    media.config.read = unavailable;
    REQUIRE(settings_init() != 0);
    REQUIRE(settings_get_data()->lcd_backlight != 42);
    settings_get_data()->chameleon_default_slot_index = 1;
    REQUIRE(settings_save() != 0);
    media.config.read = physical_read;
    REQUIRE(settings_save() == 0);
    drop();
    REQUIRE(driver()->mount() == VFS_OK && settings_init() == 0);
    REQUIRE(settings_get_data()->lcd_backlight == 42);
    REQUIRE(settings_get_data()->chameleon_default_slot_index == 1);
    REQUIRE(fds_compare_sync(card_id, TAG_SENSE_HF, size, edited) == 1);
    drop();
    check_packed_settings_recovery();
    puts("PASS Chameleon PackedFS: 594-byte card, shortened config, settings, I/O retry and remount");
    return 0;
}

/* Start a new simulated boot with a valid 26-byte record still on NOR. */
static settings_data_t start_with_unavailable_settings(void) {
    baseline();
    reset_baseline();
    REQUIRE(settings_init() == 0);
    settings_data_t *settings = settings_get_data();
    settings->anim_enabled = true;
    settings->sleep_timeout_sec = 180;
    settings->language = LANGUAGE_EN_US;
    settings->app_enable_bits &= ~((1u << 2) | (1u << 7));
    settings->lcd_backlight = 42;
    REQUIRE(settings_save() == 0);
    settings_data_t stored;
    REQUIRE(driver()->read_file_data("/settings.bin", &stored, sizeof(stored)) == 26);
    drop();
    REQUIRE(driver()->mount() == VFS_OK);
    physical_read = media.config.read;
    media.config.read = unavailable;
    REQUIRE(settings_init() != 0);
    REQUIRE(!settings->anim_enabled && settings->sleep_timeout_sec == 30);
    REQUIRE(settings->language == LANGUAGE_DE_DE && settings->app_enable_bits == 0xffff);
    return stored;
}

static void check_stored_settings(const settings_data_t *expected) {
    settings_data_t actual;
    vfs_obj_t object;
    REQUIRE(driver()->stat_file("/settings.bin", &object) == VFS_OK && object.size == 26);
    REQUIRE(driver()->read_file_data("/settings.bin", &actual, sizeof(actual)) == 26);
    REQUIRE(memcmp(&actual, expected, sizeof(actual)) == 0);
}

static void check_explicit_defaults(void) {
    settings_data_t stored = start_with_unavailable_settings();
    /* These are the same edit APIs exercised by the settings UI. The second
     * app's bit and the saved language are controls that the user never edits. */
    SETTINGS_TOGGLE(anim_enabled);
    SETTINGS_TOGGLE(anim_enabled);
    SETTINGS_SET(sleep_timeout_sec, 60);
    SETTINGS_SET(sleep_timeout_sec, 30);
    settings_toggle_app(2);
    settings_toggle_app(2);
    SETTINGS_SET(lcd_backlight, 55);
    REQUIRE(settings_save() != 0);
    media.config.read = physical_read;

    /* Force an actual failed publication after the late read and merge. */
    nor_arm(&media, NOR_RETURN_IO_BEFORE, 1, NULL);
    REQUIRE(settings_save() != 0 && media.fault_triggered);
    nor_disarm(&media);
    drop();
    REQUIRE(driver()->mount() == VFS_OK);
    check_stored_settings(&stored);

    settings_data_t expected;
    memcpy(&expected, &stored, sizeof(expected));
    expected.anim_enabled = false;
    expected.sleep_timeout_sec = 30;
    expected.app_enable_bits |= 1u << 2;
    expected.lcd_backlight = 55;
    REQUIRE(settings_save() == 0);
    drop();
    REQUIRE(driver()->mount() == VFS_OK && settings_init() == 0);
    check_stored_settings(&expected);
    REQUIRE(memcmp(settings_get_data(), &expected, sizeof(expected)) == 0);
    drop();
}

static unsigned recovery_calls;
static void observe_recovery(const settings_data_t *previous) {
    REQUIRE(previous->language == LANGUAGE_DE_DE && previous->sleep_timeout_sec == 30);
    const settings_data_t *current = settings_get_data();
    REQUIRE(current->language == LANGUAGE_EN_US && current->sleep_timeout_sec == 180);
    ++recovery_calls;
}

static void check_late_preferences(bool recover_via_save) {
    settings_data_t stored = start_with_unavailable_settings();
    recovery_calls = 0;
    settings_on_recovered(observe_recovery);
    REQUIRE(settings_retry_load() != 0 && recovery_calls == 0);
    media.config.read = physical_read;
    nor_reset_observation(&media);
    REQUIRE((recover_via_save ? settings_save() : settings_retry_load()) == 0);
    REQUIRE(recovery_calls == 1);
    REQUIRE(settings_get_data()->language == LANGUAGE_EN_US);
    REQUIRE(settings_get_data()->sleep_timeout_sec == 180);
    REQUIRE(settings_save() == 0 && settings_retry_load() == 0 && recovery_calls == 1);
    REQUIRE(media.stats.programs == 0 && media.stats.erases == 0);
    settings_on_recovered(NULL);
    drop();
    REQUIRE(driver()->mount() == VFS_OK && settings_init() == 0);
    check_stored_settings(&stored);
    drop();
}

void check_packed_settings_recovery(void) {
    check_explicit_defaults();
    check_late_preferences(false);
    check_late_preferences(true);
    puts("PASS explicit defaults and individual app bit after failed write and remount");
    puts("PASS verified EN/180 delivered on late load via save and retry; unchanged 26-byte record");
}
