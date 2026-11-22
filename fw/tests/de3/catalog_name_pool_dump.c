/* Semantic catalog dump: independent of pointer/offset representation. */
#include <assert.h>
#include <inttypes.h>
#include <stdio.h>
#include <string.h>
#include "db_amiibo.c"
#include "db_game.c"
#include "db_link.c"

#ifdef PIXL_CATALOG_POINTER_NAMES
#define FIG_EN(a) ((a)->name_en)
#define FIG_CN(a) ((a)->name_cn)
#define GAME_EN(a) ((a)->name_en)
#define GAME_CN(a) ((a)->name_cn)
#else
#define FIG_EN(a) db_amiibo_name_en(a)
#define FIG_CN(a) db_amiibo_name_cn(a)
#define GAME_EN(a) db_game_name_en(a)
#define GAME_CN(a) db_game_name_cn(a)
static void bounded(const char *pool, size_t size, uint16_t offset) {
    assert(offset < size && memchr(pool + offset, 0, size - offset));
}
#endif

static void text_hex(const char *value) {
    for (const unsigned char *p = (const unsigned char *)value; *p; ++p)
        printf("%02x", *p);
    putchar(' ');
}

int main(void) {
    assert(sizeof(amiibo_list) / sizeof(*amiibo_list) == amiibo_list_size + 1);
    assert(!amiibo_list[amiibo_list_size].head && !amiibo_list[amiibo_list_size].tail);
    for (size_t i = 0; i < amiibo_list_size; ++i) {
        const db_amiibo_t *a = &amiibo_list[i];
#ifndef PIXL_CATALOG_POINTER_NAMES
        bounded(db_amiibo_name_pool, sizeof(db_amiibo_name_pool), a->name_en_offset);
        bounded(db_amiibo_name_pool, sizeof(db_amiibo_name_pool), a->name_cn_offset);
#endif
        printf("A %08" PRIx32 "%08" PRIx32 " ", a->head, a->tail);
        text_hex(FIG_EN(a)); text_hex(FIG_CN(a)); putchar('\n');
    }
    for (const db_game_t *g = game_list; g->game_id; ++g) {
#ifndef PIXL_CATALOG_POINTER_NAMES
        bounded(db_game_name_pool, sizeof(db_game_name_pool), g->name_en_offset);
        bounded(db_game_name_pool, sizeof(db_game_name_pool), g->name_cn_offset);
#endif
        printf("G %u %u %u %u ", g->game_id, g->parent_game_id, g->order, g->link_cnt);
        text_hex(GAME_EN(g)); text_hex(GAME_CN(g)); putchar('\n');
    }
    for (const db_link_t *link = link_list; link->game_id; ++link) {
        assert(link->amiibo_index < amiibo_list_size);
        assert(link->note_index < sizeof(db_usage_notes) / sizeof(*db_usage_notes));
        const db_amiibo_t *a = &amiibo_list[link->amiibo_index];
        const db_notes_t *notes = &db_usage_notes[link->note_index];
        printf("L %u %08" PRIx32 "%08" PRIx32 " ", link->game_id, a->head, a->tail);
        text_hex(notes->en); text_hex(notes->cn); text_hex(notes->it); putchar('\n');
    }
    return 0;
}
