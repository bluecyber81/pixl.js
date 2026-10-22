#include "amiidb_api_db.h"
#include <string.h>

#define QUERY_MAX_IDS 2048

static unsigned char ascii_lower(unsigned char c) { return c >= 'A' && c <= 'Z' ? c + ('a' - 'A') : c; }
static bool contains_text(const char *name, const char *query) {
    if (!name) return false;
    if (!*query) return true;
    for (; *name; name++) {
        const char *a = name, *b = query;
        while (*a && *b && ascii_lower(*a) == ascii_lower(*b)) { a++; b++; }
        if (!*b) return true;
    }
    return false;
}

static bool parse_id(const char *text, uint32_t *head, uint32_t *tail) {
    if (strlen(text) != 16) return false;
    uint32_t words[2] = {0, 0};
    for (unsigned i = 0; i < 16; i++) {
        unsigned char c = ascii_lower(text[i]);
        unsigned value;
        if (c >= '0' && c <= '9') value = c - '0';
        else if (c >= 'a' && c <= 'f') value = c - 'a' + 10;
        else return false;
        words[i / 8] = (words[i / 8] << 4) | value;
    }
    *head = words[0]; *tail = words[1];
    return true;
}

static bool game_contains(uint8_t filter, uint8_t game) {
    for (unsigned depth = 0; depth < 256 && game; depth++) {
        if (game == filter) return true;
        const db_game_t *entry = game_list;
        while (entry->game_id && entry->game_id != game) entry++;
        if (!entry->game_id) return false;
        game = entry->parent_game_id;
    }
    return false;
}

static int compare_amiibo(const db_amiibo_t *a, const db_amiibo_t *b) {
    int names = strcmp(a->name_en, b->name_en);
    if (names) return names;
    if (a->head != b->head) return a->head < b->head ? -1 : 1;
    return (a->tail > b->tail) - (a->tail < b->tail);
}

int32_t amiidb_api_db_search_page(const char *search, uint8_t game_id, uint16_t page,
                                const db_amiibo_t **items, uint16_t *total) {
    if (!search || !items || !total || amiibo_list_size > QUERY_MAX_IDS) return -1;
    *total = 0;
    size_t query_length = 0;
    while (query_length <= AMIIDB_SEARCH_MAX_BYTES && search[query_length]) query_length++;
    if (query_length > AMIIDB_SEARCH_MAX_BYTES) return -1;
    uint8_t matches[QUERY_MAX_IDS / 8] = {0};
    uint32_t head = 0, tail = 0;
    bool exact_id = parse_id(search, &head, &tail);
    for (size_t i = 0; i < amiibo_list_size; i++) {
        const db_amiibo_t *item = &amiibo_list[i];
        if (exact_id ? item->head != head || item->tail != tail :
            !contains_text(item->name_en, search) && !contains_text(item->name_cn, search)) continue;
        bool linked = game_id == 0;
        for (const db_link_t *link = link_list; !linked && link->game_id; link++) {
            if (link->head == item->head && link->tail == item->tail && game_contains(game_id, link->game_id)) linked = true;
        }
        if (linked) { matches[i / 8] |= 1u << (i % 8); (*total)++; }
    }
    if (!*total) return 0;
    uint16_t final_page = (*total - 1) / AMIIDB_RESULT_PAGE_SIZE;
    if (page > final_page) page = final_page;
    const db_amiibo_t *after = NULL;
    uint16_t count = 0;
    /* Repeated bounded top-100 selection avoids a 950-pointer allocation. */
    for (uint16_t current = 0; current <= page; current++) {
        count = 0;
        for (size_t i = 0; i < amiibo_list_size; i++) {
            const db_amiibo_t *item = &amiibo_list[i];
            if (!(matches[i / 8] & (1u << (i % 8))) || (after && compare_amiibo(item, after) <= 0)) continue;
            uint16_t pos = 0;
            while (pos < count && compare_amiibo(items[pos], item) < 0) pos++;
            if (pos >= AMIIDB_RESULT_PAGE_SIZE) continue;
            if (count < AMIIDB_RESULT_PAGE_SIZE) count++;
            memmove(items + pos + 1, items + pos, (count - pos - 1) * sizeof(*items));
            items[pos] = item;
        }
        if (!count) return 0;
        after = items[count - 1];
    }
    return count;
}

int32_t amiidb_api_db_search(const char *search, amiidb_db_search_cb_t cb, void *ctx) {
    if (!search || !cb) return -1;
    const db_amiibo_t *items[AMIIDB_RESULT_PAGE_SIZE];
    uint16_t total = 0;
    for (uint16_t page = 0;; page++) {
        int32_t count = amiidb_api_db_search_page(search, 0, page, items, &total);
        if (count < 0) return count;
        for (int32_t i = 0; i < count; i++) cb(items[i], ctx);
        if ((uint32_t)(page + 1) * AMIIDB_RESULT_PAGE_SIZE >= total) return 0;
    }
}
