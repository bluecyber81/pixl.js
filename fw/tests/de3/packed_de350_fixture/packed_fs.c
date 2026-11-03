/* SPDX-License-Identifier: GPL-2.0-only
 * Immutable packed records on the pinned littlefs 2.8. No device-specific IO.
 * All publication is through one atomic replacement of the small manifest.
 */
#include "packed_fs.h"
#include <limits.h>
#include <string.h>

#define M_MAGIC 0x314d4650u
#define S_MAGIC 0x31534650u
#define R_MAGIC 0x31524650u
#define MH 64u
#define SH 24u
#define RH 16u
#define MAX_RECORDS 384u
#define IX 12u
#define CATALOG_SLOTS 32u
#define MANIFEST "/.pfs_manifest"
#define NEXT "/.pfs_next"
#define STAGE "/.pfs_stage"
#define BUSY LFS_ERR_BADF
#define DISK (PFS_BLOCK_COUNT * PFS_BLOCK_SIZE)

typedef struct {
  uint32_t generation, next_id, count, objects, pending, bound;
  uint8_t archive[32];
  uint32_t ids[PFS_MAX_SHARDS];
} manifest_t;
typedef struct handle {
  struct handle *next;
  struct pfs *fs;
  uint8_t kind;
} handle_t;
typedef struct {
  lfs_file_t f;
  struct lfs_file_config cfg;
  uint8_t cache[PFS_CACHE_SIZE];
  bool open;
} io_t;
typedef struct {
  uint32_t shard, offset, data, size;
} location_t;
typedef struct {
  uint32_t hash, offset;
} index_t;
typedef struct {
  uint32_t id, count, body, filter[8], parents[2];
} catalog_t;
typedef struct {
  uint32_t shard, index, offset, count, body;
  io_t io;
} cursor_t;
struct pfs {
  lfs_t lfs;
  struct lfs_config cfg;
  manifest_t current;
  catalog_t catalog[CATALOG_SLOTS];
  pfs_alloc_fn alloc;
  pfs_free_fn release;
  handle_t *handles;
  struct pfs_file *writer;
  uint8_t handle_count;
  bool mounted, poisoned, transaction;
  uint8_t read_cache[PFS_CACHE_SIZE], prog_cache[PFS_CACHE_SIZE], lookahead[64],
      copy[PFS_CACHE_SIZE];
};
struct pfs_file {
  handle_t h;
  io_t io;
  pfs_info_t info;
  location_t loc;
  uint32_t pos;
  int flags;
  bool writing, commit_started;
};
struct pfs_dir {
  handle_t h;
  manifest_t snapshot;
  cursor_t cursor;
  char path[PFS_PATH_MAX];
};
typedef enum { PUT, ATTR, RENAME, REMOVE } op_t;
typedef struct {
  op_t op;
  const char *path, *target;
  pfs_info_t info;
  pfs_file_t *stage;
  bool subtree, exists;
} change_t;

