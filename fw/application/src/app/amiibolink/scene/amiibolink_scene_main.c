#include "amiibolink_scene.h"
#include "amiibolink_view.h"
#include "app_amiibolink.h"
#include "ble_amiibolink.h"
#include "ble_main.h"
#include "vfs.h"

#include "amiibo_helper.h"
#include "mini_app_launcher.h"
#include "mini_app_registry.h"
#include "ntag_emu.h"
#include "ntag_store.h"

#include "nrf_log.h"

#include "settings.h"

#define ICON_FOLDER 0xe1d6
#define ICON_FILE 0xe1ed
#define ICON_BACK 0xe069
#define ICON_ERROR 0xe1bb

#define DEFAULT_NTAG_INDEX 99
#define MAX_NTAG_INDEX 26

APP_TIMER_DEF(m_amiibo_gen_delay_timer);
static uint32_t m_generate_generation;
static uint8_t m_active_index;
static ble_amiibolink_mode_t m_active_mode;
static void ntag_update_cb(ntag_event_type_t type, void *context, ntag_t *p_ntag);

static void ntag_save_error(app_amiibolink_t *app) {
    (void)app;
    ntag_emu_save_failed();
    mui_update(mui());
}

static void amiibolink_scene_amiibo_detail_menu_msg_box_no_key_cb(mui_msg_box_event_t event, mui_msg_box_t *p_msg_box) {
    app_amiibolink_t *app = p_msg_box->user_data;
    if (event == MUI_MSG_BOX_EVENT_SELECT_CENTER) {
        mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIBOLINK_VIEW_ID_MAIN);
    }
}

static void amiibolink_scene_amiibo_detail_no_key_msg(app_amiibolink_t *app) {
    mui_msg_box_set_header(app->p_msg_box, getLangString(_L_AMIIBO_KEY_UNLOADED));
    mui_msg_box_set_message(app->p_msg_box, getLangString(_L_UPLOAD_KEY_RETAIL_BIN));
    mui_msg_box_set_btn_text(app->p_msg_box, NULL, getLangString(_L_KNOW), NULL);
    mui_msg_box_set_btn_focus(app->p_msg_box, 1);
    mui_msg_box_set_event_cb(app->p_msg_box, amiibolink_scene_amiibo_detail_menu_msg_box_no_key_cb);

    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIBOLINK_VIEW_ID_MSG_BOX);
}

/* Generation failures have no pending write to retry. Keep RF paused and
 * return through the menu, where a later entry can retry the selected mode. */
static void ntag_reload_error_back(mui_msg_box_event_t event, mui_msg_box_t *box) {
    app_amiibolink_t *app = box->user_data;
    if (event == MUI_MSG_BOX_EVENT_SELECT_CENTER)
        mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIBOLINK_SCENE_MENU);
}

static void ntag_reload_error(app_amiibolink_t *app) {
    mui_msg_box_set_header(app->p_msg_box, getLangString(_L_ERR));
    mui_msg_box_set_message(app->p_msg_box, getLangString(_L_FAILED));
    mui_msg_box_set_btn_text(app->p_msg_box, NULL, getLangString(_L_BACK), NULL);
    mui_msg_box_set_btn_focus(app->p_msg_box, 1);
    mui_msg_box_set_event_cb(app->p_msg_box, ntag_reload_error_back);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIBOLINK_VIEW_ID_MSG_BOX);
}

static void ntag_generate_cb(void* ctx) {
    app_amiibolink_t *app = ctx;
    if (!amiibo_helper_is_key_loaded()) {
        amiibolink_scene_amiibo_detail_no_key_msg(app);
        return;
    }

    if (!ntag_emu_prepare_change()) return;
    ret_code_t err_code = amiibo_helper_rand_amiibo_uuid(ntag_emu_get_current_tag());
    NRF_LOG_INFO("ntag generate: %d", err_code);
    if (err_code == NRF_SUCCESS) {
        mui_update(mui());
    }
    ntag_emu_set_tag(ntag_emu_get_current_tag());
}

static void ntag_generate_timer_request(void *context) {
    ntag_emu_request_action(ntag_generate_cb, context, m_generate_generation);
}

/* On LCD the pending-save callback must finish before the large next-tag
 * frame is entered. Other boards keep their existing inlining policy. */
#if defined(BOARD_LCD)
#define NTAG_RELOAD_PHASE __attribute__((noinline))
#else
#define NTAG_RELOAD_PHASE
#endif

#ifdef INTERNAL_ENABLE
static bool ntag_update(app_amiibolink_t *app, uint8_t index, ntag_t *p_ntag) {
    ret_code_t err_code = ntag_store_write(index, p_ntag);
    NRF_LOG_INFO("ntag_update: index=%d, err_code=%d", index, err_code);
    return err_code == NRF_SUCCESS;
}

