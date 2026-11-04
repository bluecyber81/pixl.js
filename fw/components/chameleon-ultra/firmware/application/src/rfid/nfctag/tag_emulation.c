#include "crc_utils.h"
#include "nfc_14a.h"
#include "rfid_port.h"
// #include "lf_tag_em.h"
#include "fds_ids.h"
#include "fds_util.h"
#include "nfc_mf0_ntag.h"
#include "nfc_mf1.h"
#include "rgb_marquee.h"
#include "tag_emulation.h"
#include "tag_persistence.h"
#include "settings.h"

#define NRF_LOG_MODULE_NAME tag_emu
#include "nrf_log.h"
#include "nrf_log_ctrl.h"
#include "nrf_log_default_backends.h"
NRF_LOG_MODULE_REGISTER();

/*
 * A card slot can simulate up to two cards at the same time, one ID 125kHz EM410X, and one IC 13.56MHz 14A.(May be able
 * to support more in the future) When starting, you should start the startup listener on demand (there is no emulated
 * card when there is no data, but you need to monitor the state on demand) If the retrieved card slot configuration has
 * a specified type of card, then loading the specified type of data should be carried out, and the necessary parameters
 * of initialization should be performed. When the on-field entry is detected, in addition to the relevant LED, you also
 * need to start the simulation card according to whether the current data is loaded. In the simulation card, all
 * operations should be carried out based on the data loaded in RAM. After the analog card is over, the modified data
 * should be preserved to Flash
 *
 *
 *
 * ......
 */

// Is the logo in the analog card?
bool g_is_tag_emulating = false;

static tag_specific_type_t tag_specific_type_old2new_lf_values[][2] = {TAG_SPECIFIC_TYPE_OLD2NEW_LF_VALUES};
static tag_specific_type_t tag_specific_type_old2new_hf_values[][2] = {TAG_SPECIFIC_TYPE_OLD2NEW_HF_VALUES};
static tag_specific_type_t tag_specific_type_lf_values[] = {TAG_SPECIFIC_TYPE_LF_VALUES};
static tag_specific_type_t tag_specific_type_hf_values[] = {TAG_SPECIFIC_TYPE_HF_VALUES};

bool is_tag_specific_type_valid(tag_specific_type_t tag_type) {
    bool valid = false;
    for (uint16_t i = 0; i < ARRAYLEN(tag_specific_type_lf_values); i++) {
        valid |= (tag_type == tag_specific_type_lf_values[i]);
    }
    for (uint16_t i = 0; i < ARRAYLEN(tag_specific_type_hf_values); i++) {
        valid |= (tag_type == tag_specific_type_hf_values[i]);
    }
    return valid;
}
// **********************  Specific parameters start **********************

/**
 * The label data exists in the information in Flash, and the total length must be aligned by 4 bytes (whole
 * words)!IntersectionIntersection
 */
static uint8_t m_tag_data_buffer_lf[12]; // Low -frequency card data buffer
static uint16_t m_tag_data_lf_crc;
static tag_data_buffer_t m_tag_data_lf = {sizeof(m_tag_data_buffer_lf), m_tag_data_buffer_lf, &m_tag_data_lf_crc};

static uint8_t m_tag_data_buffer_hf[4500]; // High -frequency card data buffer
static uint16_t m_tag_data_hf_crc;
static bool m_tag_data_loaded;
static tag_data_buffer_t m_tag_data_hf = {sizeof(m_tag_data_buffer_hf), m_tag_data_buffer_hf, &m_tag_data_hf_crc};

/**
 * Eight card slots, each card slot has its own unique configuration
 */
static tag_slot_config_t slotConfig ALIGN_U32 = {
    // Configure activated card slot, default activation of the 0th card slot (the first card)
    .version = TAG_SLOT_CONFIG_CURRENT_VERSION,
    .active_slot = 0,
    // Configuration card slots
    // See tag_emulation_factory_init for actual tag content
    .slots =
        {
            {
                .enabled_hf = true,
                .enabled_lf = true,
                .tag_hf = TAG_TYPE_MIFARE_1024,
                .tag_lf = TAG_TYPE_EM410X,
            }, // 1
            {
                .enabled_hf = true,
                .enabled_lf = false,
                .tag_hf = TAG_TYPE_MF0ICU1,
                .tag_lf = TAG_TYPE_UNDEFINED,
            }, // 2
            {
                .enabled_hf = false,
                .enabled_lf = true,
                .tag_hf = TAG_TYPE_UNDEFINED,
                .tag_lf = TAG_TYPE_EM410X,
            }, // 3
            {
                .enabled_hf = false,
                .enabled_lf = false,
                .tag_hf = TAG_TYPE_UNDEFINED,
                .tag_lf = TAG_TYPE_UNDEFINED,
            }, // 4
            {
                .enabled_hf = false,
                .enabled_lf = false,
                .tag_hf = TAG_TYPE_UNDEFINED,
                .tag_lf = TAG_TYPE_UNDEFINED,
            }, // 5
            {
                .enabled_hf = false,
                .enabled_lf = false,
                .tag_hf = TAG_TYPE_UNDEFINED,
                .tag_lf = TAG_TYPE_UNDEFINED,
            }, // 6
            {
                .enabled_hf = false,
                .enabled_lf = false,
                .tag_hf = TAG_TYPE_UNDEFINED,
                .tag_lf = TAG_TYPE_UNDEFINED,
            }, // 7
            {
                .enabled_hf = false,
                .enabled_lf = false,
                .tag_hf = TAG_TYPE_UNDEFINED,
                .tag_lf = TAG_TYPE_UNDEFINED,
            }, // 8
        },
};
// The card slot configuration unique CRC, once the slot configuration changes, can be checked by CRC
static uint16_t m_slot_config_crc;