static uint32_t crc(uint32_t c, const void *data, size_t n) {
  /* The same reflected CRC32 and caller-owned seed/finalization as lfs_crc.
   * One byte per lookup avoids two nibble steps while mount validates every
   * payload twice (record and shard). The immutable 1-KiB table stays in flash;
   * no additional heap, stack buffer or mutable state is needed. */
  static const uint32_t table[256] = {
    0x00000000u, 0x77073096u, 0xee0e612cu, 0x990951bau, 0x076dc419u, 0x706af48fu, 0xe963a535u, 0x9e6495a3u,
    0x0edb8832u, 0x79dcb8a4u, 0xe0d5e91eu, 0x97d2d988u, 0x09b64c2bu, 0x7eb17cbdu, 0xe7b82d07u, 0x90bf1d91u,
    0x1db71064u, 0x6ab020f2u, 0xf3b97148u, 0x84be41deu, 0x1adad47du, 0x6ddde4ebu, 0xf4d4b551u, 0x83d385c7u,
    0x136c9856u, 0x646ba8c0u, 0xfd62f97au, 0x8a65c9ecu, 0x14015c4fu, 0x63066cd9u, 0xfa0f3d63u, 0x8d080df5u,
    0x3b6e20c8u, 0x4c69105eu, 0xd56041e4u, 0xa2677172u, 0x3c03e4d1u, 0x4b04d447u, 0xd20d85fdu, 0xa50ab56bu,
    0x35b5a8fau, 0x42b2986cu, 0xdbbbc9d6u, 0xacbcf940u, 0x32d86ce3u, 0x45df5c75u, 0xdcd60dcfu, 0xabd13d59u,
    0x26d930acu, 0x51de003au, 0xc8d75180u, 0xbfd06116u, 0x21b4f4b5u, 0x56b3c423u, 0xcfba9599u, 0xb8bda50fu,
    0x2802b89eu, 0x5f058808u, 0xc60cd9b2u, 0xb10be924u, 0x2f6f7c87u, 0x58684c11u, 0xc1611dabu, 0xb6662d3du,
    0x76dc4190u, 0x01db7106u, 0x98d220bcu, 0xefd5102au, 0x71b18589u, 0x06b6b51fu, 0x9fbfe4a5u, 0xe8b8d433u,
    0x7807c9a2u, 0x0f00f934u, 0x9609a88eu, 0xe10e9818u, 0x7f6a0dbbu, 0x086d3d2du, 0x91646c97u, 0xe6635c01u,
    0x6b6b51f4u, 0x1c6c6162u, 0x856530d8u, 0xf262004eu, 0x6c0695edu, 0x1b01a57bu, 0x8208f4c1u, 0xf50fc457u,
    0x65b0d9c6u, 0x12b7e950u, 0x8bbeb8eau, 0xfcb9887cu, 0x62dd1ddfu, 0x15da2d49u, 0x8cd37cf3u, 0xfbd44c65u,
    0x4db26158u, 0x3ab551ceu, 0xa3bc0074u, 0xd4bb30e2u, 0x4adfa541u, 0x3dd895d7u, 0xa4d1c46du, 0xd3d6f4fbu,
    0x4369e96au, 0x346ed9fcu, 0xad678846u, 0xda60b8d0u, 0x44042d73u, 0x33031de5u, 0xaa0a4c5fu, 0xdd0d7cc9u,
    0x5005713cu, 0x270241aau, 0xbe0b1010u, 0xc90c2086u, 0x5768b525u, 0x206f85b3u, 0xb966d409u, 0xce61e49fu,
    0x5edef90eu, 0x29d9c998u, 0xb0d09822u, 0xc7d7a8b4u, 0x59b33d17u, 0x2eb40d81u, 0xb7bd5c3bu, 0xc0ba6cadu,
    0xedb88320u, 0x9abfb3b6u, 0x03b6e20cu, 0x74b1d29au, 0xead54739u, 0x9dd277afu, 0x04db2615u, 0x73dc1683u,
    0xe3630b12u, 0x94643b84u, 0x0d6d6a3eu, 0x7a6a5aa8u, 0xe40ecf0bu, 0x9309ff9du, 0x0a00ae27u, 0x7d079eb1u,
    0xf00f9344u, 0x8708a3d2u, 0x1e01f268u, 0x6906c2feu, 0xf762575du, 0x806567cbu, 0x196c3671u, 0x6e6b06e7u,
    0xfed41b76u, 0x89d32be0u, 0x10da7a5au, 0x67dd4accu, 0xf9b9df6fu, 0x8ebeeff9u, 0x17b7be43u, 0x60b08ed5u,
    0xd6d6a3e8u, 0xa1d1937eu, 0x38d8c2c4u, 0x4fdff252u, 0xd1bb67f1u, 0xa6bc5767u, 0x3fb506ddu, 0x48b2364bu,
    0xd80d2bdau, 0xaf0a1b4cu, 0x36034af6u, 0x41047a60u, 0xdf60efc3u, 0xa867df55u, 0x316e8eefu, 0x4669be79u,
    0xcb61b38cu, 0xbc66831au, 0x256fd2a0u, 0x5268e236u, 0xcc0c7795u, 0xbb0b4703u, 0x220216b9u, 0x5505262fu,
    0xc5ba3bbeu, 0xb2bd0b28u, 0x2bb45a92u, 0x5cb36a04u, 0xc2d7ffa7u, 0xb5d0cf31u, 0x2cd99e8bu, 0x5bdeae1du,
    0x9b64c2b0u, 0xec63f226u, 0x756aa39cu, 0x026d930au, 0x9c0906a9u, 0xeb0e363fu, 0x72076785u, 0x05005713u,
    0x95bf4a82u, 0xe2b87a14u, 0x7bb12baeu, 0x0cb61b38u, 0x92d28e9bu, 0xe5d5be0du, 0x7cdcefb7u, 0x0bdbdf21u,
    0x86d3d2d4u, 0xf1d4e242u, 0x68ddb3f8u, 0x1fda836eu, 0x81be16cdu, 0xf6b9265bu, 0x6fb077e1u, 0x18b74777u,
    0x88085ae6u, 0xff0f6a70u, 0x66063bcau, 0x11010b5cu, 0x8f659effu, 0xf862ae69u, 0x616bffd3u, 0x166ccf45u,
    0xa00ae278u, 0xd70dd2eeu, 0x4e048354u, 0x3903b3c2u, 0xa7672661u, 0xd06016f7u, 0x4969474du, 0x3e6e77dbu,
    0xaed16a4au, 0xd9d65adcu, 0x40df0b66u, 0x37d83bf0u, 0xa9bcae53u, 0xdebb9ec5u, 0x47b2cf7fu, 0x30b5ffe9u,
    0xbdbdf21cu, 0xcabac28au, 0x53b39330u, 0x24b4a3a6u, 0xbad03605u, 0xcdd70693u, 0x54de5729u, 0x23d967bfu,
    0xb3667a2eu, 0xc4614ab8u, 0x5d681b02u, 0x2a6f2b94u, 0xb40bbe37u, 0xc30c8ea1u, 0x5a05df1bu, 0x2d02ef8du,
  };
  const uint8_t *bytes = data;
  for (size_t i = 0; i < n; i++)
    c = (c >> 8) ^ table[(c ^ bytes[i]) & 0xffu];
  return c;
}
static void catalog_add(catalog_t *c, uint32_t hash) {
  for (unsigned i = 0; i < 2; i++, hash >>= 16) {
    unsigned bit = hash & 255u;
    c->filter[bit >> 5] |= 1u << (bit & 31);
  }
}
static uint32_t path_hash(const char *path) {
  uint32_t h = 2166136261u;
  for (; *path; path++)
    h = (h ^ (uint8_t)*path) * 16777619u;
  return h;
}
static void catalog_parent_add(catalog_t *cat, const char *path) {
  const char *end = strrchr(path, '/');
  if (end == path)
    end++;
  uint32_t hash = 2166136261u;
  while (path < end)
    hash = (hash ^ (uint8_t)*path++) * 16777619u;
  unsigned bit = hash & 63u;
  cat->parents[bit >> 5] |= 1u << (bit & 31);
}
static void index_add(index_t *index, unsigned count, uint32_t hash,
                      uint32_t offset) {
  unsigned i = count;
  while (i && (index[i - 1].hash > hash ||
               (index[i - 1].hash == hash && index[i - 1].offset > offset))) {
    index[i] = index[i - 1];
    i--;
  }
  index[i].hash = hash;
  index[i].offset = offset;
}
static uint32_t u32(const uint8_t *p) {
  return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) |
         ((uint32_t)p[3] << 24);
}
static void put32(uint8_t *p, uint32_t n) {
  for (unsigned i = 0; i < 4; i++)
    p[i] = (uint8_t)(n >> (8 * i));
}
static void shard_name(uint32_t id, char name[16]) {
  static const char hex[] = "0123456789abcdef";
  name[0] = '/';
  name[1] = 'p';
  for (unsigned i = 0; i < 8; i++)
    name[2 + i] = hex[(id >> (28 - 4 * i)) & 15u];
  name[10] = 0;
}
static bool shard_id(const char *name, uint32_t *id) {
  if (name[0] != 'p' || strlen(name) != 9)
    return false;
  uint32_t value = 0;
  for (unsigned i = 1; i < 9; i++) {
    char c = name[i];
    unsigned n = c >= '0' && c <= '9'   ? (unsigned)(c - '0')
                 : c >= 'a' && c <= 'f' ? (unsigned)(c - 'a' + 10)
                                        : 16;
    if (n > 15)
      return false;
    value = (value << 4) | n;
  }
  *id = value;
  return value != 0;
}
static int valid_path(const char *p, bool root) {
  if (!p || p[0] != '/')
    return LFS_ERR_INVAL;
  size_t n = 0;
  while (n < PFS_PATH_MAX && p[n])
    n++;
  if (n >= PFS_PATH_MAX)
    return LFS_ERR_NAMETOOLONG;
  if (n == 1)
    return root ? 0 : LFS_ERR_INVAL;
  const char *start = p + 1;
  for (const char *s = start;; s++)
    if (!*s || *s == '/') {
      size_t len = (size_t)(s - start);
      if (!len || (len == 1 && start[0] == '.') ||
          (len == 2 && start[0] == '.' && start[1] == '.'))
        return LFS_ERR_INVAL;
      if (len >= PFS_NAME_MAX)
        return LFS_ERR_NAMETOOLONG;
      if (!*s)
        return 0;
      start = s + 1;
    }
}
static bool descendant(const char *path, const char *parent) {
  size_t n = strlen(parent);
  return !strncmp(path, parent, n) && path[n] == '/';
}
static int ready(pfs_t *fs, bool write) {
  if (!fs || !fs->mounted)
    return LFS_ERR_BADF;
  if (write && (fs->poisoned || fs->transaction))
    return LFS_ERR_IO;
  return 0;
}
static int io_error(pfs_t *fs, int result) {
  if (result == LFS_ERR_IO || result == LFS_ERR_CORRUPT)
    fs->poisoned = true;
  return result;
}
static int io_open(pfs_t *fs, io_t *io, const char *path, int flags) {
  memset(io, 0, sizeof(*io));
  io->cfg.buffer = io->cache;
  int r = lfs_file_opencfg(&fs->lfs, &io->f, path, flags, &io->cfg);
  io->open = r == 0;
  return r;
}
static int io_close(pfs_t *fs, io_t *io, int status) {
  if (!io->open)
    return status;
  if (status < 0)
    io->f.flags |= LFS_F_ERRED;
  int r = lfs_file_close(&fs->lfs, &io->f);
  io->open = false;
  return status < 0 ? status : r;
}
static int read_at(pfs_t *fs, io_t *io, uint32_t pos, void *buffer,
                   uint32_t n) {
  lfs_soff_t r = lfs_file_seek(&fs->lfs, &io->f, (lfs_soff_t)pos, LFS_SEEK_SET);
  if (r < 0)
    return (int)r;
  lfs_ssize_t got = lfs_file_read(&fs->lfs, &io->f, buffer, n);
  return got == (lfs_ssize_t)n ? 0 : got < 0 ? (int)got : LFS_ERR_CORRUPT;
}
static int emit(pfs_t *fs, io_t *io, const void *data, uint32_t n, uint32_t *rc,
                uint32_t *sc) {
  lfs_ssize_t r = lfs_file_write(&fs->lfs, &io->f, data, n);
  if (r != (lfs_ssize_t)n)
    return r < 0 ? (int)r : LFS_ERR_IO;
  if (rc)
    *rc = crc(*rc, data, n);
  if (sc)
    *sc = crc(*sc, data, n);
  return 0;
}
static int shard_header(pfs_t *fs, io_t *io, uint32_t id, uint32_t *count,
                        uint32_t *body) {
  uint8_t b[SH];
  int r = read_at(fs, io, 0, b, sizeof(b));
  if (r)
    return r;
  lfs_soff_t size = lfs_file_size(&fs->lfs, &io->f);
  if (size < 0)
    return (int)size;
  if (u32(b) != S_MAGIC || u32(b + 4) != PFS_FORMAT_VERSION ||
      u32(b + 8) != id || u32(b + 20) != ~crc(~0u, b, 20) ||
      u32(b + 12) > MAX_RECORDS ||
      u32(b + 16) > DISK - SH - 4 - u32(b + 12) * IX ||
      size != (lfs_soff_t)(SH + u32(b + 16) + u32(b + 12) * IX + 4))
    return LFS_ERR_CORRUPT;
  *count = u32(b + 12);
  *body = u32(b + 16);
  return 0;
}
static uint32_t record_size(const pfs_info_t *info) {
  return RH + (uint32_t)strlen(info->path) + PFS_META_SIZE + info->size + 4;
}
static int read_record(pfs_t *fs, io_t *io, uint32_t offset, uint32_t limit,
                       pfs_info_t *info, location_t *loc, bool want_meta) {
  uint8_t b[RH];
  if (offset > limit || RH > limit - offset)
    return LFS_ERR_CORRUPT;
  int r = read_at(fs, io, offset, b, sizeof(b));
  if (r)
    return r;
  unsigned n = (unsigned)b[8] | ((unsigned)b[9] << 8);
  uint32_t size = u32(b + 4);
  if (u32(b) != R_MAGIC || b[11] || u32(b + 12) != ~crc(~0u, b, 12) || !n ||
      n >= PFS_PATH_MAX || (b[10] != PFS_FILE && b[10] != PFS_DIR) ||
      size > DISK || (b[10] == PFS_DIR && size) ||
      RH + n + PFS_META_SIZE + 4 > limit - offset ||
      size > limit - offset - (RH + n + PFS_META_SIZE + 4))
    return LFS_ERR_CORRUPT;
  memset(info, 0, sizeof(*info));
  info->size = size;
  info->type = b[10];
  r = read_at(fs, io, offset + RH, info->path, n);
  if (r)
    return r;
  if (memchr(info->path, 0, n) || valid_path(info->path, false))
    return LFS_ERR_CORRUPT;
  if (want_meta) {
    r = read_at(fs, io, offset + RH + n, info->meta, PFS_META_SIZE);
    if (r)
      return r;
  }
  loc->offset = offset;
  loc->data = offset + RH + n + PFS_META_SIZE;
  loc->size = RH + n + PFS_META_SIZE + size + 4;
  return 0;
}
static int verify_record(pfs_t *fs, io_t *io, const location_t *loc,
                         uint32_t *body_crc) {
  uint32_t sum = ~0u;
  for (uint32_t off = 0; off < loc->size - 4;) {
    uint32_t n = loc->size - 4 - off;
    if (n > PFS_CACHE_SIZE)
      n = PFS_CACHE_SIZE;
    int r = read_at(fs, io, loc->offset + off, fs->copy, n);
    if (r)
      return r;
    sum = crc(sum, fs->copy, n);
    if (body_crc)
      *body_crc = crc(*body_crc, fs->copy, n);
    off += n;
  }
  uint8_t stored[4];
  int r = read_at(fs, io, loc->offset + loc->size - 4, stored, 4);
  return r ? r : u32(stored) == ~sum ? 0 : LFS_ERR_CORRUPT;
}
/* Mount consumes immutable records in order. Decode the prefix and include
 * those same bytes in both checksums before reading metadata and payload.
 * Rewinding after read_record would evict a crossed LittleFS cache page and
 * seek through the CTZ chain again. Every record byte is still validated;
 * the trailing record CRC remains excluded from the shard body CRC. */
