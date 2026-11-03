#include "tag_helper.h"
#include "fds_ids.h"
#include "fds_utils.h"
#include "i18n/language.h"
#include "nrf_log.h"
#include "settings.h"
#include "tag_emulation.h"
#include "utils2.h"
#include <string.h>
#include <stddef.h>

#define NFC_TAG_NTAG_DATA_SIZE 4

const static tag_specific_type_name_t tag_type_names[] = {
    {TAG_TYPE_UNDEFINED, "-", "-", 0},
    // MiFare series
    {TAG_TYPE_MIFARE_Mini, "MF Mini", "MiFare Mini", 20 * NFC_TAG_MF1_DATA_SIZE},
    {TAG_TYPE_MIFARE_1024, "MF 1K", "MiFare 1K", 64 * NFC_TAG_MF1_DATA_SIZE},
    {TAG_TYPE_MIFARE_2048, "MF 2K", "MiFare 2K", 128 * NFC_TAG_MF1_DATA_SIZE},
    {TAG_TYPE_MIFARE_4096, "MF 4K", "MiFare 4K", 256 * NFC_TAG_MF1_DATA_SIZE},
    // NTAG series
    {TAG_TYPE_NTAG_210, "N210", "NTAG 210", NTAG210_PAGES *NFC_TAG_NTAG_DATA_SIZE},
    {TAG_TYPE_NTAG_212, "N212", "NTAG 212", NTAG212_PAGES *NFC_TAG_NTAG_DATA_SIZE},
    {TAG_TYPE_NTAG_213, "N213", "NTAG 213", NTAG213_PAGES *NFC_TAG_NTAG_DATA_SIZE},
    {TAG_TYPE_NTAG_215, "N215", "NTAG 215", NTAG215_PAGES *NFC_TAG_NTAG_DATA_SIZE},
    {TAG_TYPE_NTAG_216, "N216", "NTAG 216", NTAG216_PAGES *NFC_TAG_NTAG_DATA_SIZE},

    {TAG_TYPE_MF0ICU1, "MFUL", "Mifare Ultralight", MF0ICU1_PAGES *NFC_TAG_NTAG_DATA_SIZE},
    {TAG_TYPE_MF0ICU2, "MFULC", "Mifare Ultralight C", MF0ICU2_PAGES *NFC_TAG_NTAG_DATA_SIZE},
    {TAG_TYPE_MF0UL11, "MFEV11", "Mifare Ultralight EV1 (640 bit)", MF0UL11_PAGES *NFC_TAG_NTAG_DATA_SIZE},
    {TAG_TYPE_MF0UL21, "MFEV21", "Mifare Ultralight EV1 (1312 bit)", MF0UL21_PAGES *NFC_TAG_NTAG_DATA_SIZE},

};

// typedef enum {
//     NFC_TAG_MF1_WRITE_NORMAL    = 0u,
//     NFC_TAG_MF1_WRITE_DENIED    = 1u,
//     NFC_TAG_MF1_WRITE_DECEIVE   = 2u,
//     NFC_TAG_MF1_WRITE_SHADOW    = 3u,
// } nfc_tag_mf1_write_mode_t;

const static uint32_t mf1_write_mode_names[4] = {
    [NFC_TAG_MF1_WRITE_NORMAL] = _L_APP_CHAMELEON_TAG_MF1_WRITE_NORMAL,
    [NFC_TAG_MF1_WRITE_DENIED] = _L_APP_CHAMELEON_TAG_MF1_WRITE_DENIED,
    [NFC_TAG_MF1_WRITE_DECEIVE] = _L_APP_CHAMELEON_TAG_MF1_WRITE_DECEIVE,
    [NFC_TAG_MF1_WRITE_SHADOW] = _L_APP_CHAMELEON_TAG_MF1_WRITE_SHADOW,
};