// ********************** Specific parameter ends **********************

/**
 * The data of the label is loaded to the RAM and the mapping table of the operation of the regulating notification,
 * The mapping structure is:
 * Field -type detailed label type Loading data The notification of the notification of the notification of the
 * notification of the call recovery data before saving the data of the realization data of the function card data
 */
static tag_base_handler_map_t tag_base_map[] = {
    // Low -frequency ID card simulation
    //{ TAG_SENSE_LF,    TAG_TYPE_EM410X,         lf_tag_em410x_data_loadcb,    lf_tag_em410x_data_savecb,
    //lf_tag_em410x_data_factory,    &m_tag_data_lf },
    // MF1 tag simulation
    {TAG_SENSE_HF, TAG_TYPE_MIFARE_Mini, nfc_tag_mf1_data_loadcb, nfc_tag_mf1_data_savecb, nfc_tag_mf1_data_factory,
     &m_tag_data_hf},
    {TAG_SENSE_HF, TAG_TYPE_MIFARE_1024, nfc_tag_mf1_data_loadcb, nfc_tag_mf1_data_savecb, nfc_tag_mf1_data_factory,
     &m_tag_data_hf},
    {TAG_SENSE_HF, TAG_TYPE_MIFARE_2048, nfc_tag_mf1_data_loadcb, nfc_tag_mf1_data_savecb, nfc_tag_mf1_data_factory,
     &m_tag_data_hf},
    {TAG_SENSE_HF, TAG_TYPE_MIFARE_4096, nfc_tag_mf1_data_loadcb, nfc_tag_mf1_data_savecb, nfc_tag_mf1_data_factory,
     &m_tag_data_hf},
    // NTAG tag simulation
    {TAG_SENSE_HF, TAG_TYPE_NTAG_210, nfc_tag_mf0_ntag_data_loadcb, nfc_tag_mf0_ntag_data_savecb,
     nfc_tag_mf0_ntag_data_factory, &m_tag_data_hf},
    {TAG_SENSE_HF, TAG_TYPE_NTAG_212, nfc_tag_mf0_ntag_data_loadcb, nfc_tag_mf0_ntag_data_savecb,
     nfc_tag_mf0_ntag_data_factory, &m_tag_data_hf},
    {TAG_SENSE_HF, TAG_TYPE_NTAG_213, nfc_tag_mf0_ntag_data_loadcb, nfc_tag_mf0_ntag_data_savecb,
     nfc_tag_mf0_ntag_data_factory, &m_tag_data_hf},
    {TAG_SENSE_HF, TAG_TYPE_NTAG_215, nfc_tag_mf0_ntag_data_loadcb, nfc_tag_mf0_ntag_data_savecb,
     nfc_tag_mf0_ntag_data_factory, &m_tag_data_hf},
    {TAG_SENSE_HF, TAG_TYPE_NTAG_216, nfc_tag_mf0_ntag_data_loadcb, nfc_tag_mf0_ntag_data_savecb,
     nfc_tag_mf0_ntag_data_factory, &m_tag_data_hf},
    // MF0 tag simulation
    {TAG_SENSE_HF, TAG_TYPE_MF0ICU1, nfc_tag_mf0_ntag_data_loadcb, nfc_tag_mf0_ntag_data_savecb,
     nfc_tag_mf0_ntag_data_factory, &m_tag_data_hf},
    {TAG_SENSE_HF, TAG_TYPE_MF0ICU2, nfc_tag_mf0_ntag_data_loadcb, nfc_tag_mf0_ntag_data_savecb,
     nfc_tag_mf0_ntag_data_factory, &m_tag_data_hf},
    {TAG_SENSE_HF, TAG_TYPE_MF0UL11, nfc_tag_mf0_ntag_data_loadcb, nfc_tag_mf0_ntag_data_savecb,
     nfc_tag_mf0_ntag_data_factory, &m_tag_data_hf},
    {TAG_SENSE_HF, TAG_TYPE_MF0UL21, nfc_tag_mf0_ntag_data_loadcb, nfc_tag_mf0_ntag_data_savecb,
     nfc_tag_mf0_ntag_data_factory, &m_tag_data_hf},
};

static int32_t tag_emulation_load_config(void);

/**
 * accordingToTheSpecifiedDetailedLabelType,ObtainTheImplementationFunctionOfTheDataThatProcessesTheLoadedLoaded
 */
static tag_datas_loadcb_t get_data_loadcb_from_tag_type(tag_specific_type_t type) {
    for (int i = 0; i < ARRAY_SIZE(tag_base_map); i++) {
        if (tag_base_map[i].tag_type == type) {
            return tag_base_map[i].data_on_load;
        }
    }
    return NULL;
}

/**
 * accordingToTheSpecifiedDetailedLabelType,ObtainTheOperationFunctionBeforeTheDataPreservationOfTheData
 */
static tag_datas_savecb_t get_data_savecb_from_tag_type(tag_specific_type_t type) {
    for (int i = 0; i < ARRAY_SIZE(tag_base_map); i++) {
        if (tag_base_map[i].tag_type == type) {
            return tag_base_map[i].data_on_save;
        }
    }
    return NULL;
}

