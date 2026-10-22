#include "boards.h"
#if defined(BOARD_LCD) && defined(VFS_SPIFFS_ENABLE)
#include <stdbool.h>
#include <string.h>
#include "vfs_spiffs_diag.h"
#include "spiffs_nucleus.h"
#include "hal_spi_flash.h"
#include "vfs.h"

typedef struct {
    uint16_t object_id, page;
    uint8_t name[SPIFFS_OBJ_NAME_LEN];
} diag_candidate_t;
typedef struct {
    diag_candidate_t candidates[VFS_SPIFFS_DIAG_CANDIDATES];
    uint8_t open_name[SPIFFS_OBJ_NAME_LEN];
    int32_t list_error, open_result, open_error;
    uint32_t hal_error, hal_address, hal_length;
    uint16_t generation, open_generation;
    uint8_t count, total;
    bool list_complete, open_valid, capture_open, hal_failed;
} legacy_diag_state_t;

/* Reuse the legacy diagnostic RAM rather than retaining a second file cache.
 * This prefix includes all 64 raw name bytes, but no user metadata. */
#define TYBALT_HEADER_BYTES offsetof(spiffs_page_object_ix_header, meta)
typedef struct {
    uint16_t object_id, page, captured_generation;
    uint8_t header[TYBALT_HEADER_BYTES];
    int32_t list_error;
    uint8_t matches;
    bool capturing, list_complete, present;
} tybalt_diag_state_t;
typedef struct {
    union {
        legacy_diag_state_t legacy;
        tybalt_diag_state_t tybalt;
    } value;
    uint16_t generation;
    uint8_t selection;
} diag_state_t;
static diag_state_t state;
#define diag state.value.legacy
#define tybalt state.value.tybalt
_Static_assert(sizeof(diag_state_t) <= 240, "diagnostic permanent RAM budget");
_Static_assert(SPIFFS_OBJ_NAME_LEN == 64, "diagnostic wire name size");
_Static_assert(sizeof(spiffs_page_object_ix_header) <= 256, "diagnostic header bound");
_Static_assert(TYBALT_HEADER_BYTES == 77, "schema2 raw header prefix layout");

static const char *tybalt_name(uint8_t selection) {
    if (selection == 1) return "/amiibo/Animal/Welcome/W08 - Tybalt.bin";
    if (selection == 2) return "/amiibo/Animal/Welcome/W08 - TybalT,`i&";
    return NULL;
}

static bool is_directory(const char *dir) {
    return dir && (!strcmp(dir, "/amiibo/Animal/Welcome") || !strcmp(dir, "/amiibo/Animal/Welcome/"));
}
static bool is_target(const uint8_t *name) {
    static const char prefix[] = "/amiibo/Animal/Welcome/";
    static const char suffix[] = " - Sprocket.bin";
    const uint8_t *end = memchr(name, 0, SPIFFS_OBJ_NAME_LEN);
    if (!end) return false;
    size_t len = (size_t)(end - name);
    return len > sizeof(prefix) - 1 + sizeof(suffix) - 1 &&
           !memcmp(name, prefix, sizeof(prefix) - 1) &&
           !memcmp(name + len - (sizeof(suffix) - 1), suffix, sizeof(suffix) - 1) &&
           memchr(name + sizeof(prefix) - 1, '/', len - (sizeof(prefix) - 1)) == NULL;
}
static void put16(uint8_t *out, uint16_t value) { out[0] = value; out[1] = value >> 8; }
static void put32(uint8_t *out, uint32_t value) {
    out[0] = value; out[1] = value >> 8; out[2] = value >> 16; out[3] = value >> 24;
}