static bool ntag_reload(app_amiibolink_t *app, uint8_t index) {
    if (!ntag_emu_prepare_change()) {
        amiibolink_view_set_index(app->p_amiibolink_view, m_active_index);
        return false;
    }
    ntag_t ntag;
    ret_code_t err_code = ntag_store_read(index, &ntag);
    if (err_code != NRF_SUCCESS) {
        amiibolink_view_set_index(app->p_amiibolink_view, m_active_index);
        ntag_reload_error(app);
        return false;
    }
    if (!ntag_emu_set_tag(&ntag)) return false;
    m_active_index = index;
    m_active_mode = app->amiibolink_mode;
    return true;
}

static void ntag_init() {}
#else

static bool ntag_update(app_amiibolink_t *app, uint8_t index, ntag_t *p_ntag) {
    char path[VFS_MAX_PATH_LEN] = {0};
    sprintf(path, "/amiibolink/%02d.bin", index);
    vfs_driver_t *p_driver = vfs_get_driver(VFS_DRIVE_EXT);
    int32_t err_code = p_driver->write_file_data(path, p_ntag->data, NTAG_DATA_SIZE);
    NRF_LOG_INFO("ntag_update: index=%d, err_code=%d", index, err_code);
    return err_code == NTAG_DATA_SIZE;
}

static bool ntag_reload_prepared(app_amiibolink_t *app, uint8_t index) NTAG_RELOAD_PHASE;
static bool ntag_reload_prepared(app_amiibolink_t *app, uint8_t index) {
    ntag_t ntag = {0};
    char path[VFS_MAX_PATH_LEN] = {0};

    sprintf(path, "/amiibolink/%02d.bin", index);
    vfs_driver_t *p_driver = vfs_get_driver(VFS_DRIVE_EXT);
    /* Native slot files hold exactly one NTAG215. The local buffer can hold a
     * larger tag, so one extra byte detects an oversized file in the same read. */
    int32_t bytes = p_driver->read_file_data(path, ntag.data, NTAG_DATA_SIZE + 1);
    bool ready = bytes == NTAG_DATA_SIZE;
    if (bytes == VFS_ERR_NOOBJ) ready = ntag_store_new_rand(&ntag) == NRF_SUCCESS;
    if (!ready) {
        NRF_LOG_WARNING("ntag_reload: slot unavailable. index=%d, read=%d", index, bytes);
        amiibolink_view_set_index(app->p_amiibolink_view, m_active_index);
        ntag_reload_error(app);
        return false;
    }
    if (!ntag_emu_set_tag(&ntag)) return false;
    m_active_index = index;
    m_active_mode = app->amiibolink_mode;
    return true;
}

static bool ntag_reload(app_amiibolink_t *app, uint8_t index) {
    if (!ntag_emu_prepare_change()) {
        amiibolink_view_set_index(app->p_amiibolink_view, m_active_index);
        return false;
    }
    return ntag_reload_prepared(app, index);
}

static void ntag_init() {
    vfs_driver_t *p_driver = vfs_get_driver(VFS_DRIVE_EXT);
    p_driver->create_dir("/amiibolink");
}

#endif

static void ntag_update_cb(ntag_event_type_t type, void *context, ntag_t *p_ntag) {

    app_amiibolink_t *app = context;

    if (type == NTAG_EVENT_TYPE_WRITTEN && m_active_mode != BLE_AMIIBOLINK_MODE_RANDOM) {
        app_timer_stop(m_amiibo_gen_delay_timer);
        if (!ntag_update(app, m_active_index, p_ntag)) ntag_save_error(app);
        mui_update(mui());
    } else if (type == NTAG_EVENT_TYPE_READ && m_active_mode == BLE_AMIIBOLINK_MODE_RANDOM_AUTO_GEN) {
        app_timer_stop(m_amiibo_gen_delay_timer);
        m_generate_generation = ntag_emu_get_generation();
        app_timer_start(m_amiibo_gen_delay_timer, APP_TIMER_TICKS(1000), app);
    }
}

static void amiibolink_scene_main_event_cb(amiibolink_view_event_t event, amiibolink_view_t *p_view) {
    app_amiibolink_t *app = p_view->user_data;
    if (event == AMIIBOLINK_VIEW_EVENT_MENU) {
        mui_scene_dispatcher_next_scene(app->p_scene_dispatcher, AMIIBOLINK_SCENE_MENU);
    } else if (event == AMIIBOLINK_VIEW_EVENT_UPDATE) {
        ntag_reload(app, app->p_amiibolink_view->index);
    }
}

