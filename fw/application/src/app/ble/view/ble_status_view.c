#include "ble_status_view.h"
#include "i18n/language.h"
#include "mui_qrcode_helper.h"
#include "ble_main.h"
#ifdef VFS_PACKED_LFS_ENABLE
#include "vfs_packed_runtime.h"
#endif

static void ble_status_view_on_draw(mui_view_t *p_view, mui_canvas_t *p_canvas) {
    ble_status_view_t* p_status_view = p_view->user_data;
#ifdef VFS_PACKED_LFS_ENABLE
    if (vfs_packed_recovery_required()) p_status_view->page = 0;
#endif
    if (p_status_view->page == 1) {
        draw_qrcode(p_canvas, 39, 0, 50, "https://bluecyber81.github.io/pixl.js/");
        return;
    }
    p_status_view->drawn_link_state = ble_link_state_get();
    mui_canvas_set_font(p_canvas, u8g2_font_siji_t_6x10);
    mui_canvas_draw_glyph(p_canvas, 2, 12, 0xe1b5);
    mui_canvas_set_font(p_canvas, u8g2_font_wqy12_t_gb2312a);
    mui_canvas_draw_utf8(p_canvas, 14, 12, getLangString(_L_APP_BLE_TITLE));
    if (p_status_view->drawn_link_state == BLE_LINK_INACTIVE) {
        mui_canvas_draw_utf8(p_canvas, 4, 24, getLangString(_L_DE3_BLE_INACTIVE));
        mui_canvas_draw_utf8(p_canvas, 4, 36, getLangString(_L_DE3_BLE_RESTART));
        mui_canvas_draw_utf8(p_canvas, 4, 48, getLangString(_L_DE3_BLE_BACK));
    } else {
#ifdef VFS_PACKED_LFS_ENABLE
        if (vfs_packed_recovery_required())
            mui_canvas_draw_utf8(p_canvas, 4, 24, getLangString(_L_DE331_STORAGE_RECOVERY));
        else
#endif
            mui_canvas_draw_utf8(p_canvas, 12, 24, p_status_view->ble_addr);
        mui_canvas_draw_utf8(p_canvas, 4, 36, getLangString(
            p_status_view->drawn_link_state == BLE_LINK_CONNECTED ?
                _L_DE3_BLE_CONNECTED :
            p_status_view->drawn_link_state == BLE_LINK_HOST_CONNECTED ? _L_DE3_BLE_WAIT_CLIENT :
            p_status_view->drawn_link_state == BLE_LINK_DISCONNECTING ? _L_DE3_BLE_CLOSING : _L_DE3_BLE_VISIBLE));
#ifdef VFS_PACKED_LFS_ENABLE
        if (vfs_packed_recovery_required())
            mui_canvas_draw_utf8(p_canvas, 4, 48, getLangString(_L_DE331_STORAGE_CONTINUE));
        else
#endif
        mui_canvas_draw_utf8(p_canvas, 4, 48, getLangString(_L_DE3_BLE_QR));
    }
}

static void ble_status_view_on_input(mui_view_t *p_view, mui_input_event_t *event) {
    ble_status_view_t *p_ble_status_view = p_view->user_data;
    if (event->type == INPUT_TYPE_SHORT || event->type == INPUT_TYPE_LONG) {
        switch (event->key) {
        case INPUT_KEY_LEFT:
        case INPUT_KEY_RIGHT:
#ifdef VFS_PACKED_LFS_ENABLE
            if (vfs_packed_recovery_required()) break;
#endif
            if (p_ble_status_view->page == 1) {
                p_ble_status_view->page = 0;
            } else {
                p_ble_status_view->page = 1;
            }

            if (p_ble_status_view->event_cb) {
                p_ble_status_view->event_cb(BLE_STATUS_VIEW_EVENT_UPDATE, p_ble_status_view);
            }
            break;
        case INPUT_KEY_CENTER:
            if (p_ble_status_view->event_cb) {
                /* Follow the action the user actually saw. If a connection
                 * arrives between drawing and pressing, the guarded restart
                 * becomes a no-op rather than disconnecting the new peer. */
                bool restart = event->type == INPUT_TYPE_SHORT && p_ble_status_view->page == 0 &&
                               p_ble_status_view->drawn_link_state == BLE_LINK_INACTIVE;
                p_ble_status_view->event_cb(restart ? BLE_STATUS_VIEW_BLE_RESTART :
                    BLE_STATUS_VIEW_BLE_DISABLE, p_ble_status_view);
            }
            break;
        }
    }
}

static void ble_status_view_on_enter(mui_view_t *p_view) {}

static void ble_status_view_on_exit(mui_view_t *p_view) {}

ble_status_view_t *ble_status_view_create() {
    ble_status_view_t *p_ble_status_view = mui_mem_malloc(sizeof(ble_status_view_t));
    if (!p_ble_status_view) return NULL;
    /* TLSF returns reused storage: start on the status page with no callback. */
    memset(p_ble_status_view, 0, sizeof(ble_status_view_t));

    mui_view_t *p_view = mui_view_create();
    if (!p_view) { mui_mem_free(p_ble_status_view); return NULL; }
    p_view->user_data = p_ble_status_view;
    p_view->draw_cb = ble_status_view_on_draw;
    p_view->input_cb = ble_status_view_on_input;
    p_view->enter_cb = ble_status_view_on_enter;
    p_view->exit_cb = ble_status_view_on_exit;

    p_ble_status_view->p_view = p_view;

    return p_ble_status_view;
}
void ble_status_view_free(ble_status_view_t *p_view) {
    if (!p_view) return;
    mui_view_free(p_view->p_view);
    mui_mem_free(p_view);
}
mui_view_t *ble_status_view_get_view(ble_status_view_t *p_view) { return p_view->p_view; }