void vfs_spiffs_diag_reset(void) { memset(&state, 0, sizeof(state)); }
void vfs_spiffs_diag_list_begin(const char *dir) {
    if (!is_directory(dir)) {
        if (state.selection) tybalt.capturing = false;
        return;
    }
    ++state.generation;
    if (state.selection) {
        memset(&tybalt, 0, sizeof(tybalt));
        tybalt.capturing = true;
        return;
    }
    diag.generation = state.generation;
    diag.count = diag.total = 0; diag.list_complete = false; diag.list_error = 0;
    memset(diag.candidates, 0, sizeof(diag.candidates));
}
void vfs_spiffs_diag_list_entry(const char *dir, const struct spiffs_dirent *entry) {
    if (state.selection) return; /* Raw header hook captures before filtering. */
    if (!is_directory(dir) || !entry || !is_target(entry->name)) return;
    if (diag.total < UINT8_MAX) ++diag.total;
    if (diag.count >= VFS_SPIFFS_DIAG_CANDIDATES) return;
    diag_candidate_t *candidate = &diag.candidates[diag.count++];
    candidate->object_id = entry->obj_id; candidate->page = entry->pix;
    memcpy(candidate->name, entry->name, sizeof(candidate->name));
}
void vfs_spiffs_diag_list_end(const char *dir, int32_t error) {
    if (!is_directory(dir)) return;
    if (state.selection) {
        tybalt.capturing = false; tybalt.list_complete = true; tybalt.list_error = error;
        return;
    }
    diag.list_complete = true; diag.list_error = error;
}
void vfs_spiffs_diag_list_closed(const char *dir) {
    if (state.selection && is_directory(dir)) tybalt.capturing = false;
}
void vfs_spiffs_diag_open_begin(const char *path) {
    if (state.selection) return;
    /* The caller has already validated the C path. Do not scan beyond its NUL. */
    diag.capture_open = false;
    if (!path || strlen(path) >= SPIFFS_OBJ_NAME_LEN) return;
    uint8_t name[SPIFFS_OBJ_NAME_LEN] = {0};
    memcpy(name, path, strlen(path));
    if (!is_target(name)) return;
    memcpy(diag.open_name, name, sizeof(name));
    diag.capture_open = true; diag.open_valid = false; diag.hal_failed = false;
    diag.open_generation = diag.generation;
    diag.hal_error = diag.hal_address = diag.hal_length = 0;
}
void vfs_spiffs_diag_open_end(int32_t result, int32_t error) {
    if (state.selection) return;
    if (!diag.capture_open) return;
    diag.open_result = result; diag.open_error = result < 0 ? error : 0;
    diag.open_valid = true; diag.capture_open = false;
}
void vfs_spiffs_diag_hal_read(uint32_t result, uint32_t address, uint32_t length) {
    if (state.selection) return;
    if (!diag.capture_open || result == 0 || diag.hal_failed) return;
    diag.hal_failed = true; diag.hal_error = result;
    diag.hal_address = address; diag.hal_length = length;
}

/* Called by the real SPIFFS directory visitor immediately after a successful
 * header read. No SPIFFS/cache/HAL operation is performed by this observer. */
void vfs_spiffs_diag_header_observe(spiffs *fs, uint16_t object_id, uint16_t page,
                                  const void *raw_header) {
    if (!fs || !raw_header || !state.selection || !tybalt.capturing) return;
    const spiffs_page_object_ix_header *header = raw_header;
    const char *name = tybalt_name(state.selection);
    if (!name || memcmp(header->name, name, strlen(name) + 1)) return;
    if (tybalt.matches < UINT8_MAX) ++tybalt.matches;
    if (tybalt.present) return; /* First observation, with explicit match count. */
    tybalt.present = true; tybalt.object_id = object_id; tybalt.page = page;
    tybalt.captured_generation = state.generation;
    memcpy(tybalt.header, raw_header, sizeof(tybalt.header));
}

bool vfs_spiffs_diag_generation_matches(uint8_t selection, uint16_t generation) {
    return (selection == 1 || selection == 2) && state.selection == selection &&
           generation == state.generation && tybalt.present && !tybalt.capturing &&
           tybalt.list_complete && tybalt.captured_generation == generation;
}

