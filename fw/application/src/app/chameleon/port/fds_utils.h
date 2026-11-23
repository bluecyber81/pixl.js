#ifndef FDS_UTILS_H
#define FDS_UTILS_H

#include "vfs_meta.h"

typedef enum {
    CHAMELEON_SAVE_CARD,
    CHAMELEON_READ_CARD, CHAMELEON_WRITE_CARD,
    CHAMELEON_READ_CONFIG, CHAMELEON_WRITE_CONFIG,
    CHAMELEON_SAVE_SETTINGS
} chameleon_save_stage_t;

typedef struct {
    chameleon_save_stage_t stage;
    int32_t code; /* Zero if validation/short I/O supplied no backend error. */
} chameleon_save_issue_t;

void chameleon_save_begin(void);
const chameleon_save_issue_t *chameleon_last_save_issue(void);
bool chameleon_save_settings(void);

#define CHELEMEON_DUMP_FOLDER "/chameleon/dump"

bool fds_config_file_exists();
int32_t fds_read_meta(uint16_t id, uint16_t key, vfs_meta_t *meta);
int32_t fds_write_meta(uint16_t id, uint16_t key, vfs_meta_t *meta);
#endif 