/**
 * accordingToTheSpecifiedDetailedLabelType,ObtainTheOperationFunctionOfTheDataFactoryInitialized
 */
static tag_datas_factory_t get_data_factory_from_tag_type(tag_specific_type_t type) {
    for (int i = 0; i < ARRAY_SIZE(tag_base_map); i++) {
        if (tag_base_map[i].tag_type == type) {
            return tag_base_map[i].data_factory;
        }
    }
    return NULL;
}

/**
 * accordingToTheSpecifiedDetailedLabelType,ObtainItsBasicFieldInductionType
 */
tag_sense_type_t get_sense_type_from_tag_type(tag_specific_type_t type) {
    for (int i = 0; i < ARRAY_SIZE(tag_base_map); i++) {
        if (tag_base_map[i].tag_type == type) {
            return tag_base_map[i].sense_type;
        }
    }
    return TAG_SENSE_NO;
}

/**
 * obtainTheBufferInformationAccordingToTheType
 */
tag_data_buffer_t *get_buffer_by_tag_type(tag_specific_type_t type) {
    for (int i = 0; i < ARRAY_SIZE(tag_base_map); i++) {
        if (tag_base_map[i].tag_type == type) {
            return tag_base_map[i].data_buffer;
        }
    }
    return NULL;
}

/**
 * loadDataFromMemoryToTheSimulationCardData
 */
bool tag_emulation_load_by_buffer(tag_specific_type_t tag_type, bool update_crc) {
    m_tag_data_loaded = false;
    // theDataHasBeenLoadedToTheBufferArea,AndTheConfigurationOfTheActivatedCardSlotIsNext,
    // //PassTheBufferOfTheSettingOfTheSettingSimulationCardType (highFrequencyCard,LowFrequencyCard)ToIt
    tag_datas_loadcb_t fn_loadcb = get_data_loadcb_from_tag_type(tag_type);
    if (fn_loadcb == NULL) { // makeSureThatThereIsACorrespondingLoadingProcess
        NRF_LOG_INFO("Tag data loader no impl.");
        return false;
    }
    // theCorrespondingImplementation,WeHaveLoadedTheData
    tag_data_buffer_t *buffer = get_buffer_by_tag_type(tag_type);
    int length = fn_loadcb(tag_type, buffer);
    if (length > 0 && length <= buffer->length) {
        // afterReadingIsCompleted,WeCanSaveACrcOfTheCurrentDataWhenItIsStoredLater,ItCanBeUsedAsAReferenceForChangesComparison
        if (update_crc) calc_14a_crc_lut(buffer->buffer, length, (uint8_t *)buffer->crc);
        m_tag_data_loaded = true;
        return true;
    }
    return false;
}

/**
 * loadTheDataAccordingToTheType
 */
static void load_data_by_tag_type(uint8_t slot, tag_specific_type_t tag_type) {
    m_tag_data_loaded = false;
    // maybeTheCardSlotIsNotEnabledToUseTheSimulationOfThisTypeOfLabel,AndSkipTheDataDirectlyToLoadThisData
    if (tag_type == TAG_TYPE_UNDEFINED) {
        return;
    }
    // getTheSpecialBufferInformation
    tag_data_buffer_t *buffer = get_buffer_by_tag_type(tag_type);
    if (buffer == NULL) {
        NRF_LOG_ERROR("No buffer valid!");
        return;
    }
    tag_sense_type_t sense_type = get_sense_type_from_tag_type(tag_type);
    // getTheSpecialCardSlotFdsRecordInformation
    fds_slot_record_map_t map_info;
    get_fds_map_by_slot_sense_type_for_dump(slot, sense_type, &map_info);
    // accordingToTheTypeOfTheCardSlotCurrentlyActivated,LoadTheDataOfTheDesignatedFieldToTheBuffer
    // //Tip:IfTheLengthOfTheDataCannotMatchTheLengthOfTheBuffer,ItMayBeCausedByTheFirmwareUpdateAtThisTime,TheDataMustBeDeletedAndRebuilt
    uint16_t length = buffer->length;
    bool ret = fds_read_sync(map_info.id, map_info.key, &length, buffer->buffer);
    if (false == ret) {
        NRF_LOG_INFO("Tag slot data no exists.");
        return;
    }
    /* Pass the bytes actually read to the callback, not the 4500-byte capacity. */
    uint16_t capacity = buffer->length;
    buffer->length = length;
    ret = tag_emulation_load_by_buffer(tag_type, true);
    buffer->length = capacity;
    if (ret) {
        NRF_LOG_INFO("Load tag slot %d, type %d data done.", slot, tag_type);
    }
}

/**
 * Save data according to the type
 */