static int32_t tybalt_query(spiffs *fs, uint8_t operation, uint8_t selection,
                           uint8_t *out, size_t capacity, size_t *length) {
    const size_t needed = operation == 3 ? 20 : operation == 4 ? 101 : operation == 5 ? 111 : 194;
    if (capacity < needed || selection > 2 || operation > 6) return VFS_ERR_FAIL;
    if (operation == 3) {
        ++state.generation;
        memset(&state.value, 0, sizeof(state.value));
        state.selection = selection;
        if (!selection) diag.generation = state.generation;
    } else if (!selection || selection != state.selection || tybalt.capturing) {
        return VFS_ERR_FAIL;
    }
    bool present = selection && tybalt.present;
    if (operation >= 5 && !vfs_spiffs_diag_generation_matches(selection, state.generation)) return VFS_ERR_NOOBJ;
    uint32_t address = present ? (uint32_t)tybalt.page * 256u : 0;
    if (present && (tybalt.page == UINT16_MAX || SPIFFS_IS_LOOKUP_PAGE(fs, tybalt.page) ||
                    address > SPIFFS_CFG_PHYS_SZ(fs) || sizeof(spiffs_page_object_ix_header) > SPIFFS_CFG_PHYS_SZ(fs) - address))
        return VFS_ERR_FAIL;
    uint32_t lu_address = present ? SPIFFS_BLOCK_TO_PADDR(fs, SPIFFS_BLOCK_FOR_PAGE(fs, tybalt.page)) +
                                  SPIFFS_OBJ_LOOKUP_ENTRY_FOR_PAGE(fs, tybalt.page) * sizeof(spiffs_obj_id) : 0;
    if (present && (lu_address > SPIFFS_CFG_PHYS_SZ(fs) || sizeof(spiffs_obj_id) > SPIFFS_CFG_PHYS_SZ(fs) - lu_address))
        return VFS_ERR_FAIL;
    memset(out, 0, needed);
    out[0] = 2; out[1] = operation; out[2] = selection;
    out[3] = (present ? 1 : 0) | ((selection && tybalt.list_complete) ? 2 : 0) |
             ((selection && tybalt.matches > 1) ? 4 : 0);
    put16(out + 4, state.generation);
    if (selection) out[6] = tybalt.matches;
    if (present) {
        put16(out + 8, tybalt.object_id); put16(out + 10, tybalt.page);
        put32(out + 12, address); put32(out + 16, lu_address);
    }
    if (operation == 4) {
        put32(out + 20, tybalt.list_error);
        if (present) memcpy(out + 24, tybalt.header, TYBALT_HEADER_BYTES);
    } else if (operation == 5) {
        spiffs_cache *cache = spiffs_get_cache(fs);
        if (!cache || cache->cpage_count > 32 || fs->cache_size < sizeof(spiffs_cache) +
            cache->cpage_count * (sizeof(spiffs_cache_page) + 256u)) return VFS_ERR_FAIL;
        put32(out + 20, cache->last_access); put32(out + 24, cache->cpage_use_map);
        for (unsigned i = 0; i < cache->cpage_count; ++i) {
            spiffs_cache_page *cp = spiffs_get_cache_page_hdr(fs, cache, i);
            if (!(cache->cpage_use_map & (1u << i)) || (cp->flags & SPIFFS_CACHE_FLAG_TYPE_WR)) continue;
            const uint8_t *bytes = spiffs_get_cache_page(fs, cache, i);
            if (cp->pix == tybalt.page && !(out[3] & 8)) {
                out[3] |= 8; out[28] = cp->flags; out[29] = i;
                memcpy(out + 34, bytes, TYBALT_HEADER_BYTES);
            }
            if (cp->pix == lu_address / 256u && !(out[3] & 16)) {
                out[3] |= 16; out[30] = cp->flags; out[31] = i;
                memcpy(out + 32, bytes + lu_address % 256u, 2);
            }
        }
    } else if (operation == 6) {
        spiffs_page_object_ix_header header;
        for (unsigned i = 0; i < 2; ++i) {
            uint8_t *sample = out + 20 + i * 87;
            uint16_t lu = 0;
            uint32_t lu_result = hal_spi_flash_read(lu_address, &lu, sizeof(lu));
            uint32_t header_result = hal_spi_flash_read(address, &header, sizeof(header));
            put32(sample, lu_result); put32(sample + 6, header_result);
            if (lu_result == 0) put16(sample + 4, lu);
            if (header_result == 0) memcpy(sample + 10, &header, TYBALT_HEADER_BYTES);
        }
    }
    *length = needed;
    return VFS_OK;
}