const tag_specific_type_t hf_tag_specific_types[] = {
    // Specific and necessary signs do not exist
    TAG_TYPE_UNDEFINED,
    // MiFare series
    TAG_TYPE_MIFARE_Mini, TAG_TYPE_MIFARE_1024, TAG_TYPE_MIFARE_2048, TAG_TYPE_MIFARE_4096,
    // NTAG series
    TAG_TYPE_NTAG_210, TAG_TYPE_NTAG_212, TAG_TYPE_NTAG_213, TAG_TYPE_NTAG_215, TAG_TYPE_NTAG_216,

    TAG_TYPE_MF0ICU1, TAG_TYPE_MF0ICU2, TAG_TYPE_MF0UL11, TAG_TYPE_MF0UL21};

tag_group_type_t tag_helper_get_tag_group_type(tag_specific_type_t tag_type) {
    if (tag_type == TAG_TYPE_MIFARE_Mini || tag_type == TAG_TYPE_MIFARE_1024 || tag_type == TAG_TYPE_MIFARE_2048 ||
        tag_type == TAG_TYPE_MIFARE_4096) {
        return TAG_GROUP_MIFARE;
    } else if (tag_type == TAG_TYPE_NTAG_210 || tag_type == TAG_TYPE_NTAG_212 || tag_type == TAG_TYPE_NTAG_213 ||
               tag_type == TAG_TYPE_NTAG_215 || tag_type == TAG_TYPE_NTAG_216 || tag_type == TAG_TYPE_MF0ICU1 ||
               tag_type == TAG_TYPE_MF0ICU2 || tag_type == TAG_TYPE_MF0UL11 || tag_type == TAG_TYPE_MF0UL21) {
        return TAG_GROUP_NTAG;
    } else {
        return TAG_GROUP_UNKNOWN;
    }
}

const tag_specific_type_name_t *tag_helper_get_tag_type_name(tag_specific_type_t tag_type) {
    for (uint32_t i = 0; i < ARRAY_SIZE(tag_type_names); i++) {
        if (tag_type_names[i].tag_type == tag_type) {
            return &(tag_type_names[i]);
        }
    }
    return NULL;
}

nfc_tag_14a_coll_res_reference_t *tag_helper_get_active_coll_res_ref() {
    tag_specific_type_t tag_type = tag_helper_get_active_tag_type();
    tag_data_buffer_t *tag_buffer = get_buffer_by_tag_type(tag_type);
    tag_group_type_t tag_group_type = tag_helper_get_tag_group_type(tag_type);
    if (tag_group_type == TAG_GROUP_MIFARE) {
        return get_mifare_coll_res();
        // nfc_tag_mf1_information_t *m_tag_information = (nfc_tag_mf1_information_t *)tag_buffer->buffer;
        // return &m_tag_information->res_coll;
    } else {
        // nfc_tag_mf0_ntag_information_t *m_tag_information = (nfc_tag_mf0_ntag_information_t *)tag_buffer->buffer;
        // return &m_tag_information->res_coll;
        return nfc_tag_mf0_ntag_get_coll_res();
    }
}

