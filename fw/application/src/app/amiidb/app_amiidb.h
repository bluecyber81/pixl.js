#ifndef APP_AMIIDB_H
#define APP_AMIIDB_H

#include "mini_app_defines.h"
#include "mui_list_view.h"
#include "mui_msg_box.h"
#include "mui_scene_dispatcher.h"
#include "mui_text_input.h"
#include "ntag_def.h"
#include "vfs.h"
#include "amiibo_view.h"
#include "mui_toast_view.h"

#include "amiidb_api_fav.h"
#include "amiidb_api_db.h"

#include "mlib_common.h"
#include "db_header.h"

#define LIST_VIEW_ITEM_MAX_COUNT 100

ARRAY_DEF(amiidb_fav_array, amiidb_fav_t, M_POD_OPLIST);



typedef struct {
    mui_list_view_t *p_list_view;
    mui_text_input_t *p_text_input;
    mui_msg_box_t *p_msg_box;
    amiibo_view_t * p_amiibo_view;
    mui_toast_view_t *p_toast_view;
    mui_view_dispatcher_t *p_view_dispatcher;
    mui_scene_dispatcher_t *p_scene_dispatcher;

    mui_view_dispatcher_t *p_view_dispatcher_toast;

    /** amiibo detail */
    ntag_t ntag;
    uint8_t prev_scene_id;

    /** search */
    string_t search_str;
    uint16_t search_page;
    uint16_t game_page;
    uint16_t search_filter_page;
    uint16_t game_page_path[8];
    uint16_t game_scroll_path[8];
    uint8_t game_focus_path[8];
    uint8_t search_game_id;
    bool search_filter_select;
    bool search_restore_focus;
    const db_amiibo_t *result_items[AMIIDB_RESULT_PAGE_SIZE];
    uint16_t result_count;
    uint16_t result_total;

    amiidb_fav_array_t fav_array;
    
    /** file browser*/
    const db_amiibo_t * cur_amiibo;
    uint16_t game_id_path[8];
    uint8_t game_id_index;

    /** fav list*/
    string_t cur_fav_dir;
    amiidb_fav_t cur_fav;
    amiidb_fav_info_t fav_page_anchor;
    int8_t fav_page_direction;
    uint8_t fav_page_focus;
    uint8_t fav_page_mode;
    /* Destination selection must not overwrite the source list or resume page. */
    amiidb_fav_info_t fav_select_anchor;
    int8_t fav_select_direction;
    uint8_t in_fav_folders;

    /** data slot */
    uint8_t cur_slot_index;

    uint8_t cur_focus_index;
    uint16_t cur_scroll_offset;

} app_amiidb_t;

typedef enum {
    AMIIDB_VIEW_ID_LIST,
    AMIIDB_VIEW_ID_DETAIL,
    AMIIDB_VIEW_ID_INPUT,
    AMIIDB_VIEW_ID_MSG_BOX,
    AMIIDB_VIEW_ID_TOAST
} amiidb_view_id_t;

/* Version 1 is a pointer-free navigation snapshot, never an NFC tag dump.
 * It is copied through an aligned local object because retain_data is unaligned.
 * Older unversioned App3 snapshots are deliberately not accepted. */
#define APP_AMIIDB_RESUME_MAGIC 0x31424441u
#define APP_AMIIDB_RESUME_VERSION 1u
typedef struct {
    uint32_t magic;
    uint16_t size;
    uint8_t version;
    uint8_t target_scene;
    uint32_t selected_head, selected_tail;
    amiidb_fav_t current_fav;
    amiidb_fav_info_t fav_page_anchor;
    amiidb_fav_t recent[AMIIDB_RECENT_LIMIT];
    uint16_t game_id_path[8];
    uint16_t game_page_path[8];
    uint16_t game_scroll_path[8];
    uint16_t search_page, game_page, scroll_offset;
    uint8_t game_focus_path[8];
    uint8_t origin_scene, game_id_index, focus_index, search_game_id;
    uint8_t slot_index, fav_page_focus, fav_page_mode, in_fav_folders;
    uint8_t recent_count;
    int8_t fav_page_direction;
    char search_str[AMIIDB_SEARCH_MAX_BYTES + 1];
    char fav_dir[VFS_MAX_NAME_LEN];
} app_amiidb_cache_data_t;


extern const mini_app_t app_amiidb_info;

#endif
