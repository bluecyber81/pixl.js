//
// Created by solos on 8/20/2023.
//

#ifndef FW_AMIIDB_API_DB_H
#define FW_AMIIDB_API_DB_H

#include "db_header.h"
#define AMIIDB_SEARCH_MAX_BYTES 32
#define AMIIDB_RESULT_PAGE_SIZE 100

typedef void (*amiidb_db_search_cb_t)(const db_amiibo_t *p_amiibo, void *ctx);

int32_t amiidb_api_db_search(const char *search, amiidb_db_search_cb_t cb, void *ctx);
/* Alphabetical, stable pages; game 0 includes all games, other IDs include descendants.
 * No heap allocation. Output contains only the requested page and total counts all hits. */
int32_t amiidb_api_db_search_page(const char *search, uint8_t game_id, uint16_t page,
                                const db_amiibo_t **items, uint16_t *total);

#endif // FW_AMIIDB_API_DB_H
