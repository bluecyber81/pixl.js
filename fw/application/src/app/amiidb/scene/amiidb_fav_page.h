#ifndef AMIIDB_FAV_PAGE_H
#define AMIIDB_FAV_PAGE_H
#include "app_amiidb.h"
/* Shared bounded page storage for the mutually exclusive favorite screens. */
void amiidb_fav_page_reset(app_amiidb_t *app);
bool amiidb_fav_page_step(app_amiidb_t *app, uint16_t icon);
void amiidb_fav_page_load(app_amiidb_t *app, bool folders_only);
#endif