static bool amiibolink_scene_switch_mode(app_amiibolink_t *app, ble_amiibolink_mode_t mode, uint8_t initial_index) {
    if (!ntag_emu_prepare_change()) return false;
    NRF_LOG_INFO("new mode: %d", mode);
    ble_amiibolink_mode_t previous_mode = app->amiibolink_mode;
    uint8_t previous_index = amiibolink_view_get_index(app->p_amiibolink_view);
    app->amiibolink_mode = mode;
    bool loaded = false;
    if (mode == BLE_AMIIBOLINK_MODE_NTAG) {
        loaded = ntag_reload(app, DEFAULT_NTAG_INDEX);
    } else if (mode == BLE_AMIIBOLINK_MODE_CYCLE) {
        loaded = ntag_reload(app, initial_index);
    } else if (mode == BLE_AMIIBOLINK_MODE_RANDOM_AUTO_GEN || mode == BLE_AMIIBOLINK_MODE_RANDOM) {
        loaded = ntag_emu_set_tag(ntag_emu_get_current_tag());
        if (loaded) {
            m_active_mode = mode;
            m_active_index = initial_index;
        }
    }
    if (!loaded) {
        app->amiibolink_mode = previous_mode;
        amiibolink_view_set_index(app->p_amiibolink_view, previous_index);
        return false;
    }
    /* Publish UI/BLE mode only once the selected tag is ready. */
    amiibolink_view_set_amiibolink_mode(app->p_amiibolink_view, mode);
    amiibolink_view_set_index(app->p_amiibolink_view, initial_index);
    amiibolink_view_set_max_size(app->p_amiibolink_view, MAX_NTAG_INDEX);
    ble_amiibolink_set_mode(mode);
    return true;
}

static bool amiibolink_scene_ble_event_handler(void *ctx, ble_amiibolink_event_type_t event_type, uint8_t *data,
                                               size_t size) {
    app_amiibolink_t *app = ctx;
    amiibolink_view_t *p_view = app->p_amiibolink_view;
    if (event_type == BLE_AMIIBOLINK_EVENT_TAG_UPDATED) {

        if (app->amiibolink_mode == BLE_AMIIBOLINK_MODE_CYCLE) {
            // save ntag
            if (!ntag_update(app, p_view->index, (ntag_t *)data)) {
                ntag_save_error(app);
                return false;
            }
            if (p_view->index < p_view->max_size - 1) {
                p_view->index++;
            } else {
                p_view->index = 0;
            }
            ntag_reload(app, p_view->index);
        } else if (app->amiibolink_mode == BLE_AMIIBOLINK_MODE_NTAG) {
            if (!ntag_update(app, DEFAULT_NTAG_INDEX, (ntag_t *)data)) {
                ntag_save_error(app);
                return false;
            }
        }

        mui_update(mui());
        return true;
    } else if (event_type == BLE_AMIIBOLINK_EVENT_SET_MODE) {
        ble_amiibolink_mode_t mode = *((ble_amiibolink_mode_t *)data);
        settings_data_t *p_settings = settings_get_data();
        
        // If BLE tries to set mode to manual, but user previously selected auto mode, restore it
        if (mode == BLE_AMIIBOLINK_MODE_RANDOM && 
            p_settings->amiibolink_mode == BLE_AMIIBOLINK_MODE_RANDOM_AUTO_GEN) {
            NRF_LOG_INFO("BLE tried to set manual mode, but restoring saved auto mode");
            mode = p_settings->amiibolink_mode;
        }
        
        bool applied = amiibolink_scene_switch_mode(app, mode, 0);
        mui_update(mui());
        return applied;
    }
    return false;
}

void amiibolink_scene_main_on_enter(void *user_data) {
    app_amiibolink_t *app = user_data;

    settings_data_t *p_settings = settings_get_data();

    // enable ble
    ble_init();
    uint8_t device_mode;
    if (p_settings->amiibo_link_ver == BLE_AMIIBOLINK_VER_V2) {
        device_mode = BLE_DEVICE_MODE_AMIIBOLINK_V2;
    } else if (p_settings->amiibo_link_ver == BLE_AMIIBOLINK_VER_V1) {
        device_mode = BLE_DEVICE_MODE_AMIIBOLINK;
    } else {
        device_mode = BLE_DEVICE_MODE_AMILOOP;
    }
    ble_device_mode_prepare(device_mode);
    ble_adv_start();

    ble_amiibolink_set_version(p_settings->amiibo_link_ver);
    ble_nus_set_handler(ble_amiibolink_received_data, NULL);

    ntag_init();
    amiibo_helper_try_load_amiibo_keys_from_vfs();

    ble_amiibolink_init();
    ble_amiibolink_set_event_handler(amiibolink_scene_ble_event_handler, app);

    ntag_emu_set_update_cb(ntag_update_cb, app);

    int32_t err_code = app_timer_create(&m_amiibo_gen_delay_timer, APP_TIMER_MODE_SINGLE_SHOT, ntag_generate_timer_request);
    APP_ERROR_CHECK(err_code);

    amiibolink_view_set_event_cb(app->p_amiibolink_view, amiibolink_scene_main_event_cb);
    if (amiibolink_scene_switch_mode(app, app->amiibolink_mode, amiibolink_view_get_index(app->p_amiibolink_view)))
        mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, AMIIBOLINK_VIEW_ID_MAIN);
}

void amiibolink_scene_main_on_exit(void *user_data) {
    app_timer_stop(m_amiibo_gen_delay_timer);
    ble_disable();
    ble_nus_set_handler(NULL, NULL);
    ntag_emu_set_update_cb(NULL, NULL);
}