static int read_verified_record(pfs_t *fs, io_t *io, uint32_t offset,
                                uint32_t limit, pfs_info_t *info,
                                location_t *loc, uint32_t *body_crc) {
  uint8_t b[RH];
  if (offset > limit || RH > limit - offset)
    return LFS_ERR_CORRUPT;
  int r = read_at(fs, io, offset, b, sizeof(b));
  if (r)
    return r;
  unsigned n = (unsigned)b[8] | ((unsigned)b[9] << 8);
  uint32_t size = u32(b + 4);
  if (u32(b) != R_MAGIC || b[11] || u32(b + 12) != ~crc(~0u, b, 12) || !n ||
      n >= PFS_PATH_MAX || (b[10] != PFS_FILE && b[10] != PFS_DIR) ||
      size > DISK || (b[10] == PFS_DIR && size) ||
      RH + n + PFS_META_SIZE + 4 > limit - offset ||
      size > limit - offset - (RH + n + PFS_META_SIZE + 4))
    return LFS_ERR_CORRUPT;
  uint32_t sum = crc(~0u, b, sizeof(b));
  *body_crc = crc(*body_crc, b, sizeof(b));
  memset(info, 0, sizeof(*info));
  info->size = size;
  info->type = b[10];
  r = read_at(fs, io, offset + RH, info->path, n);
  if (r)
    return r;
  if (memchr(info->path, 0, n) || valid_path(info->path, false))
    return LFS_ERR_CORRUPT;
  sum = crc(sum, info->path, n);
  *body_crc = crc(*body_crc, info->path, n);
  loc->offset = offset;
  loc->data = offset + RH + n + PFS_META_SIZE;
  loc->size = RH + n + PFS_META_SIZE + size + 4;
  uint32_t pos = offset + RH + n;
  uint32_t end = offset + loc->size - 4;
  while (pos < end) {
    uint32_t length = end - pos;
    if (length > PFS_CACHE_SIZE)
      length = PFS_CACHE_SIZE;
    r = read_at(fs, io, pos, fs->copy, length);
    if (r)
      return r;
    sum = crc(sum, fs->copy, length);
    *body_crc = crc(*body_crc, fs->copy, length);
    pos += length;
  }
  uint8_t stored[4];
  r = read_at(fs, io, end, stored, sizeof(stored));
  return r ? r : u32(stored) == ~sum ? 0 : LFS_ERR_CORRUPT;
}
/* Allocation-free mount fallback: every sequentially verified record must
 * occur in the on-disk index. The later pass checks the complete index CRC,
 * strict (hash, offset) order and footer, so equal record/index counts prove
 * a bijection even when no temporary index buffer is available. */
