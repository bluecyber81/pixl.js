#include "mui_core.h"

#include "mui_anim.h"
#include "mui_u8g2.h"
#include "nrf_log.h"
#include "settings.h"
#include "app_error.h"
#include "mini_app_launcher.h"
#include "mini_app_registry.h"
#include "ntag_emu.h"
#include "i18n/language.h"

/* No allocations and no app pointers: available even during RAM exhaustion.
 * Confirmation defaults to No; navigation/back never discards the current tag. */
static uint8_t m_save_confirm;
static uint32_t m_save_generation;
static bool mui_nfc_save_active(void) {
    if (!ntag_emu_save_pending()) { m_save_confirm = 0; return false; }
    uint32_t generation = ntag_emu_get_generation();
    if (generation != m_save_generation) {
        m_save_generation = generation;
        m_save_confirm = 0;
    }
    return true;
}
static bool mui_nfc_save_draw(mui_t *m) {
    if (!mui_nfc_save_active()) return false;
    mui_canvas_t *c = &m->canvas;
    mui_canvas_set_frame(c, 0, 0, m->screen_width, m->screen_height);
    mui_canvas_set_draw_color(c, 1);
    mui_canvas_set_font(c, u8g2_font_wqy12_t_gb2312a);
    mui_canvas_draw_utf8(c, 0, 12, _T(DE3_SAVE_FAILED));
    mui_canvas_draw_utf8(c, 0, 28, m_save_confirm ? _T(DE3_SAVE_DISCARD_ASK) : _T(DE3_SAVE_RAM_ONLY));
    mui_canvas_draw_utf8(c, 0, 44, m_save_confirm ?
        (m_save_confirm == 2 ? _T(DE3_SAVE_YES_SELECTED) : _T(DE3_SAVE_NO_SELECTED)) : _T(DE3_SAVE_RETRY));
    mui_canvas_draw_utf8(c, 0, 60, m_save_confirm ? _T(DE3_SAVE_CONFIRM) : _T(DE3_SAVE_DISCARD));
    mui_canvas_flush(c);
    return true;
}
static bool mui_nfc_save_input(mui_t *m, mui_event_t *event) {
    if (!mui_nfc_save_active()) return false;
    uint32_t key = event->arg_int & 0xff, type = (event->arg_int >> 8) & 0xff;
    if (type == INPUT_TYPE_SHORT) {
        if (key == INPUT_KEY_LEFT) m_save_confirm = 0;
        else if (key == INPUT_KEY_RIGHT) m_save_confirm = m_save_confirm ? 2 : 1;
        else if (key == INPUT_KEY_CENTER) {
            if (m_save_confirm == 2) {
                m_save_confirm = 0;
                if (ntag_emu_discard_changes()) mini_app_launcher_exit(mini_app_launcher());
            } else if (m_save_confirm) m_save_confirm = 0;
            else ntag_emu_retry_save();
        }
    } else if (key == INPUT_KEY_CENTER && type == INPUT_TYPE_LONG) m_save_confirm = 0;
    mui_update(m);
    return true;
}

static mui_view_port_t *mui_find_view_port_enabled(mui_t *m, mui_layer_t layer) {
    if ((unsigned)layer >= MUI_LAYER_MAX) return NULL;
    for (unsigned i = m->layer_counts[layer]; i; i--) {
        mui_view_port_t *vp = m->layers[layer][i - 1];
        if (vp && vp->enabled) return vp;
    }
    return NULL;
}

static void mui_draw_mem_mon(mui_canvas_t *p_canvas) {

    settings_data_t *p_settings = settings_get_data();
    if (p_settings->show_mem_usage) {
        char mem[32];
        mui_mem_monitor_t mon;
        mui_mem_monitor(&mon);
        sprintf(mem, "u:%02d%% f:%02d%%", mon.used_pct, mon.frag_pct);
        uint8_t w = (uint8_t)mui_canvas_get_utf8_width(p_canvas, mem);
        uint8_t x = mui_canvas_get_width(p_canvas) - w;
        uint8_t y = mui_canvas_get_height(p_canvas);

        mui_canvas_set_font(p_canvas, u8g2_font_wqy12_t_gb2312a);
        mui_canvas_set_draw_color(p_canvas, 0);
        mui_canvas_draw_box(p_canvas, x, y - 10, w, 12);
        mui_canvas_set_draw_color(p_canvas, 1);
        mui_canvas_draw_utf8(p_canvas, x, y, mem);
    }
}

static void mui_buffer_flush(mui_t *p_mui) {
    mui_canvas_set_frame(&p_mui->canvas, 0, 0, p_mui->screen_width, p_mui->screen_height);
    mui_draw_mem_mon(&p_mui->canvas);
    mui_canvas_flush(&p_mui->canvas);
}

