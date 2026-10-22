#ifndef AMIIDB_SCENE_ERRORS_H
#define AMIIDB_SCENE_ERRORS_H
#include "app_amiidb.h"
#include "i18n/language.h"
static inline void amiidb_fav_show_error(app_amiidb_t *app, int32_t result) {
    const char *message = result == VFS_ERR_MAXNM ? _T(DE3_FAV_INVALID) :
                          result == VFS_ERR_NOSPC ? _T(DE3_STORAGE_FULL) :
                          result == VFS_ERR_NODEV ? _T(DE3_STORAGE_UNAVAILABLE) : _T(DE3_FAV_IO_ERROR);
    mui_toast_view_show(app->p_toast_view, message);
}
#endif