void tag_helper_load_coll_res_from_block0() {
    tag_specific_type_t tag_type = tag_helper_get_active_tag_type();
    tag_data_buffer_t *tag_buffer = get_buffer_by_tag_type(tag_type);
    tag_group_type_t tag_group_type = tag_helper_get_tag_group_type(tag_type);
    if (tag_group_type == TAG_GROUP_MIFARE && !nfc_tag_mf1_is_use_mf1_coll_res()) {
        nfc_tag_mf1_information_t *m_tag_information = (nfc_tag_mf1_information_t *)tag_buffer->buffer;
        nfc_tag_14a_coll_res_reference_t *coll_res = tag_helper_get_active_coll_res_ref();
        nfc_tag_14a_uid_size uid_size = *(coll_res->size);
        if (uid_size == NFC_TAG_14A_UID_SINGLE_SIZE) {
            nfc_tag_mf1_factory_info_t *block0_factory_info = (nfc_tag_mf1_factory_info_t *)m_tag_information->memory[0];
            memcpy(coll_res->sak, block0_factory_info->sak, 1);
            memcpy(coll_res->atqa, block0_factory_info->atqa, 2);
            memcpy(coll_res->uid, block0_factory_info->uid, uid_size);

        } else if (uid_size == NFC_TAG_14A_UID_DOUBLE_SIZE) {
            nfc_tag_mf1_factory_info_t *block0_factory_info = (nfc_tag_mf1_factory_info_t *)m_tag_information->memory[0];
            memcpy(coll_res->atqa, block0_factory_info->manufacturer, 2);
            memcpy(coll_res->uid, block0_factory_info->uid, uid_size);

            //sak is not stored in block0, hardcoded sak according to tag type
            //reference: https://www.nxp.com/docs/en/application-note/AN10833.pdf
            if (tag_type == TAG_TYPE_MIFARE_Mini) {
                coll_res->sak[0] = 0x09;
            } else if (tag_type == TAG_TYPE_MIFARE_1024) {
                coll_res->sak[0] = 0x08;
            } else if (tag_type == TAG_TYPE_MIFARE_2048) {
                coll_res->sak[0] = 0x19;
            } else if (tag_type == TAG_TYPE_MIFARE_4096) {
                coll_res->sak[0] = 0x18;
            } else {
                coll_res->sak[0] = 0x08;
            }
        }
    }else if(tag_group_type == TAG_GROUP_NTAG){
        nfc_tag_mf0_ntag_information_t *m_tag_information = (nfc_tag_mf0_ntag_information_t *)tag_buffer->buffer;
        nfc_tag_14a_coll_res_reference_t *coll_res = tag_helper_get_active_coll_res_ref();
        nfc_tag_14a_uid_size uid_size = *(coll_res->size);
        if(uid_size == NFC_TAG_14A_UID_DOUBLE_SIZE){
            coll_res->uid[0] = m_tag_information->memory[0][0];
            coll_res->uid[1] = m_tag_information->memory[0][1];
            coll_res->uid[2] = m_tag_information->memory[0][2];
            coll_res->uid[3] = m_tag_information->memory[1][0];
            coll_res->uid[4] = m_tag_information->memory[1][1];
            coll_res->uid[5] = m_tag_information->memory[1][2];
            coll_res->uid[6] = m_tag_information->memory[1][3];
        }
    }
}

bool tag_helper_factory_data(uint8_t slot) {
    tag_specific_type_t tag_type = tag_helper_get_active_tag_type();
    return tag_emulation_factory_data(slot, tag_type) && tag_emulation_save_config();
}

/* Explicit profile for an already loaded Mini dump. Never change its type,
 * block data or unrelated options. Shadow data must remain nonpersistent. */