static bool save_data_by_tag_type(uint8_t slot, tag_specific_type_t tag_type) {
    // Maybe the card slot is not enabled to use the simulation of this type of label, and skip it directly to save this
    // data
    if (tag_type == TAG_TYPE_UNDEFINED) {
        return true;
    }
    if (!m_tag_data_loaded) return false;
    tag_data_buffer_t *buffer = get_buffer_by_tag_type(tag_type);
    if (buffer == NULL) {
        NRF_LOG_ERROR("No buffer valid!");
        return false;
    }
    /* The MF1 callback turns a pending Shadow selection into its persisted
     * representation. Roll that transition back if persistence fails, or the
     * next retry would deliberately skip saving an already-Shadow buffer. */
    nfc_tag_mf1_configure_t *pending_shadow = NULL;
    if (buffer->buffer && buffer->length >= sizeof(nfc_tag_14a_coll_res_entity_t) + sizeof(nfc_tag_mf1_configure_t) &&
        (tag_type == TAG_TYPE_MIFARE_Mini || tag_type == TAG_TYPE_MIFARE_1024 ||
         tag_type == TAG_TYPE_MIFARE_2048 || tag_type == TAG_TYPE_MIFARE_4096)) {
        nfc_tag_mf1_configure_t *config = &((nfc_tag_mf1_information_t *)buffer->buffer)->config;
        if (config->mode_block_write == NFC_TAG_MF1_WRITE_SHADOW_REQ) pending_shadow = config;
    }
    // The length of the data to be saved by the user should not exceed the size of the global buffer
    int data_byte_length = 0;
    tag_datas_savecb_t fn_savecb = get_data_savecb_from_tag_type(tag_type);
    if (fn_savecb == NULL) { // Make sure that there is a real estate process
        NRF_LOG_INFO("Tag data saver no impl.");
        return false;
    } else {
        data_byte_length = fn_savecb(tag_type, buffer);
    }
    // Make sure to save data, we can judge whether the data has changed through CRC
    if (data_byte_length <= 0) {
        if (pending_shadow) pending_shadow->mode_block_write = NFC_TAG_MF1_WRITE_SHADOW_REQ;
        NRF_LOG_INFO("Tag type %d data no save.", tag_type);
        return data_byte_length == 0;
    }
    // Make sure that the data to be stored is not greater than the size of the current buffer area
    if (data_byte_length > buffer->length) {
        if (pending_shadow) pending_shadow->mode_block_write = NFC_TAG_MF1_WRITE_SHADOW_REQ;
        NRF_LOG_ERROR("Tag data save length overflow.", tag_type);
        return false;
    }
    uint16_t crc;
    calc_14a_crc_lut(buffer->buffer, data_byte_length, (uint8_t *)&crc);
    tag_sense_type_t sense_type = get_sense_type_from_tag_type(tag_type);
    // Get the special card slot FDS record information
    fds_slot_record_map_t map_info;
    get_fds_map_by_slot_sense_type_for_dump(slot, sense_type, &map_info);
    /* CRC16 is a cheap changed-data hint, not proof of equal bytes. This
     * comparison only runs on a save, never at startup or in the NFC IRQ. */
    if (crc == *buffer->crc) {
        int32_t equal = fds_compare_sync(map_info.id, map_info.key, data_byte_length, buffer->buffer);
        if (equal != 0) {
            if (equal < 0 && pending_shadow) pending_shadow->mode_block_write = NFC_TAG_MF1_WRITE_SHADOW_REQ;
            return equal > 0;
        }
    }
    // Call the blocked FDS to write the function, and write the data of the specified field type of the card slot into
    // the Flash
    bool ret = fds_write_sync(map_info.id, map_info.key, data_byte_length, buffer->buffer);
    if (ret) {
        *buffer->crc = crc;
        NRF_LOG_INFO("Save tag slot data success.");
    } else {
        if (pending_shadow) pending_shadow->mode_block_write = NFC_TAG_MF1_WRITE_SHADOW_REQ;
        NRF_LOG_ERROR("Save tag slot data error.");
    }
    /* A failed write remains dirty so a later save can retry it. */
    return ret;
}

/**
 * Delete data according to the type
 */
static void delete_data_by_tag_type(uint8_t slot, tag_sense_type_t sense_type) {
    if (sense_type == TAG_SENSE_NO) {
        return;
    }
    fds_slot_record_map_t map_info;
    get_fds_map_by_slot_sense_type_for_dump(slot, sense_type, &map_info);
    int count = fds_delete_sync(map_info.id, map_info.key);
    NRF_LOG_INFO("Slot %d delete sense type %d data, record count: %d", slot, sense_type, count);
}

/**
 * Load the simulation card data data. Note that loading is just data operation,
 * Start the analog card, please call tag_emulation_sense_run function, otherwise you will not sensor the field event
 */
void tag_emulation_load_data(void) {
    uint8_t slot = tag_emulation_get_slot();
    load_data_by_tag_type(slot, slotConfig.slots[slot].tag_hf);
    // load_data_by_tag_type(slot, slotConfig.slots[slot].tag_lf);
}

/**
 *Save the emulated card configuration data. At the right time, this function should be called for data preservation of
 *data
 */
bool tag_emulation_save_data(void) {
    uint8_t slot = tag_emulation_get_slot();
    return save_data_by_tag_type(slot, slotConfig.slots[slot].tag_hf);
}

/* Explicit changed-only commit: the caller has already compared the edited
 * fields byte-for-byte. General saves instead compare storage on CRC equality;
 * this explicit changed path can persist directly without that extra read. */
