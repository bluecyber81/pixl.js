#include "app_chameleon.h"
#include "chameleon_scene.h"

#include "mini_app_launcher.h"
#include "mini_app_registry.h"

#include "amiibo_helper.h"
#include "nrf_log.h"
#include "nrf_log_ctrl.h"

#include "i18n/language.h"
#include "settings.h"

#include "mui_icons.h"
#include "tag_helper.h"

#include "fds_utils.h"

#include <ctype.h>

#define ATS_MAX_LENGTH 16

typedef enum {
    CHAMELEON_MENU_BACK,
    CHAMELEON_MENU_FILE,
} chameleon_menu_item_t;

static const char *get_id_edit_title(app_chameleon_id_edit_type_t id_edit_type) {
    switch (id_edit_type) {
    case APP_CHAMELEON_ID_EDIT_TYPE_UID:
        return "UID:";

    case APP_CHAMELEON_ID_EDIT_TYPE_SAK:
        return "SAK:";

    case APP_CHAMELEON_ID_EDIT_TYPE_ATQA:
        return "ATQA:";

    case APP_CHAMELEON_ID_EDIT_TYPE_ATS:
        return "ATS:";

    default:
        return "";
    }
}

static void format_id_edit_text(app_chameleon_id_edit_type_t id_edit_type, char *text) {
    const nfc_tag_14a_coll_res_reference_t *coll_res = tag_helper_get_active_coll_res_ref();
    text[0] = '\0';
    if (!coll_res || !coll_res->size || !coll_res->uid || !coll_res->sak || !coll_res->atqa || !coll_res->ats) {
        return;
    }
    switch (id_edit_type) {
    case APP_CHAMELEON_ID_EDIT_TYPE_UID:
        nfc_tag_14a_uid_size uid_size = *(coll_res->size);
        if (uid_size == NFC_TAG_14A_UID_SINGLE_SIZE) {
            sprintf(text, "%02x.%02x.%02x.%02x", coll_res->uid[0], coll_res->uid[1], coll_res->uid[2],
                    coll_res->uid[3]);
        } else if (uid_size == NFC_TAG_14A_UID_DOUBLE_SIZE) {
            sprintf(text, "%02x.%02x.%02x.%02x.%02x.%02x.%02x", coll_res->uid[0], coll_res->uid[1], coll_res->uid[2],
                    coll_res->uid[3], coll_res->uid[4], coll_res->uid[5], coll_res->uid[6]);
        } else if (uid_size == NFC_TAG_14A_UID_TRIPLE_SIZE) {
            sprintf(text, "%02x.%02x.%02x.%02x.%02x.%02x.%02x.%02x.%02x.%02x", coll_res->uid[0], coll_res->uid[1],
                    coll_res->uid[2], coll_res->uid[3], coll_res->uid[4], coll_res->uid[5], coll_res->uid[6],
                    coll_res->uid[7], coll_res->uid[8], coll_res->uid[9]);
        }
        return;

    case APP_CHAMELEON_ID_EDIT_TYPE_SAK:
        sprintf(text, "%02x", coll_res->sak[0]);
        return;

    case APP_CHAMELEON_ID_EDIT_TYPE_ATQA:
        sprintf(text, "%02x.%02x", coll_res->atqa[1], coll_res->atqa[0]);
        return;

    case APP_CHAMELEON_ID_EDIT_TYPE_ATS:
        if (coll_res->ats->length > 0) {
            uint8_t len = coll_res->ats->length;
            if (len > ATS_MAX_LENGTH) len = ATS_MAX_LENGTH;
            char *p = text;
            for (uint8_t i = 0; i < len; i++) {
                if (i > 0) *p++ = '.';
                sprintf(p, "%02x", coll_res->ats->data[i]);
                p += 2;
            }
        } else {
            text[0] = '\0';
        }
        return;
    }
}

static int chameleon_id_hex_digit(unsigned char value) {
    if (value >= '0' && value <= '9') return value - '0';
    if (value >= 'a' && value <= 'f') return value - 'a' + 10;
    if (value >= 'A' && value <= 'F') return value - 'A' + 10;
    return -1;
}