bool tag_helper_apply_disney_profile(void) {
    if (tag_helper_get_active_tag_type() != TAG_TYPE_MIFARE_Mini || !tag_emulation_active_data_ready()) return false;
    tag_data_buffer_t *buffer = get_buffer_by_tag_type(TAG_TYPE_MIFARE_Mini);
    if (!buffer || !buffer->buffer || !buffer->crc ||
        buffer->length < offsetof(nfc_tag_mf1_information_t, memory) + 20 * NFC_TAG_MF1_DATA_SIZE) return false;
    nfc_tag_mf1_information_t *data = (nfc_tag_mf1_information_t *)buffer->buffer;
    if (data->config.mode_block_write >= NFC_TAG_MF1_WRITE_SHADOW) return false;
    /* ATS is untouched: retain only the small identity prefix, not 256 ATS bytes. */
    uint8_t old_identity[offsetof(nfc_tag_14a_coll_res_entity_t, ats)];
    memcpy(old_identity, &data->res_coll, sizeof(old_identity));
    bool old_custom = data->config.use_mf1_coll_res;

    data->config.use_mf1_coll_res = false;
    data->res_coll.size = NFC_TAG_14A_UID_DOUBLE_SIZE;
    tag_helper_load_coll_res_from_block0();
    data->res_coll.sak[0] = 0x09;
    data->res_coll.atqa[0] = 0x44;
    data->res_coll.atqa[1] = 0x00;
    /* The general dirty tracker is only CRC16. Decide the profile no-op by
     * exact bytes, then request a real commit even if changed bytes collide. */
    if (old_custom == data->config.use_mf1_coll_res &&
        memcmp(old_identity, &data->res_coll, sizeof(old_identity)) == 0) return true;
    if (tag_emulation_save_active_data()) return true;

    memcpy(&data->res_coll, old_identity, sizeof(old_identity));
    data->config.use_mf1_coll_res = old_custom;
    return false;
}

    tag_specific_type_t tag_helper_get_active_tag_type() {
        tag_specific_type_t tag_type[2];
        uint8_t slot = tag_emulation_get_slot();
        tag_emulation_get_specific_types_by_slot(slot, tag_type);
        return tag_type[0];
    }

    void tag_helper_format_uid(char *buff, uint8_t *uid, uint8_t uid_len) {
        if (uid_len == NFC_TAG_14A_UID_SINGLE_SIZE) {
            sprintf(buff, "%02x:%02x:%02x:%02x", uid[0], uid[1], uid[2], uid[3]);
        } else if (uid_len == NFC_TAG_14A_UID_DOUBLE_SIZE) {
            sprintf(buff, "%02x:%02x:%02x:%02x:%02x:%02x:%02x", uid[0], uid[1], uid[2], uid[3], uid[4], uid[5], uid[6]);
        } else {
            sprintf(buff, "%02x:%02x:%02x:%02x:%02x:%02x:%02x:%02x:%02x:%02x", uid[0], uid[1], uid[2], uid[3], uid[4],
                    uid[5], uid[6], uid[7], uid[8], uid[9]);
        }
    }

    const char *tag_helper_get_mf_write_mode_name(nfc_tag_mf1_write_mode_t write_mode) {
        if (write_mode == NFC_TAG_MF1_WRITE_SHADOW_REQ) {
            write_mode = NFC_TAG_MF1_WRITE_SHADOW;
        }
        if (write_mode >= 0 && write_mode < 4) {
            return getLangString(mf1_write_mode_names[write_mode]);
        }
        return "";
    }

    void tag_helper_get_nickname(char *buff, size_t buff_len) {
        if (!buff || buff_len == 0) {
            return;
        }
        uint8_t slot = tag_emulation_get_slot();
        vfs_meta_t meta = {0};
        memset(buff, 0, buff_len);
        int32_t err = fds_read_meta(FDS_SLOT_TAG_DUMP_FILE_ID_BASE + slot, TAG_SENSE_HF, &meta);

        if (err == 0 && meta.has_notes) {
            size_t length = 0;
            while (length < sizeof(meta.notes) && meta.notes[length]) length++;
            if (length >= buff_len) length = buff_len - 1;
            memcpy(buff, meta.notes, length);
            buff[length] = '\0';
        }

        if (strlen(buff) == 0) {
            snprintf(buff, buff_len, "%s %02d", _T(APP_CHAMELEON_CARD_SLOT), slot + 1);
        }
    }

    int32_t tag_helper_set_nickname(const char *nickname) {
        uint8_t slot = tag_emulation_get_slot();
        vfs_meta_t meta = {0};

        if (!nickname) return -1;
        size_t length = 0;
        while (length < sizeof(meta.notes) && nickname[length]) length++;
        if (length >= sizeof(meta.notes)) return -1;

        int32_t err = fds_read_meta(FDS_SLOT_TAG_DUMP_FILE_ID_BASE + slot, TAG_SENSE_HF, &meta);
        if (err != 0) {
            return err;
        }
        meta.has_notes = 1;
        memcpy(meta.notes, nickname, length + 1);
        return fds_write_meta(FDS_SLOT_TAG_DUMP_FILE_ID_BASE + slot, TAG_SENSE_HF, &meta);
    }

    size_t tag_helper_get_active_tag_data_size() {
        tag_specific_type_t tag_type = tag_helper_get_active_tag_type();
        const tag_specific_type_name_t *tag_type_name = tag_helper_get_tag_type_name(tag_type);
        return tag_type_name->data_size;
    }

    uint8_t *tag_helper_get_active_tag_memory_data() {
        tag_specific_type_t tag_type = tag_helper_get_active_tag_type();
        tag_data_buffer_t *tag_buffer = get_buffer_by_tag_type(tag_type);
        tag_group_type_t tag_group_type = tag_helper_get_tag_group_type(tag_type);
        if (tag_group_type == TAG_GROUP_MIFARE) {
            nfc_tag_mf1_information_t *m_tag_information = (nfc_tag_mf1_information_t *)tag_buffer->buffer;
            return &m_tag_information->memory;
        } else {
            nfc_tag_mf0_ntag_information_t *m_tag_information = (nfc_tag_mf0_ntag_information_t *)tag_buffer->buffer;
            return &m_tag_information->memory;
        }
    }

    bool tag_helper_is_active_tag_writable() {
        tag_specific_type_t tag_type = tag_helper_get_active_tag_type();
        tag_group_type_t tag_group_type = tag_helper_get_tag_group_type(tag_type);
        if (tag_group_type == TAG_GROUP_MIFARE) {
            return nfc_tag_mf1_get_write_mode() != NFC_TAG_MF1_WRITE_DENIED;
        } else if (tag_group_type == TAG_GROUP_NTAG) {
            uint8_t *memory = tag_helper_get_active_tag_memory_data();
            return (memory[2 * NFC_TAG_NTAG_DATA_SIZE + 2] & 0x07) != 0x07;
        }
        return false;
    }

    bool tag_helper_generate_uid(void) {
        tag_specific_type_t tag_type = tag_helper_get_active_tag_type();
        tag_group_type_t tag_group_type = tag_helper_get_tag_group_type(tag_type);
        tag_data_buffer_t *tag_buffer = get_buffer_by_tag_type(tag_type);
        if (tag_group_type == TAG_GROUP_NTAG && tag_buffer && tag_buffer->buffer &&
            tag_buffer->length >= offsetof(nfc_tag_mf0_ntag_information_t, memory) + 3 * NFC_TAG_NTAG_DATA_SIZE) {
            nfc_tag_mf0_ntag_information_t *m_tag_information = (nfc_tag_mf0_ntag_information_t *)tag_buffer->buffer;
            uint8_t uuid[7];
            ret_code_t err_code = utils_rand_bytes(uuid, sizeof(uuid));
            if (err_code == NRF_SUCCESS) {
                uuid[0] = 04; // fixed
                m_tag_information->memory[0][0] = uuid[0];
                m_tag_information->memory[0][1] = uuid[1];
                m_tag_information->memory[0][2] = uuid[2];
                // BCC 0 is always equal to UID0 ⊕ UID 1 ⊕ UID 2 ⊕ 0x88
                m_tag_information->memory[0][3] = m_tag_information->memory[0][0] ^ m_tag_information->memory[0][1] ^
                                                  m_tag_information->memory[0][2] ^ 0x88;

                m_tag_information->memory[1][0] = uuid[3];
                m_tag_information->memory[1][1] = uuid[4];
                m_tag_information->memory[1][2] = uuid[5];
                m_tag_information->memory[1][3] = uuid[6];

                // BCC 1 is always equal to UID3 ⊕ UID 4 ⊕ UID 5 ⊕ UID6
                m_tag_information->memory[2][0] = m_tag_information->memory[1][0] ^ m_tag_information->memory[1][1] ^
                                                  m_tag_information->memory[1][2] ^ m_tag_information->memory[1][3];

                memcpy(m_tag_information->res_coll.uid, uuid, sizeof(uuid));
                return true;
            }
        }
        return false;
    }

    bool tag_helper_is_defult_slot() {
        settings_data_t *settings = settings_get_data();
        return settings->chameleon_default_slot_index == tag_emulation_get_slot();
    }

    bool tag_helper_valid_default_slot() {
        settings_data_t *settings = settings_get_data();
        return settings->chameleon_default_slot_index != INVALID_SLOT_INDEX;
    }

    void tag_helper_set_slot_num(uint8_t slot_num){
        if (!tag_emulation_prepare_slot_count(slot_num)) return;
        //set slot number in settings
        settings_data_t *settings = settings_get_data();
        settings->chameleon_slot_num = slot_num;

        //check default card settings
        if(settings->chameleon_default_slot_index >= slot_num){
            settings->chameleon_default_slot_index = INVALID_SLOT_INDEX;
        }

        settings_save();

        //disable slots larger than slot_num
        for (uint8_t i = slot_num; i < TAG_MAX_SLOT_NUM; i++) {
            tag_emulation_slot_set_enable(i, TAG_SENSE_HF,false);
        }
        //save config and data buffer...
        tag_emulation_save();
    }