static int mount_index_contains(pfs_t *fs, io_t *io, uint32_t count,
                                uint32_t body, uint32_t hash, uint32_t offset) {
  uint32_t lo = 0, hi = count;
  while (lo < hi) {
    uint32_t mid = lo + (hi - lo) / 2;
    uint8_t entry[IX];
    int r = read_at(fs, io, SH + body + mid * IX, entry, IX);
    if (r)
      return r;
    if (u32(entry + 8) != ~crc(~0u, entry, 8))
      return LFS_ERR_CORRUPT;
    uint32_t h = u32(entry), o = u32(entry + 4);
    if (h == hash && o == offset)
      return 0;
    if (h < hash || (h == hash && o < offset))
      lo = mid + 1;
    else
      hi = mid;
  }
  return LFS_ERR_CORRUPT;
}
static int cursor_close(pfs_t *fs, cursor_t *c, int r) {
  return io_close(fs, &c->io, r);
}
static int next_record(pfs_t *fs, const manifest_t *m, cursor_t *c,
                       pfs_info_t *info, location_t *loc, unsigned parent_bit) {
  while (c->shard < m->count) {
    uint32_t id = m->ids[c->shard];
    int r = 0;
    if (!c->io.open) {
      /* Only a fully mounted, immutable shard may rule out this parent.
       * Cold/replaced/evicted shards fall back to the complete traversal.
       * Comparing the exact ID also preserves open directory snapshots. */
      const catalog_t *cat = &fs->catalog[c->shard % CATALOG_SLOTS];
      if (!c->offset && parent_bit < 64 && cat->id == id &&
          !(cat->parents[parent_bit >> 5] & (1u << (parent_bit & 31)))) {
        c->shard++;
        c->index = 0;
        continue;
      }
      char name[16];
      shard_name(id, name);
      r = io_open(fs, &c->io, name, LFS_O_RDONLY);
      if (r)
        return r;
      r = shard_header(fs, &c->io, id, &c->count, &c->body);
      if (r)
        return cursor_close(fs, c, r);
      if (!c->offset)
        c->offset = SH;
    }
    if (c->index < c->count) {
      /* Traversal needs names, types and sizes. Directory consumers fetch
       * metadata only for the entries they actually return. */
      r = read_record(fs, &c->io, c->offset, SH + c->body, info, loc, false);
      if (r)
        return cursor_close(fs, c, r);
      loc->shard = id;
      c->offset += loc->size;
      c->index++;
      return 1;
    }
    if (c->offset != SH + c->body)
      return cursor_close(fs, c, LFS_ERR_CORRUPT);
    r = cursor_close(fs, c, 0);
    if (r)
      return r;
    c->shard++;
    c->index = 0;
    c->offset = 0;
  }
  return 0;
}
static int get_catalog(pfs_t *fs, unsigned slot, catalog_t **out) {
  catalog_t *c = &fs->catalog[slot % CATALOG_SLOTS];
  uint32_t id = fs->current.ids[slot];
  if (c->id != id) {
    memset(c, 0, sizeof(*c));
    /* This index-only cache fill has not inspected parent paths. */
    c->parents[0] = c->parents[1] = UINT32_MAX;
    io_t io;
    char name[16];
    shard_name(id, name);
    int r = io_open(fs, &io, name, LFS_O_RDONLY);
    if (r)
      return r;
    r = shard_header(fs, &io, id, &c->count, &c->body);
    for (unsigned i = 0; !r && i < c->count; i++) {
      uint8_t entry[IX];
      r = read_at(fs, &io, SH + c->body + i * IX, entry, IX);
      if (r)
        break;
      if (u32(entry + 8) != ~crc(~0u, entry, 8)) {
        r = LFS_ERR_CORRUPT;
        break;
      }
      catalog_add(c, u32(entry));
    }
    r = io_close(fs, &io, r);
    if (r)
      return r;
    c->id = id;
  }
  *out = c;
  return 0;
}
static int lookup(pfs_t *fs, const manifest_t *m, const char *path,
                  pfs_info_t *info, location_t *loc) {
  uint32_t hash = path_hash(path);
  for (unsigned slot = 0; slot < m->count; slot++) {
    catalog_t *cat;
    int checked = get_catalog(fs, slot, &cat);
    if (checked)
      return checked;
    unsigned bit = hash & 255u;
    if (!(cat->filter[bit >> 5] & (1u << (bit & 31))))
      continue;
    bit = (hash >> 16) & 255u;
    if (!(cat->filter[bit >> 5] & (1u << (bit & 31))))
      continue;
    io_t io;
    char name[16];
    shard_name(m->ids[slot], name);
    int r = io_open(fs, &io, name, LFS_O_RDONLY);
    if (r)
      return r;
    uint32_t count, body;
    r = shard_header(fs, &io, m->ids[slot], &count, &body);
    if (r)
      return io_close(fs, &io, r);
    uint32_t lo = 0, hi = count;
    uint8_t entry[IX];
    while (lo < hi) {
      uint32_t mid = lo + (hi - lo) / 2;
      r = read_at(fs, &io, SH + body + mid * IX, entry, IX);
      if (r)
        return io_close(fs, &io, r);
      if (u32(entry + 8) != ~crc(~0u, entry, 8))
        return io_close(fs, &io, LFS_ERR_CORRUPT);
      if (u32(entry) < hash)
        lo = mid + 1;
      else
        hi = mid;
    }
    for (; lo < count; lo++) {
      r = read_at(fs, &io, SH + body + lo * IX, entry, IX);
      if (r)
        return io_close(fs, &io, r);
      if (u32(entry + 8) != ~crc(~0u, entry, 8))
        return io_close(fs, &io, LFS_ERR_CORRUPT);
      if (u32(entry) != hash)
        break;
      uint32_t offset = u32(entry + 4);
      if (offset < SH)
        return io_close(fs, &io, LFS_ERR_CORRUPT);
      r = read_record(fs, &io, offset, SH + body, info, loc, true);
      if (r)
        return io_close(fs, &io, r);
      if (!strcmp(info->path, path)) {
        loc->shard = m->ids[slot];
        return io_close(fs, &io, 0);
      }
    }
    r = io_close(fs, &io, 0);
    if (r)
      return r;
  }
  return LFS_ERR_NOENT;
}
static int parent_exists(pfs_t *fs, const char *path) {
  char parent[PFS_PATH_MAX];
  memcpy(parent, path, strlen(path) + 1);
  char *slash = strrchr(parent, '/');
  if (slash == parent)
    return 0;
  *slash = 0;
  pfs_info_t info;
  location_t loc;
  int r = lookup(fs, &fs->current, parent, &info, &loc);
  return r ? r : info.type == PFS_DIR ? 0 : LFS_ERR_NOTDIR;
}
static int manifest_load(pfs_t *fs, manifest_t *m) {
  io_t io;
  int r = io_open(fs, &io, MANIFEST, LFS_O_RDONLY);
  if (r)
    return r == LFS_ERR_NOENT ? LFS_ERR_CORRUPT : r;
  uint8_t b[MH + PFS_MAX_SHARDS * 4 + 4];
  lfs_soff_t size = lfs_file_size(&fs->lfs, &io.f);
  if (size < (lfs_soff_t)(MH + 4) || size > (lfs_soff_t)sizeof(b))
    r = LFS_ERR_CORRUPT;
  else
    r = read_at(fs, &io, 0, b, (uint32_t)size);
  r = io_close(fs, &io, r);
  if (r)
    return r;
  uint32_t count = u32(b + 16);
  if (u32(b) != M_MAGIC || u32(b + 4) != PFS_FORMAT_VERSION ||
      count > PFS_MAX_SHARDS || size != (lfs_soff_t)(MH + 4 * count + 4) ||
      u32(b + size - 4) != ~crc(~0u, b, (size_t)size - 4) || !u32(b + 8) ||
      !u32(b + 12) || u32(b + 24) > 1 || u32(b + 28) > 1 ||
      (!u32(b + 24) && !u32(b + 28)))
    return LFS_ERR_CORRUPT;
  memset(m, 0, sizeof(*m));
  m->generation = u32(b + 8);
  m->next_id = u32(b + 12);
  m->count = count;
  m->objects = u32(b + 20);
  m->pending = u32(b + 24);
  m->bound = u32(b + 28);
  memcpy(m->archive, b + 32, 32);
  for (unsigned i = 0; i < count; i++) {
    m->ids[i] = u32(b + MH + 4 * i);
    if (!m->ids[i] || m->ids[i] >= m->next_id)
      return LFS_ERR_CORRUPT;
    for (unsigned j = 0; j < i; j++)
      if (m->ids[i] == m->ids[j])
        return LFS_ERR_CORRUPT;
  }
  return 0;
}
static int publish(pfs_t *fs, const manifest_t *m) {
  uint8_t b[MH + PFS_MAX_SHARDS * 4 + 4];
  memset(b, 0, sizeof(b));
  put32(b, M_MAGIC);
  put32(b + 4, PFS_FORMAT_VERSION);
  put32(b + 8, m->generation);
  put32(b + 12, m->next_id);
  put32(b + 16, m->count);
  put32(b + 20, m->objects);
  put32(b + 24, m->pending);
  put32(b + 28, m->bound);
  memcpy(b + 32, m->archive, 32);
  for (unsigned i = 0; i < m->count; i++)
    put32(b + MH + 4 * i, m->ids[i]);
  uint32_t n = MH + 4 * m->count;
  put32(b + n, ~crc(~0u, b, n));
  io_t io;
  int r = io_open(fs, &io, NEXT, LFS_O_WRONLY | LFS_O_CREAT | LFS_O_EXCL);
  if (r)
    return io_error(fs, r);
  r = emit(fs, &io, b, n + 4, NULL, NULL);
  if (!r)
    r = lfs_file_sync(&fs->lfs, &io.f);
  r = io_close(fs, &io, r);
  if (r)
    return io_error(fs, r);
  r = lfs_rename(&fs->lfs, NEXT, MANIFEST);
  if (r) {
    fs->poisoned = true;
    return r;
  }
  fs->current = *m;
  return 0;
}
static bool referenced(pfs_t *fs, uint32_t id) {
  for (unsigned i = 0; i < fs->current.count; i++)
    if (fs->current.ids[i] == id)
      return true;
  for (handle_t *h = fs->handles; h; h = h->next) {
    if (h->kind == 1) {
      pfs_file_t *f = (pfs_file_t *)h;
      if (!f->writing && f->loc.shard == id)
        return true;
    } else {
      pfs_dir_t *d = (pfs_dir_t *)h;
      for (unsigned i = 0; i < d->snapshot.count; i++)
        if (d->snapshot.ids[i] == id)
          return true;
    }
  }
  return false;
}
static int collect(pfs_t *fs) {
  /* Restart iteration after removal: littlefs directory positions may shift. */
  for (;;) {
    lfs_dir_t dir;
    int r = lfs_dir_open(&fs->lfs, &dir, "/");
    if (r)
      return io_error(fs, r);
    struct lfs_info info;
    bool found = false;
    char path[48];
    while ((r = lfs_dir_read(&fs->lfs, &dir, &info)) > 0) {
      uint32_t id;
      bool stale = shard_id(info.name, &id) && !referenced(fs, id);
      stale |= !strcmp(info.name, NEXT + 1);
      stale |= !fs->writer && !strcmp(info.name, STAGE + 1);
      if (stale) {
        if (info.type != LFS_TYPE_REG) {
          r = LFS_ERR_CORRUPT;
          break;
        }
        path[0] = '/';
        memcpy(path + 1, info.name, strlen(info.name) + 1);
        found = true;
        break;
      }
    }
    int closed = lfs_dir_close(&fs->lfs, &dir);
    if (r < 0 || closed < 0)
      return io_error(fs, r < 0 ? r : closed);
    if (!found)
      return 0;
    r = lfs_remove(&fs->lfs, path);
    if (r)
      return io_error(fs, r);
  }
}
int pfs_gc(pfs_t *fs) {
  int r = ready(fs, true);
  if (r)
    return r;
  if (fs->writer)
    return BUSY;
  return collect(fs);
}
static uint32_t blocks_for(uint32_t bytes) {
  return (bytes + (PFS_BLOCK_SIZE - 33)) / (PFS_BLOCK_SIZE - 32);
}
static int reserve(pfs_t *fs, uint32_t blocks) {
  lfs_ssize_t used = lfs_fs_size(&fs->lfs);
  if (used < 0)
    return io_error(fs, (int)used);
  if ((uint32_t)used > PFS_BLOCK_COUNT)
    return io_error(fs, LFS_ERR_CORRUPT);
  return blocks > PFS_BLOCK_COUNT - (uint32_t)used ? LFS_ERR_NOSPC : 0;
}