bool tag_emulation_save_active_data(void) {
    uint8_t slot = tag_emulation_get_slot();
    tag_specific_type_t type = slotConfig.slots[slot].tag_hf;
    if (!m_tag_data_loaded || type == TAG_TYPE_UNDEFINED) return false;
    tag_data_buffer_t *buffer = get_buffer_by_tag_type(type);
    tag_datas_savecb_t saver = get_data_savecb_from_tag_type(type);
    if (!buffer || !buffer->buffer || !buffer->crc || !saver) return false;
    int length = saver(type, buffer);
    /* Zero means intentionally not saved (e.g. shadow), never a commit. */
    if (length <= 0 || length > buffer->length) return false;
    uint16_t crc;
    calc_14a_crc_lut(buffer->buffer, length, (uint8_t *)&crc);
    fds_slot_record_map_t map;
    get_fds_map_by_slot_sense_type_for_dump(slot, get_sense_type_from_tag_type(type), &map);
    bool saved = fds_write_sync(map.id, map.key, length, buffer->buffer);
    if (saved) *buffer->crc = crc;
    return saved;
}

/**
 * @brief Get the type of labeling of the simulation card from the corresponding card slot.
 *
 * @param slot Card slot
 * @param tag_type Label
 */
void tag_emulation_get_specific_types_by_slot(uint8_t slot, tag_slot_specific_type_t *tag_types) {
    tag_types->tag_hf = slotConfig.slots[slot].tag_hf;
    tag_types->tag_lf = slotConfig.slots[slot].tag_lf;
}

/**
 * Delete the data specified by a card slot, if it is the current activated card slot data, we also need to dynamically
 * close the simulation of this card
 */
void tag_emulation_delete_data(uint8_t slot, tag_sense_type_t sense_type) {
    // delete data
    delete_data_by_tag_type(slot, sense_type);
    // Close the corresponding card type of the corresponding card slot
    switch (sense_type) {
    case TAG_SENSE_HF: {
        slotConfig.slots[slot].tag_hf = TAG_TYPE_UNDEFINED;
        slotConfig.slots[slot].enabled_hf = false;
    } break;
    case TAG_SENSE_LF: {
        slotConfig.slots[slot].tag_lf = TAG_TYPE_UNDEFINED;
        slotConfig.slots[slot].enabled_lf = false;
    } break;
    default:
        break;
    }
    // If the deleted card slot data is currently activated (being simulated), we also need to make dynamic shutdown
    if (slotConfig.active_slot == slot) {
        tag_emulation_sense_switch(sense_type, false);
    }
}

/**
 * Set the data of a card slot to the preset data from the factory
 */
bool tag_emulation_factory_data(uint8_t slot, tag_specific_type_t tag_type) {
    tag_datas_factory_t factory = get_data_factory_from_tag_type(tag_type);
    if (factory != NULL) {
        // The process of implementing the data formatting data!
        if (factory(slot, tag_type)) {
            // If the current data card slot number currently set is the current activated card slot, then we need to
            // update to the memory
            if (tag_emulation_get_slot() == slot) {
                load_data_by_tag_type(slot, tag_type);
                return m_tag_data_loaded;
            }
            return true;
        }
    }
    return false;
}

/**
 * Switch field induction monitoring status
 * @param enable: Whether to make the field induction
 */
static void tag_emulation_sense_switch_all(bool enable) {
    uint8_t slot = tag_emulation_get_slot();
    // NRF_LOG_INFO("Slot %d tag type hf %d, lf %d", slot, slotConfig.slots[slot].tag_hf,
    // slotConfig.slots[slot].tag_lf);
    if (enable && (slotConfig.slots[slot].enabled_hf) && (slotConfig.slots[slot].tag_hf != TAG_TYPE_UNDEFINED)) {
        nfc_tag_14a_sense_switch(true);
    } else {
        nfc_tag_14a_sense_switch(false);
    }
    // if (enable && (slotConfig.slots[slot].enabled_lf) && (slotConfig.slots[slot].tag_lf != TAG_TYPE_UNDEFINED)) {
    //     lf_tag_125khz_sense_switch(true);
    // } else {
    //     lf_tag_125khz_sense_switch(false);
    // }
}

/**
 * Switch field induction monitoring status
 * @param type: Field sensor type
 * @param enable: Whether to enable this type of field induction
 */
void tag_emulation_sense_switch(tag_sense_type_t type, bool enable) {
    uint8_t slot = tag_emulation_get_slot();
    // Check the parameters, not allowed to switch non -normal field
    switch (type) {
    case TAG_SENSE_NO:
        APP_ERROR_CHECK(NRF_ERROR_INVALID_PARAM);
        break;
    case TAG_SENSE_HF:
        if (enable && (slotConfig.slots[slot].enabled_hf) && (slotConfig.slots[slot].tag_hf != TAG_TYPE_UNDEFINED)) {
            nfc_tag_14a_sense_switch(true);
        } else {
            nfc_tag_14a_sense_switch(false);
        }
        break;
        // case TAG_SENSE_LF:
        //     if (enable && (slotConfig.slots[slot].enabled_lf) &&
        //             (slotConfig.slots[slot].tag_lf != TAG_TYPE_UNDEFINED)) {
        //         lf_tag_125khz_sense_switch(true);
        //     } else {
        //         lf_tag_125khz_sense_switch(false);
        //     }
        //     break;
    }
}

/* Decode into a temporary object: malformed files must not change active RAM
 * or be silently replaced on app exit. V8 stores 4 + 8*N bytes; legacy files
 * store an active index (0..7) at byte 0 and 4 + 4*N bytes. */