static bool mui_draw_layer(mui_t *p_mui, mui_layer_t layer, uint8_t x, uint8_t y, uint8_t w, uint8_t h) {
    mui_view_port_t *p_view_port = mui_find_view_port_enabled(p_mui, layer);
    if (p_view_port) {
        mui_canvas_set_frame(&p_mui->canvas, x, y, w, h);
        p_view_port->draw_cb(p_view_port, &p_mui->canvas);
        return true;
    }
    return false;
}

static void mui_process_redraw(mui_t *p_mui, mui_event_t *p_event) {
    uint8_t sw = p_mui->screen_width;
    uint8_t sh = p_mui->screen_height;

    if(!p_mui->auto_update){
        return;
    }

    mui_canvas_clear(&p_mui->canvas);
    if (mui_nfc_save_draw(p_mui)) return;
    if (p_mui->memory_error) {
        /* This fallback uses the existing framebuffer and ROM strings only. */
        mui_canvas_set_frame(&p_mui->canvas, 0, 0, sw, sh);
        mui_canvas_set_draw_color(&p_mui->canvas, 1);
        mui_canvas_set_font(&p_mui->canvas, u8g2_font_wqy12_t_gb2312a);
        mui_canvas_draw_utf8(&p_mui->canvas, 0, 18, "RAM voll");
        mui_canvas_draw_utf8(&p_mui->canvas, 0, 36, "Mitte: Hauptmenue");
        mui_canvas_flush(&p_mui->canvas);
        return;
    }

    if (mui_draw_layer(p_mui, MUI_LAYER_FULLSCREEN, 0, 0, sw, sh)) {
        mui_draw_layer(p_mui, MUI_LAYER_TOAST, 0, 0, sw, sh);
        mui_buffer_flush(p_mui);
        return;
    }

    if (mui_draw_layer(p_mui, MUI_LAYER_WINDOW, 0, LAYER_STATUS_BAR_HEIGHT, sw, sh - LAYER_STATUS_BAR_HEIGHT)) {
        mui_draw_layer(p_mui, MUI_LAYER_STATUS_BAR, 0, 0, sw, LAYER_STATUS_BAR_HEIGHT);
        mui_draw_layer(p_mui, MUI_LAYER_TOAST, 0, LAYER_STATUS_BAR_HEIGHT, sw, sh - LAYER_STATUS_BAR_HEIGHT);
        mui_buffer_flush(p_mui);
        return;
    }

    if (mui_draw_layer(p_mui, MUI_LAYER_DESKTOP, 0, LAYER_STATUS_BAR_HEIGHT, sw, sh - LAYER_STATUS_BAR_HEIGHT)) {
        mui_draw_layer(p_mui, MUI_LAYER_STATUS_BAR, 0, 0, sw, LAYER_STATUS_BAR_HEIGHT);
        mui_draw_layer(p_mui, MUI_LAYER_TOAST, 0, LAYER_STATUS_BAR_HEIGHT, sw, sh - LAYER_STATUS_BAR_HEIGHT);
        mui_buffer_flush(p_mui);
        return;
    }
}

static void mui_process_input(mui_t *p_mui, mui_event_t *p_event) {
    if (mui_nfc_save_input(p_mui, p_event)) return;
    if (p_mui->memory_error) {
        uint32_t arg = p_event->arg_int;
        if ((arg & 0xFF) == INPUT_KEY_CENTER && ((arg >> 8) & 0xFF) == INPUT_TYPE_SHORT) {
            p_mui->memory_error = false;
            if (!mini_app_launcher_get_app_handle(mini_app_launcher(), MINI_APP_ID_STATUS_BAR))
                mini_app_launcher_run(mini_app_launcher(), MINI_APP_ID_STATUS_BAR);
            mini_app_launcher_run(mini_app_launcher(), MINI_APP_ID_DESKTOP);
        }
        mui_update(p_mui);
        return;
    }

    mui_view_port_t *p_view_port = mui_find_view_port_enabled(p_mui, MUI_LAYER_FULLSCREEN);
    if (!p_view_port) {
        p_view_port = mui_find_view_port_enabled(p_mui, MUI_LAYER_WINDOW);
    }
    if (!p_view_port) {
        p_view_port = mui_find_view_port_enabled(p_mui, MUI_LAYER_DESKTOP);
    }
    if (p_view_port) {
        mui_input_event_t input_event;
        uint32_t arg = p_event->arg_int;

        input_event.key = arg & 0xFF;
        input_event.type = (arg >> 8) & 0xFF;

        p_view_port->input_cb(p_view_port, &input_event);

        if(p_mui->auto_update){
            mui_update(mui());
        }
    }
}

static void mui_process_anim(mui_t *p_mui, mui_event_t *p_event) { mui_anim_core_event(p_event); }

static void mui_process_event(void *p_context, mui_event_t *p_event) {
    mui_t *p_mui = p_context;
    switch (p_event->id) {
    case MUI_EVENT_ID_REDRAW:
        mui_process_redraw(p_mui, p_event);
        break;

    case MUI_EVENT_ID_INPUT:
        mui_process_input(p_mui, p_event);
        break;

    case MUI_EVENT_ID_ANIM:
        mui_process_anim(p_mui, p_event);
        break;
    }
}