pfs_t *pfs_new(const struct lfs_config *cfg, pfs_alloc_fn alloc,
               pfs_free_fn release) {
  if (!cfg || !alloc || !release || !cfg->read || !cfg->prog || !cfg->erase ||
      !cfg->sync || cfg->block_size != PFS_BLOCK_SIZE ||
      cfg->block_count != PFS_BLOCK_COUNT || cfg->read_size != PFS_CACHE_SIZE ||
      cfg->prog_size != PFS_CACHE_SIZE)
    return NULL;
  pfs_t *fs = alloc(sizeof(*fs));
  if (!fs)
    return NULL;
  memset(fs, 0, sizeof(*fs));
  fs->alloc = alloc;
  fs->release = release;
  fs->cfg = *cfg;
  fs->cfg.cache_size = PFS_CACHE_SIZE;
  fs->cfg.lookahead_size = sizeof(fs->lookahead);
  fs->cfg.read_buffer = fs->read_cache;
  fs->cfg.prog_buffer = fs->prog_cache;
  fs->cfg.lookahead_buffer = fs->lookahead;
  fs->cfg.name_max = 47;
  fs->cfg.attr_max = 128;
  fs->cfg.block_cycles = 500;
  return fs;
}
bool pfs_idle(const pfs_t *fs) {
  return !fs || (!fs->handles && !fs->transaction);
}
bool pfs_get_import_identity(const pfs_t *fs, uint8_t out[32]) {
  if (!fs || !fs->mounted || !fs->current.bound || !out)
    return false;
  memcpy(out, fs->current.archive, 32);
  return true;
}
bool pfs_mounted(const pfs_t *fs) { return fs && fs->mounted; }
bool pfs_poisoned(const pfs_t *fs) { return !fs || fs->poisoned; }
bool pfs_import_pending(const pfs_t *fs) {
  return !fs || !fs->mounted || fs->current.pending != 0;
}
int pfs_unmount(pfs_t *fs) {
  if (!fs)
    return LFS_ERR_INVAL;
  if (fs->handles || fs->transaction)
    return BUSY;
  if (!fs->mounted)
    return 0;
  int r = lfs_unmount(&fs->lfs);
  if (!r) {
    fs->mounted = false;
    fs->poisoned = false;
  }
  return r;
}
int pfs_destroy(pfs_t *fs) {
  if (!fs)
    return 0;
  int r = pfs_unmount(fs);
  if (r)
    return r;
  fs->release(fs);
  return 0;
}
int pfs_mount(pfs_t *fs) {
  if (!fs)
    return LFS_ERR_INVAL;
  if (fs->mounted)
    return fs->poisoned ? LFS_ERR_IO : 0;
  int r = lfs_mount(&fs->lfs, &fs->cfg);
  if (r)
    return r;
  memset(fs->catalog, 0, sizeof(fs->catalog));
  r = manifest_load(fs, &fs->current);
  uint32_t objects = 0;
  for (unsigned i = 0; !r && i < fs->current.count; i++) {
    char path[16];
    shard_name(fs->current.ids[i], path);
    io_t io;
    r = io_open(fs, &io, path, LFS_O_RDONLY);
    if (r)
      break;
    uint32_t count = 0, body;
    r = shard_header(fs, &io, fs->current.ids[i], &count, &body);
    /* Reuse the first sequential validation pass to build the exact index.
     * This avoids seeking back through every payload for each index entry.
     * At most 384 * 8 bytes, released before opening the next shard. A low
     * heap uses the bounded on-disk fallback without losing any checks. */
    index_t *expected = !r && count ? fs->alloc(count * sizeof(*expected)) : NULL;
    catalog_t *cat = &fs->catalog[i % CATALOG_SLOTS];
    memset(cat, 0, sizeof(*cat));
    uint32_t offset = SH, sum = ~0u;
    for (unsigned j = 0; !r && j < count; j++) {
      pfs_info_t info;
      location_t loc;
      r = read_verified_record(fs, &io, offset, SH + body, &info, &loc, &sum);
      if (!r) {
        uint32_t hash = path_hash(info.path);
        if (expected)
          index_add(expected, j, hash, offset);
        else
          r = mount_index_contains(fs, &io, count, body, hash, offset);
      }
      if (!r) {
        catalog_parent_add(cat, info.path);
        offset += loc.size;
        objects++;
      }
    }
    uint8_t footer[4];
    if (!r && offset != SH + body)
      r = LFS_ERR_CORRUPT;
    uint32_t previous = 0, previous_offset = 0;
    for (unsigned j = 0; !r && j < count; j++) {
      uint8_t entry[IX];
      r = read_at(fs, &io, offset, entry, IX);
      if (r)
        break;
      uint32_t hash = u32(entry), record_offset = u32(entry + 4);
      if (u32(entry + 8) != ~crc(~0u, entry, 8) ||
          (j && (hash < previous ||
                 (hash == previous && record_offset <= previous_offset))) ||
          record_offset < SH || record_offset >= SH + body) {
        r = LFS_ERR_CORRUPT;
        break;
      }
      if (expected && (hash != expected[j].hash ||
                       record_offset != expected[j].offset))
        r = LFS_ERR_CORRUPT;
      if (!r)
        catalog_add(cat, hash);
      previous = hash;
      previous_offset = record_offset;
      sum = crc(sum, entry, IX);
      offset += IX;
    }
    if (!r)
      r = read_at(fs, &io, offset, footer, 4);
    if (!r && u32(footer) != ~sum)
      r = LFS_ERR_CORRUPT;
    r = io_close(fs, &io, r);
    if (expected)
      fs->release(expected);
    /* Reuse this already verified index. An unsuccessful shard never
     * becomes a valid cache entry, including footer/close failures. */
    if (!r) {
      cat->count = count;
      cat->body = body;
      cat->id = fs->current.ids[i];
    }
  }
  if (!r && objects != fs->current.objects)
    r = LFS_ERR_CORRUPT;
  if (r) {
    lfs_unmount(&fs->lfs);
    return r;
  }
  fs->mounted = true;
  fs->poisoned = false;
  return 0;
}
int pfs_format(pfs_t *fs) {
  if (!fs)
    return LFS_ERR_INVAL;
  int r = pfs_unmount(fs);
  if (r)
    return r;
  r = lfs_format(&fs->lfs, &fs->cfg);
  if (r)
    return r;
  r = lfs_mount(&fs->lfs, &fs->cfg);
  if (r)
    return r;
  fs->mounted = true;
  fs->poisoned = false;
  memset(fs->catalog, 0, sizeof(fs->catalog));
  manifest_t m = {0};
  m.generation = m.next_id = m.pending = 1;
  r = publish(fs, &m);
  if (r)
    fs->poisoned = true;
  return r;
}
int pfs_bind_import(pfs_t *fs, const uint8_t digest[32]) {
  int r = ready(fs, true);
  if (r)
    return r;
  if (!digest)
    return LFS_ERR_INVAL;
  if (!pfs_idle(fs))
    return BUSY;
  if (fs->current.bound)
    return memcmp(fs->current.archive, digest, 32) ? LFS_ERR_EXIST : 0;
  if (!fs->current.pending || fs->current.objects)
    return LFS_ERR_INVAL;
  r = collect(fs);
  if (r)
    return r;
  if (fs->current.generation == UINT32_MAX)
    return LFS_ERR_NOSPC;
  manifest_t m = fs->current;
  m.bound = 1;
  memcpy(m.archive, digest, 32);
  m.generation++;
  return publish(fs, &m);
}
int pfs_finish_import(pfs_t *fs) {
  if (!fs || !fs->mounted || !fs->current.bound)
    return LFS_ERR_INVAL;
  if (!pfs_idle(fs))
    return BUSY;
  int r = pfs_gc(fs);
  if (r)
    return r;
  if (!fs->current.pending)
    return 0;
  if (fs->current.generation == UINT32_MAX)
    return LFS_ERR_NOSPC;
  manifest_t m = fs->current;
  m.pending = 0;
  m.generation++;
  return publish(fs, &m);
}
int pfs_space(pfs_t *fs, uint32_t *total, uint32_t *free_bytes) {
  if (!total || !free_bytes)
    return LFS_ERR_INVAL;
  *total = *free_bytes = 0;
  int r = ready(fs, false);
  if (r)
    return r;
  lfs_ssize_t n = lfs_fs_size(&fs->lfs);
  if (n < 0)
    return (int)n;
  if ((uint32_t)n > PFS_BLOCK_COUNT)
    return LFS_ERR_CORRUPT;
  *total = DISK;
  *free_bytes = DISK - (uint32_t)n * PFS_BLOCK_SIZE;
  return 0;
}
int pfs_stat(pfs_t *fs, const char *path, pfs_info_t *info) {
  if (!info)
    return LFS_ERR_INVAL;
  memset(info, 0, sizeof(*info));
  int r = ready(fs, false);
  if (!r)
    r = valid_path(path, true);
  if (r)
    return r;
  if (!strcmp(path, "/")) {
    info->type = PFS_DIR;
    info->path[0] = '/';
    return 0;
  }
  location_t loc;
  return lookup(fs, &fs->current, path, info, &loc);
}