static bool tag_emulation_decode_config(tag_slot_config_t *candidate, uint16_t length) {
    if (length < 8 || length > sizeof(*candidate)) return false;
    uint8_t *raw = (uint8_t *)candidate;
    uint16_t count;
    if (candidate->version < TAG_SLOT_CONFIG_CURRENT_VERSION) {
        if ((length - 4) % 4) return false;
        count = (length - 4) / 4;
        if (!count || count > TAG_MAX_SLOT_NUM || raw[0] >= count) return false;
        uint8_t active = raw[0];
        /* Expand backwards: each legacy slot is read before a larger V8 slot
         * can overwrite it. This avoids a second 404-byte stack buffer. */
        for (uint16_t remaining = count; remaining; remaining--) {
            uint16_t i = remaining - 1;
            bool enabled = (raw[4 + i * 4] & 1) != 0;
            tag_specific_type_t hf = raw[4 + i * 4 + 2];
            tag_specific_type_t lf = raw[4 + i * 4 + 3];
            for (uint16_t j = 0; j < ARRAYLEN(tag_specific_type_old2new_hf_values); j++)
                if (hf == tag_specific_type_old2new_hf_values[j][0]) {
                    hf = tag_specific_type_old2new_hf_values[j][1]; break;
                }
            for (uint16_t j = 0; j < ARRAYLEN(tag_specific_type_old2new_lf_values); j++)
                if (lf == tag_specific_type_old2new_lf_values[j][0]) {
                    lf = tag_specific_type_old2new_lf_values[j][1]; break;
                }
            memset(&candidate->slots[i], 0, sizeof(candidate->slots[i]));
            candidate->slots[i].tag_hf = hf;
            candidate->slots[i].tag_lf = lf;
            candidate->slots[i].enabled_hf = enabled && hf != TAG_TYPE_UNDEFINED;
            candidate->slots[i].enabled_lf = enabled && lf != TAG_TYPE_UNDEFINED;
        }
        candidate->version = TAG_SLOT_CONFIG_CURRENT_VERSION;
        candidate->active_slot = active;
    } else {
        if (candidate->version != TAG_SLOT_CONFIG_CURRENT_VERSION || (length - 4) % 8) return false;
        count = (length - 4) / 8;
        if (!count || count > TAG_MAX_SLOT_NUM || candidate->active_slot >= count) return false;
    }
    for (uint16_t i = 0; i < count; i++) {
        tag_specific_type_t hf = candidate->slots[i].tag_hf;
        tag_specific_type_t lf = candidate->slots[i].tag_lf;
        if (hf != TAG_TYPE_UNDEFINED && get_sense_type_from_tag_type(hf) != TAG_SENSE_HF) return false;
        if (lf != TAG_TYPE_UNDEFINED && lf != TAG_TYPE_EM410X) return false;
    }
    /* Empty/disabled active slots are legal; the UI routes them to type selection. */
    return true;
}

static int32_t tag_emulation_load_config(void) {
    tag_slot_config_t candidate = {0};
    int32_t length = fds_read_config((uint8_t *)&candidate, sizeof(candidate));
    if (length == 0) return 0; /* New device: existing factory path. */
    if (length < 0) return -1;
    uint16_t stored_crc;
    calc_14a_crc_lut((uint8_t *)&candidate, sizeof(candidate), (uint8_t *)&stored_crc);
    if (!tag_emulation_decode_config(&candidate, (uint16_t)length)) return -1;
    /* Resetting/replacing settings can reduce the slot count without going
     * through prepare_slot_count. Reconcile before loading card data: the next
     * save uses this count for its file length, and navigation scans all slots. */
    uint8_t count = settings_get_data()->chameleon_slot_num;
    if (count < 8 || count > TAG_MAX_SLOT_NUM) return -1;
    for (uint8_t i = count; i < TAG_MAX_SLOT_NUM; i++) candidate.slots[i].enabled_hf = false;
    if (candidate.active_slot >= count) {
        candidate.active_slot = 0;
        for (uint8_t i = 0; i < count; i++) {
            if (candidate.slots[i].enabled_hf &&
                get_sense_type_from_tag_type(candidate.slots[i].tag_hf) == TAG_SENSE_HF) {
                candidate.active_slot = i;
                break;
            }
        }
    }
    memcpy(&slotConfig, &candidate, sizeof(slotConfig));
    m_slot_config_crc = stored_crc;
    NRF_LOG_INFO("Load tag slot config done.");
    return length;
}

/**
 *Save the emulated card configuration data
 */
bool tag_emulation_save_config(void) {
    // We are configured the card slot configuration, and we need to calculate the current card slot configuration CRC
    // code to judge whether the data below is updated
    uint16_t new_calc_crc;
    calc_14a_crc_lut((uint8_t *)&slotConfig, sizeof(slotConfig), (uint8_t *)&new_calc_crc);
    bool changed = new_calc_crc != m_slot_config_crc;
    if (!changed) {
        int32_t equal = fds_compare_sync(FDS_EMULATION_CONFIG_FILE_ID, FDS_EMULATION_CONFIG_RECORD_KEY,
                                         sizeof(slotConfig), (uint8_t *)&slotConfig);
        if (equal < 0) return false;
        changed = equal == 0;
    }
    if (changed) {
        NRF_LOG_INFO("Save tag slot config start.");
        bool ret = fds_write_sync(FDS_EMULATION_CONFIG_FILE_ID, FDS_EMULATION_CONFIG_RECORD_KEY, sizeof(slotConfig),
                                  (uint8_t *)&slotConfig);
        if (ret) {
            NRF_LOG_INFO("Save tag slot config success.");
            m_slot_config_crc = new_calc_crc;
        } else {
            NRF_LOG_ERROR("Save tag slot config error.");
        }
        return ret;
    } else {
        NRF_LOG_INFO("Tag slot config no change.");
    }
    return true;
}

