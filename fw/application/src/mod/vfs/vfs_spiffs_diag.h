#ifndef VFS_SPIFFS_DIAG_H
#define VFS_SPIFFS_DIAG_H

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>
#include "spiffs.h"

/* LCD-only custom command 0x1b. Legacy schema1 is documented here; schema2
 * and volatile selection are documented in docs/diagnostics_de315.txt.
 * Legacy request exactly [operation, candidate].
 * No addresses or paths are accepted. Candidates 0/1 come only from the last
 * ordinary listing of /amiibo/Animal/Welcome/. Each response is one logical
 * reply; BLE transport may fragment it at the negotiated capacity.
 * Little-endian common prefix (16 bytes):
 *  0 schema=1, 1 operation, 2 candidate, 3 flags,
 *  4 u16 listing-generation, 6 stored-count, 7 total-count (saturates at255),
 *  8 u16 object-ID, 10 u16 header-page, 12 u32 physical header-address.
 * Flags: bit0 candidate present, bit1 listing completed, bit2 >2 candidates,
 * bit3 last Sprocket OPEN captured, bit4 that OPEN had a HAL read failure,
 * bit5 cache slot present (operation1 only).
 * op0 (170 bytes): at16 s32 list_errno, at20 s32 OPEN errno, at24 s32 OPEN
 * result, at28 u32 HAL error, at32 u32 failing HAL address, at36 u32 length,
 * at40 last OPEN path[64], at104 listed path[64], at168 u16 OPEN-generation.
 * Paths are fixed raw64-byte fields, not length-prefixed strings.
 * op1 (91 bytes): at16 cache flags; at17 header object-ID u16, span u16,
 * flags u8, size u32, type u8, name[64]. Absent cache: bit5 clear, body zero.
 * op2 (235 bytes): three consecutive73-byte direct-header-read records at16:
 * u32 HAL result, u16 object-ID, u16 span, u8 flags, name[64]. On HAL failure
 * the remaining69 bytes of that record are zero. No cache reads or changes.
 * A generation identifies a stored observation, not current flash ownership.
 * Clients must compare generation/page across replies and retain error flags.
 */
#define VFS_SPIFFS_DIAG_MAX_REPLY 235u
#define VFS_SPIFFS_DIAG_CANDIDATES 2u

void vfs_spiffs_diag_list_begin(const char *dir);
void vfs_spiffs_diag_list_entry(const char *dir, const struct spiffs_dirent *entry);
void vfs_spiffs_diag_list_end(const char *dir, int32_t error);
void vfs_spiffs_diag_list_closed(const char *dir);
void vfs_spiffs_diag_open_begin(const char *path);
void vfs_spiffs_diag_open_end(int32_t result, int32_t error);
void vfs_spiffs_diag_hal_read(uint32_t result, uint32_t address, uint32_t length);
void vfs_spiffs_diag_reset(void);
void vfs_spiffs_diag_header_observe(spiffs *fs, uint16_t object_id, uint16_t page,
                                  const void *raw_header);
bool vfs_spiffs_diag_generation_matches(uint8_t selection, uint16_t generation);
int32_t vfs_spiffs_diag_query(spiffs *fs, uint8_t operation, uint8_t candidate,
                             uint8_t *out, size_t capacity, size_t *length);

#endif
