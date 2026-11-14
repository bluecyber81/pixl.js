#ifndef AMIIDB_FAV_PAGE_H
#define AMIIDB_FAV_PAGE_H
#include "app_amiidb.h"
/* Shared bounded renderer; source and destination keep separate page keys. */
void amiidb_fav_page_reset(app_amiidb_t *app);
bool amiidb_fav_page_step(app_amiidb_t *app, uint16_t icon);
void amiidb_fav_page_load(app_amiidb_t *app, bool folders_only);
bool amiidb_fav_page_focus(app_amiidb_t *app, const amiidb_fav_t *favorite);
bool amiidb_fav_select_page_step(app_amiidb_t *app, uint16_t icon);
void amiidb_fav_select_page_load(app_amiidb_t *app);
#endif