int32_t vfs_spiffs_diag_query(spiffs *fs, uint8_t operation, uint8_t index,
                             uint8_t *out, size_t capacity, size_t *length) {
    if (length) *length = 0;
    const size_t needed = operation == 0 ? 170 : operation == 1 ? 91 : 235;
    if (!fs || !out || !length || operation > 6 ||
        (operation <= 2 && (state.selection || index >= VFS_SPIFFS_DIAG_CANDIDATES || capacity < needed)))
        return VFS_ERR_FAIL;
    if (!SPIFFS_mounted(fs)) return VFS_ERR_NODEV;
    if (SPIFFS_CFG_LOG_PAGE_SZ(fs) != 256 || SPIFFS_CFG_LOG_BLOCK_SZ(fs) != 4096 ||
        SPIFFS_CFG_PHYS_ADDR(fs) != 0 || SPIFFS_CFG_PHYS_SZ(fs) > 0x1000000u)
        return VFS_ERR_UNSUPT;
    if (operation >= 3) return tybalt_query(fs, operation, index, out, capacity, length);
    bool present = index < diag.count;
    if (operation && !present) return VFS_ERR_NOOBJ;
    const diag_candidate_t *candidate = &diag.candidates[index];
    uint32_t address = (uint32_t)candidate->page * 256u;
    if (present && (candidate->page == UINT16_MAX || SPIFFS_IS_LOOKUP_PAGE(fs, candidate->page) ||
                    address > SPIFFS_CFG_PHYS_SZ(fs) || sizeof(spiffs_page_object_ix_header) > SPIFFS_CFG_PHYS_SZ(fs) - address))
        return VFS_ERR_FAIL;
    memset(out, 0, needed);
    out[0] = 1; out[1] = operation; out[2] = index;
    out[3] = (present ? 1 : 0) | (diag.list_complete ? 2 : 0) | (diag.total > 2 ? 4 : 0) |
             (diag.open_valid ? 8 : 0) | (diag.hal_failed ? 16 : 0);
    put16(out + 4, diag.generation); out[6] = diag.count; out[7] = diag.total;
    if (present) { put16(out + 8, candidate->object_id); put16(out + 10, candidate->page); put32(out + 12, address); }
    if (operation == 0) {
        put32(out + 16, diag.list_error); put32(out + 20, diag.open_error); put32(out + 24, diag.open_result);
        put32(out + 28, diag.hal_error); put32(out + 32, diag.hal_address); put32(out + 36, diag.hal_length);
        memcpy(out + 40, diag.open_name, 64);
        if (present) memcpy(out + 104, candidate->name, 64);
        put16(out + 168, diag.open_generation);
    } else if (operation == 1) {
        /* Peek at existing cache memory only. Calling spiffs_cache_page_get or
         * spiffs_phys_rd would update its LRU state and defeat this comparison. */
        spiffs_cache *cache = spiffs_get_cache(fs);
        if (!cache || cache->cpage_count > 32 || fs->cache_size < sizeof(spiffs_cache) +
            cache->cpage_count * (sizeof(spiffs_cache_page) + 256u)) return VFS_ERR_FAIL;
        for (unsigned i = 0; i < cache->cpage_count; ++i) {
            spiffs_cache_page *cp = spiffs_get_cache_page_hdr(fs, cache, i);
            if ((cache->cpage_use_map & (1u << i)) && !(cp->flags & SPIFFS_CACHE_FLAG_TYPE_WR) && cp->pix == candidate->page) {
                const spiffs_page_object_ix_header *header = (const void *)spiffs_get_cache_page(fs, cache, i);
                out[3] |= 32; out[16] = cp->flags;
                put16(out + 17, header->p_hdr.obj_id); put16(out + 19, header->p_hdr.span_ix);
                out[21] = header->p_hdr.flags; put32(out + 22, header->size); out[26] = header->type;
                memcpy(out + 27, header->name, 64); break;
            }
        }
    } else {
        spiffs_page_object_ix_header header;
        for (unsigned i = 0; i < 3; ++i) {
            uint8_t *sample = out + 16 + i * 73;
            uint32_t result = hal_spi_flash_read(address, &header, sizeof(header));
            put32(sample, result);
            if (result != 0) continue; /* Never expose uninitialized/partial bytes. */
            put16(sample + 4, header.p_hdr.obj_id); put16(sample + 6, header.p_hdr.span_ix);
            sample[8] = header.p_hdr.flags; memcpy(sample + 9, header.name, 64);
        }
    }
    *length = needed;
    return VFS_OK;
}
#endif