static bool matches(const change_t *c, const char *path) {
  return !strcmp(path, c->path) || (c->subtree && descendant(path, c->path));
}
static int transform(const change_t *c, pfs_info_t *info, bool *keep) {
  *keep = true;
  if (!matches(c, info->path))
    return 0;
  if (c->op == REMOVE) {
    *keep = false;
    return 0;
  }
  if (c->op == PUT) {
    *info = c->info;
    return 0;
  }
  if (c->op == ATTR) {
    memcpy(info->meta, c->info.meta, PFS_META_SIZE);
    return 0;
  }
  size_t old = strlen(c->path), prefix = strlen(c->target),
         tail = strlen(info->path) - old;
  if (prefix + tail >= PFS_PATH_MAX)
    return LFS_ERR_NAMETOOLONG;
  memmove(info->path + prefix, info->path + old, tail + 1);
  memcpy(info->path, c->target, prefix);
  return valid_path(info->path, false);
}
static int write_record(pfs_t *fs, io_t *output, const pfs_info_t *info,
                        io_t *input, uint32_t input_offset,
                        uint32_t *body_crc) {
  uint8_t h[RH] = {0};
  put32(h, R_MAGIC);
  put32(h + 4, info->size);
  size_t len = strlen(info->path);
  h[8] = (uint8_t)len;
  h[9] = (uint8_t)(len >> 8);
  h[10] = info->type;
  put32(h + 12, ~crc(~0u, h, 12));
  uint32_t sum = ~0u;
  int r = emit(fs, output, h, sizeof(h), &sum, body_crc);
  if (!r)
    r = emit(fs, output, info->path, (uint32_t)len, &sum, body_crc);
  if (!r)
    r = emit(fs, output, info->meta, PFS_META_SIZE, &sum, body_crc);
  for (uint32_t off = 0; !r && off < info->size;) {
    uint32_t n = info->size - off;
    if (n > PFS_CACHE_SIZE)
      n = PFS_CACHE_SIZE;
    if (!input)
      return LFS_ERR_CORRUPT;
    r = read_at(fs, input, input_offset + off, fs->copy, n);
    if (!r)
      r = emit(fs, output, fs->copy, n, &sum, body_crc);
    off += n;
  }
  put32(h, ~sum);
  return r ? r : emit(fs, output, h, 4, NULL, NULL);
}
static int rebuild(pfs_t *fs, const change_t *c, uint32_t oldid, uint32_t newid,
                   uint32_t count, uint32_t body, bool add) {
  if (count > MAX_RECORDS)
    return LFS_ERR_NOSPC;
  index_t *index = fs->alloc(count * sizeof(*index));
  if (!index)
    return LFS_ERR_NOMEM;
  unsigned indexed = 0;
  uint32_t output_offset = SH;
  char path[16];
  shard_name(newid, path);
  io_t output, input;
  memset(&input, 0, sizeof(input));
  int r = io_open(fs, &output, path, LFS_O_WRONLY | LFS_O_CREAT | LFS_O_EXCL);
  if (r) {
    fs->release(index);
    return r;
  }
  uint8_t h[SH] = {0};
  put32(h, S_MAGIC);
  put32(h + 4, PFS_FORMAT_VERSION);
  put32(h + 8, newid);
  put32(h + 12, count);
  put32(h + 16, body);
  put32(h + 20, ~crc(~0u, h, 20));
  r = emit(fs, &output, h, sizeof(h), NULL, NULL);
  uint32_t sum = ~0u;
  if (!r && oldid) {
    shard_name(oldid, path);
    r = io_open(fs, &input, path, LFS_O_RDONLY);
    uint32_t oldcount = 0, oldbody = 0;
    if (!r)
      r = shard_header(fs, &input, oldid, &oldcount, &oldbody);
    uint32_t offset = SH;
    for (unsigned j = 0; !r && j < oldcount; j++) {
      pfs_info_t info;
      location_t loc;
      r = read_record(fs, &input, offset, SH + oldbody, &info, &loc, true);
      if (!r)
        r = verify_record(fs, &input, &loc, NULL);
      if (r)
        break;
      bool replaced = c->op == PUT && !strcmp(info.path, c->path), keep;
      r = transform(c, &info, &keep);
      if (!r && keep) {
        index_add(index, indexed++, path_hash(info.path), output_offset);
        output_offset += record_size(&info);
      }
      if (!r && keep)
        r = write_record(fs, &output, &info, replaced ? &c->stage->io : &input,
                         replaced ? 0 : loc.data, &sum);
      offset += loc.size;
    }
  }
  if (!r && add) {
    index_add(index, indexed++, path_hash(c->info.path), output_offset);
    output_offset += record_size(&c->info);
  }
  if (!r && add)
    r = write_record(fs, &output, &c->info, c->stage ? &c->stage->io : NULL, 0,
                     &sum);
  r = io_close(fs, &input, r);
  if (!r && (indexed != count || output_offset != SH + body))
    r = LFS_ERR_CORRUPT;
  for (unsigned j = 0; !r && j < indexed; j++) {
    uint8_t entry[IX];
    put32(entry, index[j].hash);
    put32(entry + 4, index[j].offset);
    put32(entry + 8, ~crc(~0u, entry, 8));
    r = emit(fs, &output, entry, IX, NULL, &sum);
  }
  fs->release(index);
  put32(h, ~sum);
  if (!r)
    r = emit(fs, &output, h, 4, NULL, NULL);
  if (!r)
    r = lfs_file_sync(&fs->lfs, &output.f);
  return io_close(fs, &output, r);
}
static int transact(pfs_t *fs, const change_t *c) {
  int r = ready(fs, true);
  if (r)
    return r;
  if (fs->current.pending && !fs->current.bound)
    return LFS_ERR_INVAL;
  if (fs->writer && fs->writer != c->stage)
    return BUSY;
  if (fs->current.generation == UINT32_MAX)
    return LFS_ERR_NOSPC;
  /* A stage writer already collected before it acquired the exclusive
   * writer slot. No other mutation can create garbage until publication.
   * Readers may have released old snapshots in the meantime; collect those
   * only if the reserved transaction space actually needs them. A retry after
   * an earlier commit attempt must also collect its unpublished outputs. */
  bool staged = fs->writer && fs->writer == c->stage;
  if (!staged || c->stage->commit_started) {
    r = collect(fs);
    if (r)
      return r;
  }
  bool affected[PFS_MAX_SHARDS] = {0};
  uint32_t counts[PFS_MAX_SHARDS] = {0}, bodies[PFS_MAX_SHARDS] = {0};
  pfs_info_t info;
  location_t loc;
  uint32_t objects = fs->current.objects;
  for (unsigned i = 0; i < fs->current.count; i++) {
    catalog_t *cat;
    r = get_catalog(fs, i, &cat);
    if (r)
      return io_error(fs, r);
    counts[i] = cat->count;
    bodies[i] = cat->body;
  }
  if (c->subtree) {
    cursor_t cursor = {0};
    while ((r = next_record(fs, &fs->current, &cursor, &info, &loc, 64)) > 0) {
      if (!matches(c, info.path))
        continue;
      unsigned slot = cursor.shard;
      affected[slot] = true;
      bool keep;
      r = transform(c, &info, &keep);
      if (r)
        break;
      bodies[slot] -= loc.size;
      if (keep) {
        uint32_t size = record_size(&info);
        if (size > DISK - bodies[slot]) {
          r = LFS_ERR_NOSPC;
          break;
        }
        bodies[slot] += size;
      } else {
        counts[slot]--;
        objects--;
      }
    }
    r = cursor_close(fs, &cursor, r < 0 ? r : 0);
    if (r)
      return io_error(fs, r);
  } else if (c->exists) {
    r = lookup(fs, &fs->current, c->path, &info, &loc);
    if (r)
      return io_error(fs, r);
    unsigned slot = 0;
    while (slot < fs->current.count && fs->current.ids[slot] != loc.shard)
      slot++;
    if (slot == fs->current.count)
      return io_error(fs, LFS_ERR_CORRUPT);
    affected[slot] = true;
    bool keep;
    r = transform(c, &info, &keep);
    if (r)
      return r;
    bodies[slot] -= loc.size;
    if (keep) {
      uint32_t size = record_size(&info);
      if (size > DISK - bodies[slot])
        return LFS_ERR_NOSPC;
      bodies[slot] += size;
    } else {
      counts[slot]--;
      objects--;
    }
  }
  int addslot = -1;
  bool append = c->op == PUT && !c->exists;
  if (append) {
    uint32_t size = record_size(&c->info);
    if (size > DISK - SH - 4)
      return LFS_ERR_NOSPC;
    if (fs->current.count &&
        bodies[fs->current.count - 1] + size + SH + 4 +
                (counts[fs->current.count - 1] + 1) * IX <=
            PFS_SHARD_TARGET &&
        counts[fs->current.count - 1] < MAX_RECORDS)
      addslot = (int)fs->current.count - 1;
    else if (fs->current.count < PFS_MAX_SHARDS)
      addslot = (int)fs->current.count;
    else
      return LFS_ERR_NOSPC;
    affected[addslot] = true;
    bodies[addslot] += size;
    counts[addslot]++;
    objects++;
  }
  uint32_t needed = 8;
  unsigned slots =
      fs->current.count + (append && addslot == (int)fs->current.count);
  for (unsigned i = 0; i < slots; i++)
    if (affected[i] && counts[i])
      needed += blocks_for(SH + bodies[i] + counts[i] * IX + 4);
  r = reserve(fs, needed);
  if (r == LFS_ERR_NOSPC && staged) {
    r = collect(fs);
    if (!r)
      r = reserve(fs, needed);
  }
  if (r)
    return r;
  manifest_t m = fs->current;
  m.count = 0;
  m.objects = objects;
  m.generation++;
  if (staged)
    c->stage->commit_started = true;
  fs->transaction = true;
  for (unsigned i = 0; !r && i < slots; i++) {
    if (!affected[i]) {
      m.ids[m.count++] = fs->current.ids[i];
      continue;
    }
    if (!counts[i])
      continue;
    if (m.next_id == UINT32_MAX) {
      r = LFS_ERR_NOSPC;
      break;
    }
    uint32_t id = m.next_id++;
    r = rebuild(fs, c, i < fs->current.count ? fs->current.ids[i] : 0, id,
                counts[i], bodies[i], (int)i == addslot);
    if (!r)
      m.ids[m.count++] = id;
  }
  if (!r)
    r = publish(fs, &m);
  fs->transaction = false;
  return io_error(fs, r);
}
int pfs_mkdir(pfs_t *fs, const char *path) {
  int r = ready(fs, true);
  if (!r)
    r = valid_path(path, false);
  if (r)
    return r;
  if (fs->writer)
    return BUSY;
  pfs_info_t info;
  location_t loc;
  r = lookup(fs, &fs->current, path, &info, &loc);
  if (r != LFS_ERR_NOENT)
    return r ? r : LFS_ERR_EXIST;
  r = parent_exists(fs, path);
  if (r)
    return r;
  change_t c = {0};
  c.op = PUT;
  c.path = path;
  c.info.type = PFS_DIR;
  memset(c.info.meta, 0xff, PFS_META_SIZE);
  memcpy(c.info.path, path, strlen(path) + 1);
  return transact(fs, &c);
}
int pfs_setattr(pfs_t *fs, const char *path,
                const uint8_t meta[PFS_META_SIZE]) {
  if (!meta)
    return LFS_ERR_INVAL;
  int r = ready(fs, true);
  if (r)
    return r;
  if (fs->writer)
    return BUSY;
  if (fs->current.pending && !fs->current.bound)
    return LFS_ERR_INVAL;
  change_t c = {0};
  r = pfs_stat(fs, path, &c.info);
  if (r)
    return r;
  if (!strcmp(path, "/"))
    return LFS_ERR_INVAL;
  if (!memcmp(c.info.meta, meta, PFS_META_SIZE))
    return 0;
  c.op = ATTR;
  c.path = path;
  c.exists = true;
  memcpy(c.info.meta, meta, PFS_META_SIZE);
  return transact(fs, &c);
}
int pfs_rename(pfs_t *fs, const char *path, const char *target) {
  int r = ready(fs, true);
  if (!r)
    r = valid_path(path, false);
  if (!r)
    r = valid_path(target, false);
  if (r)
    return r;
  if (fs->writer)
    return BUSY;
  pfs_info_t info;
  location_t loc;
  r = lookup(fs, &fs->current, path, &info, &loc);
  if (r)
    return r;
  if (!strcmp(path, target))
    return 0;
  bool dir = info.type == PFS_DIR;
  if (dir && descendant(target, path))
    return LFS_ERR_INVAL;
  r = lookup(fs, &fs->current, target, &info, &loc);
  if (r != LFS_ERR_NOENT)
    return r ? r : LFS_ERR_EXIST;
  r = parent_exists(fs, target);
  if (r)
    return r;
  change_t c = {0};
  c.op = RENAME;
  c.path = path;
  c.target = target;
  c.subtree = dir;
  c.exists = true;
  return transact(fs, &c);
}
int pfs_remove(pfs_t *fs, const char *path, bool recursive) {
  int r = ready(fs, true);
  if (!r)
    r = valid_path(path, false);
  if (r)
    return r;
  if (fs->writer)
    return BUSY;
  pfs_info_t info;
  location_t loc;
  r = lookup(fs, &fs->current, path, &info, &loc);
  if (r)
    return r;
  bool dir = info.type == PFS_DIR;
  if (dir && !recursive) {
    cursor_t cursor = {0};
    while ((r = next_record(fs, &fs->current, &cursor, &info, &loc, 64)) > 0)
      if (descendant(info.path, path)) {
        r = LFS_ERR_NOTEMPTY;
        break;
      }
    r = cursor_close(fs, &cursor, r < 0 ? r : 0);
    if (r)
      return r;
  }
  change_t c = {0};
  c.op = REMOVE;
  c.path = path;
  c.subtree = dir;
  c.exists = true;
  return transact(fs, &c);
}

