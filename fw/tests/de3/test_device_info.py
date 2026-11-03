"""Compile actual read-only metadata/UI code against bounded Nordic register stubs.

The metadata test also needs the unmodified S112 7.2.0 HEX from Nordic's
nRF5 SDK 17.1.0. Set NRF5_SDK_PATH (or the build's NRF52_SDK_ROOT) to the SDK
root. No SDK or firmware binary is downloaded or redistributed by this test.
"""
from pathlib import Path
import hashlib
import importlib.util
import os
import struct
import tempfile
import unittest
from unittest.mock import patch

FW = Path(__file__).resolve().parents[2]
SCENE = FW / "application/src/app/settings/scene"
spec = importlib.util.spec_from_file_location("de2_native", FW / "tests/de2/test_player_v3.py")
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)

S112_IMAGE = Path("components/softdevice/s112/hex/s112_nrf52_7.2.0_softdevice.hex")
# Identical in Nordic SDK 17.1.0 and the digest-pinned image in tools/build_lcd.py.
S112_SHA256 = "6024130cbe5b89e5f108951b7f65374c2bb1aabb57049cdf9b4bcab4ce3e80e4"


def load_s112_fixture():
    sdk = os.environ.get("NRF5_SDK_PATH") or os.environ.get("NRF52_SDK_ROOT")
    root = Path(sdk) if sdk else FW / "components/chameleon-ultra/firmware/nrf52_sdk"
    image = root / S112_IMAGE
    if not image.is_file():
        raise FileNotFoundError(
            f"Nordic S112 7.2.0 test fixture is missing: {image}. "
            "Set NRF5_SDK_PATH or NRF52_SDK_ROOT to an unpacked nRF5 SDK 17.1.0 root."
        )
    data = image.read_bytes()
    if hashlib.sha256(data).hexdigest() != S112_SHA256:
        raise ValueError(f"Nordic S112 7.2.0 test fixture SHA-256 mismatch: {image}")
    return data

REGISTERS = r'''
#pragma once
#include <stdint.h>
#include <assert.h>
typedef struct { uint32_t CODEPAGESIZE, CODESIZE; struct { uint32_t PART; } INFO; } test_ficr_t;
static test_ficr_t ficr;
#define NRF_FICR (&ficr)
static uint32_t info_size, sd_size, sd_variant, sd_version, sd_magic;
static uint16_t sd_fwid;
static unsigned reads[6];
static uint32_t read_field(unsigned field) {
    /* Fail the host test if any metadata is read before its fixed address fits. */
    assert(ficr.CODEPAGESIZE && ficr.CODESIZE);
    assert((uint64_t)ficr.CODEPAGESIZE * ficr.CODESIZE >= 0x3018);
    reads[field]++;
    if (field > 0) assert(info_size >= 0x18);
    switch (field) {
    case 0: return info_size;
    case 1: return sd_magic;
    case 2: return sd_size;
    case 3: return sd_variant;
    case 4: return sd_version;
    default: return sd_fwid;
    }
}
'''
SDM = r'''
#pragma once
#define SOFTDEVICE_INFO_STRUCT_OFFSET 0x2000u
#define SOFTDEVICE_INFO_STRUCT_ADDRESS (MBR_SIZE + SOFTDEVICE_INFO_STRUCT_OFFSET)
#define SD_VERSION_OFFSET (SOFTDEVICE_INFO_STRUCT_OFFSET + 0x14u)
/* Deliberately different from the mocked installed version: code must not use them. */
#define SD_VERSION 8009004u
#define SD_VARIANT_ID 140u
#define SD_INFO_STRUCT_SIZE_GET(base) (assert((base) == MBR_SIZE), read_field(0))
#define SD_SIZE_GET(base) (assert((base) == MBR_SIZE), read_field(2))
#define SD_ID_GET(base) (assert((base) == MBR_SIZE), read_field(3))
#define SD_VERSION_GET(base) (assert((base) == MBR_SIZE), read_field(4))
#define SD_FWID_GET(base) (assert((base) == MBR_SIZE), read_field(5))
'''
SETUP = r'''
#include <string.h>
#include "settings_device_info.h"
static void setup(void) {
    ficr.CODEPAGESIZE = 4096; ficr.CODESIZE = 128; ficr.INFO.PART = 0x52832;
    info_size = 0x2c; sd_size = 0x19000; sd_variant = 112;
    sd_version = 7002000; sd_fwid = 0x0103; sd_magic = 0x51b1e5db;
    memset(reads, 0, sizeof(reads));
}
'''