/* Strict dotted bytes; the caller's output is unchanged on any invalid input. */
static bool chameleon_id_parse_bytes(const char *text, uint8_t *output, size_t count) {
    if (!text || !output || count == 0 || count > ATS_MAX_LENGTH) return false;
    uint8_t parsed[ATS_MAX_LENGTH];
    for (size_t i = 0; i < count; i++) {
        int hi = chameleon_id_hex_digit((unsigned char)text[0]);
        if (hi < 0) return false;
        int lo = chameleon_id_hex_digit((unsigned char)text[1]);
        if (lo < 0) return false;
        parsed[i] = (uint8_t)((hi << 4) | lo);
        text += 2;
        if (i + 1 < count) {
            if (*text != '.') return false;
            text++;
        }
    }
    if (*text != '\0') return false;
    memcpy(output, parsed, count);
    return true;
}

static bool handle_id_edit_cb(app_chameleon_t *app, const char *text) {
    if (!app || !text) return false;
    const nfc_tag_14a_coll_res_reference_t *coll_res = tag_helper_get_active_coll_res_ref();
    if (!coll_res) return false;
    uint8_t parsed[ATS_MAX_LENGTH];
    switch (app->id_edit_type) {
    case APP_CHAMELEON_ID_EDIT_TYPE_UID: {
        if (!coll_res->size || !coll_res->uid) return false;
        size_t count = *(coll_res->size);
        if (count != NFC_TAG_14A_UID_SINGLE_SIZE && count != NFC_TAG_14A_UID_DOUBLE_SIZE &&
            count != NFC_TAG_14A_UID_TRIPLE_SIZE) return false;
        if (!chameleon_id_parse_bytes(text, parsed, count)) return false;
        memcpy(coll_res->uid, parsed, count);
        return true;
    }
    case APP_CHAMELEON_ID_EDIT_TYPE_SAK:
        if (!coll_res->sak || !chameleon_id_parse_bytes(text, parsed, 1)) return false;
        coll_res->sak[0] = parsed[0];
        return true;
    case APP_CHAMELEON_ID_EDIT_TYPE_ATQA:
        if (!coll_res->atqa || !chameleon_id_parse_bytes(text, parsed, 2)) return false;
        coll_res->atqa[1] = parsed[0];
        coll_res->atqa[0] = parsed[1];
        return true;
    case APP_CHAMELEON_ID_EDIT_TYPE_ATS: {
        if (!coll_res->ats) return false;
        size_t length = 0;
        while (length < ATS_MAX_LENGTH * 3 && text[length]) length++;
        if (length == 0) {
            coll_res->ats->length = 0;
            return true;
        }
        if (length >= ATS_MAX_LENGTH * 3 || length % 3 != 2) return false;
        size_t count = (length + 1) / 3;
        if (!chameleon_id_parse_bytes(text, parsed, count)) return false;
        memcpy(coll_res->ats->data, parsed, count);
        coll_res->ats->length = (uint8_t)count;
        return true;
    }
    default:
        return false;
    }
}

static void text_input_event_cb(mui_text_input_event_t event, mui_text_input_t *p_text_input) {
    app_chameleon_t *app = p_text_input->user_data;
    if (event == MUI_TEXT_INPUT_EVENT_CONFIRMED) {
        const char *text = mui_text_input_get_input_text(p_text_input);
        if (strlen(text) > 0 || app->id_edit_type == APP_CHAMELEON_ID_EDIT_TYPE_ATS) {
            if (handle_id_edit_cb(app, text)) {
                mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
            } else {
                mui_toast_view_show(app->p_toast_view, _T(APP_CHAMELEON_CARD_ADV_ID_EDIT_INVALID_INPUT));
            }
        } else {
            mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
        }
    } else {
        mui_scene_dispatcher_previous_scene(app->p_scene_dispatcher);
    }
}

void chameleon_scene_menu_card_advanced_id_edit_on_enter(void *user_data) {
    app_chameleon_t *app = user_data;
    char text[48];

    format_id_edit_text(app->id_edit_type, text);

    mui_text_input_set_max_length(app->p_text_input, sizeof(text) - 1);
    mui_text_input_set_header(app->p_text_input, get_id_edit_title(app->id_edit_type));
    mui_text_input_set_input_text(app->p_text_input, text);
    mui_text_input_set_event_cb(app->p_text_input, text_input_event_cb);
    mui_view_dispatcher_switch_to_view(app->p_view_dispatcher, CHAMELEON_VIEW_ID_TEXT_INPUT);
}

void chameleon_scene_menu_card_advanced_id_edit_on_exit(void *user_data) {
    app_chameleon_t *app = user_data;
    mui_text_input_set_max_length(app->p_text_input, 0);
}