/**
 * Start label simulation
 */
void tag_emulation_sense_run(void) {
    if (m_tag_data_loaded) tag_emulation_sense_switch_all(true);
}

/**
 * Stop the label simulation. Note that this function will absolutely block NFC -related events, including awakening MCU
 * If you still need to be awakened by NFC after the MCU is required, please do not call this function
 */
void tag_emulation_sense_end(void) {
    TAG_FIELD_LED_OFF();
    tag_emulation_sense_switch_all(false);
}

/**
 *Initialized label simulation
 */
bool tag_emulation_init(void) {
    m_tag_data_loaded = false;
    int32_t config_length = tag_emulation_load_config();
    if (config_length < 0) return false;
    if (config_length == 0) return true;
    if (slotConfig.slots[slotConfig.active_slot].tag_hf == TAG_TYPE_UNDEFINED) return true;
    tag_emulation_load_data();
    return m_tag_data_loaded;
}

bool tag_emulation_active_data_ready(void) { return m_tag_data_loaded; }

/* Shrinking the saved file must not leave its active index outside the file.
 * Keep the old selection and data if saving it fails. */
bool tag_emulation_prepare_slot_count(uint8_t count) {
    if (!count || count > TAG_MAX_SLOT_NUM) return false;
    if (slotConfig.active_slot < count) return tag_emulation_save_data();
    uint8_t next = 0;
    for (uint8_t i = 0; i < count; i++) {
        if (slotConfig.slots[i].enabled_hf &&
            get_sense_type_from_tag_type(slotConfig.slots[i].tag_hf) == TAG_SENSE_HF) { next = i; break; }
    }
    /* The slot change commits the old card exactly once before replacing its buffer. */
    return tag_emulation_change_slot(next, false);
}

/**
 *Save the label data (written from RAM to Flash)
 */
bool tag_emulation_save(void) {
    /* Never publish configuration over a failed card-data commit. */
    return tag_emulation_save_data() && tag_emulation_save_config();
}

bool tag_emulation_save_for_exit(uint8_t *default_slot) {
    uint8_t active = slotConfig.active_slot;
    uint8_t count = settings_get_data()->chameleon_slot_num;
    if (!default_slot || active >= TAG_MAX_SLOT_NUM || active >= count) return false;
    if (!tag_emulation_save_data()) return false;
    /* The next init loads the default. Do not replace the current buffer:
     * a cancelled exit must retain even deliberately volatile Shadow bytes. */
    uint8_t next = *default_slot;
    if (next < TAG_MAX_SLOT_NUM && next < count && slotConfig.slots[next].enabled_hf &&
        get_sense_type_from_tag_type(slotConfig.slots[next].tag_hf) == TAG_SENSE_HF) {
        slotConfig.active_slot = next;
    } else {
        next = UINT8_MAX; /* Invalid default must not enable NFC wake. */
    }
    bool saved = tag_emulation_save_config();
    slotConfig.active_slot = active;
    if (saved) *default_slot = next;
    /* Keep the CRC of the configuration actually written. Restoring RAM must
     * not turn a later ordinary save into a false equal-data/no-op decision. */
    return saved;
}

/**
 * Get the currently activated card slot index
 */
uint8_t tag_emulation_get_slot(void) { return slotConfig.active_slot; }

/**
 * Set the currently activated card slot index
 */
void tag_emulation_set_slot(uint8_t index) {
    slotConfig.active_slot = index; // Re -set to the new switched card slot
    // rgb_marquee_reset(); // force animation color refresh according to new slot
}

/**
 * Switch to the card slot of the specified index, this function will automatically complete the data loading
 */
bool tag_emulation_change_slot(uint8_t index, bool sense_disable) {
    if (index >= TAG_MAX_SLOT_NUM) return false;
    if (sense_disable) {
        // Turn off the analog card to avoid triggering the simulation when switching the card slot
        tag_emulation_sense_end();
    }
    /* A failed save must not be followed by a load over the only dirty RAM copy. */
    if (!save_data_by_tag_type(slotConfig.active_slot, slotConfig.slots[slotConfig.active_slot].tag_hf)) {
        if (sense_disable) tag_emulation_sense_run();
        return false;
    }
    g_is_tag_emulating = false;    // Reset the logo position
    tag_emulation_set_slot(index); // Update the index of the activated card slot
    tag_emulation_load_data();     // Then reload the data of the card slot
    if (sense_disable) {
        // According to the configuration of the new card slot, the monitoring status of our update
        tag_emulation_sense_run();
    }
    return true;
}

/**
 * Determine whether the specified card slot is enabled
 */
bool tag_emulation_slot_is_enabled(uint8_t slot, tag_sense_type_t sense_type) {
    switch (sense_type) {
    case TAG_SENSE_LF: {
        return slotConfig.slots[slot].enabled_lf;
        break;
    }
    case TAG_SENSE_HF: {
        return slotConfig.slots[slot].enabled_hf;
        break;
    }
    default:
        return false;
        break; // Never happen
    }
}

/**
 * Set whether the specified card slot is enabled
 */