class DeviceInfoTests(native.NativeTests):
    test_real_player_format_and_resource_lifecycle = None
    test_real_central_v3_guard_preserves_destination_and_classic_path = None
    test_real_favorite_sort_null_folder_data_and_antisymmetry = None
    test_real_ui_generation_never_emulates_failed_or_unsupported_tag = None
    test_real_large_category_navigation_matches_visible_100_items = None

    def run_info(self, source):
        self.compile_run(source, {
            "nrf.h": REGISTERS,
            "nrf_mbr.h": "#pragma once\n#define MBR_SIZE 0x1000u\n",
            "nrf_sdm.h": SDM,
            "nrf_bootloader_info.h": "#pragma once\n#define SD_PRESENT (read_field(1) == 0x51b1e5dbu)\n",
        }, [SCENE])

    def test_actual_metadata_validation_formatting_and_buffer_bounds(self):
        self.run_info(SETUP + r'''
static void assert_rejected(void) {
    settings_softdevice_info_t info = {140, 8009004, 0x4321};
    assert(!settings_device_info_read_softdevice(&info));
    assert(info.variant == 0 && info.version == 0 && info.fwid == 0);
}
int main(void) {
    settings_softdevice_info_t info; char text[32];
    setup(); assert(!settings_device_info_read_softdevice(NULL));
    assert(settings_device_info_read_softdevice(&info));
    assert(info.variant == 112 && info.version == 7002000 && info.fwid == 0x0103);
    settings_device_info_format_softdevice(text, sizeof(text), &info);
    assert(!strcmp(text, "[S112 7.2.0]"));
    sd_version = 7003000; sd_fwid = 0x0123;
    assert(settings_device_info_read_softdevice(&info));
    settings_device_info_format_softdevice(text, sizeof(text), &info);
    assert(!strcmp(text, "[S112 7.3.0]"));
    settings_device_info_format_chip(text, sizeof(text), ficr.INFO.PART);
    assert(!strcmp(text, "[nRF52832]"));
    settings_device_info_format_chip(text, sizeof(text), UINT32_MAX);
    assert(!strcmp(text, "[0xFFFFFFFF]"));
    setup(); ficr.CODEPAGESIZE = 0; assert_rejected(); assert(!reads[0]);
    setup(); ficr.CODESIZE = 0; assert_rejected(); assert(!reads[0]);
    setup(); ficr.CODEPAGESIZE = UINT32_MAX; assert_rejected(); assert(!reads[0]);
    setup(); ficr.CODESIZE = 3; assert_rejected(); assert(!reads[0]);
    setup(); info_size = 0x17; assert_rejected(); assert(reads[0] == 1 && !reads[1]);
    setup(); ficr.CODESIZE = 4; info_size = 255; sd_size = 0x5000; assert_rejected();
    setup(); sd_magic = UINT32_MAX; assert_rejected(); assert(!reads[2]);
    setup(); sd_size = 0x2000; assert_rejected(); assert(!reads[3]);
    setup(); sd_size = UINT32_MAX; assert_rejected(); assert(!reads[3]);
    setup(); sd_variant = UINT32_MAX; assert_rejected(); assert(!reads[4]);
    setup(); sd_variant = 111; assert_rejected(); assert(!reads[4]);
    setup(); sd_version = 0; assert_rejected();
    setup(); sd_version = UINT32_MAX; assert_rejected();
    setup(); sd_fwid = 0; assert_rejected();
    setup(); sd_fwid = UINT16_MAX; assert_rejected();
    setup(); info_size = 0x18; assert(settings_device_info_read_softdevice(&info));
    setup(); sd_size = 0x3000 + info_size; assert(settings_device_info_read_softdevice(&info));
    setup(); sd_size = 0x3000 + info_size - 1; assert_rejected();
    setup(); sd_size = 0x80000; assert(settings_device_info_read_softdevice(&info));
    setup(); sd_size = 0x80001; assert_rejected();
    setup();
    unsigned variants[] = {112, 113, 122, 132, 140};
    for (unsigned i = 0; i < sizeof(variants)/sizeof(variants[0]); ++i) {
        sd_variant = variants[i]; assert(settings_device_info_read_softdevice(&info));
        assert(info.variant == variants[i]);
    }
    char long_value[512]; memset(long_value, 'x', sizeof(long_value)); long_value[511] = 0;
    settings_device_info_format_text(text, sizeof(text), long_value);
    assert(strlen(text) == 31 && text[0] == '[' && text[30] == ']');
    settings_device_info_format_text(text, sizeof(text), NULL); assert(!strcmp(text, "[?]"));
    for (unsigned n = 0; n <= 32; ++n) {
        unsigned char guarded[36]; memset(guarded, 0xa5, sizeof(guarded));
        settings_device_info_format_text((char*)guarded+2, n, long_value);
        assert(guarded[0] == 0xa5 && guarded[1] == 0xa5 && guarded[n+2] == 0xa5);
        if (n) assert(memchr(guarded+2, 0, n));
        memset(guarded, 0xa5, sizeof(guarded));
        settings_device_info_format_softdevice((char*)guarded+2, n, &info);
        assert(guarded[0] == 0xa5 && guarded[1] == 0xa5 && guarded[n+2] == 0xa5);
        if (n) assert(memchr(guarded+2, 0, n));
        memset(guarded, 0xa5, sizeof(guarded));
        settings_device_info_format_chip((char*)guarded+2, n, UINT32_MAX);
        assert(guarded[0] == 0xa5 && guarded[1] == 0xa5 && guarded[n+2] == 0xa5);
        if (n) assert(memchr(guarded+2, 0, n));
    }
    settings_device_info_format_text(NULL, 10, "x");
    settings_device_info_format_softdevice(NULL, 10, &info);
    settings_device_info_format_chip(NULL, 10, 0x52832);
    puts("PASS: installed metadata, malformed/erased metadata, fixed-address bounds and bounded strings");
    return 0;
}
''')

    def test_nordic_supplied_s112_metadata_matches_readout(self):
        image = load_s112_fixture()
        memory = {}
        base = 0
        for line in image.decode("ascii").splitlines():
            record = bytes.fromhex(line[1:])
            self.assertEqual(sum(record) & 255, 0)
            size, address, kind = record[0], int.from_bytes(record[1:3], "big"), record[3]
            data = record[4:4+size]
            if kind == 4:
                base = int.from_bytes(data, "big") << 16
            elif kind == 0:
                memory.update({base+address+i: value for i, value in enumerate(data)})
        raw = bytes(memory[i] for i in range(0x3000, 0x3018))
        info_len = raw[0]
        magic, image_size = struct.unpack_from("<II", raw, 4)
        fwid = struct.unpack_from("<H", raw, 12)[0]
        variant, version = struct.unpack_from("<II", raw, 16)
        self.assertEqual((info_len, magic, image_size, fwid, variant, version),
                         (44, 0x51B1E5DB, 0x19000, 0x0103, 112, 7002000))
        self.run_info(SETUP + f'''
int main(void) {{
    setup(); info_size={info_len}u; sd_magic={magic}u; sd_size={image_size}u;
    sd_fwid={fwid}u; sd_variant={variant}u; sd_version={version}u;
    settings_softdevice_info_t info; char text[32];
    assert(settings_device_info_read_softdevice(&info));
    settings_device_info_format_softdevice(text, sizeof(text), &info);
    assert(!strcmp(text, "[S112 7.2.0]") && info.fwid == 0x0103);
    puts("PASS: Nordic supplied S112 7.2.0 metadata readout"); return 0;
}}
''')

    def test_missing_or_wrong_sdk_fixture_is_not_silently_skipped(self):
        with tempfile.TemporaryDirectory(prefix="pixl-sdk-fixture-") as tmp:
            root = Path(tmp)
            with patch.dict(os.environ, {"NRF5_SDK_PATH": str(root)}):
                with self.assertRaisesRegex(FileNotFoundError, "Set NRF5_SDK_PATH"):
                    load_s112_fixture()
                image = root / S112_IMAGE
                image.parent.mkdir(parents=True)
                image.write_bytes(b":00000001FF\n")  # valid EOF, wrong/empty image
                with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                    load_s112_fixture()

    def test_actual_version_scene_uses_detected_metadata_and_unknown_fallback(self):
        src = (SCENE / "settings_scene_version.c").read_text()
        self.assertNotIn("sprintf(", src)
        selected = native.function(src, "settings_scene_version_list_view_on_selected")
        enter = native.function(src, "settings_scene_version_on_enter")
        leave = native.function(src, "settings_scene_version_on_exit")
        self.run_info(SETUP + r'''
#define LCD_SCREEN
#define LCD_ST7567
#define _T(x) #x
#define _L_BACK 0
#define SETTINGS_VIEW_ID_MAIN 1
typedef int mui_list_view_event_t;
typedef struct { void *user_data; } mui_list_view_t;
typedef struct { void *user_data; } mui_list_item_t;
typedef struct { mui_list_view_t *p_list_view; void *p_scene_dispatcher, *p_view_dispatcher; } app_settings_t;
static char labels[12][40], values[12][32];
static unsigned items, cleared, back, switched;
static char long_value[512];
static const char *version_get_version(void *p) { (void)p; return "2.21.0-DE3.9"; }
static const char *version_get_builddate(void *p) { (void)p; return "2026-10-21"; }
static const char *version_get_githash(void *p) { (void)p; return NULL; }
static const char *version_get_gitbranch(void *p) { (void)p; return long_value; }
static unsigned version_get_target(void *p) { (void)p; return 52; }
static unsigned version_get_dirty_flag(void *p) { (void)p; return 1; }
static const char *getLangString(unsigned x) { (void)x; return "Back"; }
static void mui_list_view_add_item_ext(void *p, unsigned icon, const char *label, const char *value, void *arg) {
    (void)p; (void)icon; (void)arg; assert(items < 12 && strlen(value) < 32);
    snprintf(labels[items], 40, "%s", label); snprintf(values[items], 32, "%s", value); items++;
}
static void mui_list_view_add_item(void *p, unsigned icon, const char *label, void *arg) {
    mui_list_view_add_item_ext(p, icon, label, "", arg);
}
static void mui_scene_dispatcher_previous_scene(void *p) { (void)p; back++; }
static void mui_list_view_set_selected_cb(void *p, void (*cb)(int,mui_list_view_t*,mui_list_item_t*)) { (void)p; (void)cb; }
static void mui_view_dispatcher_switch_to_view(void *p, unsigned id) { (void)p; assert(id == 1); switched++; }
static void mui_list_view_clear_items(void *p) { (void)p; items = 0; cleared++; }
''' + selected + '\n' + enter + '\n' + leave + r'''
int main(void) {
    setup(); memset(long_value, 'x', sizeof(long_value)); long_value[511] = 0;
    mui_list_view_t list = {0}; app_settings_t app = {&list, 0, 0}; list.user_data = &app;
    settings_scene_version_on_enter(&app);
    assert(items == 10 && switched == 1);
    assert(!strcmp(values[0], "[2.21.0-DE3.9]"));
    assert(!strcmp(values[2], "[?]")); assert(strlen(values[3]) == 31 && values[3][30] == ']');
    assert(!strcmp(labels[4], "DE39_INFO_BUILD_TARGET") && !strcmp(values[4], "[LCD/ST7567]"));
    assert(!strcmp(values[5], "[nRF52832]")); assert(!strcmp(values[6], "[S112 7.2.0]"));
    assert(!strcmp(values[7], "[0x0103]"));
    settings_scene_version_list_view_on_selected(0, &list, NULL); assert(back == 1);
    settings_scene_version_on_exit(&app); assert(cleared == 1 && items == 0);
    sd_magic = UINT32_MAX; settings_scene_version_on_enter(&app);
    assert(!strcmp(values[6], "[DE39_INFO_UNKNOWN]") && !strcmp(values[7], "[DE39_INFO_UNKNOWN]"));
    settings_scene_version_on_exit(&app); assert(cleared == 2 && items == 0);
    puts("PASS: actual version scene, build/detected separation, unknown fallback and scene cleanup");
    return 0;
}
''')


if __name__ == "__main__":
    unittest.main()