static void attach(pfs_t *fs, handle_t *h, unsigned kind) {
  h->fs = fs;
  h->kind = (uint8_t)kind;
  h->next = fs->handles;
  fs->handles = h;
  fs->handle_count++;
}
static void detach(handle_t *h) {
  pfs_t *fs = h->fs;
  handle_t **p = &fs->handles;
  while (*p && *p != h)
    p = &(*p)->next;
  if (*p) {
    *p = h->next;
    fs->handle_count--;
  }
  fs->release(h);
}
int pfs_open(pfs_t *fs, const char *path, int flags, pfs_file_t **output) {
  if (!output)
    return LFS_ERR_INVAL;
  *output = NULL;
  bool writing = (flags & 3) != LFS_O_RDONLY;
  int r = ready(fs, writing);
  if (!r)
    r = valid_path(path, false);
  if (r)
    return r;
  if ((flags & 3) == 0 ||
      (flags & ~(LFS_O_RDONLY | LFS_O_WRONLY | LFS_O_CREAT | LFS_O_EXCL |
                 LFS_O_TRUNC | LFS_O_APPEND)) ||
      (!writing &&
       (flags & (LFS_O_CREAT | LFS_O_EXCL | LFS_O_TRUNC | LFS_O_APPEND))))
    return LFS_ERR_INVAL;
  if (writing && fs->current.pending && !fs->current.bound)
    return LFS_ERR_INVAL;
  if (fs->handle_count >= PFS_MAX_HANDLES || (writing && fs->writer))
    return BUSY;
  pfs_info_t info;
  location_t loc;
  r = lookup(fs, &fs->current, path, &info, &loc);
  bool exists = !r;
  if (r && r != LFS_ERR_NOENT)
    return r;
  if (!exists && !(flags & LFS_O_CREAT))
    return LFS_ERR_NOENT;
  if (exists && info.type != PFS_FILE)
    return LFS_ERR_ISDIR;
  if (exists && (flags & LFS_O_CREAT) && (flags & LFS_O_EXCL))
    return LFS_ERR_EXIST;
  if (!exists) {
    r = parent_exists(fs, path);
    if (r)
      return r;
    memset(&info, 0, sizeof(info));
    memset(info.meta, 0xff, PFS_META_SIZE);
    info.type = PFS_FILE;
    memcpy(info.path, path, strlen(path) + 1);
    memset(&loc, 0, sizeof(loc));
  }
  pfs_file_t *file = fs->alloc(sizeof(*file));
  if (!file)
    return LFS_ERR_NOMEM;
  memset(file, 0, sizeof(*file));
  file->info = info;
  file->loc = loc;
  file->flags = flags;
  file->writing = writing;
  if (writing) {
    r = collect(fs);
    if (!r)
      r = reserve(fs, 8 + blocks_for(flags & LFS_O_TRUNC ? 0 : info.size));
    if (!r)
      r = io_open(fs, &file->io, STAGE, LFS_O_RDWR | LFS_O_CREAT | LFS_O_EXCL);
    if (!r && exists && !(flags & LFS_O_TRUNC)) {
      char name[16];
      shard_name(loc.shard, name);
      io_t old;
      r = io_open(fs, &old, name, LFS_O_RDONLY);
      if (!r)
        r = verify_record(fs, &old, &loc, NULL);
      for (uint32_t offset = 0; !r && offset < info.size;) {
        uint32_t n = info.size - offset;
        if (n > PFS_CACHE_SIZE)
          n = PFS_CACHE_SIZE;
        r = read_at(fs, &old, loc.data + offset, fs->copy, n);
        if (!r)
          r = emit(fs, &file->io, fs->copy, n, NULL, NULL);
        offset += n;
      }
      r = io_close(fs, &old, r);
    }
    if (!r) {
      lfs_soff_t pos =
          lfs_file_seek(&fs->lfs, &file->io.f, 0,
                        (flags & LFS_O_APPEND) ? LFS_SEEK_END : LFS_SEEK_SET);
      if (pos < 0)
        r = (int)pos;
    }
  } else {
    char name[16];
    shard_name(loc.shard, name);
    r = io_open(fs, &file->io, name, LFS_O_RDONLY);
    if (!r)
      r = verify_record(fs, &file->io, &loc, NULL);
  }
  if (r) {
    io_close(fs, &file->io, r);
    fs->release(file);
    return writing ? io_error(fs, r) : r;
  }
  attach(fs, &file->h, 1);
  if (writing)
    fs->writer = file;
  *output = file;
  return 0;
}
lfs_ssize_t pfs_read(pfs_file_t *file, void *buffer, lfs_size_t size) {
  if (!file || (size && !buffer) || !(file->flags & LFS_O_RDONLY))
    return LFS_ERR_BADF;
  pfs_t *fs = file->h.fs;
  if (file->writing)
    return lfs_file_read(&fs->lfs, &file->io.f, buffer, size);
  if (size > file->info.size - file->pos)
    size = file->info.size - file->pos;
  if (!size)
    return 0;
  int r = read_at(fs, &file->io, file->loc.data + file->pos, buffer, size);
  if (r)
    return r;
  file->pos += size;
  return (lfs_ssize_t)size;
}
lfs_ssize_t pfs_write(pfs_file_t *file, const void *buffer, lfs_size_t size) {
  if (!file || !file->writing || (size && !buffer))
    return LFS_ERR_BADF;
  pfs_t *fs = file->h.fs;
  if (fs->poisoned)
    return LFS_ERR_IO;
  if (file->flags & LFS_O_APPEND) {
    lfs_soff_t end = lfs_file_seek(&fs->lfs, &file->io.f, 0, LFS_SEEK_END);
    if (end < 0)
      return io_error(fs, (int)end);
  }
  lfs_soff_t pos = lfs_file_tell(&fs->lfs, &file->io.f);
  if (pos < 0)
    return (int)pos;
  if (size > DISK || (uint32_t)pos > DISK - size)
    return LFS_ERR_FBIG;
  lfs_ssize_t r = lfs_file_write(&fs->lfs, &file->io.f, buffer, size);
  return r < 0 ? io_error(fs, (int)r) : r;
}
lfs_soff_t pfs_seek(pfs_file_t *file, lfs_soff_t offset, int whence) {
  if (!file)
    return LFS_ERR_BADF;
  if (file->writing)
    return lfs_file_seek(&file->h.fs->lfs, &file->io.f, offset, whence);
  if (whence != LFS_SEEK_SET && whence != LFS_SEEK_CUR &&
      whence != LFS_SEEK_END)
    return LFS_ERR_INVAL;
  int64_t base = whence == LFS_SEEK_SET   ? 0
                 : whence == LFS_SEEK_CUR ? file->pos
                                          : file->info.size;
  int64_t pos = base + offset;
  if (base < 0 || pos < 0 || pos > file->info.size)
    return LFS_ERR_INVAL;
  file->pos = (uint32_t)pos;
  return (lfs_soff_t)pos;
}
int pfs_abort(pfs_file_t *file) {
  if (!file)
    return 0;
  pfs_t *fs = file->h.fs;
  int r = io_close(fs, &file->io, LFS_ERR_IO);
  (void)r;
  if (fs->writer == file)
    fs->writer = NULL;
  detach(&file->h);
  return 0;
}
int pfs_close(pfs_file_t *file) {
  if (!file)
    return LFS_ERR_BADF;
  pfs_t *fs = file->h.fs;
  if (!file->writing) {
    int r = io_close(fs, &file->io, 0);
    detach(&file->h);
    return r;
  }
  if (fs->poisoned)
    return LFS_ERR_IO;
  int r = lfs_file_sync(&fs->lfs, &file->io.f);
  if (r)
    return io_error(fs, r);
  lfs_soff_t size = lfs_file_size(&fs->lfs, &file->io.f);
  if (size < 0)
    return io_error(fs, (int)size);
  change_t c = {0};
  c.op = PUT;
  c.path = file->info.path;
  c.info = file->info;
  c.info.size = (uint32_t)size;
  c.stage = file;
  c.exists = file->loc.shard != 0;
  r = transact(fs, &c);
  if (r)
    return r;
  /* Publication is durable. Cleanup is deferred to GC; no postcommit retry. */
  r = io_close(fs, &file->io, 0);
  if (r)
    fs->poisoned = true;
  fs->writer = NULL;
  detach(&file->h);
  return 0;
}
/* The existing PUT transaction publishes content and raw128 together. */
lfs_ssize_t pfs_replace(pfs_t *fs, const char *path, const void *data,
                        lfs_size_t size, const uint8_t meta[PFS_META_SIZE]) {
  if ((size && !data) || size > DISK)
    return LFS_ERR_INVAL;
  pfs_file_t *file = NULL;
  int r = pfs_open(fs, path, LFS_O_WRONLY | LFS_O_CREAT | LFS_O_TRUNC, &file);
  if (r)
    return r;
  if (meta)
    memcpy(file->info.meta, meta, PFS_META_SIZE);
  else if (!file->loc.shard)
    memset(file->info.meta, 0, PFS_META_SIZE);
  lfs_ssize_t written = pfs_write(file, data, size);
  r = written < 0 ? (int)written : (lfs_size_t)written != size ? LFS_ERR_IO : 0;
  if (!r)
    r = pfs_close(file);
  if (r)
    pfs_abort(file);
  return r ? r : (lfs_ssize_t)size;
}
int pfs_opendir(pfs_t *fs, const char *path, pfs_dir_t **output) {
  if (!output)
    return LFS_ERR_INVAL;
  *output = NULL;
  pfs_info_t info;
  int r = pfs_stat(fs, path, &info);
  if (r)
    return r;
  if (info.type != PFS_DIR)
    return LFS_ERR_NOTDIR;
  if (fs->handle_count >= PFS_MAX_HANDLES)
    return BUSY;
  pfs_dir_t *dir = fs->alloc(sizeof(*dir));
  if (!dir)
    return LFS_ERR_NOMEM;
  memset(dir, 0, sizeof(*dir));
  dir->snapshot = fs->current;
  memcpy(dir->path, path, strlen(path) + 1);
  attach(fs, &dir->h, 2);
  *output = dir;
  return 0;
}
int pfs_readdir(pfs_dir_t *dir, pfs_info_t *info) {
  if (!dir || !info)
    return LFS_ERR_BADF;
  location_t loc;
  int r;
  size_t n = strlen(dir->path);
  const unsigned parent_bit = path_hash(dir->path) & 63u;
  while ((r = next_record(dir->h.fs, &dir->snapshot, &dir->cursor, info,
                          &loc, parent_bit)) > 0) {
    const char *name;
    if (n == 1)
      name = info->path + 1;
    else if (descendant(info->path, dir->path))
      name = info->path + n + 1;
    else
      continue;
    if (*name && !strchr(name, '/')) {
      r = read_at(dir->h.fs, &dir->cursor.io, loc.data - PFS_META_SIZE,
                  info->meta, PFS_META_SIZE);
      return r ? cursor_close(dir->h.fs, &dir->cursor, r) : 1;
    }
  }
  return r;
}
int pfs_closedir(pfs_dir_t *dir) {
  if (!dir)
    return LFS_ERR_BADF;
  int r = cursor_close(dir->h.fs, &dir->cursor, 0);
  detach(&dir->h);
  return r;
}