void tag_emulation_slot_set_enable(uint8_t slot, tag_sense_type_t sense_type, bool enable) {
    // Set the capacity of the corresponding card slot directly
    switch (sense_type) {
    case TAG_SENSE_LF: {
        slotConfig.slots[slot].enabled_lf = enable;
        break;
    }
    case TAG_SENSE_HF: {
        slotConfig.slots[slot].enabled_hf = enable;
        break;
    }
    default:
        break; // Never happen
    }
}

/**
 *Find the next valid card slot
 */
uint8_t tag_emulation_slot_find_next(uint8_t slot_now) {
    uint8_t start_slot = (slot_now + 1 == TAG_MAX_SLOT_NUM) ? 0 : slot_now + 1;
    for (uint8_t i = start_slot;;) {
        if (i == slot_now) return slot_now; // No other activated card slots were found after a loop
        if (slotConfig.slots[i].enabled_hf &&
            get_sense_type_from_tag_type(slotConfig.slots[i].tag_hf) == TAG_SENSE_HF)
            return i; // Check whether the card slot that is currently traversed is enabled, so that the capacity
                      // determines that the current card slot is the card slot that can effectively enable capacity
        i++;
        if (i == TAG_MAX_SLOT_NUM) { // Continue the next cycle
            i = 0;
        }
    }
    return slot_now; // If you cannot find it, the specified return value of the pass is returned by default
}

/**
 * Find the previous valid card slot
 */
uint8_t tag_emulation_slot_find_prev(uint8_t slot_now) {
    uint8_t start_slot = (slot_now == 0) ? (TAG_MAX_SLOT_NUM - 1) : slot_now - 1;
    for (uint8_t i = start_slot;;) {
        if (i == slot_now) return slot_now; // No other activated card slots were found after a loop
        if (slotConfig.slots[i].enabled_hf &&
            get_sense_type_from_tag_type(slotConfig.slots[i].tag_hf) == TAG_SENSE_HF)
            return i; // Check whether the card slot that is currently traversed is enabled, so that the capacity
                      // determines that the current card slot is the card slot that can effectively enable capacity
        if (i == 0) { // Continue the next cycle
            i = TAG_MAX_SLOT_NUM - 1;
        } else {
            i--;
        }
    }
    return slot_now; // If you cannot find it, the specified return value of the pass is returned by default
}

/**
 *Set the card specified by the specified card slot card slot card type card to the specified type
 */
void tag_emulation_change_type(uint8_t slot, tag_specific_type_t tag_type) {
    tag_sense_type_t sense_type = get_sense_type_from_tag_type(tag_type);
    NRF_LOG_INFO("sense type = %d", sense_type);
    switch (sense_type) {
    case TAG_SENSE_LF: {
        slotConfig.slots[slot].tag_lf = tag_type;
        break;
    }
    case TAG_SENSE_HF: {
        slotConfig.slots[slot].tag_hf = tag_type;
        break;
    }
    default:
        break; // Never happen
    }
    NRF_LOG_INFO("tag type = %d", tag_type);
    // After the update is completed, we need to notify the relevant data in the update of the memory
    if (sense_type != TAG_SENSE_NO) {
        load_data_by_tag_type(slot, tag_type);
        NRF_LOG_INFO("reload data success.");
    }
}

/**
 * @briefThe factory initialization function of the simulation card
 * Some data that can be used to initialize the default factory factory
 */
void tag_emulation_factory_init(void) {
    fds_slot_record_map_t map_info;

    // Initialized a dual -frequency card in the card slot, if there is no historical record, it is a new state of
    // factory.
    if (slotConfig.slots[0].enabled_hf && slotConfig.slots[0].tag_hf == TAG_TYPE_MIFARE_1024) {
        // Initialize a high -frequency M1 card in the card slot 1, if it does not exist.
        get_fds_map_by_slot_sense_type_for_dump(0, TAG_SENSE_HF, &map_info);
        if (!fds_is_exists(map_info.id, map_info.key)) {
            tag_emulation_factory_data(0, slotConfig.slots[0].tag_hf);
        }
    }

    if (slotConfig.slots[0].enabled_lf && slotConfig.slots[0].tag_lf == TAG_TYPE_EM410X) {
        // Initialize a low -frequency EM410X card in slot 1, if it does not exist.
        get_fds_map_by_slot_sense_type_for_dump(0, TAG_SENSE_LF, &map_info);
        if (!fds_is_exists(map_info.id, map_info.key)) {
            tag_emulation_factory_data(0, slotConfig.slots[0].tag_lf);
        }
    }

    if (slotConfig.slots[1].enabled_hf && slotConfig.slots[1].tag_hf == TAG_TYPE_MF0ICU1) {
        // Initialize a high -frequency M1 card in the card slot 2, if it does not exist.
        get_fds_map_by_slot_sense_type_for_dump(1, TAG_SENSE_HF, &map_info);
        if (!fds_is_exists(map_info.id, map_info.key)) {
            tag_emulation_factory_data(1, slotConfig.slots[1].tag_hf);
        }
    }

    if (slotConfig.slots[2].enabled_lf && slotConfig.slots[2].tag_lf == TAG_TYPE_EM410X) {
        // Initialize a low -frequency EM410X card in slot 3, if it does not exist.
        get_fds_map_by_slot_sense_type_for_dump(2, TAG_SENSE_LF, &map_info);
        if (!fds_is_exists(map_info.id, map_info.key)) {
            tag_emulation_factory_data(2, slotConfig.slots[2].tag_lf);
        }
    }
}