mui_t *mui() {
    static mui_t mui;
    return &mui;
}

void mui_init(mui_t *p_mui) {

    mui_mem_init();

    mui_u8g2_init(&p_mui->u8g2);

    p_mui->screen_height = SCREEN_HEIGHT;
    p_mui->screen_width = SCREEN_WIDTH;
    p_mui->canvas.fb = &p_mui->u8g2;
    p_mui->canvas.height = p_mui->screen_height;
    p_mui->canvas.width = p_mui->screen_width;
    p_mui->canvas.offset_x = 0;
    p_mui->canvas.offset_y = 0;

    p_mui->auto_update = 1;

    memset(p_mui->layers, 0, sizeof(p_mui->layers));
    memset(p_mui->layer_counts, 0, sizeof(p_mui->layer_counts));
    p_mui->memory_error = false;

    mui_event_set_callback(&p_mui->event_queue, mui_process_event, p_mui);
    APP_ERROR_CHECK(mui_event_queue_init(&p_mui->event_queue) ? NRF_SUCCESS : NRF_ERROR_NO_MEM);

    mui_input_init();

    mui_anim_core_init();

    p_mui->initialized = true;
}

void mui_deinit(mui_t *p_mui) {
    mui_input_deinit();
    mui_event_queue_deinit(&p_mui->event_queue);
    mui_u8g2_deinit(&p_mui->u8g2);
    mui_mem_deinit();
    p_mui->initialized = false;
}

void mui_post(mui_t *p_mui, mui_event_t *p_event) { mui_event_post(&p_mui->event_queue, p_event); }

void mui_tick(mui_t *p_mui) { mui_event_dispatch(&p_mui->event_queue); }

void mui_panic(mui_t *p_mui, char *err) {
    if (p_mui->initialized) {
        u8g2_ClearBuffer(&p_mui->u8g2);
        u8g2_SetFont(&p_mui->u8g2, u8g2_font_wqy12_t_gb2312a);
        u8g2_DrawBox(&p_mui->u8g2, 0, 0, 128, 12);
        u8g2_SetDrawColor(&p_mui->u8g2, 0);
        u8g2_DrawUTF8(&p_mui->u8g2, 28, 10, "SYSTEM FAULT");

        u8g2_SetDrawColor(&p_mui->u8g2, 1);

        uint8_t x = 0;
        uint8_t y = 24;
        uint32_t i = 0;
        uint8_t m = u8g2_GetMaxCharWidth(&p_mui->u8g2);

        while (err[i] != 0 && y < 64) {
            uint8_t w = u8g2_DrawGlyph(&p_mui->u8g2, x, y, err[i]);
            x += w;
            if (x > 128 - m) {
                x = 0;
                y += 12;
            }
            i++;
        }

        u8g2_SendBuffer(&p_mui->u8g2);
    }
}

void mui_set_auto_update(mui_t* p_mui, bool enabled){
    p_mui->auto_update = enabled;
}

void mui_add_view_port(mui_t *m, mui_view_port_t *vp, mui_layer_t layer) {
    if (!m || !vp || (unsigned)layer >= MUI_LAYER_MAX) return;
    for (unsigned l = 0; l < MUI_LAYER_MAX; l++)
        for (unsigned i = 0; i < m->layer_counts[l]; i++)
            if (m->layers[l][i] == vp) return;
    if (m->layer_counts[layer] == MUI_LAYER_CAPACITY) { mui_show_memory_error(m); return; }
    m->layers[layer][m->layer_counts[layer]++] = vp;
    mui_update(m);
}
void mui_remove_view_port(mui_t *m, mui_view_port_t *vp, mui_layer_t layer) {
    (void)layer;
    if (!m || !vp) return;
    for (unsigned l = 0; l < MUI_LAYER_MAX; l++) {
        for (unsigned i = 0; i < m->layer_counts[l]; i++) {
            if (m->layers[l][i] != vp) continue;
            for (unsigned j = i + 1; j < m->layer_counts[l]; j++) m->layers[l][j - 1] = m->layers[l][j];
            m->layers[l][--m->layer_counts[l]] = NULL;
            return;
        }
    }
}

void mui_update(mui_t *p_mui) {
    mui_event_t event = {.id = MUI_EVENT_ID_REDRAW};
    mui_post(p_mui, &event);
}


void mui_update_now(mui_t* p_mui){
     mui_event_t event = {.id = MUI_EVENT_ID_REDRAW};
    mui_event_dispatch_now(&p_mui->event_queue, &event);
}

void mui_show_memory_error(mui_t *m) {
    if (!m) return;
    m->memory_error = true;
    m->auto_update = true;
    mui_update(m);
}
