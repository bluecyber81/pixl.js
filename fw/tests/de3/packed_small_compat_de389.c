/* SPDX-License-Identifier: GPL-2.0-only */
/* Three processes exchange the same 2 MiB image: App661 -> candidate -> App661. */
#include "packed_fs.h"
#include "packed_vfs_nor_de344.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static nor_fixture_t media;
enum { LEGACY_FILES = 32, NEW_FILES = 128, MAX_BYTES = 572 };

static size_t fixture(unsigned index, bool added, char path[PFS_PATH_MAX],
                      uint8_t data[MAX_BYTES], uint8_t meta[PFS_META_SIZE]) {
    snprintf(path, PFS_PATH_MAX, added ? "/ManySmall/f%03u.bin" : "/old/f%03u.bin", index);
    size_t size = 540;
    if (added && index < 3) {
        const size_t boundaries[] = {0, 1, MAX_BYTES};
        size = boundaries[index];
    }
    for (size_t k = 0; k < size; ++k) data[k] = (uint8_t)(index+k+(added ? 0 : 7));
    for (size_t k = 0; k < PFS_META_SIZE; ++k) meta[k] = added ? 0xff : (uint8_t)(index+3*k);
    return size;
}

static void check_files(pfs_t *fs, bool added) {
    unsigned files = added ? NEW_FILES : LEGACY_FILES;
    pfs_dir_t *dir;
    pfs_info_t info;
    REQUIRE(pfs_opendir(fs, added ? "/ManySmall" : "/old", &dir) == 0);
    unsigned count = 0;
    int next;
    while ((next = pfs_readdir(dir, &info)) > 0) ++count;
    REQUIRE(next == 0 && count == files && pfs_closedir(dir) == 0);
    for (unsigned i = 0; i < files; ++i) {
        char path[PFS_PATH_MAX];
        uint8_t expected[MAX_BYTES], actual[MAX_BYTES+1], meta[PFS_META_SIZE];
        size_t size = fixture(i, added, path, expected, meta);
        REQUIRE(pfs_stat(fs, path, &info)==0 && info.type==PFS_FILE && info.size==size);
        REQUIRE(!memcmp(info.meta, meta, sizeof(meta)));
        pfs_file_t *file;
        REQUIRE(pfs_open(fs, path, LFS_O_RDONLY, &file)==0);
        REQUIRE(pfs_read(file, actual, sizeof(actual))==(lfs_ssize_t)size);
        REQUIRE(!memcmp(actual, expected, size) && pfs_close(file)==0);
    }
}

int main(int argc, char **argv) {
    REQUIRE(argc == 3);
    bool seed = !strcmp(argv[2], "seed");
    bool append = !strcmp(argv[2], "append");
    REQUIRE(seed || append || !strcmp(argv[2], "read"));
    nor_init(&media);
    if (!seed) {
        FILE *image = fopen(argv[1], "rb");
        REQUIRE(image && fread(media.disk, 1, NOR_BYTES, image) == NOR_BYTES);
        REQUIRE(fgetc(image) == EOF && fclose(image)==0);
    }
    pfs_t *fs = pfs_new(&media.config, malloc, free);
    REQUIRE(fs);
    if (seed) {
        const uint8_t identity[32] = {42};
        REQUIRE(pfs_format(fs)==0 && pfs_bind_import(fs, identity)==0);
        REQUIRE(pfs_mkdir(fs, "/old")==0);
        for (unsigned i = 0; i < LEGACY_FILES; ++i) {
            char path[PFS_PATH_MAX];
            uint8_t data[MAX_BYTES], meta[PFS_META_SIZE];
            size_t size = fixture(i, false, path, data, meta);
            REQUIRE(pfs_replace(fs, path, data, size, meta)==(lfs_ssize_t)size);
        }
        REQUIRE(pfs_finish_import(fs)==0);
    } else {
        REQUIRE(pfs_mount(fs)==0);
    }
    check_files(fs, false);
#ifdef CANDIDATE_WRITER
    REQUIRE(append);
    REQUIRE(pfs_mkdir(fs, "/ManySmall")==0);
    for (unsigned i = 0; i < NEW_FILES; ++i) {
        char path[PFS_PATH_MAX];
        uint8_t data[MAX_BYTES], meta[PFS_META_SIZE];
        size_t size = fixture(i, true, path, data, meta);
        REQUIRE(pfs_create_small(fs, path, data, size)==0);
        REQUIRE(pfs_create_small(fs, path, data, size)==LFS_ERR_EXIST);
    }
    check_files(fs, false);
#else
    REQUIRE(!append);
#endif
    if (!seed) check_files(fs, true);
    REQUIRE(pfs_unmount(fs)==0 && pfs_destroy(fs)==0);
    if (seed || append) {
        FILE *image = fopen(argv[1], "wb");
        REQUIRE(image && fwrite(media.disk, 1, NOR_BYTES, image)==NOR_BYTES);
        REQUIRE(fclose(image)==0);
    }
    return 0;
}
