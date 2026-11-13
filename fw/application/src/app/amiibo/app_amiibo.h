#ifndef APP_AMIIBO_H
#define APP_AMIIBO_H

#include "amiibo_detail_view.h"
#include "mini_app_defines.h"
#include "mui_list_view.h"
#include "mui_msg_box.h"
#include "mui_scene_dispatcher.h"
#include "mui_text_input.h"
#include "mui_toast_view.h"
#include "ntag_def.h"
#include "vfs.h"

#include "mlib_common.h"

typedef struct {
    amiibo_detail_view_t *p_amiibo_detail_view;
    mui_list_view_t *p_list_view;
    mui_text_input_t *p_text_input;
    mui_msg_box_t *p_msg_box;
    mui_toast_view_t *p_toast_view;
    mui_view_dispatcher_t *p_view_dispatcher;
    mui_scene_dispatcher_t *p_scene_dispatcher;
    mui_view_dispatcher_t *p_view_dispatcher_toast;
    ntag_t ntag;

    /** file browser*/
    vfs_drive_t current_drive;
    string_t current_folder;
    string_t current_file;
    uint32_t current_focus_index;

    /**amiibo detail view*/
    char browser_anchor[VFS_MAX_NAME_LEN];
    uint16_t browser_anchor_icon;
    int8_t browser_direction; /* 0: first page, +1: after, -1: before anchor */
    bool reload_amiibo_files;
    bool focus_detail_file;

} app_amiibo_t;

typedef enum {
    AMIIBO_VIEW_ID_LIST,
    AMIIBO_VIEW_ID_DETAIL,
    AMIIBO_VIEW_ID_INPUT,
    AMIIBO_VIEW_ID_MSG_BOX,
    AMIIBO_VIEW_ID_TOAST
} amiibo_view_id_t;

typedef struct {
    bool cached_enabled;
    vfs_drive_t current_drive;
    char current_folder[128];
    char current_file[64];
    uint32_t current_focus_index;
    uint32_t current_scene_id;
    /* Versioned tail: the pre-DE3.32 208-byte prefix remains unchanged. */
    uint32_t browser_magic;
    char browser_anchor[VFS_MAX_NAME_LEN];
    uint16_t browser_anchor_icon;
    int8_t browser_direction;
} app_amiibo_cache_data_t;

#define APP_AMIIBO_CACHE_PAGE_MAGIC 0x41333250u

int32_t app_amiibo_file_neighbor(app_amiibo_t *app, int8_t direction, char *name,
                                 uint16_t *focus, uint16_t *total);

extern mini_app_t app_amiibo_info;

#endif
