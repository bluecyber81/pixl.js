/**
 * Copyright (c) 2016 - 2021, Nordic Semiconductor ASA
 *
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form, except as embedded into a Nordic
 *    Semiconductor ASA integrated circuit in a product or a software update for
 *    such product, must reproduce the above copyright notice, this list of
 *    conditions and the following disclaimer in the documentation and/or other
 *    materials provided with the distribution.
 *
 * 3. Neither the name of Nordic Semiconductor ASA nor the names of its
 *    contributors may be used to endorse or promote products derived from this
 *    software without specific prior written permission.
 *
 * 4. This software, with or without modification, must only be used with a
 *    Nordic Semiconductor ASA integrated circuit.
 *
 * 5. Any software provided in binary form under this license must not be reverse
 *    engineered, decompiled, modified and/or disassembled.
 *
 * THIS SOFTWARE IS PROVIDED BY NORDIC SEMICONDUCTOR ASA "AS IS" AND ANY EXPRESS
 * OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
 * OF MERCHANTABILITY, NONINFRINGEMENT, AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL NORDIC SEMICONDUCTOR ASA OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
 * GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
 * LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT
 * OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 */
/* HOST-ONLY scaffolding. Real code is inserted at ACTUAL markers by generator.
 * Hardware backend: bounded FIFO, NOR bitwise programming, explicit completion.
 * This does not model analog flash behavior, radio, NVIC priorities or crypto.
 */
#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static unsigned assertions, scenarios;
#define CHECK(x) do { ++assertions; if (!(x)) { fprintf(stderr,"CHECK %s line=%d\n",#x,__LINE__); exit(71); } } while (0)
#define NRF_ASSERT_PRESENT 0
#define ASSERT(x) do { if (NRF_ASSERT_PRESENT) { CHECK(x); } } while(0)
#define STATIC_ASSERT(x,...) _Static_assert((x),#x)
#define UNUSED_PARAMETER(x) ((void)(x))
#define UNUSED_RETURN_VALUE(x) ((void)(x))
#define NRF_LOG_DEBUG(...)
#define NRF_LOG_ERROR(...)
#define NRF_LOG_INFO(...)
#define NRF_LOG_WARNING(...)
#define NRF_LOG_FINAL_FLUSH()
#define NRF_LOG_MODULE_REGISTER()
#define NRF_LOG_ENABLED 0
#define NRF_DFU_IN_APP 0
#define NRF_BL_DFU_ALLOW_UPDATE_FROM_APP 0
#define NRF_DFU_SETTINGS_COMPATIBILITY_MODE 1
#define NRF_DFU_SAVE_PROGRESS_IN_FLASH 0
#define NRF_DFU_SETTINGS_VERSION 2
#define NRF52_SERIES 1
#define BL_SETTINGS_ACCESS_ONLY 1
#define INIT_COMMAND_MAX_SIZE 512
#define INIT_COMMAND_MAX_SIZE_v1 256
#define CODE_PAGE_SIZE 4096u
#define DATA_OBJECT_MAX_SIZE CODE_PAGE_SIZE
#define BOOTLOADER_SETTINGS_PAGE_SIZE CODE_PAGE_SIZE
#define NRF_MBR_PARAMS_PAGE_SIZE CODE_PAGE_SIZE
#define NRF_DFU_BANK_VALID_APP 1u
#define NRF_BL_RESET_DELAY_MS 0
#define NRF_BL_DFU_INACTIVITY_TIMEOUT_MS 20000
#define NRF_BOOTLOADER_MS_TO_TICKS(ms) ((uint32_t)(((uint64_t)(ms)*32768u)/1000u))
#define ANON_UNIONS_ENABLE
#define ANON_UNIONS_DISABLE
#define __WEAK
#define __INLINE inline
#define CEIL_DIV(a,b) (((a)+(b)-1)/(b))
#define NRF_SUCCESS 0u
#define NRF_ERROR_INTERNAL 3u
#define NRF_ERROR_NO_MEM 4u
#define NRF_ERROR_INVALID_PARAM 7u
#define NRF_ERROR_INVALID_STATE 8u
#define NRF_ERROR_INVALID_LENGTH 9u
#define NRF_ERROR_INVALID_ADDR 16u
#define NRF_ERROR_NULL 14u
#define NRF_ERROR_FORBIDDEN 15u
#define NRF_ERROR_TIMEOUT 13u
#ifndef EXPECT_ADMISSION_CRC_FIX
#define EXPECT_ADMISSION_CRC_FIX 0
#endif
#ifndef EXPECT_LENGTH_GUARD_FIX
#define EXPECT_LENGTH_GUARD_FIX 0
#endif
typedef uint32_t ret_code_t;
typedef void (*nrf_dfu_flash_callback_t)(void *);
typedef uint32_t nrf_dfu_ext_error_code_t;

#pragma pack(4)
typedef struct
{
    uint32_t                image_size;         /**< Size of the image in the bank. */
    uint32_t                image_crc;          /**< CRC of the image. If set to 0, the CRC is ignored. */
    uint32_t                bank_code;          /**< Identifier code for the bank. */
} nrf_dfu_bank_t;

/**@brief DFU progress.
 *
 * Be aware of the difference between objects and firmware images. A firmware image consists of multiple objects, each of a maximum size @ref DATA_OBJECT_MAX_SIZE.
 *
 * @note The union inside this struct is cleared when CREATE_OBJECT of command type is executed, and when there is a valid post-validation.
 *       In DFU activation (after reset) the @ref dfu_progress_t::update_start_address will be used in case of a SD/SD+BL update.
 */
ANON_UNIONS_ENABLE;
typedef struct
{
    uint32_t command_size;              /**< The size of the current init command stored in the DFU settings. */
    uint32_t command_offset;            /**< The offset of the currently received init command data. The offset will increase as the init command is received. */
    uint32_t command_crc;               /**< The calculated CRC of the init command (calculated after the transfer is completed). */
    uint32_t data_object_size;          /**< The size of the last object created. Note that this size is not the size of the whole firmware image.*/
    union
    {
        struct
        {
            uint32_t firmware_image_crc;        /**< CRC value of the current firmware (continuously calculated as data is received). */
            uint32_t firmware_image_crc_last;   /**< The CRC of the last executed object. */
            uint32_t firmware_image_offset;     /**< The offset of the current firmware image being transferred. Note that this offset is the offset in the entire firmware image and not only the current object. */
            uint32_t firmware_image_offset_last;/**< The offset of the last executed object from the start of the firmware image. */
        };
        struct
        {
            uint32_t update_start_address;      /**< Value indicating the start address of the new firmware (before copy). It's always used, but it's most important for an SD/SD+BL update where the SD changes size or if the DFU process had a power loss when updating a SD with changed size. */
        };
    };
} dfu_progress_t;
ANON_UNIONS_DISABLE;

/** @brief Event types in the bootloader and DFU process. */
typedef enum
{
    NRF_DFU_EVT_DFU_INITIALIZED,        /**< Starting DFU. */
    NRF_DFU_EVT_TRANSPORT_ACTIVATED,    /**< Transport activated (e.g. BLE connected, USB plugged in). */
    NRF_DFU_EVT_TRANSPORT_DEACTIVATED,  /**< Transport deactivated (e.g. BLE disconnected, USB plugged out). */
    NRF_DFU_EVT_DFU_STARTED,            /**< DFU process started. */
    NRF_DFU_EVT_OBJECT_RECEIVED,        /**< A DFU data object has been received. */
    NRF_DFU_EVT_DFU_FAILED,             /**< DFU process has failed, been interrupted, or hung. */
    NRF_DFU_EVT_DFU_COMPLETED,          /**< DFU process completed. */
    NRF_DFU_EVT_DFU_ABORTED,            /**< DFU process aborted. */
} nrf_dfu_evt_type_t;

/**
 * @brief Function for notifying DFU state.
 */
typedef void (*nrf_dfu_observer_t)(nrf_dfu_evt_type_t notification);

#define NRF_DFU_PEER_DATA_LEN 64 /**< The length in bytes of nrf_dfu_peer_data_t expected by tools manipulating the settings page. Do not change without changing the settings page version. */
#define NRF_DFU_ADV_NAME_LEN  28 /**< The length in bytes of nrf_dfu_adv_name_t expected by tools manipulating the settings page. Do not change without changing the settings page version. */

#if defined(NRF_DFU_TRANSPORT_BLE) && NRF_DFU_TRANSPORT_BLE

typedef struct
{
    uint32_t            crc;                                    /**< CRC of the rest of the parameters in this struct. */
    ble_gap_id_key_t    ble_id;                                 /**< BLE GAP identity key of the device that initiated the DFU process. */
    ble_gap_enc_key_t   enc_key;                                /**< Encryption key structure containing encrypted diversifier and LTK for reestablishing the bond. */
    uint8_t             sys_serv_attr[SYSTEM_SERVICE_ATT_SIZE]; /**< System service attributes for restoring of Service Changed Indication setting in DFU mode. */
} nrf_dfu_peer_data_t;

typedef enum
{
    DFU_PEER_DATA_STATE_INVALID             = 0,
    DFU_PEER_DATA_STATE_INITIALIZED         = 1,
    DFU_PEER_DATA_STATE_WRITE_REQUESTED     = 2,
    DFU_PEER_DATA_STATE_WRITE_FINISHED      = 3,
    DFU_PEER_DATA_STATE_WRITE_FAILED        = 4,
} nrf_dfu_peer_data_state_t;

typedef struct
{
    uint32_t    crc;                            /**< CRC of the rest of the parameters in this struct. Calculated by the bootloader. */
    uint8_t     name[20];                       /**< New advertisement name to set. */
    uint32_t    len;                            /**< Length of the advertisement name. */
} nrf_dfu_adv_name_t;

typedef enum
{
    DFU_ADV_NAME_STATE_INVALID              = 0,
    DFU_ADV_NAME_STATE_INITIALIZED          = 1,
    DFU_ADV_NAME_STATE_WRITE_REQUESTED      = 2,
    DFU_ADV_NAME_STATE_WRITE_FINISHED       = 3,
    DFU_ADV_NAME_STATE_WRITE_FAILED         = 4,
} nrf_dfu_set_adv_name_state_t;

#else
typedef struct
{
    uint8_t dummy_data[NRF_DFU_PEER_DATA_LEN];
} nrf_dfu_peer_data_t;

typedef struct
{
    uint8_t dummy_data[NRF_DFU_ADV_NAME_LEN];
} nrf_dfu_adv_name_t;
#endif // NRF_DFU_TRANSPORT_BLE

STATIC_ASSERT(sizeof(nrf_dfu_peer_data_t) == NRF_DFU_PEER_DATA_LEN, "nrf_dfu_peer_data_t has unexpected length. This can cause incompatibility with tools.");
STATIC_ASSERT(sizeof(nrf_dfu_adv_name_t)  == NRF_DFU_ADV_NAME_LEN,  "nrf_dfu_adv_name_t has unexpected length. This can cause incompatibility with tools.");

#define SETTINGS_RESERVED_AREA_SIZE    16 /**< The number of words in the reserved area of the DFU settings. */
#define SETTINGS_BOOT_VALIDATION_SIZE  64 /**< The number of bytes reserved for boot_validation value. */


typedef enum
{
    NO_VALIDATION,
    VALIDATE_CRC,
    VALIDATE_SHA256,
    VALIDATE_ECDSA_P256_SHA256,
} boot_validation_type_t;

typedef struct
{
    boot_validation_type_t type;
    uint8_t                bytes[SETTINGS_BOOT_VALIDATION_SIZE];
} boot_validation_t;

/**@brief DFU settings for application and bank data.
 */
typedef struct
{
    uint32_t            crc;                /**< CRC for the stored DFU settings, not including the CRC itself. If 0xFFFFFFF, the CRC has never been calculated. */
    uint32_t            settings_version;   /**< Version of the current DFU settings struct layout. */
    uint32_t            app_version;        /**< Version of the last stored application. */
    uint32_t            bootloader_version; /**< Version of the last stored bootloader. */

    uint32_t            bank_layout;        /**< Bank layout: single bank or dual bank. This value can change. */
    uint32_t            bank_current;       /**< The bank that is currently used. */

    nrf_dfu_bank_t      bank_0;             /**< Bank 0. */
    nrf_dfu_bank_t      bank_1;             /**< Bank 1. */

    uint32_t            write_offset;       /**< Write offset for the current operation. */
    uint32_t            sd_size;            /**< Size of the SoftDevice. */

    dfu_progress_t      progress;           /**< Current DFU progress. */

    uint32_t            enter_buttonless_dfu;
    uint8_t             init_command[INIT_COMMAND_MAX_SIZE];  /**< Buffer for storing the init command. */

    uint32_t            boot_validation_crc;
    boot_validation_t   boot_validation_softdevice;
    boot_validation_t   boot_validation_app;
    boot_validation_t   boot_validation_bootloader;

    nrf_dfu_peer_data_t peer_data;          /**< Not included in calculated CRC. */
    nrf_dfu_adv_name_t  adv_name;           /**< Not included in calculated CRC. */
} nrf_dfu_settings_t;

#pragma pack()

ANON_UNIONS_ENABLE;

/**
 * @brief DFU object types.
 */
typedef enum
{
    NRF_DFU_OBJ_TYPE_INVALID,                   //!< Invalid object type.
    NRF_DFU_OBJ_TYPE_COMMAND,                   //!< Command object.
    NRF_DFU_OBJ_TYPE_DATA,                      //!< Data object.
} nrf_dfu_obj_type_t;

/**
 * @brief DFU protocol operation.
 */
typedef enum
{
    NRF_DFU_OP_PROTOCOL_VERSION     = 0x00,     //!< Retrieve protocol version.
    NRF_DFU_OP_OBJECT_CREATE        = 0x01,     //!< Create selected object.
    NRF_DFU_OP_RECEIPT_NOTIF_SET    = 0x02,     //!< Set receipt notification.
    NRF_DFU_OP_CRC_GET              = 0x03,     //!< Request CRC of selected object.
    NRF_DFU_OP_OBJECT_EXECUTE       = 0x04,     //!< Execute selected object.
    NRF_DFU_OP_OBJECT_SELECT        = 0x06,     //!< Select object.
    NRF_DFU_OP_MTU_GET              = 0x07,     //!< Retrieve MTU size.
    NRF_DFU_OP_OBJECT_WRITE         = 0x08,     //!< Write selected object.
    NRF_DFU_OP_PING                 = 0x09,     //!< Ping.
    NRF_DFU_OP_HARDWARE_VERSION     = 0x0A,     //!< Retrieve hardware version.
    NRF_DFU_OP_FIRMWARE_VERSION     = 0x0B,     //!< Retrieve firmware version.
    NRF_DFU_OP_ABORT                = 0x0C,     //!< Abort the DFU procedure.
    NRF_DFU_OP_RESPONSE             = 0x60,     //!< Response.
    NRF_DFU_OP_INVALID              = 0xFF,
} nrf_dfu_op_t;

/**
 * @brief DFU operation result code.
 */
typedef enum
{
    NRF_DFU_RES_CODE_INVALID                 = 0x00,    //!< Invalid opcode.
    NRF_DFU_RES_CODE_SUCCESS                 = 0x01,    //!< Operation successful.
    NRF_DFU_RES_CODE_OP_CODE_NOT_SUPPORTED   = 0x02,    //!< Opcode not supported.
    NRF_DFU_RES_CODE_INVALID_PARAMETER       = 0x03,    //!< Missing or invalid parameter value.
    NRF_DFU_RES_CODE_INSUFFICIENT_RESOURCES  = 0x04,    //!< Not enough memory for the data object.
    NRF_DFU_RES_CODE_INVALID_OBJECT          = 0x05,    //!< Data object does not match the firmware and hardware requirements, the signature is wrong, or parsing the command failed.
    NRF_DFU_RES_CODE_UNSUPPORTED_TYPE        = 0x07,    //!< Not a valid object type for a Create request.
    NRF_DFU_RES_CODE_OPERATION_NOT_PERMITTED = 0x08,    //!< The state of the DFU process does not allow this operation.
    NRF_DFU_RES_CODE_OPERATION_FAILED        = 0x0A,    //!< Operation failed.
    NRF_DFU_RES_CODE_EXT_ERROR               = 0x0B,    //!< Extended error. The next byte of the response contains the error code of the extended error (see @ref nrf_dfu_ext_error_code_t.
} nrf_dfu_result_t;

typedef enum
{
    NRF_DFU_FIRMWARE_TYPE_SOFTDEVICE    = 0x00,
    NRF_DFU_FIRMWARE_TYPE_APPLICATION   = 0x01,
    NRF_DFU_FIRMWARE_TYPE_BOOTLOADER    = 0x02,
    NRF_DFU_FIRMWARE_TYPE_UNKNOWN       = 0xFF,
} nrf_dfu_firmware_type_t;

/**
 * @brief @ref NRF_DFU_OP_PROTOCOL_VERSION response details.
 */
typedef struct
{
    uint8_t version;                    //!< Protocol version.
} nrf_dfu_response_protocol_t;

/**
 * @brief @ref NRF_DFU_OP_HARDWARE_VERSION response details.
 */
typedef struct
{
    uint32_t part;                      //!< Hardware part, from FICR register.
    uint32_t variant;                   //!< Hardware variant, from FICR register.
    struct
    {
        uint32_t rom_size;              //!< ROM size, in bytes.
        uint32_t ram_size;              //!< RAM size, in bytes.
        uint32_t rom_page_size;         //!< ROM flash page size, in bytes.
    } memory;
} nrf_dfu_response_hardware_t;

/**
 * @brief @ref NRF_DFU_OP_FIRMWARE_VERSION response details.
 */
typedef struct
{
    nrf_dfu_firmware_type_t type;       //!< Firmware type.
    uint32_t                version;    //!< Firmware version.
    uint32_t                addr;       //!< Firmware address in flash.
    uint32_t                len;        //!< Firmware length in bytes.
} nrf_dfu_response_firmware_t;

/**
 * @brief @ref NRF_DFU_OP_OBJECT_SELECT response details.
 */
typedef struct
{
    uint32_t offset;                    //!< Current offset.
    uint32_t crc;                       //!< Current CRC.
    uint32_t max_size;                  //!< Maximum size of selected object.
} nrf_dfu_response_select_t;

/**
 * @brief @ref NRF_DFU_OP_OBJECT_CREATE response details.
 */
typedef struct
{
    uint32_t offset;                    //!< Current offset
    uint32_t crc;                       //!< Current CRC.
} nrf_dfu_response_create_t;

/**
 * @brief @ref NRF_DFU_OP_OBJECT_WRITE response details.
 */
typedef struct
{
    uint32_t offset;                    //!< Used only when packet receipt notification is used.
    uint32_t crc;                       //!< Used only when packet receipt notification is used.
} nrf_dfu_response_write_t;

/**
 * @brief @ref NRF_DFU_OP_CRC_GET response details.
 */
typedef struct
{
    uint32_t offset;                    //!< Current offset.
    uint32_t crc;                       //!< Current CRC.
} nrf_dfu_response_crc_t;

/**
 * @brief @ref NRF_DFU_OP_PING response details.
 */
typedef struct
{
    uint8_t id;                         //!< The received ID which is echoed back.
} nrf_dfu_response_ping_t;

/**
 * @brief @ref NRF_DFU_OP_MTU_GET response details.
 */
typedef struct
{
    uint16_t size;                      //!< The MTU size as specified by the local transport.
} nrf_dfu_response_mtu_t;

/**
 * @brief DFU response message.
 */
typedef struct
{
    nrf_dfu_op_t     request;                      //!< Requested operation.
    nrf_dfu_result_t result;                       //!< Result of the operation.
    union
    {
        nrf_dfu_response_protocol_t protocol;      //!< Protocol version response.
        nrf_dfu_response_hardware_t hardware;      //!< Hardware version response.
        nrf_dfu_response_firmware_t firmware;      //!< Firmware version response.
        nrf_dfu_response_select_t   select;        //!< Select object response..
        nrf_dfu_response_create_t   create;        //!< Create object response..
        nrf_dfu_response_write_t    write;         //!< Write object response.
        nrf_dfu_response_crc_t      crc;           //!< CRC response.
        nrf_dfu_response_ping_t     ping;          //!< Ping response.
        nrf_dfu_response_mtu_t      mtu;           //!< MTU response.
    };
} nrf_dfu_response_t;

/**
 * @brief @ref NRF_DFU_OP_FIRMWARE_VERSION request details.
 */
typedef struct
{
    uint8_t image_number;  //!< Index of the firmware.
} nrf_dfu_request_firmware_t;

/**
 * @brief @ref NRF_DFU_OP_OBJECT_SELECT request details.
 */
typedef struct
{
    uint32_t object_type;  //!< Object type. See @ref nrf_dfu_obj_type_t.
} nrf_dfu_request_select_t;

/**
 * @brief @ref NRF_DFU_OP_OBJECT_CREATE request details.
 */
typedef struct
{
    uint32_t object_type;  //!< Object type. See @ref nrf_dfu_obj_type_t.
    uint32_t object_size;  //!< Object size in bytes.
} nrf_dfu_request_create_t;

/**
 * @brief @ref NRF_DFU_OP_OBJECT_WRITE request details.
 */
typedef struct
{
    uint8_t  const * p_data; //!< Data.
    uint16_t         len;    //!< Length of data in @ref nrf_dfu_request_write_t::p_data.
} nrf_dfu_request_write_t;

/**
 * @brief @ref NRF_DFU_OP_PING request details.
 */
typedef struct
{
    uint8_t id;             //!< Ping ID that will be returned in response.
} nrf_dfu_request_ping_t;

/**
 * @brief @ref NRF_DFU_OP_MTU_GET request details.
 */
typedef struct
{
    uint16_t size;          //!< Transport MTU size in bytes.
} nrf_dfu_request_mtu_t;

/**
 * @brief @ref NRF_DFU_OP_RECEIPT_NOTIF_SET request details.
 */
typedef struct
{
    uint32_t target;        //!< Target PRN.
} nrf_dfu_request_prn_t;


typedef void (*nrf_dfu_response_callback_t)(nrf_dfu_response_t * p_res, void * p_context);

/**
 *@brief DFU request.
 */
typedef struct
{
    nrf_dfu_op_t   request;     //!< Requested operation.
    void         * p_context;
    struct
    {
        nrf_dfu_response_callback_t response; //!< Callback to call to send the response.
        nrf_dfu_flash_callback_t    write;
    } callback;
    union
    {
        nrf_dfu_request_firmware_t firmware;    //!< Firmware version request.
        nrf_dfu_request_select_t   select;      //!< Select object request.
        nrf_dfu_request_create_t   create;      //!< Create object request.
        nrf_dfu_request_write_t    write;       //!< Write object request.
        nrf_dfu_request_ping_t     ping;        //!< Ping.
        nrf_dfu_request_mtu_t      mtu;         //!< MTU size request.
        nrf_dfu_request_prn_t      prn;         //!< Set receipt notification request.
    };
} nrf_dfu_request_t;




extern uint8_t m_dfu_settings_buffer[CODE_PAGE_SIZE] __attribute__((aligned(4096)));
extern uint8_t m_mbr_params_page[CODE_PAGE_SIZE] __attribute__((aligned(4096)));
#define BOOTLOADER_SETTINGS_ADDRESS ((uintptr_t)m_dfu_settings_buffer)
#define NRF_MBR_PARAMS_PAGE_ADDRESS ((uintptr_t)m_mbr_params_page)
#define BOOTLOADER_SETTINGS_BACKUP_ADDRESS NRF_MBR_PARAMS_PAGE_ADDRESS
static uint8_t application_page[CODE_PAGE_SIZE] __attribute__((aligned(4096)));
static uint8_t transport_data[244] __attribute__((aligned(4)));

/* Portable subset of fstorage interface; scalar field widths match SDK.
 * All tested pointers are low-address non-PIE globals; uint32 casts roundtrip.
 */
typedef struct nrf_fstorage_s nrf_fstorage_t;
typedef struct { uint32_t erase_unit,program_unit; } flash_info_t;
typedef struct {
    ret_code_t (*write)(nrf_fstorage_t const *,uint32_t,void const *,uint32_t,void *);
    ret_code_t (*erase)(nrf_fstorage_t const *,uint32_t,uint32_t,void *);
} nrf_fstorage_api_t;
typedef struct { uint32_t id,result,addr,len; void const *p_src; void *p_param; } nrf_fstorage_evt_t;
struct nrf_fstorage_s {
    uint32_t start_addr,end_addr; flash_info_t const *p_flash_info;
    nrf_fstorage_api_t const *p_api; void (*evt_handler)(nrf_fstorage_evt_t *);
};
#define NRF_FSTORAGE_EVT_WRITE_RESULT 1u
#define NRF_FSTORAGE_EVT_ERASE_RESULT 2u
#define NRF_FSTORAGE_PARAM_CHECK_DISABLED 1
#define NRF_PARAM_CHECK(_module, _cond, _err, _printfn)                                             \
    do                                                                                              \
    {                                                                                               \
        if ((_cond))                                                                                \
        {                                                                                           \
            /* Do nothing. */                                                                       \
        }                                                                                           \
        else if (!(_module ## _PARAM_CHECK_DISABLED))                                               \
        {                                                                                           \
            _printfn("%s check failed in %s() with value 0x%x.", #_cond, __func__, _err);           \
            return (_err);                                                                          \
        }                                                                                           \
        else                                                                                        \
        {                                                                                           \
            ASSERT((_cond));                                                                        \
        }                                                                                           \
    } while (0);
#define NRF_FSTORAGE_PARAM_CHECK(c,e) NRF_PARAM_CHECK(NRF_FSTORAGE,c,e,NRF_LOG_ERROR)
typedef struct { uint32_t kind,dest,len; void const *src; void *context; } operation_t;
static operation_t operations[16];
static unsigned op_start,op_count,op_admission,op_completed,fail_admission,fail_event;
static bool inline_backend,suppress_callbacks,external_flash_busy,in_irq;
static unsigned reset_calls,reset_while_busy,reset_in_irq;
static ret_code_t backend_write(nrf_fstorage_t const*,uint32_t,void const*,uint32_t,void*);
static ret_code_t backend_erase(nrf_fstorage_t const*,uint32_t,uint32_t,void*);
static const flash_info_t flash_info={4096,4};
static const nrf_fstorage_api_t backend_api={backend_write,backend_erase};
static void dfu_fstorage_evt_handler(nrf_fstorage_evt_t *);
static nrf_fstorage_t m_fs={0,UINT32_MAX,&flash_info,&backend_api,dfu_fstorage_evt_handler};
static uint32_t m_flash_operations_pending;
static bool backend_busy(void);
static bool nrf_fstorage_is_busy(void *unused) { (void)unused; return backend_busy(); }

static bool addr_is_within_bounds(nrf_fstorage_t const * p_fs,
                                  uint32_t               addr,
                                  uint32_t               len)
{
    return (   (addr           >= p_fs->start_addr)
            && (addr + len - 1 <= p_fs->end_addr));
}

static bool addr_is_aligned32(uint32_t addr)
{
    return !(addr & 0x03);
}

static bool addr_is_page_aligned(nrf_fstorage_t const * p_fs,
                                 uint32_t               addr)
{
    return (addr & (p_fs->p_flash_info->erase_unit - 1)) == 0;
}

ret_code_t nrf_fstorage_write(nrf_fstorage_t const * p_fs,
                              uint32_t               dest,
                              void           const * p_src,
                              uint32_t               len,
                              void                 * p_context)
{
    NRF_FSTORAGE_PARAM_CHECK(p_fs,        NRF_ERROR_NULL);
    NRF_FSTORAGE_PARAM_CHECK(p_src,       NRF_ERROR_NULL);
    NRF_FSTORAGE_PARAM_CHECK(p_fs->p_api, NRF_ERROR_INVALID_STATE);
    NRF_FSTORAGE_PARAM_CHECK(len,         NRF_ERROR_INVALID_LENGTH);

    /* Length must be a multiple of the program unit. */
    NRF_FSTORAGE_PARAM_CHECK(!(len % p_fs->p_flash_info->program_unit), NRF_ERROR_INVALID_LENGTH);

    /* Source and destination addresses must be word-aligned. */
    NRF_FSTORAGE_PARAM_CHECK(addr_is_aligned32(dest),                NRF_ERROR_INVALID_ADDR);
    NRF_FSTORAGE_PARAM_CHECK(addr_is_aligned32((uint32_t)p_src),     NRF_ERROR_INVALID_ADDR);
    NRF_FSTORAGE_PARAM_CHECK(addr_is_within_bounds(p_fs, dest, len), NRF_ERROR_INVALID_ADDR);

    return (p_fs->p_api)->write(p_fs, dest, p_src, len, p_context);
}

ret_code_t nrf_fstorage_erase(nrf_fstorage_t const * p_fs,
                              uint32_t               page_addr,
                              uint32_t               len,
                              void                 * p_context)
{
    NRF_FSTORAGE_PARAM_CHECK(p_fs,        NRF_ERROR_NULL);
    NRF_FSTORAGE_PARAM_CHECK(p_fs->p_api, NRF_ERROR_INVALID_STATE);
    NRF_FSTORAGE_PARAM_CHECK(len,         NRF_ERROR_INVALID_LENGTH);

    /* Address must be aligned to a page boundary. */
    NRF_FSTORAGE_PARAM_CHECK(addr_is_page_aligned(p_fs, page_addr), NRF_ERROR_INVALID_ADDR);

    NRF_FSTORAGE_PARAM_CHECK(
        addr_is_within_bounds(p_fs, page_addr, (len * p_fs->p_flash_info->erase_unit)),
        NRF_ERROR_INVALID_ADDR
    );

    return (p_fs->p_api)->erase(p_fs, page_addr, len, p_context);
}
void dfu_fstorage_evt_handler(nrf_fstorage_evt_t * p_evt)
{
    if (NRF_LOG_ENABLED && (m_flash_operations_pending > 0))
    {
        m_flash_operations_pending--;
    }

    if (p_evt->result == NRF_SUCCESS)
    {
        NRF_LOG_DEBUG("Flash %s success: addr=%p, pending %d",
                      (p_evt->id == NRF_FSTORAGE_EVT_WRITE_RESULT) ? "write" : "erase",
                      p_evt->addr, m_flash_operations_pending);
    }
    else
    {
        NRF_LOG_DEBUG("Flash %s failed (0x%x): addr=%p, len=0x%x bytes, pending %d",
                      (p_evt->id == NRF_FSTORAGE_EVT_WRITE_RESULT) ? "write" : "erase",
                      p_evt->result, p_evt->addr, p_evt->len, m_flash_operations_pending);
    }

    if (p_evt->p_param)
    {
        //lint -save -e611 (Suspicious cast)
        ((nrf_dfu_flash_callback_t)(p_evt->p_param))((void*)p_evt->p_src);
        //lint -restore
    }
}

ret_code_t nrf_dfu_flash_store(uint32_t                   dest,
                               void               const * p_src,
                               uint32_t                   len,
                               nrf_dfu_flash_callback_t   callback)
{
    ret_code_t rc;

    NRF_LOG_DEBUG("nrf_fstorage_write(addr=%p, src=%p, len=%d bytes), queue usage: %d",
                  dest, p_src, len, m_flash_operations_pending);

    //lint -save -e611 (Suspicious cast)
    rc = nrf_fstorage_write(&m_fs, dest, p_src, len, (void *)callback);
    //lint -restore

    if ((NRF_LOG_ENABLED) && (rc == NRF_SUCCESS))
    {
        m_flash_operations_pending++;
    }
    else
    {
        NRF_LOG_WARNING("nrf_fstorage_write() failed with error 0x%x.", rc);
    }

    return rc;
}

ret_code_t nrf_dfu_flash_erase(uint32_t                 page_addr,
                               uint32_t                 num_pages,
                               nrf_dfu_flash_callback_t callback)
{
    ret_code_t rc;

    NRF_LOG_DEBUG("nrf_fstorage_erase(addr=0x%p, len=%d pages), queue usage: %d",
                  page_addr, num_pages, m_flash_operations_pending);

    //lint -save -e611 (Suspicious cast)
    rc = nrf_fstorage_erase(&m_fs, page_addr, num_pages, (void *)callback);
    //lint -restore

    if ((NRF_LOG_ENABLED) && (rc == NRF_SUCCESS))
    {
        m_flash_operations_pending++;
    }
    else
    {
        NRF_LOG_WARNING("nrf_fstorage_erase() failed with error 0x%x.", rc);
    }

    return rc;
}
uint32_t crc32_compute(uint8_t const * p_data, uint32_t size, uint32_t const * p_crc)
{
    uint32_t crc;

    crc = (p_crc == NULL) ? 0xFFFFFFFF : ~(*p_crc);
    for (uint32_t i = 0; i < size; i++)
    {
        crc = crc ^ p_data[i];
        for (uint32_t j = 8; j > 0; j--)
        {
            crc = (crc >> 1) ^ (0xEDB88320U & ((crc & 1) ? 0xFFFFFFFF : 0));
        }
    }
    return ~crc;
}


#define NRF_ERROR_BUSY 17u
#define NRF_EVT_FLASH_OPERATION_SUCCESS 1u
#define NRF_EVT_FLASH_OPERATION_ERROR 2u
#define NRF_FSTORAGE_SD_MAX_WRITE_SIZE 20u
#define NRF_FSTORAGE_SD_MAX_RETRIES 8u
#define MIN(a,b) ((a)<(b)?(a):(b))
#define MAX(a,b) ((a)>(b)?(a):(b))
typedef uint32_t nrf_atomic_flag_t;
typedef uint32_t nrf_atfifo_item_get_t;
typedef uint32_t nrf_atfifo_item_put_t;
/**@brief   fstorage operation codes. */
typedef enum
{
    NRF_FSTORAGE_OP_WRITE,  //!< Write bytes to flash.
    NRF_FSTORAGE_OP_ERASE   //!< Erase flash pages.
} nrf_fstorage_sd_opcode_t;

ANON_UNIONS_ENABLE;
/**@brief   fstorage operation queue element. */
typedef struct
{
    nrf_fstorage_t           const * p_fs;     //!< The fstorage instance that requested the operation.
    nrf_fstorage_sd_opcode_t         op_code;  //!< Requested operation.
    void                           * p_param;  //!< User-defined parameter passed to the event handler.
    union
    {
        struct
        {
            void     const * p_src;     //!< Data to be written to flash.
            uint32_t         dest;      //!< Destination of the data in flash.
            uint32_t         len;       //!< Length of the data to be written (in bytes).
            uint32_t         offset;    //!< Write offset.
        } write;
        struct
        {
            uint32_t page;              //!< Physical page number.
            uint32_t progress;          //!< Number of pages erased.
            uint32_t pages_to_erase;    //!< Total number of pages to erase.
        } erase;
    };
} nrf_fstorage_sd_op_t;
ANON_UNIONS_DISABLE;

typedef enum
{
    NRF_FSTORAGE_STATE_IDLE,            //!< No operations requested to the SoftDevice.
    NRF_FSTORAGE_STATE_OP_PENDING,      //!< A non-fstorage operation is pending.
    NRF_FSTORAGE_STATE_OP_EXECUTING,    //!< An fstorage operation is executing.
} nrf_fstorage_sd_state_t;

/**@brief   Internal state. */
typedef struct
{
    nrf_atomic_flag_t       initialized;    //!< fstorage is initalized.
    nrf_atomic_flag_t       queue_running;  //!< The queue is running.
                                            /** Prevent API calls from entering queue_process(). */
    nrf_fstorage_sd_state_t state;          //!< Internal fstorage state.
    uint32_t                retries;        //!< Number of times an operation has been retried on timeout.
    bool                    sd_enabled;     //!< The SoftDevice is enabled.
    bool                    paused;         //!< A SoftDevice state change is impending.
                                            /** Do not load a new operation when the last one completes. */
} nrf_fstorage_sd_work_t;



static nrf_fstorage_sd_work_t m_flags;
static nrf_fstorage_sd_op_t *m_p_cur_op;
static nrf_atfifo_item_get_t m_iget_ctx;
static flash_info_t m_flash_info={4096,4};
static nrf_fstorage_sd_op_t m_fifo[16];
static bool hardware_pending;
static uint32_t hardware_dest,hardware_len,hardware_kind;
static void const *hardware_src;
static unsigned hardware_calls,hardware_events,hardware_error_call;
static uint32_t hardware_error_code;
static uint32_t nrf_atomic_flag_set_fetch(nrf_atomic_flag_t *f) {uint32_t old=*f;*f=1;return old;}
static nrf_fstorage_sd_op_t *nrf_atfifo_item_alloc(nrf_fstorage_sd_op_t *f,nrf_atfifo_item_put_t *c) {
    (void)c;++op_admission;if(op_admission==fail_admission||op_count==16)return NULL;return &f[(op_start+op_count)%16];
}
static bool nrf_atfifo_item_put(nrf_fstorage_sd_op_t *f,nrf_atfifo_item_put_t *c) {(void)f;(void)c;++op_count;return true;}
static nrf_fstorage_sd_op_t *nrf_atfifo_item_get(nrf_fstorage_sd_op_t *f,nrf_atfifo_item_get_t *c) {(void)c;return op_count?&f[op_start]:NULL;}
static bool nrf_atfifo_item_free(nrf_fstorage_sd_op_t *f,nrf_atfifo_item_get_t *c) {
    (void)f;(void)c;CHECK(op_count);op_start=(op_start+1)%16;--op_count;++op_completed;return true;
}
static void apply_hardware(void) {
    CHECK(hardware_pending);uint8_t *dst=(uint8_t *)(uintptr_t)hardware_dest;
    if(hardware_kind==NRF_FSTORAGE_EVT_ERASE_RESULT)memset(dst,0xff,CODE_PAGE_SIZE);
    else for(unsigned i=0;i<hardware_len;i++)dst[i]&=((uint8_t const*)hardware_src)[i];
}
static ret_code_t sd_flash_write(uint32_t *dst,uint32_t const *src,uint32_t words) {
    ++hardware_calls;CHECK(words>0&&words<=5&&!hardware_pending);
    /* S112 sd_flash_write documented word-address contract; no memory access on error. */
    if(((uintptr_t)dst&3u)||((uintptr_t)src&3u))return NRF_ERROR_INVALID_ADDR;
    if(hardware_calls==hardware_error_call)return hardware_error_code;
    hardware_dest=(uint32_t)(uintptr_t)dst;hardware_src=src;hardware_len=words*4;
    hardware_kind=NRF_FSTORAGE_EVT_WRITE_RESULT;hardware_pending=true;
    if(!m_flags.sd_enabled){apply_hardware();hardware_pending=false;}return NRF_SUCCESS;
}
static ret_code_t sd_flash_page_erase(uint32_t page) {
    ++hardware_calls;CHECK(!hardware_pending);if(hardware_calls==hardware_error_call)return hardware_error_code;
    hardware_dest=page*CODE_PAGE_SIZE;hardware_src=NULL;hardware_len=CODE_PAGE_SIZE;
    hardware_kind=NRF_FSTORAGE_EVT_ERASE_RESULT;hardware_pending=true;
    if(!m_flags.sd_enabled){apply_hardware();hardware_pending=false;}return NRF_SUCCESS;
}
static ret_code_t nrf_sdh_request_continue(void) {return NRF_SUCCESS;}
void nrf_fstorage_sys_evt_handler(uint32_t,void *);
static void event_send(nrf_fstorage_sd_op_t const * p_op, ret_code_t result)
{
    if (p_op->p_fs->evt_handler == NULL)
    {
        /* Nothing to do. */
        return;
    }

    nrf_fstorage_evt_t evt =
    {
        .result  = result,
        .p_param = p_op->p_param,
    };

    switch (p_op->op_code)
    {
        case NRF_FSTORAGE_OP_WRITE:
            evt.id    = NRF_FSTORAGE_EVT_WRITE_RESULT;
            evt.addr  = p_op->write.dest;
            evt.p_src = p_op->write.p_src;
            evt.len   = p_op->write.len;
            break;

        case NRF_FSTORAGE_OP_ERASE:
            evt.id   = NRF_FSTORAGE_EVT_ERASE_RESULT;
            evt.addr = (p_op->erase.page * m_flash_info.erase_unit);
            evt.len  = p_op->erase.pages_to_erase;
            break;

        default:
            /* Should not happen. */
            break;
    }

    p_op->p_fs->evt_handler(&evt);
}

static uint32_t write_execute(nrf_fstorage_sd_op_t const * p_op)
{
    uint32_t chunk_len;

    chunk_len = MIN(p_op->write.len - p_op->write.offset, NRF_FSTORAGE_SD_MAX_WRITE_SIZE);
    chunk_len = MAX(1, chunk_len / m_flash_info.program_unit);

    /* Cast to p_src to uint32_t to perform arithmetic. */
    uint32_t       * p_dest = (uint32_t*)(p_op->write.dest + p_op->write.offset);
    uint32_t const * p_src  = (uint32_t*)((uint32_t)p_op->write.p_src + p_op->write.offset);

    return sd_flash_write(p_dest, p_src, chunk_len);
}

static uint32_t erase_execute(nrf_fstorage_sd_op_t const * p_op)
{
    return sd_flash_page_erase(p_op->erase.page + p_op->erase.progress);
}

static void queue_free(void)
{
    (void) nrf_atfifo_item_free(m_fifo, &m_iget_ctx);
}

static bool queue_load_next(void)
{
    m_p_cur_op = nrf_atfifo_item_get(m_fifo, &m_iget_ctx);

    return (m_p_cur_op != NULL);
}

static void queue_process(void)
{
    uint32_t rc;

    if (m_flags.state == NRF_FSTORAGE_STATE_IDLE)
    {
        if (!queue_load_next())
        {
            /* No more operations, nothing to do. */
            m_flags.queue_running = false;
            return;
        }
    }

    m_flags.state = NRF_FSTORAGE_STATE_OP_EXECUTING;

    switch (m_p_cur_op->op_code)
    {
        case NRF_FSTORAGE_OP_WRITE:
            rc = write_execute(m_p_cur_op);
            break;

        case NRF_FSTORAGE_OP_ERASE:
            rc = erase_execute(m_p_cur_op);
            break;

         default:
            rc = NRF_ERROR_INTERNAL;
            break;
    }

    switch (rc)
    {
        case NRF_SUCCESS:
        {
            /* The operation was accepted by the SoftDevice.
             * If the SoftDevice is enabled, wait for a system event. Otherwise,
             * the SoftDevice call is synchronous and will not send an event so we simulate it. */
            if (!m_flags.sd_enabled)
            {
                nrf_fstorage_sys_evt_handler(NRF_EVT_FLASH_OPERATION_SUCCESS, NULL);
            }
        } break;

        case NRF_ERROR_BUSY:
        {
            /* The SoftDevice is executing a flash operation that was not requested by fstorage.
             * Stop processing the queue until a system event is received. */
            m_flags.state = NRF_FSTORAGE_STATE_OP_PENDING;
        } break;

        default:
        {
            /* An error has occurred. We cannot proceed further with this operation. */
            event_send(m_p_cur_op, NRF_ERROR_INTERNAL);
            /* Reset the internal state so we can accept other operations. */
            m_flags.state         = NRF_FSTORAGE_STATE_IDLE;
            m_flags.queue_running = false;
            /* Free the current queue element. */
            queue_free();
        } break;
    }
}

static void queue_start(void)
{
    if (   (!nrf_atomic_flag_set_fetch(&m_flags.queue_running))
        && (!m_flags.paused))
    {
        queue_process();
    }
}

static bool on_operation_success(nrf_fstorage_sd_op_t * const p_op)
{
    /* Reset the retry counter on success. */
    m_flags.retries = 0;

    switch (p_op->op_code)
    {
        case NRF_FSTORAGE_OP_WRITE:
        {
            /* Update the offset only if the operation is successful
             * so that it can be retried in case it times out. */
            uint32_t const chunk_len = MIN(p_op->write.len - p_op->write.offset,
                                           NRF_FSTORAGE_SD_MAX_WRITE_SIZE);

            p_op->write.offset += chunk_len;

            if (p_op->write.offset == p_op->write.len)
            {
                return true;
            }
        } break;

        case NRF_FSTORAGE_OP_ERASE:
        {
            p_op->erase.progress++;

            if (p_op->erase.progress == p_op->erase.pages_to_erase)
            {
                return true;
            }
        } break;

        default:
            /* Should not happen. */
            break;
    }

    return false;
}

static bool on_operation_failure(nrf_fstorage_sd_op_t const * p_op)
{
    UNUSED_PARAMETER(p_op);

    m_flags.retries++;

    if (m_flags.retries > NRF_FSTORAGE_SD_MAX_RETRIES)
    {
        /* Maximum amount of retries reached. Give up. */
        m_flags.retries = 0;
        return true;
    }

    return false;
}

static ret_code_t write(nrf_fstorage_t const * p_fs,
                        uint32_t               dest,
                        void           const * p_src,
                        uint32_t               len,
                        void                 * p_param)
{
    nrf_fstorage_sd_op_t  * p_op;
    nrf_atfifo_item_put_t   iput_ctx;

    /* Get a free queue element. */
    p_op = nrf_atfifo_item_alloc(m_fifo, &iput_ctx);

    if (p_op == NULL)
    {
        return NRF_ERROR_NO_MEM;
    }

    /* Initialize the operation. */
    memset(p_op, 0x00, sizeof(nrf_fstorage_sd_op_t));

    p_op->op_code     = NRF_FSTORAGE_OP_WRITE;
    p_op->p_fs        = p_fs;
    p_op->p_param     = p_param;
    p_op->write.dest  = dest;
    p_op->write.p_src = p_src;
    p_op->write.len   = len;

    /* Put the operation on the queue. */
    (void) nrf_atfifo_item_put(m_fifo, &iput_ctx);

    queue_start();

    return NRF_SUCCESS;
}

static ret_code_t erase(nrf_fstorage_t const * p_fs,
                        uint32_t               page_addr,
                        uint32_t               len,
                        void                 * p_param)
{
    nrf_fstorage_sd_op_t  * p_op;
    nrf_atfifo_item_put_t   iput_ctx;

    /* Get a free queue element. */
    p_op = nrf_atfifo_item_alloc(m_fifo, &iput_ctx);

    if (p_op == NULL)
    {
        return NRF_ERROR_NO_MEM;
    }

    /* Initialize the operation. */
    memset(p_op, 0x00, sizeof(nrf_fstorage_sd_op_t));

    p_op->op_code              = NRF_FSTORAGE_OP_ERASE;
    p_op->p_fs                 = p_fs;
    p_op->p_param              = p_param;
    p_op->erase.page           = (page_addr / m_flash_info.erase_unit);
    p_op->erase.pages_to_erase = len;

    /* Put the operation on the queue. */
    (void) nrf_atfifo_item_put(m_fifo, &iput_ctx);

    queue_start();

    return NRF_SUCCESS;
}

static bool is_busy(nrf_fstorage_t const * p_fs)
{
    UNUSED_PARAMETER(p_fs);

    return (m_flags.state != NRF_FSTORAGE_STATE_IDLE);
}

void nrf_fstorage_sys_evt_handler(uint32_t sys_evt, void * p_context)
{
    UNUSED_PARAMETER(p_context);

    if (   (sys_evt != NRF_EVT_FLASH_OPERATION_SUCCESS)
        && (sys_evt != NRF_EVT_FLASH_OPERATION_ERROR))
    {
        /* Ignore any non-flash events. */
        return;
    }

    switch (m_flags.state)
    {
        case NRF_FSTORAGE_STATE_IDLE:
            /* Ignore flash events if no flash operation was requested. */
            return;

        case NRF_FSTORAGE_STATE_OP_PENDING:
            /* The SoftDevice has completed a flash operation that was not requested by fstorage.
             * It should be possible to request an operation now.
             * Process the queue at the end of this function. */
            break;

        case NRF_FSTORAGE_STATE_OP_EXECUTING:
        {
            /* Handle the result of a flash operation initiated by this module. */
            bool operation_finished = false;

            switch (sys_evt)
            {
                case NRF_EVT_FLASH_OPERATION_SUCCESS:
                    operation_finished = on_operation_success(m_p_cur_op);
                    break;

                case NRF_EVT_FLASH_OPERATION_ERROR:
                    operation_finished = on_operation_failure(m_p_cur_op);
                    break;

                default:
                    break;
            }

            if (operation_finished)
            {
                /* The operation has finished. Change state to NRF_FSTORAGE_STATE_IDLE
                 * so that queue_process() will fetch a new operation from the queue. */
                m_flags.state = NRF_FSTORAGE_STATE_IDLE;

                event_send(m_p_cur_op, (sys_evt == NRF_EVT_FLASH_OPERATION_SUCCESS) ?
                                        NRF_SUCCESS : NRF_ERROR_TIMEOUT);

                /* Free the queue element after sending out the event to prevent API calls made
                 * in the event context to queue elements indefinitely, without this function
                 * ever returning in case the SoftDevice calls are synchronous. */
                queue_free();
            }
        } break;
    }

    if (!m_flags.paused)
    {
        queue_process();
    }
    else
    {
        /* A flash operation has completed. Let the SoftDevice change state. */
        (void) nrf_sdh_request_continue();
    }
}
static bool backend_busy(void) {return is_busy(&m_fs);}
static ret_code_t backend_write(nrf_fstorage_t const *f,uint32_t d,void const*s,uint32_t n,void*c) {
    m_flags.sd_enabled=!inline_backend;return write(f,d,s,n,c);
}
static ret_code_t backend_erase(nrf_fstorage_t const*f,uint32_t d,uint32_t n,void*c) {
    m_flags.sd_enabled=!inline_backend;return erase(f,d,n,c);
}
static void hardware_event(bool ok) {
    CHECK(hardware_pending);if(ok)apply_hardware();hardware_pending=false;++hardware_events;
    bool prior=in_irq;in_irq=true;nrf_fstorage_sys_evt_handler(ok?NRF_EVT_FLASH_OPERATION_SUCCESS:NRF_EVT_FLASH_OPERATION_ERROR,NULL);in_irq=prior;
}
static void backend_finish(bool store) {
    (void)store;unsigned before=op_completed;CHECK(op_count);while(op_completed==before)hardware_event(fail_event!=op_completed+1);
}
static void backend_drain(void){while(op_count)backend_finish(true);}

static ret_code_t nrf_dfu_flash_init(bool sd) { (void)sd; return NRF_SUCCESS; }
ret_code_t nrf_dfu_settings_write_and_backup(nrf_dfu_flash_callback_t);

/**
 * Copyright (c) 2016 - 2021, Nordic Semiconductor ASA
 *
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form, except as embedded into a Nordic
 *    Semiconductor ASA integrated circuit in a product or a software update for
 *    such product, must reproduce the above copyright notice, this list of
 *    conditions and the following disclaimer in the documentation and/or other
 *    materials provided with the distribution.
 *
 * 3. Neither the name of Nordic Semiconductor ASA nor the names of its
 *    contributors may be used to endorse or promote products derived from this
 *    software without specific prior written permission.
 *
 * 4. This software, with or without modification, must only be used with a
 *    Nordic Semiconductor ASA integrated circuit.
 *
 * 5. Any software provided in binary form under this license must not be reverse
 *    engineered, decompiled, modified and/or disassembled.
 *
 * THIS SOFTWARE IS PROVIDED BY NORDIC SEMICONDUCTOR ASA "AS IS" AND ANY EXPRESS
 * OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
 * OF MERCHANTABILITY, NONINFRINGEMENT, AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL NORDIC SEMICONDUCTOR ASA OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
 * GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
 * LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT
 * OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 */



#define DFU_SETTINGS_VERSION_OFFSET             (offsetof(nrf_dfu_settings_t, settings_version))                         //<! Offset in the settings struct where the settings version is located.
#define DFU_SETTINGS_INIT_COMMAND_OFFSET        (offsetof(nrf_dfu_settings_t, init_command))                             //<! Offset in the settings struct where the InitCommand is located.
#define DFU_SETTINGS_BOOT_VALIDATION_OFFSET     (offsetof(nrf_dfu_settings_t, boot_validation_crc))                      //<! Offset in the settings struct where the boot validation info is located.
#define DFU_SETTINGS_BOOT_VALIDATION_SIZE       ((3 * sizeof(boot_validation_t)) + 4)
#define DFU_SETTINGS_BOND_DATA_OFFSET_V1        (offsetof(nrf_dfu_settings_t, init_command) + INIT_COMMAND_MAX_SIZE_v1)  //<! Offset in the settings struct where the bond data was located in settings version 1.
#define DFU_SETTINGS_ADV_NAME_OFFSET_V1         (offsetof(nrf_dfu_settings_t, init_command) + INIT_COMMAND_MAX_SIZE_v1 + NRF_DFU_PEER_DATA_LEN)  //<! Offset in the settings struct where the bond data was located in settings version 1.

#define NRF_LOG_MODULE_NAME nrf_dfu_settings
NRF_LOG_MODULE_REGISTER();


/**@brief   This variable reserves a page in flash for bootloader settings
 *          to ensure the linker doesn't place any code or variables at this location.
 */
#if defined (__CC_ARM )

    uint8_t m_dfu_settings_buffer[BOOTLOADER_SETTINGS_PAGE_SIZE]
        __attribute__((at(BOOTLOADER_SETTINGS_ADDRESS)))
        __attribute__((used));

#elif defined ( __GNUC__ ) || defined ( __SES_ARM )

    uint8_t m_dfu_settings_buffer[BOOTLOADER_SETTINGS_PAGE_SIZE]
        __attribute__((section(".bootloader_settings_page")))
        __attribute__((used));

#elif defined ( __ICCARM__ )

    __no_init __root uint8_t m_dfu_settings_buffer[BOOTLOADER_SETTINGS_PAGE_SIZE]
        @ BOOTLOADER_SETTINGS_ADDRESS;

#else

    #error Not a valid compiler/linker for m_dfu_settings placement.

#endif // Compiler specific

#if defined(NRF52_SERIES)

/**@brief   This variable reserves a page in flash for MBR parameters
 *          to ensure the linker doesn't place any code or variables at this location.
 */
#if defined ( __CC_ARM )

    uint8_t m_mbr_params_page[NRF_MBR_PARAMS_PAGE_SIZE]
        __attribute__((at(NRF_MBR_PARAMS_PAGE_ADDRESS)))
        __attribute__((used));

#elif defined ( __GNUC__ ) || defined ( __SES_ARM )

    uint8_t m_mbr_params_page[NRF_MBR_PARAMS_PAGE_SIZE]
        __attribute__((section(".mbr_params_page")))
        __attribute__((used));

#elif defined ( __ICCARM__ )

    __no_init uint8_t m_mbr_params_page[NRF_MBR_PARAMS_PAGE_SIZE]
        @ NRF_MBR_PARAMS_PAGE_ADDRESS;

#else

    #error Not a valid compiler/linker for m_mbr_params_page placement.

#endif // Compiler specific

uint8_t * mp_dfu_settings_backup_buffer = &m_mbr_params_page[0];


#ifndef NRF_DFU_IN_APP
#define NRF_DFU_IN_APP 0
#endif


#define UICR_PARAM_PAGE_ADDR 0x10001018

#if !defined(BL_SETTINGS_ACCESS_ONLY) && !NRF_DFU_IN_APP
/**@brief   This variable has the linker write the MBR parameters page address to the
 *          UICR register. This value will be written in the HEX file and thus to the
 *          UICR when the bootloader is flashed into the chip.
 */
#if defined ( __CC_ARM )

    uint32_t const m_uicr_mbr_params_page_address
        __attribute__((at(UICR_PARAM_PAGE_ADDR))) = NRF_MBR_PARAMS_PAGE_ADDRESS;

#elif defined ( __GNUC__ ) || defined ( __SES_ARM )

    uint32_t const m_uicr_mbr_params_page_address
        __attribute__ ((section(".uicr_mbr_params_page")))
        __attribute__ ((used)) = NRF_MBR_PARAMS_PAGE_ADDRESS;

#elif defined ( __ICCARM__ )

    __root uint32_t const m_uicr_mbr_params_page_address
        @ UICR_PARAM_PAGE_ADDR = NRF_MBR_PARAMS_PAGE_ADDRESS;

#else

    #error Not a valid compiler/linker for m_mbr_params_page placement.

#endif // Compiler specific
#endif // #ifndef BL_SETTINGS_ACCESS_ONLY
#endif // #if defined( NRF52_SERIES )

nrf_dfu_settings_t s_dfu_settings;

static uint32_t settings_crc_get(nrf_dfu_settings_t const * p_settings)
{
    ASSERT(offsetof(nrf_dfu_settings_t, crc) == 0);

    // The crc is calculated from the s_dfu_settings struct, except the crc itself, the init command, bond data, and boot validation.
    return crc32_compute((uint8_t*)(p_settings) + 4, DFU_SETTINGS_INIT_COMMAND_OFFSET - 4, NULL);
}


static bool crc_ok(nrf_dfu_settings_t const * p_settings)
{
    if (p_settings->crc != 0xFFFFFFFF)
    {
        // CRC is set. Content must be valid
        uint32_t crc = settings_crc_get(p_settings);
        if (crc == p_settings->crc)
        {
            return true;
        }
    }
    return false;
}


static uint32_t boot_validation_crc(nrf_dfu_settings_t const * p_settings)
{
    return crc32_compute((const uint8_t *)&p_settings->boot_validation_softdevice,
                          DFU_SETTINGS_BOOT_VALIDATION_SIZE - 4,
                          NULL);
}


static bool boot_validation_crc_ok(nrf_dfu_settings_t const * p_settings)
{
    return (boot_validation_crc(p_settings) == p_settings->boot_validation_crc);
}


static bool settings_crc_ok(void)
{
    nrf_dfu_settings_t const * p_settings = (nrf_dfu_settings_t const *)m_dfu_settings_buffer;
    return crc_ok(p_settings);
}


static bool settings_backup_crc_ok(void)
{
    nrf_dfu_settings_t const * p_settings = (nrf_dfu_settings_t const *)mp_dfu_settings_backup_buffer;
    return crc_ok(p_settings) && ((p_settings->settings_version == 1) || boot_validation_crc_ok(p_settings));
}

#define REGION_COPY_BY_MEMBER(start_member, end_member, p_dst_addr)        \
    memcpy(p_dst_addr                    + offsetof(nrf_dfu_settings_t, start_member), \
           mp_dfu_settings_backup_buffer + offsetof(nrf_dfu_settings_t, start_member), \
           offsetof(nrf_dfu_settings_t, end_member) - offsetof(nrf_dfu_settings_t, start_member))


static void settings_forbidden_parts_copy_from_backup(uint8_t * p_dst_addr)
{
#if NRF_DFU_IN_APP || NRF_BL_DFU_ALLOW_UPDATE_FROM_APP
    REGION_COPY_BY_MEMBER(settings_version, bank_current, p_dst_addr);
    REGION_COPY_BY_MEMBER(bank_0, write_offset, p_dst_addr);
    REGION_COPY_BY_MEMBER(sd_size, progress, p_dst_addr);
    REGION_COPY_BY_MEMBER(boot_validation_crc, peer_data, p_dst_addr);
#else
    REGION_COPY_BY_MEMBER(settings_version, enter_buttonless_dfu, p_dst_addr);
    REGION_COPY_BY_MEMBER(init_command, peer_data, p_dst_addr);
#endif
}

void nrf_dfu_settings_reinit(void)
{
    bool settings_valid        = settings_crc_ok();
    bool settings_backup_valid = settings_backup_crc_ok();

    if (settings_valid)
    {
        NRF_LOG_DEBUG("Using settings page.");
        memcpy(&s_dfu_settings, m_dfu_settings_buffer, sizeof(nrf_dfu_settings_t));
        if (settings_backup_valid)
        {
            NRF_LOG_DEBUG("Copying forbidden parts from backup page.");
            settings_forbidden_parts_copy_from_backup((uint8_t *)&s_dfu_settings);
        }
    }
    else if (settings_backup_valid)
    {
        NRF_LOG_INFO("Restoring settings from backup since the settings page contents are "
                     "invalid (CRC error).");
        memcpy(&s_dfu_settings,
               mp_dfu_settings_backup_buffer,
               sizeof(nrf_dfu_settings_t));
    }
    else
    {
        NRF_LOG_WARNING("Resetting bootloader settings since neither the settings page nor the "
                        "backup are valid (CRC error).");
        memset(&s_dfu_settings, 0x00, sizeof(nrf_dfu_settings_t));
        s_dfu_settings.settings_version = NRF_DFU_SETTINGS_VERSION;
    }

    if (NRF_DFU_SETTINGS_COMPATIBILITY_MODE && !NRF_DFU_IN_APP && (s_dfu_settings.settings_version == 1))
    {
        NRF_LOG_INFO("Old settings page detected. Upgrading info.");

        // Old version. Translate.
        memcpy(&s_dfu_settings.peer_data, (uint8_t *)&s_dfu_settings + DFU_SETTINGS_BOND_DATA_OFFSET_V1, NRF_DFU_PEER_DATA_LEN);
        memcpy(&s_dfu_settings.adv_name,  (uint8_t *)&s_dfu_settings + DFU_SETTINGS_ADV_NAME_OFFSET_V1,  NRF_DFU_ADV_NAME_LEN);

        // Initialize with defaults.
        s_dfu_settings.boot_validation_softdevice.type = NO_VALIDATION;
        s_dfu_settings.boot_validation_app.type        = VALIDATE_CRC;
        s_dfu_settings.boot_validation_bootloader.type = NO_VALIDATION;
        memcpy(s_dfu_settings.boot_validation_app.bytes, &s_dfu_settings.bank_0.image_crc, sizeof(uint32_t));

        s_dfu_settings.settings_version = NRF_DFU_SETTINGS_VERSION;
    }

    return;
}

ret_code_t nrf_dfu_settings_init(bool sd_irq_initialized)
{
    NRF_LOG_DEBUG("Calling nrf_dfu_settings_init()...");

    ret_code_t err_code = nrf_dfu_flash_init(sd_irq_initialized);
    if (err_code != NRF_SUCCESS)
    {
        NRF_LOG_ERROR("nrf_dfu_flash_init() failed with error: %x", err_code);
        return NRF_ERROR_INTERNAL;
    }

    nrf_dfu_settings_reinit();

    err_code = nrf_dfu_settings_write_and_backup(NULL);

    if (err_code != NRF_SUCCESS)
    {
        NRF_LOG_ERROR("nrf_dfu_settings_write_and_backup() failed with error: %x", err_code);
        return NRF_ERROR_INTERNAL;
    }

    return NRF_SUCCESS;
}


static bool settings_forbidden_parts_equal_to_backup(uint8_t * p_compare_addr)
{
    nrf_dfu_settings_t temp_settings;
    memcpy(&temp_settings, p_compare_addr, sizeof(nrf_dfu_settings_t));
    settings_forbidden_parts_copy_from_backup((uint8_t *)&temp_settings);
    return memcmp(&temp_settings, p_compare_addr, sizeof(nrf_dfu_settings_t)) == 0;
}


static ret_code_t settings_write(void                   * p_dst,
                                 void const             * p_src,
                                 nrf_dfu_flash_callback_t callback,
                                 nrf_dfu_settings_t     * p_dfu_settings_buffer)
{
    ret_code_t err_code;

    if (memcmp(p_dst, p_src, sizeof(nrf_dfu_settings_t)) == 0)
    {
        NRF_LOG_DEBUG("Destination settings are identical to source, write not needed. Skipping.");
        if (callback != NULL)
        {
            callback(NULL);
        }
        return NRF_SUCCESS;
    }

    if (NRF_DFU_IN_APP && !settings_forbidden_parts_equal_to_backup((uint8_t *)&s_dfu_settings))
    {
        NRF_LOG_WARNING("Settings write aborted since it tries writing to forbidden settings.");
        return NRF_ERROR_FORBIDDEN;
    }

    NRF_LOG_DEBUG("Writing settings...");
    NRF_LOG_DEBUG("Erasing old settings at: 0x%08x", p_dst);

    // Not setting the callback function because ERASE is required before STORE
    // Only report completion on successful STORE.
    err_code = nrf_dfu_flash_erase((uint32_t)p_dst, 1, NULL);

    if (err_code != NRF_SUCCESS)
    {
        NRF_LOG_ERROR("Could not erase the settings page!");
        return NRF_ERROR_INTERNAL;
    }

    ASSERT(p_dfu_settings_buffer != NULL);
    memcpy(p_dfu_settings_buffer, p_src, sizeof(nrf_dfu_settings_t));

    err_code = nrf_dfu_flash_store((uint32_t)p_dst,
                                   p_dfu_settings_buffer,
                                   sizeof(nrf_dfu_settings_t),
                                   callback);

    if (err_code != NRF_SUCCESS)
    {
        NRF_LOG_ERROR("Could not write the DFU settings page!");
        return NRF_ERROR_INTERNAL;
    }

    return NRF_SUCCESS;
}


ret_code_t nrf_dfu_settings_write(nrf_dfu_flash_callback_t callback)
{
    static nrf_dfu_settings_t dfu_settings_buffer;
    s_dfu_settings.crc = settings_crc_get(&s_dfu_settings);
    s_dfu_settings.boot_validation_crc = boot_validation_crc(&s_dfu_settings);
    return settings_write(m_dfu_settings_buffer,
                          &s_dfu_settings,
                          callback,
                          &dfu_settings_buffer);
}


void settings_backup(nrf_dfu_flash_callback_t callback, void * p_src)
{
#if NRF_DFU_IN_APP
    NRF_LOG_INFO("Settings backup not available from app.");
#else
    static nrf_dfu_settings_t dfu_settings_buffer;
    NRF_LOG_INFO("Backing up settings page to address 0x%x.", mp_dfu_settings_backup_buffer);
    ASSERT(crc_ok(p_src));
    ret_code_t err_code = settings_write(mp_dfu_settings_backup_buffer,
                                         p_src,
                                         callback,
                                         &dfu_settings_buffer);

    if (err_code != NRF_SUCCESS)
    {
        NRF_LOG_ERROR("Could not perform backup of bootloader settings! Error: 0x%x", err_code);
    }
#endif
}


void nrf_dfu_settings_backup(nrf_dfu_flash_callback_t callback)
{
    settings_backup(callback, m_dfu_settings_buffer);
}


ret_code_t nrf_dfu_settings_write_and_backup(nrf_dfu_flash_callback_t callback)
{
#if NRF_DFU_IN_APP
    ret_code_t err_code = nrf_dfu_settings_write(callback);
#else
    ret_code_t err_code = nrf_dfu_settings_write(NULL);
    if (err_code == NRF_SUCCESS)
    {
        settings_backup(callback, &s_dfu_settings);
    }
#endif
    return err_code;
}


__WEAK ret_code_t nrf_dfu_settings_additional_erase(void)
{
    NRF_LOG_WARNING("No additional data erased");
    return NRF_SUCCESS;
}


void nrf_dfu_settings_progress_reset(void)
{
    memset(s_dfu_settings.init_command, 0xFF, INIT_COMMAND_MAX_SIZE); // Remove the last init command
    memset(&s_dfu_settings.progress, 0, sizeof(dfu_progress_t));
    s_dfu_settings.write_offset = 0;
}


/* Actual scheduler with host-size event header and 8-byte aligned buffer.
 * Queue capacity (32) and FIFO/requeue behavior match BL8.
 */
typedef void (*app_sched_event_handler_t)(void *,uint16_t);
#define APP_SCHED_EVENT_HEADER_SIZE 16
#define APP_SCHEDULER_WITH_PROFILER 0
#define APP_SCHEDULER_WITH_PAUSE 0
static unsigned critical_depth;
#define CRITICAL_REGION_ENTER() do { ++critical_depth; } while(0)
#define CRITICAL_REGION_EXIT() do { CHECK(critical_depth); --critical_depth; } while(0)
static bool is_word_aligned(void const *p) { return !((uintptr_t)p&3u); }
/**@brief Structure for holding a scheduled event header. */
typedef struct
{
    app_sched_event_handler_t handler;          /**< Pointer to event handler to receive the event. */
    uint16_t                  event_data_size;  /**< Size of event data. */
} event_header_t;

STATIC_ASSERT(sizeof(event_header_t) <= APP_SCHED_EVENT_HEADER_SIZE);

static event_header_t * m_queue_event_headers;  /**< Array for holding the queue event headers. */
static uint8_t        * m_queue_event_data;     /**< Array for holding the queue event data. */
static volatile uint8_t m_queue_start_index;    /**< Index of queue entry at the start of the queue. */
static volatile uint8_t m_queue_end_index;      /**< Index of queue entry at the end of the queue. */
static uint16_t         m_queue_event_size;     /**< Maximum event size in queue. */
static uint16_t         m_queue_size;           /**< Number of queue entries. */

#if APP_SCHEDULER_WITH_PROFILER
static uint16_t m_max_queue_utilization;    /**< Maximum observed queue utilization. */
#endif

#if APP_SCHEDULER_WITH_PAUSE
static uint32_t m_scheduler_paused_counter = 0; /**< Counter storing the difference between pausing
                                                     and resuming the scheduler. */
#endif

/**@brief Function for incrementing a queue index, and handle wrap-around.
 *
 * @param[in]   index   Old index.
 *
 * @return      New (incremented) index.
 */
static __INLINE uint8_t next_index(uint8_t index)
{
    return (index < m_queue_size) ? (index + 1) : 0;
}


static __INLINE uint8_t app_sched_queue_full()
{
  uint8_t tmp = m_queue_start_index;
  return next_index(m_queue_end_index) == tmp;
}

/**@brief Macro for checking if a queue is full. */
#define APP_SCHED_QUEUE_FULL() app_sched_queue_full()


static __INLINE uint8_t app_sched_queue_empty()
{
  uint8_t tmp = m_queue_start_index;
  return m_queue_end_index == tmp;
}

/**@brief Macro for checking if a queue is empty. */
#define APP_SCHED_QUEUE_EMPTY() app_sched_queue_empty()


uint32_t app_sched_init(uint16_t event_size, uint16_t queue_size, void * p_event_buffer)
{
    uint16_t data_start_index = (queue_size + 1) * sizeof(event_header_t);

    // Check that buffer is correctly aligned
    if (!is_word_aligned(p_event_buffer))
    {
        return NRF_ERROR_INVALID_PARAM;
    }

    // Initialize event scheduler
    m_queue_event_headers = p_event_buffer;
    m_queue_event_data    = &((uint8_t *)p_event_buffer)[data_start_index];
    m_queue_end_index     = 0;
    m_queue_start_index   = 0;
    m_queue_event_size    = event_size;
    m_queue_size          = queue_size;

#if APP_SCHEDULER_WITH_PROFILER
    m_max_queue_utilization = 0;
#endif

    return NRF_SUCCESS;
}


uint16_t app_sched_queue_space_get()
{
    uint16_t start = m_queue_start_index;
    uint16_t end   = m_queue_end_index;
    uint16_t free_space = m_queue_size - ((end >= start) ?
                           (end - start) : (m_queue_size + 1 - start + end));
    return free_space;
}


#if APP_SCHEDULER_WITH_PROFILER
static void queue_utilization_check(void)
{
    uint16_t start = m_queue_start_index;
    uint16_t end   = m_queue_end_index;
    uint16_t queue_utilization = (end >= start) ? (end - start) :
        (m_queue_size + 1 - start + end);

    if (queue_utilization > m_max_queue_utilization)
    {
        m_max_queue_utilization = queue_utilization;
    }
}

uint16_t app_sched_queue_utilization_get(void)
{
    return m_max_queue_utilization;
}
#endif // APP_SCHEDULER_WITH_PROFILER


uint32_t app_sched_event_put(void const              * p_event_data,
                             uint16_t                  event_data_size,
                             app_sched_event_handler_t handler)
{
    uint32_t err_code;

    if (event_data_size <= m_queue_event_size)
    {
        uint16_t event_index = 0xFFFF;

        CRITICAL_REGION_ENTER();

        if (!APP_SCHED_QUEUE_FULL())
        {
            event_index       = m_queue_end_index;
            m_queue_end_index = next_index(m_queue_end_index);

        #if APP_SCHEDULER_WITH_PROFILER
            // This function call must be protected with critical region because
            // it modifies 'm_max_queue_utilization'.
            queue_utilization_check();
        #endif
        }

        CRITICAL_REGION_EXIT();

        if (event_index != 0xFFFF)
        {
            // NOTE: This can be done outside the critical region since the event consumer will
            //       always be called from the main loop, and will thus never interrupt this code.
            m_queue_event_headers[event_index].handler = handler;
            if ((p_event_data != NULL) && (event_data_size > 0))
            {
                memcpy(&m_queue_event_data[event_index * m_queue_event_size],
                       p_event_data,
                       event_data_size);
                m_queue_event_headers[event_index].event_data_size = event_data_size;
            }
            else
            {
                m_queue_event_headers[event_index].event_data_size = 0;
            }

            err_code = NRF_SUCCESS;
        }
        else
        {
            err_code = NRF_ERROR_NO_MEM;
        }
    }
    else
    {
        err_code = NRF_ERROR_INVALID_LENGTH;
    }

    return err_code;
}


#if APP_SCHEDULER_WITH_PAUSE
void app_sched_pause(void)
{
    CRITICAL_REGION_ENTER();

    if (m_scheduler_paused_counter < UINT32_MAX)
    {
        m_scheduler_paused_counter++;
    }
    CRITICAL_REGION_EXIT();
}

void app_sched_resume(void)
{
    CRITICAL_REGION_ENTER();

    if (m_scheduler_paused_counter > 0)
    {
        m_scheduler_paused_counter--;
    }
    CRITICAL_REGION_EXIT();
}
#endif //APP_SCHEDULER_WITH_PAUSE


/**@brief Function for checking if scheduler is paused which means that should break processing
 *        events.
 *
 * @return    Boolean value - true if scheduler is paused, false otherwise.
 */
static __INLINE bool is_app_sched_paused(void)
{
#if APP_SCHEDULER_WITH_PAUSE
    return (m_scheduler_paused_counter > 0);
#else
    return false;
#endif
}


void app_sched_execute(void)
{
    while (!is_app_sched_paused() && !APP_SCHED_QUEUE_EMPTY())
    {
        // Since this function is only called from the main loop, there is no
        // need for a critical region here, however a special care must be taken
        // regarding update of the queue start index (see the end of the loop).
        uint16_t event_index = m_queue_start_index;

        void * p_event_data;
        uint16_t event_data_size;
        app_sched_event_handler_t event_handler;

        p_event_data = &m_queue_event_data[event_index * m_queue_event_size];
        event_data_size = m_queue_event_headers[event_index].event_data_size;
        event_handler   = m_queue_event_headers[event_index].handler;

        event_handler(p_event_data, event_data_size);

        // Event processed, now it is safe to move the queue start index,
        // so the queue entry occupied by this event can be used to store
        // a next one.
        m_queue_start_index = next_index(m_queue_start_index);
    }
}


static uint8_t sched_buffer[33*(APP_SCHED_EVENT_HEADER_SIZE+sizeof(nrf_dfu_request_t))] __attribute__((aligned(8)));
static uint32_t m_firmware_start_addr,m_firmware_size_req;
static nrf_dfu_observer_t m_observer,m_user_observer;
static volatile bool g_dfu_finalizing,g_dfu_final_success;
static nrf_dfu_response_callback_t m_final_response;
static void *m_final_context;
static nrf_dfu_result_t m_final_result;
static volatile bool m_flash_write_done,m_final_reset_ready,m_final_reset_expired;
static bool init_command_valid,ble_pending,reentrant_response;
static nrf_dfu_result_t validation_result;
static unsigned validation_calls,response_calls,free_calls,observer_counts[8];
static nrf_dfu_response_t last_response;
static void *last_context;
static void (*timer_callback)(void);
static uint32_t timer_ticks;
static unsigned timer_restarts;
static void nrf_bootloader_dfu_inactivity_timer_restart(uint32_t ticks,void (*fn)(void)) {
    timer_ticks=ticks; timer_callback=fn; ++timer_restarts;
}
static void nrf_delay_ms(unsigned ms) { CHECK(ms==0); }
static void NVIC_SystemReset(void) {
    ++reset_calls; if(nrf_fstorage_is_busy(NULL))++reset_while_busy; if(in_irq)++reset_in_irq;
}
static bool nrf_dfu_ble_response_pending(void) { return ble_pending; }
void nrf_dfu_completion_start(void);
void nrf_dfu_completion_process(bool);
static void dfu_observer(nrf_dfu_evt_type_t);
static void observed(nrf_dfu_evt_type_t event) { CHECK(event<8); ++observer_counts[event]; dfu_observer(event); }
static nrf_dfu_result_t ext_error_set(nrf_dfu_ext_error_code_t error) { (void)error; return NRF_DFU_RES_CODE_EXT_ERROR; }
static bool nrf_dfu_validation_init_cmd_present(void) { return init_command_valid; }
static nrf_dfu_result_t nrf_dfu_validation_activation_prepare(uint32_t start,uint32_t size) {
    CHECK(start==m_firmware_start_addr && size==m_firmware_size_req); ++validation_calls;
    if (validation_result==NRF_DFU_RES_CODE_SUCCESS) {
        s_dfu_settings.app_version=631; s_dfu_settings.bank_0.image_size=size;
        s_dfu_settings.bank_0.image_crc=0xabcdef02; s_dfu_settings.bank_0.bank_code=NRF_DFU_BANK_VALID_APP;
        nrf_dfu_settings_progress_reset();
    }
    return validation_result;
}
static bool discard_final_request(nrf_dfu_request_t * p_req)
{
    if (!g_dfu_finalizing)
    {
        return false;
    }
    if (p_req->request == NRF_DFU_OP_OBJECT_WRITE && p_req->callback.write)
    {
        p_req->callback.write((void *)p_req->write.p_data);
    }
    return true;
}

void nrf_dfu_completion_process(bool timed_out)
{
    if (m_final_response == NULL)
    {
        return;
    }
    /* The caller waits for all fstorage operations, including both settings
     * pages. SDK callbacks carry no error status and backup admission failures
     * are swallowed. Compare the actual flash contents instead of assuming
     * that an accepted write or a callback proves a persistent commit. */
    nrf_dfu_response_t response = {
        .request = NRF_DFU_OP_OBJECT_EXECUTE,
        .result = m_final_result,
    };
    if (response.result == NRF_DFU_RES_CODE_SUCCESS &&
        (timed_out ||
         memcmp((void const *)BOOTLOADER_SETTINGS_ADDRESS,
                &s_dfu_settings, sizeof(s_dfu_settings)) != 0 ||
         memcmp((void const *)BOOTLOADER_SETTINGS_BACKUP_ADDRESS,
                &s_dfu_settings, sizeof(s_dfu_settings)) != 0))
    {
        response.result = NRF_DFU_RES_CODE_OPERATION_FAILED;
    }
    nrf_dfu_response_callback_t callback = m_final_response;
    m_final_response = NULL;
    g_dfu_final_success = response.result == NRF_DFU_RES_CODE_SUCCESS;
    callback(&response, m_final_context);
    /* Terminal processing is complete even on failure. The bootloader drains
     * either response and resets only after flash is idle, with no extra write. */
    m_observer(NRF_DFU_EVT_DFU_COMPLETED);
}

static nrf_dfu_result_t ext_err_code_handle(nrf_dfu_result_t ret_val)
{
    if (ret_val < NRF_DFU_RES_CODE_EXT_ERROR)
    {
        return ret_val;
    }
    else
    {
        nrf_dfu_ext_error_code_t ext_err =
                (nrf_dfu_ext_error_code_t)((uint8_t)ret_val - (uint8_t)NRF_DFU_RES_CODE_EXT_ERROR);
        return ext_error_set(ext_err);
    }
}

static void on_abort_request(nrf_dfu_request_t * p_req, nrf_dfu_response_t * p_res)
{
    UNUSED_PARAMETER(p_req);
    UNUSED_PARAMETER(p_res);
    NRF_LOG_DEBUG("Handle NRF_DFU_OP_ABORT");

    m_observer(NRF_DFU_EVT_DFU_ABORTED);
}

static void on_data_obj_select_request(nrf_dfu_request_t * p_req, nrf_dfu_response_t * p_res)
{
    NRF_LOG_DEBUG("Handle NRF_DFU_OP_OBJECT_SELECT (data)");

    p_res->select.crc    = s_dfu_settings.progress.firmware_image_crc;
    p_res->select.offset = s_dfu_settings.progress.firmware_image_offset;

    p_res->select.max_size = DATA_OBJECT_MAX_SIZE;

    NRF_LOG_DEBUG("crc = 0x%x, offset = 0x%x, max_size = 0x%x",
                  p_res->select.crc,
                  p_res->select.offset,
                  p_res->select.max_size);
}

static void on_data_obj_create_request(nrf_dfu_request_t * p_req, nrf_dfu_response_t * p_res)
{
    NRF_LOG_DEBUG("Handle NRF_DFU_OP_OBJECT_CREATE (data)");

    if (!nrf_dfu_validation_init_cmd_present())
    {
        /* Can't accept data because DFU isn't initialized by init command. */
        NRF_LOG_ERROR("Cannot create data object without valid init command");
        p_res->result = NRF_DFU_RES_CODE_OPERATION_NOT_PERMITTED;
        return;
    }

    if (p_req->create.object_size == 0)
    {
        NRF_LOG_ERROR("Object size cannot be 0.")
        p_res->result = NRF_DFU_RES_CODE_INVALID_PARAMETER;
        return;
    }

    if (  ((p_req->create.object_size & (CODE_PAGE_SIZE - 1)) != 0)
        && (s_dfu_settings.progress.firmware_image_offset_last + p_req->create.object_size != m_firmware_size_req))
    {
        NRF_LOG_ERROR("Object size must be page aligned");
        p_res->result = NRF_DFU_RES_CODE_INVALID_PARAMETER;
        return;
    }

    if (p_req->create.object_size > DATA_OBJECT_MAX_SIZE)
    {
        /* It is impossible to handle the command because the size is too large */
        NRF_LOG_ERROR("Invalid size for object (too large)");
        p_res->result = NRF_DFU_RES_CODE_INSUFFICIENT_RESOURCES;
        return;
    }

    if ((s_dfu_settings.progress.firmware_image_offset_last + p_req->create.object_size) >
        m_firmware_size_req)
    {
        NRF_LOG_ERROR("Creating the object with size 0x%08x would overflow firmware size. "
                      "Offset is 0x%08x and firmware size is 0x%08x.",
                      p_req->create.object_size,
                      s_dfu_settings.progress.firmware_image_offset_last,
                      m_firmware_size_req);

        p_res->result = NRF_DFU_RES_CODE_OPERATION_NOT_PERMITTED;
        return;
    }

    s_dfu_settings.progress.data_object_size      = p_req->create.object_size;
    s_dfu_settings.progress.firmware_image_crc    = s_dfu_settings.progress.firmware_image_crc_last;
    s_dfu_settings.progress.firmware_image_offset = s_dfu_settings.progress.firmware_image_offset_last;
    s_dfu_settings.write_offset                   = s_dfu_settings.progress.firmware_image_offset_last;

    /* Erase the page we're at. */
    if (nrf_dfu_flash_erase((m_firmware_start_addr + s_dfu_settings.progress.firmware_image_offset),
                            CEIL_DIV(p_req->create.object_size, CODE_PAGE_SIZE), NULL) != NRF_SUCCESS)
    {
        NRF_LOG_ERROR("Erase operation failed");
        p_res->result = NRF_DFU_RES_CODE_INVALID_OBJECT;
        return;
    }

    NRF_LOG_DEBUG("Creating object with size: %d. Offset: 0x%08x, CRC: 0x%08x",
                 s_dfu_settings.progress.data_object_size,
                 s_dfu_settings.progress.firmware_image_offset,
                 s_dfu_settings.progress.firmware_image_crc);
}

static void on_data_obj_write_request(nrf_dfu_request_t * p_req, nrf_dfu_response_t * p_res)
{
    NRF_LOG_DEBUG("Handle NRF_DFU_OP_OBJECT_WRITE (data)");

    if (!nrf_dfu_validation_init_cmd_present())
    {
        /* Can't accept data because DFU isn't initialized by init command. */
        p_res->result = NRF_DFU_RES_CODE_OPERATION_NOT_PERMITTED;
        /* This request already owns a transport buffer. No flash callback will
         * release it when validation rejects the write before flash admission. */
        if (p_req->callback.write)
        {
            p_req->callback.write((void *)p_req->write.p_data);
        }
        return;
    }

    uint32_t const data_object_offset = s_dfu_settings.progress.firmware_image_offset -
                                        s_dfu_settings.progress.firmware_image_offset_last;

    if (p_req->write.len == 0 || (p_req->write.len & 3u) != 0 ||
        (p_req->write.len + data_object_offset) > s_dfu_settings.progress.data_object_size)
    {
        /* Reject empty or incomplete flash words and writes beyond this object. */
        NRF_LOG_ERROR("Invalid data write length");
        p_res->result = NRF_DFU_RES_CODE_INVALID_PARAMETER;
        if (p_req->callback.write)
        {
            p_req->callback.write((void *)p_req->write.p_data);
        }
        return;
    }

    uint32_t const write_addr = m_firmware_start_addr + s_dfu_settings.write_offset;
    /* CRC must be calculated before handing off the data to fstorage because the data is
     * freed on write completion.
     */
    uint32_t const next_crc =
        crc32_compute(p_req->write.p_data, p_req->write.len, &s_dfu_settings.progress.firmware_image_crc);

    ASSERT(p_req->callback.write);

    ret_code_t ret =
        nrf_dfu_flash_store(write_addr, p_req->write.p_data, p_req->write.len, p_req->callback.write);

    if (ret != NRF_SUCCESS)
    {
        /* When nrf_dfu_flash_store() fails because there is no space in the queue,
         * stop processing the request so that the peer can detect a CRC error
         * and retransmit this object. Remember to manually free the buffer !
         */
        p_req->callback.write((void*)p_req->write.p_data);
        /* Report the prefix actually accepted by flash admission. The peer
         * can retry this object using the existing CRC-mismatch mechanism. */
        p_res->write.crc    = s_dfu_settings.progress.firmware_image_crc;
        p_res->write.offset = s_dfu_settings.progress.firmware_image_offset;
        return;
    }

    /* Update the CRC of the firmware image. */
    s_dfu_settings.write_offset                   += p_req->write.len;
    s_dfu_settings.progress.firmware_image_offset += p_req->write.len;
    s_dfu_settings.progress.firmware_image_crc     = next_crc;

    /* This is only used when the PRN is triggered and the 'write' message
     * is answered with a CRC message and these field are copied into the response.
     */
    p_res->write.crc    = s_dfu_settings.progress.firmware_image_crc;
    p_res->write.offset = s_dfu_settings.progress.firmware_image_offset;
}

static void on_data_obj_crc_request(nrf_dfu_request_t * p_req, nrf_dfu_response_t * p_res)
{
    NRF_LOG_DEBUG("Handle NRF_DFU_OP_CRC_GET (data)");
    NRF_LOG_DEBUG("Offset:%d, CRC:0x%08x",
                 s_dfu_settings.progress.firmware_image_offset,
                 s_dfu_settings.progress.firmware_image_crc);

    p_res->crc.crc    = s_dfu_settings.progress.firmware_image_crc;
    p_res->crc.offset = s_dfu_settings.progress.firmware_image_offset;
}

static void on_data_obj_execute_request_sched(void * p_evt, uint16_t event_length)
{
    UNUSED_PARAMETER(event_length);

    ret_code_t          ret;
    nrf_dfu_request_t * p_req = (nrf_dfu_request_t *)(p_evt);

    if (discard_final_request(p_req))
    {
        return;
    }

    /* Wait for all buffers to be written in flash. */
    if (nrf_fstorage_is_busy(NULL))
    {
        ret = app_sched_event_put(p_req, sizeof(nrf_dfu_request_t), on_data_obj_execute_request_sched);
        if (ret != NRF_SUCCESS)
        {
            NRF_LOG_ERROR("Failed to schedule object execute: 0x%x.", ret);
            /* Initial admission already succeeded. A failed requeue leaves
             * nobody to complete this Execute, so report failure now instead
             * of silently losing the command until the client's timeout.
             * Keep flash and progress intact: a later Execute can retry. */
            nrf_dfu_response_t response = {
                .request = NRF_DFU_OP_OBJECT_EXECUTE,
                .result = NRF_DFU_RES_CODE_OPERATION_FAILED,
            };
            p_req->callback.response(&response, p_req->p_context);
            m_observer(NRF_DFU_EVT_DFU_FAILED);
        }
        return;
    }

    nrf_dfu_response_t res =
    {
        .request = NRF_DFU_OP_OBJECT_EXECUTE,
    };

    if (s_dfu_settings.progress.firmware_image_offset == m_firmware_size_req)
    {
        NRF_LOG_DEBUG("Whole firmware image received. Postvalidating.");
        /* Protect the settings before validation mutates bank/activation state.
         * Disconnect, timeout and queued requests must not undo that state. */
        g_dfu_finalizing = true;

        #if NRF_DFU_IN_APP
        res.result = nrf_dfu_validation_post_data_execute(m_firmware_start_addr, m_firmware_size_req);
        #else
        res.result = nrf_dfu_validation_activation_prepare(m_firmware_start_addr, m_firmware_size_req);
        #endif

        res.result = ext_err_code_handle(res.result);
        m_final_result = res.result;
        m_final_context = p_req->p_context;
        m_final_response = p_req->callback.response;
        nrf_dfu_completion_start();
        ret = nrf_dfu_settings_write_and_backup(NULL);
        if (ret != NRF_SUCCESS)
        {
            /* A preceding erase may already be queued. Main context waits for
             * idle before sending failure; no reset from a flash callback. */
            if (m_final_result == NRF_DFU_RES_CODE_SUCCESS)
            {
                m_final_result = NRF_DFU_RES_CODE_OPERATION_FAILED;
            }
        }
    }
    else
    {
        res.result = NRF_DFU_RES_CODE_SUCCESS;

        /* Provide response to transport */
        p_req->callback.response(&res, p_req->p_context);

        if (NRF_DFU_SAVE_PROGRESS_IN_FLASH)
        {
            /* Allowing skipping settings backup to save time and flash wear. */
            ret = nrf_dfu_settings_write_and_backup(NULL);
            UNUSED_RETURN_VALUE(ret);
        }
    }

    NRF_LOG_DEBUG("Request handling complete. Result: 0x%x", res.result);
}

static bool on_data_obj_execute_request(nrf_dfu_request_t * p_req, nrf_dfu_response_t * p_res)
{
    NRF_LOG_DEBUG("Handle NRF_DFU_OP_OBJECT_EXECUTE (data)");

    uint32_t const data_object_size = s_dfu_settings.progress.firmware_image_offset -
                                      s_dfu_settings.progress.firmware_image_offset_last;

    if (s_dfu_settings.progress.data_object_size != data_object_size)
    {
        /* The size of the written object was not as expected. */
        NRF_LOG_ERROR("Invalid data. expected: %d, got: %d",
                      s_dfu_settings.progress.data_object_size,
                      data_object_size);

        p_res->result = NRF_DFU_RES_CODE_OPERATION_NOT_PERMITTED;
        return true;
    }

    /* Update the offset and crc values for the last object written. */
    s_dfu_settings.progress.data_object_size           = 0;
    s_dfu_settings.progress.firmware_image_crc_last    = s_dfu_settings.progress.firmware_image_crc;
    s_dfu_settings.progress.firmware_image_offset_last = s_dfu_settings.progress.firmware_image_offset;

    on_data_obj_execute_request_sched(p_req, 0);

    m_observer(NRF_DFU_EVT_OBJECT_RECEIVED);

    return false;
}
static void reset_now(void)
{
    NRF_LOG_FINAL_FLUSH();

    nrf_delay_ms(NRF_BL_RESET_DELAY_MS);

    NVIC_SystemReset();
}

static void final_reset_timeout(void)
{
    /* RTC IRQ: no delay, polling, logging flush or scheduler allocation. */
    m_final_reset_expired = true;
}

void nrf_dfu_completion_start(void)
{
    /* Bound final commit processing without treating callback delivery as proof
     * of persistence. An expired timer never permits resetting busy flash. */
    CRITICAL_REGION_ENTER();
    m_final_reset_expired = false;
    nrf_bootloader_dfu_inactivity_timer_restart(
        NRF_BOOTLOADER_MS_TO_TICKS(20000), final_reset_timeout);
    CRITICAL_REGION_EXIT();
}

static void do_reset(void * p_context)
{
    UNUSED_PARAMETER(p_context);
    if (g_dfu_finalizing)
    {
        if (!m_final_reset_ready)
        {
            /* Do not let a stale RTC compare fire the new timeout callback in
             * the SDK's interval between timer_stop and clearing that event. */
            CRITICAL_REGION_ENTER();
            m_final_reset_expired = false;
            nrf_bootloader_dfu_inactivity_timer_restart(
                NRF_BOOTLOADER_MS_TO_TICKS(2000), final_reset_timeout);
            m_final_reset_ready = true;
            CRITICAL_REGION_EXIT();
        }
        return;
    }
    /* Activation before the scheduler starts and nonterminal resets retain
     * their original reset path. Terminal errors use the same drain as success. */
    reset_now();
}

static void final_reset_process(void)
{
    if (g_dfu_finalizing && !m_final_reset_ready && !nrf_fstorage_is_busy(NULL))
    {
        nrf_dfu_completion_process(m_final_reset_expired);
    }
    if ((m_final_reset_ready || m_final_reset_expired) &&
        !nrf_fstorage_is_busy(NULL) &&
        (m_final_reset_expired || !nrf_dfu_ble_response_pending()))
    {
        /* Both success and failure replies get a bounded drain. The next boot
         * validates persisted settings through the usual path. */
        m_final_reset_ready = false;
        m_final_reset_expired = false;
        reset_now();
    }
}

static void bootloader_reset(bool do_backup)
{
    NRF_LOG_DEBUG("Resetting bootloader.");

    if (do_backup)
    {
        m_flash_write_done = false;
        nrf_dfu_settings_backup(do_reset);
    }
    else
    {
        do_reset(NULL);
    }
}

static void inactivity_timeout(void)
{
    if (g_dfu_finalizing)
    {
        return;
    }
    NRF_LOG_INFO("Inactivity timeout.");
    bootloader_reset(true);
}

static void dfu_observer(nrf_dfu_evt_type_t evt_type)
{
    if (g_dfu_finalizing && evt_type != NRF_DFU_EVT_DFU_COMPLETED)
    {
        return;
    }
    switch (evt_type)
    {
        case NRF_DFU_EVT_DFU_STARTED:
        case NRF_DFU_EVT_OBJECT_RECEIVED:
            nrf_bootloader_dfu_inactivity_timer_restart(
                        NRF_BOOTLOADER_MS_TO_TICKS(NRF_BL_DFU_INACTIVITY_TIMEOUT_MS),
                        inactivity_timeout);
            break;
        case NRF_DFU_EVT_DFU_COMPLETED:
        case NRF_DFU_EVT_DFU_ABORTED:
            /* A terminal Execute has already verified its complete commit.
             * Repeating backup here could introduce a new unreported failure. */
            bootloader_reset(!g_dfu_finalizing);
            break;
        case NRF_DFU_EVT_TRANSPORT_DEACTIVATED:
            // Reset the internal state of the DFU settings to the last stored state.
            nrf_dfu_settings_reinit();
            break;
        default:
            break;
    }

    if (m_user_observer)
    {
        m_user_observer(evt_type);
    }
}

static void received(nrf_dfu_response_t *res,void *context) {
    ++response_calls; last_response=*res; last_context=context;
    if(reentrant_response)nrf_dfu_completion_process(false);
}
static void released(void *ptr) { CHECK(ptr==transport_data); ++free_calls; }
static void stamp(nrf_dfu_settings_t *s) {
    s->crc=settings_crc_get(s);s->boot_validation_crc=boot_validation_crc(s);
}
static void reset_case(void) {
    op_start=op_count=op_admission=op_completed=fail_admission=fail_event=0;
    reset_calls=reset_while_busy=reset_in_irq=response_calls=free_calls=validation_calls=timer_restarts=0;
    inline_backend=suppress_callbacks=external_flash_busy=in_irq=ble_pending=reentrant_response=false;
    critical_depth=0; memset(observer_counts,0,sizeof(observer_counts)); memset(&last_response,0,sizeof(last_response));
    memset(m_dfu_settings_buffer,0xff,CODE_PAGE_SIZE);memset(m_mbr_params_page,0xff,CODE_PAGE_SIZE);
    memset(application_page,0xff,CODE_PAGE_SIZE);memset(transport_data,0x96,sizeof(transport_data));
    memset(&s_dfu_settings,0,sizeof(s_dfu_settings));
    s_dfu_settings.settings_version=2;s_dfu_settings.app_version=630;s_dfu_settings.bootloader_version=11;
    s_dfu_settings.bank_0.bank_code=1;s_dfu_settings.bank_0.image_size=363016;
    s_dfu_settings.bank_0.image_crc=0x12345678;
    s_dfu_settings.boot_validation_app.type=VALIDATE_CRC;
    memcpy(s_dfu_settings.boot_validation_app.bytes,&s_dfu_settings.bank_0.image_crc,4);
    stamp(&s_dfu_settings);
    memcpy(m_dfu_settings_buffer,&s_dfu_settings,sizeof(s_dfu_settings));
    memcpy(m_mbr_params_page,&s_dfu_settings,sizeof(s_dfu_settings));
    CHECK(sizeof(nrf_dfu_settings_t)==896);CHECK((uintptr_t)application_page<=UINT32_MAX);
    CHECK((uintptr_t)m_dfu_settings_buffer<=UINT32_MAX && (uintptr_t)m_mbr_params_page<=UINT32_MAX);
    m_firmware_start_addr=(uint32_t)(uintptr_t)application_page;m_firmware_size_req=100;
    g_dfu_finalizing=g_dfu_final_success=m_final_reset_ready=m_final_reset_expired=false;
    m_final_response=NULL;m_final_context=NULL;m_final_result=NRF_DFU_RES_CODE_INVALID;
    m_observer=observed;m_user_observer=NULL;init_command_valid=true;
    validation_result=NRF_DFU_RES_CODE_SUCCESS;timer_callback=NULL;timer_ticks=0;
    CHECK(app_sched_init(sizeof(nrf_dfu_request_t),32,sched_buffer)==NRF_SUCCESS);
}
static nrf_dfu_request_t request(nrf_dfu_op_t kind) {
    nrf_dfu_request_t req={.request=kind,.p_context=(void *)(uintptr_t)0x12345};
    req.callback.response=received;req.callback.write=released;
    req.write.p_data=transport_data;req.write.len=4;return req;
}
static void start_final(void) {
    s_dfu_settings.progress.firmware_image_offset=m_firmware_size_req;
    nrf_dfu_request_t req=request(NRF_DFU_OP_OBJECT_EXECUTE);
    on_data_obj_execute_request_sched(&req,sizeof(req));
    CHECK(g_dfu_finalizing && validation_calls==1 && !response_calls);
    memset(&req,0xa5,sizeof(req));
}
static void pass(const char *name) { ++scenarios; printf("PASS %s\n",name); }
static void final_case(unsigned admission,unsigned event,bool immediate,bool dropped) {
    reset_case();fail_admission=admission;fail_event=event;inline_backend=immediate;suppress_callbacks=dropped;
    start_final();
    while(op_count) { final_reset_process();CHECK(!response_calls && !reset_calls);backend_finish(true); }
    ble_pending=true;final_reset_process();
    CHECK(response_calls==1 && last_context==(void *)(uintptr_t)0x12345);
    CHECK(last_response.result==((admission||event)?NRF_DFU_RES_CODE_OPERATION_FAILED:NRF_DFU_RES_CODE_SUCCESS));
    CHECK(g_dfu_final_success==(!admission && !event));CHECK(!reset_calls && m_final_reset_ready);
    CHECK(timer_ticks==NRF_BOOTLOADER_MS_TO_TICKS(2000));
    ble_pending=false;final_reset_process();CHECK(reset_calls==1 && !reset_while_busy && !reset_in_irq);
}
static void test_commit_matrix(void) {
    for(unsigned n=0;n<=4;n++) {final_case(n,0,false,false);char label[80];snprintf(label,sizeof(label),"settings_admission_failure_%u",n);pass(label);}
    for(unsigned n=1;n<=4;n++) {final_case(0,n,false,false);char label[80];snprintf(label,sizeof(label),"settings_async_failure_%u",n);pass(label);}
    final_case(0,0,true,false);pass("synchronous_nvmc_completion");
    final_case(0,0,false,true);pass("callbacks_suppressed_commit_still_verified");
    reset_case(); start_final(); ble_pending=true; timer_callback(); final_reset_process();
    CHECK(!response_calls&&!reset_calls&&m_final_reset_expired);backend_drain();final_reset_process();
    CHECK(last_response.result==NRF_DFU_RES_CODE_OPERATION_FAILED && !reset_calls);
    CHECK(!m_final_reset_expired && timer_ticks==NRF_BOOTLOADER_MS_TO_TICKS(2000));
    timer_callback();final_reset_process();CHECK(reset_calls==1&&!reset_while_busy);pass("commit_timeout_busy_guard_then_drain_timeout");
    reset_case();start_final();backend_drain();ble_pending=true;reentrant_response=true;final_reset_process();
    CHECK(response_calls==1 && m_final_response==NULL); final_reset_process();CHECK(response_calls==1);
    nrf_dfu_settings_t before=s_dfu_settings; dfu_observer(NRF_DFU_EVT_TRANSPORT_DEACTIVATED);
    CHECK(!memcmp(&before,&s_dfu_settings,sizeof(before)));CHECK(!reset_calls);
    ble_pending=false;final_reset_process();CHECK(reset_calls==1);pass("lost_ack_disconnect_guard_and_callback_reentry");
    reset_case();validation_result=NRF_DFU_RES_CODE_INVALID_OBJECT;start_final();backend_drain();
    final_reset_process();CHECK(last_response.result==NRF_DFU_RES_CODE_INVALID_OBJECT&&!g_dfu_final_success);pass("validation_failure_remains_failure");
}
static void test_powercuts(void) {
    unsigned old=0,new_state=0,other=0;
    /* Boundaries after each of the four admitted operations, plus initial state. */
    for(unsigned cut=0;cut<=4;cut++) {
        reset_case();start_final();for(unsigned k=0;k<cut;k++)backend_finish(true);
        op_count=0;g_dfu_finalizing=false;nrf_dfu_settings_reinit();
        if(s_dfu_settings.app_version==630)++old;else if(s_dfu_settings.app_version==631)++new_state;else ++other;
        CHECK(s_dfu_settings.settings_version==2 && s_dfu_settings.bootloader_version==11);
        CHECK(s_dfu_settings.app_version==(cut<3?630u:631u));
    }
    CHECK(old==3&&new_state==2&&!other);pass("powercut_five_erase_write_boundaries_actual_reinit");
    unsigned cuts=0;
    for(unsigned op=2;op<=4;op+=2) for(unsigned bytes=0;bytes<=sizeof(nrf_dfu_settings_t);bytes+=4) {
        reset_case();start_final();for(unsigned k=1;k<op;k++)backend_finish(true);
        operation_t pending=operations[op_start];CHECK(pending.kind==NRF_FSTORAGE_EVT_WRITE_RESULT);
        uint8_t *dst=(uint8_t *)(uintptr_t)pending.dest;
        for(unsigned i=0;i<bytes;i++)dst[i]&=((uint8_t const*)pending.src)[i];
        op_count=0;g_dfu_finalizing=false;nrf_dfu_settings_reinit();
        CHECK(s_dfu_settings.app_version==(op==2?630u:631u));
        CHECK(s_dfu_settings.bootloader_version==11 && s_dfu_settings.settings_version==2);++cuts;
    }
    printf("OBSERVATION word_program_cutpoints=%u\n",cuts);pass("powercut_450_program_word_cutpoints_actual_reinit");
    reset_case();memset(m_dfu_settings_buffer,0xff,CODE_PAGE_SIZE);memset(m_mbr_params_page,0xff,CODE_PAGE_SIZE);
    nrf_dfu_settings_reinit();CHECK(s_dfu_settings.settings_version==2 && !s_dfu_settings.bank_0.bank_code);
    pass("both_pages_invalid_enters_default_settings");
}
static void test_writes(void) {
    reset_case();s_dfu_settings.progress.data_object_size=100;
    nrf_dfu_request_t req=request(NRF_DFU_OP_OBJECT_WRITE);
    nrf_dfu_response_t res={.request=NRF_DFU_OP_OBJECT_WRITE,.result=NRF_DFU_RES_CODE_SUCCESS};
    on_data_obj_write_request(&req,&res);CHECK(op_count==1&&!free_calls&&res.write.offset==4);
    uint32_t crc=s_dfu_settings.progress.firmware_image_crc;
    backend_drain();CHECK(free_calls==1 && !memcmp(application_page,transport_data,4));
    pass("write_buffer_lifetime_until_actual_flash_callback");
    req.write.len=4;fail_admission=op_admission+1;
    res=(nrf_dfu_response_t){.request=NRF_DFU_OP_OBJECT_WRITE,.result=NRF_DFU_RES_CODE_SUCCESS};
    on_data_obj_write_request(&req,&res);
    CHECK(free_calls==2 && !op_count && s_dfu_settings.progress.firmware_image_offset==4);
    CHECK(s_dfu_settings.progress.firmware_image_crc==crc);
    CHECK(res.result==NRF_DFU_RES_CODE_SUCCESS);
    CHECK(res.write.offset==(EXPECT_ADMISSION_CRC_FIX?4u:0u) && res.write.crc==(EXPECT_ADMISSION_CRC_FIX?crc:0u));
    printf("OBSERVATION no_mem_write_response_offset=%u crc=%u actual_offset=4\n",res.write.offset,res.write.crc);
    pass("no_mem_write_admission_response_observed");
    req.write.len=4;fail_admission=op_admission+1;
    res=(nrf_dfu_response_t){.request=NRF_DFU_OP_OBJECT_WRITE,.result=NRF_DFU_RES_CODE_SUCCESS};
    on_data_obj_write_request(&req,&res);
    CHECK(free_calls==3 && !op_count && res.result==NRF_DFU_RES_CODE_SUCCESS);
    CHECK(res.write.offset==(EXPECT_ADMISSION_CRC_FIX?4u:0u) && res.write.crc==(EXPECT_ADMISSION_CRC_FIX?crc:0u));
    nrf_dfu_response_t actual_crc={0};on_data_obj_crc_request(&req,&actual_crc);
    CHECK(actual_crc.crc.offset==4 && actual_crc.crc.crc==crc);
    printf("OBSERVATION queue_admission_failure_response_zero_but_explicit_crc_correct\n");
    pass("queue_full_write_admission_response_observed");
    fail_admission=0;res=(nrf_dfu_response_t){.result=NRF_DFU_RES_CODE_SUCCESS};
    on_data_obj_write_request(&req,&res);CHECK(res.write.offset==8);backend_drain();CHECK(free_calls==4);
    pass("write_retry_can_progress_after_rejection");
    reset_case();g_dfu_finalizing=true;req=request(NRF_DFU_OP_OBJECT_WRITE);
    CHECK(discard_final_request(&req)&&free_calls==1&&!op_count);pass("late_write_freed_once_during_terminal_commit");
}
static void test_nonterminal_reset(void) {
    reset_case();s_dfu_settings.progress.data_object_size=100;
    nrf_dfu_request_t req=request(NRF_DFU_OP_OBJECT_WRITE);nrf_dfu_response_t res={.result=NRF_DFU_RES_CODE_SUCCESS};
    on_data_obj_write_request(&req,&res);CHECK(op_count==1);
    on_abort_request(&req,&res);
    CHECK(reset_calls==1 && reset_while_busy==1 && op_count==1 && !g_dfu_finalizing);
    printf("OBSERVATION abort_identical_backup_resets_while_data_flash_busy=1\n");
    pass("nonterminal_abort_existing_busy_reset_path_observed");
    reset_case();external_flash_busy=true;in_irq=true;inactivity_timeout();in_irq=false;
    CHECK(reset_calls==1 && reset_while_busy==1 && reset_in_irq==1);
    pass("nonterminal_timeout_existing_irq_busy_reset_path_observed");
    reset_case();m_mbr_params_page[0]^=1;fail_admission=1;inactivity_timeout();
    CHECK(!reset_calls && !op_count && op_admission==1 && !m_final_reset_ready);
    printf("OBSERVATION backup_admission_failure_swallows_nonterminal_reset_callback\n");
    pass("nonterminal_backup_admission_failure_no_reset_observed");
}
static unsigned scheduled_events;
static void after_busy_event(void *data,uint16_t length) { (void)data;(void)length;++scheduled_events;external_flash_busy=false; }
static void test_scheduler(void) {
    reset_case();external_flash_busy=true;s_dfu_settings.progress.firmware_image_offset=m_firmware_size_req;
    nrf_dfu_request_t req=request(NRF_DFU_OP_OBJECT_EXECUTE);
    CHECK(app_sched_event_put(&req,sizeof(req),on_data_obj_execute_request_sched)==NRF_SUCCESS);
    CHECK(app_sched_event_put(NULL,0,after_busy_event)==NRF_SUCCESS);
    memset(&req,0xa5,sizeof(req));scheduled_events=0;app_sched_execute();
    CHECK(scheduled_events==1&&g_dfu_finalizing&&validation_calls==1&&op_count==4);
    backend_drain();final_reset_process();CHECK(response_calls==1&&last_context==(void *)(uintptr_t)0x12345);
    pass("actual_scheduler_copies_request_busy_requeue_moves_to_tail");
    reset_case();external_flash_busy=true;s_dfu_settings.progress.firmware_image_offset=m_firmware_size_req;
    req=request(NRF_DFU_OP_OBJECT_EXECUTE);CHECK(app_sched_event_put(&req,sizeof(req),on_data_obj_execute_request_sched)==NRF_SUCCESS);
    for(unsigned i=0;i<31;i++)CHECK(app_sched_event_put(NULL,0,after_busy_event)==NRF_SUCCESS);
    CHECK(!app_sched_queue_space_get());app_sched_execute();
    CHECK(response_calls==1 && last_response.result==NRF_DFU_RES_CODE_OPERATION_FAILED && !g_dfu_finalizing);
    pass("actual_scheduler_full_queue_preserves_current_slot_reports_execute_failure");
}
static void sd_reset(void) {
    reset_case();memset(&m_flags,0,sizeof(m_flags));m_flags.sd_enabled=true;
    m_p_cur_op=NULL;hardware_pending=false;hardware_calls=hardware_events=hardware_error_call=hardware_error_code=0;
}
/* Adds BLE ingress and notification encoding to the existing SD flash fixture.
 * Only balloc, the notification sink and event fields are host substitutes. */
#define NRF_DFU_PROTOCOL_REDUCED 1
#define BLE_CONN_HANDLE_INVALID 0xffff
#define MAX_DFU_PKT_LEN 244
#define MAX_RESPONSE_LEN 17
#define RESPONSE_HEADER_LEN 3
#define NRF_DFU_EXT_ERROR_NO_ERROR 0
#define BLE_GATT_STATUS_ATTERR_INVALID_OFFSET 1
#define BLE_GATT_STATUS_ATTERR_INVALID_ATT_VAL_LENGTH 2
#define BLE_GATT_STATUS_SUCCESS 0
typedef struct { uint16_t handle,offset,len; uint8_t data[244]; } ble_gatts_evt_write_t;
typedef struct { struct { struct { struct { ble_gatts_evt_write_t write; } params; } gatts_evt; } evt; } ble_evt_t;
typedef struct { struct {uint16_t value_handle;} dfu_pkt_handles; } ble_dfu_t;
static uint16_t m_conn_handle,m_pkt_notif_target,m_pkt_notif_target_cnt;
static uint32_t m_response_session;
static uint8_t m_response_head,m_response_count;
static uint16_t m_response_inflight;
static bool m_response_failed;
static unsigned m_buffer_pool, ble_dfu_transport, pool_free, alloc_attempts, frames;
static uint32_t wire_crc,wire_offset;
static uint8_t wire_status,wire_code;
static bool pool_used, pool_full;
static uint8_t * nrf_balloc_alloc(unsigned *unused) {
    ++alloc_attempts;
    if (pool_full || pool_used) return NULL;
    pool_used=true;
    return transport_data;
}
static void nrf_balloc_free(unsigned *unused,void *p) {
    CHECK(pool_used && p==transport_data);
    pool_used=false;
    ++pool_free;
}
static uint32_t uint32_decode(const uint8_t *p) {return (uint32_t)p[0]|((uint32_t)p[1]<<8)|((uint32_t)p[2]<<16)|((uint32_t)p[3]<<24);}
static uint32_t uint16_decode(const uint8_t *p) {return p[0]|(p[1]<<8);}
static uint32_t uint32_encode(uint32_t value,uint8_t *p) {for(unsigned i=0;i<4;++i)p[i]=(uint8_t)(value>>(8*i));return 4;}
static unsigned ext_error_get(void) {return 0;}
static uint32_t nrf_dfu_transports_close(void *unused) {CHECK(false);return 0;}
static void nrf_dfu_command_req(nrf_dfu_request_t *r,nrf_dfu_response_t *s) {CHECK(false);}
static void response_send(uint8_t const *packet,uint16_t length,uintptr_t session) {
    CHECK(session==m_response_session && length>=3 && packet[0]==0x60);
    ++frames;
    wire_code=packet[1];wire_status=packet[2];
    if(length==11){wire_offset=uint32_decode(packet+3);wire_crc=uint32_decode(packet+7);}
}
static void on_prn_set_request(nrf_dfu_request_t * p_req, nrf_dfu_response_t * p_res)
{
    UNUSED_PARAMETER(p_req);
    UNUSED_PARAMETER(p_res);
    NRF_LOG_DEBUG("Handle NRF_DFU_OP_RECEIPT_NOTIF_SET");
}

static bool nrf_dfu_data_req(nrf_dfu_request_t * p_req, nrf_dfu_response_t * p_res)
{
    ASSERT(p_req);
    ASSERT(p_res);

    bool response_ready = true;

    switch (p_req->request)
    {
        case NRF_DFU_OP_OBJECT_CREATE:
        {
            on_data_obj_create_request(p_req, p_res);
        } break;

        case NRF_DFU_OP_OBJECT_WRITE:
        {
            on_data_obj_write_request(p_req, p_res);
        } break;

        case NRF_DFU_OP_CRC_GET:
        {
            on_data_obj_crc_request(p_req, p_res);
        } break;

        case NRF_DFU_OP_OBJECT_EXECUTE:
        {
            response_ready = on_data_obj_execute_request(p_req, p_res);
        } break;

        case NRF_DFU_OP_OBJECT_SELECT:
        {
            on_data_obj_select_request(p_req, p_res);
        } break;

        default:
        {
            ASSERT(false);
        } break;
    }

    return response_ready;
}

static bool nrf_dfu_obj_op(nrf_dfu_request_t * p_req, nrf_dfu_response_t * p_res)
{
    /* Keep track of the current object type since write and execute requests don't contain it. */
    static nrf_dfu_obj_type_t current_object = NRF_DFU_OBJ_TYPE_COMMAND;

    if (    (p_req->request == NRF_DFU_OP_OBJECT_SELECT)
        ||  (p_req->request == NRF_DFU_OP_OBJECT_CREATE))
    {
        STATIC_ASSERT(offsetof(nrf_dfu_request_select_t, object_type) ==
                      offsetof(nrf_dfu_request_create_t, object_type),
                      "Wrong object_type offset!");

        current_object = (nrf_dfu_obj_type_t)(p_req->select.object_type);
    }

    bool response_ready = true;

    switch (current_object)
    {
        case NRF_DFU_OBJ_TYPE_COMMAND:
            nrf_dfu_command_req(p_req, p_res);
            break;

        case NRF_DFU_OBJ_TYPE_DATA:
            response_ready = nrf_dfu_data_req(p_req, p_res);
            break;

        default:
            /* The select request had an invalid object type. */
            NRF_LOG_ERROR("Invalid object type in request.");
            current_object = NRF_DFU_OBJ_TYPE_INVALID;
            p_res->result  = NRF_DFU_RES_CODE_INVALID_OBJECT;
            /* Control requests have no packet buffer. A rejected WRITE does,
             * even when an invalid SELECT/CREATE left no usable object type. */
            if (p_req->request == NRF_DFU_OP_OBJECT_WRITE && p_req->callback.write)
            {
                p_req->callback.write((void *)p_req->write.p_data);
            }
            break;
    }

    return response_ready;
}

static void nrf_dfu_req_handler_req_process(nrf_dfu_request_t * p_req)
{
    if (discard_final_request(p_req))
    {
        return;
    }
    ASSERT(p_req->callback.response);

    bool response_ready = true;

    /* The request handlers assume these values to be set. */
    nrf_dfu_response_t response =
    {
        .request = p_req->request,
        .result  = NRF_DFU_RES_CODE_SUCCESS,
    };


    switch (p_req->request)
    {
#if !NRF_DFU_PROTOCOL_REDUCED
        case NRF_DFU_OP_PROTOCOL_VERSION:
        {
            on_protocol_version_request(p_req, &response);
        } break;

        case NRF_DFU_OP_HARDWARE_VERSION:
        {
            on_hw_version_request(p_req, &response);
        } break;

        case NRF_DFU_OP_FIRMWARE_VERSION:
        {
            on_fw_version_request(p_req, &response);
        } break;

        case NRF_DFU_OP_PING:
        {
            on_ping_request(p_req, &response);
        } break;

        case NRF_DFU_OP_MTU_GET:
        {
            on_mtu_get_request(p_req, &response);
        } break;
#endif
        case NRF_DFU_OP_RECEIPT_NOTIF_SET:
        {
            on_prn_set_request(p_req, &response);
        } break;

        case NRF_DFU_OP_ABORT:
        {
            on_abort_request(p_req, &response);
        } break;

        case NRF_DFU_OP_OBJECT_CREATE:
            /* Restart the inactivity timer on CREATE messages. */
            /* Fallthrough. */
        case NRF_DFU_OP_OBJECT_SELECT:
        case NRF_DFU_OP_OBJECT_WRITE:
        case NRF_DFU_OP_OBJECT_EXECUTE:
        case NRF_DFU_OP_CRC_GET:
        {
            response_ready = nrf_dfu_obj_op(p_req, &response);
        } break;

        default:
            NRF_LOG_INFO("Invalid opcode received: 0x%x.", p_req->request);
            response.result = NRF_DFU_RES_CODE_OP_CODE_NOT_SUPPORTED;
            break;
    }

    if (response_ready)
    {
        NRF_LOG_DEBUG("Request handling complete. Result: 0x%x", response.result);

        p_req->callback.response(&response, p_req->p_context);

        if (response.result != NRF_DFU_RES_CODE_SUCCESS)
        {
            m_observer(NRF_DFU_EVT_DFU_FAILED);
        }
    }
}

static void nrf_dfu_req_handler_req(void * p_evt, uint16_t event_length)
{
    nrf_dfu_request_t * p_req = (nrf_dfu_request_t *)(p_evt);
    nrf_dfu_req_handler_req_process(p_req);
}

ret_code_t nrf_dfu_req_handler_on_req(nrf_dfu_request_t * p_req)
{
    ret_code_t ret;

    if (discard_final_request(p_req))
    {
        return NRF_SUCCESS;
    }

    if (p_req->callback.response == NULL)
    {
        return NRF_ERROR_INVALID_PARAM;
    }

    ret = app_sched_event_put(p_req, sizeof(nrf_dfu_request_t), nrf_dfu_req_handler_req);
    if (ret != NRF_SUCCESS)
    {
        NRF_LOG_WARNING("Scheduler ran out of space!");
    }

    return ret;
}

static void response_session_reset(uint16_t conn_handle)
{
    CRITICAL_REGION_ENTER();
    /* Zero is reserved for requests without a live connection. */
    if (++m_response_session == 0) ++m_response_session;
    m_conn_handle = conn_handle;
    m_response_head = 0;
    m_response_count = 0;
    m_response_inflight = 0;
    m_response_failed = false;
    m_pkt_notif_target = 0;
    m_pkt_notif_target_cnt = 0;
    CRITICAL_REGION_EXIT();
}

static void * response_context_get(void)
{
    uintptr_t session = 0;
    CRITICAL_REGION_ENTER();
    if (m_conn_handle != BLE_CONN_HANDLE_INVALID && !m_response_failed && !g_dfu_finalizing)
    {
        session = m_response_session;
    }
    CRITICAL_REGION_EXIT();
    return (void *)session;
}

static uint32_t response_prepare(uint8_t * p_buffer, uint8_t op_code, uint8_t result)
{
    ASSERT(p_buffer);
    p_buffer[0] = NRF_DFU_OP_RESPONSE;
    p_buffer[1] = op_code;
    p_buffer[2] = result;
    return RESPONSE_HEADER_LEN;
}

static uint32_t response_select_obj_add(uint8_t  * p_buffer,
                                        uint32_t   max_size,
                                        uint32_t   fw_offset,
                                        uint32_t   crc)
{
    uint16_t offset = uint32_encode(max_size,  &p_buffer[RESPONSE_HEADER_LEN]);
    offset         += uint32_encode(fw_offset, &p_buffer[RESPONSE_HEADER_LEN + offset]);
    offset         += uint32_encode(crc,       &p_buffer[RESPONSE_HEADER_LEN + offset]);
    return offset;
}

static uint32_t response_crc_add(uint8_t * p_buffer, uint32_t fw_offset, uint32_t crc)
{
    uint16_t offset = uint32_encode(fw_offset, &p_buffer[RESPONSE_HEADER_LEN]);
    offset         += uint32_encode(crc,       &p_buffer[RESPONSE_HEADER_LEN + offset]);
    return offset;
}

static uint32_t response_ext_err_payload_add(uint8_t * p_buffer, uint8_t result, uint32_t buf_offset)
{
    p_buffer[buf_offset] = ext_error_get();
    (void) ext_error_set(NRF_DFU_EXT_ERROR_NO_ERROR);
    return 1;
}

static void ble_dfu_req_handler_callback(nrf_dfu_response_t * p_res, void * p_context)
{
    ASSERT(p_res);
    ASSERT(p_context);

    uintptr_t const session = (uintptr_t)p_context;
    bool send_response = false;
    CRITICAL_REGION_ENTER();
    if (session == m_response_session && m_conn_handle != BLE_CONN_HANDLE_INVALID &&
        !m_response_failed)
    {
        send_response = true;
        if (p_res->request == NRF_DFU_OP_OBJECT_WRITE)
        {
            if (m_pkt_notif_target == 0 || --m_pkt_notif_target_cnt != 0)
            {
                send_response = false;
            }
            else
            {
                m_pkt_notif_target_cnt = m_pkt_notif_target;
            }
        }
    }
    CRITICAL_REGION_EXIT();
    if (!send_response) return;

    uint8_t len = 0;
    uint8_t buffer[MAX_RESPONSE_LEN] = {0};

    if (p_res->request == NRF_DFU_OP_OBJECT_WRITE)
    {
        /* Reply with a CRC message at the negotiated packet interval. */
        p_res->request = NRF_DFU_OP_CRC_GET;
    }

    len += response_prepare(buffer, p_res->request, p_res->result);

    if (p_res->result != NRF_DFU_RES_CODE_SUCCESS)
    {
        NRF_LOG_WARNING("DFU request %d failed with error: 0x%x", p_res->request, p_res->result);

        if (p_res->result == NRF_DFU_RES_CODE_EXT_ERROR)
        {
            len += response_ext_err_payload_add(buffer, p_res->result, len);
        }

        response_send(buffer, len, session);
        return;
    }

    switch (p_res->request)
    {
        case NRF_DFU_OP_OBJECT_CREATE:
        case NRF_DFU_OP_OBJECT_EXECUTE:
            break;

        case NRF_DFU_OP_OBJECT_SELECT:
        {
            len += response_select_obj_add(buffer,
                                           p_res->select.max_size,
                                           p_res->select.offset,
                                           p_res->select.crc);
        } break;

        case NRF_DFU_OP_OBJECT_WRITE:
        {
            len += response_crc_add(buffer, p_res->write.offset, p_res->write.crc);
        } break;

        case NRF_DFU_OP_CRC_GET:
        {
            len += response_crc_add(buffer, p_res->crc.offset, p_res->crc.crc);
        } break;

        default:
        {
            // No action.
        } break;
    }

    response_send(buffer, len, session);
}

static uint16_t ctrl_pt_write_status(ble_gatts_evt_write_t const * p_write)
{
    if (p_write->offset != 0) return BLE_GATT_STATUS_ATTERR_INVALID_OFFSET;
    if (p_write->len == 0) return BLE_GATT_STATUS_ATTERR_INVALID_ATT_VAL_LENGTH;
    uint16_t required = 1;
    switch (p_write->data[0])
    {
        case NRF_DFU_OP_OBJECT_CREATE:     required = 6; break;
        case NRF_DFU_OP_OBJECT_SELECT:     required = 2; break;
        case NRF_DFU_OP_RECEIPT_NOTIF_SET:  required = 3; break;
        default: break;
    }
    return p_write->len < required ? BLE_GATT_STATUS_ATTERR_INVALID_ATT_VAL_LENGTH :
                                    BLE_GATT_STATUS_SUCCESS;
}

static uint32_t on_ctrl_pt_write(ble_dfu_t * p_dfu, ble_gatts_evt_write_t const * p_ble_write_evt)
{
    (void)p_dfu;
    void * p_context = response_context_get();
    if (p_context == NULL) return NRF_ERROR_INVALID_STATE;
    if (ctrl_pt_write_status(p_ble_write_evt) != BLE_GATT_STATUS_SUCCESS)
    {
        return NRF_ERROR_INVALID_PARAM;
    }
    //lint -save -e415 -e416 : Out-of-bounds access on p_ble_write_evt->data
    nrf_dfu_request_t request =
    {
        .request           = (nrf_dfu_op_t)(p_ble_write_evt->data[0]),
        .p_context         = p_context,
        .callback.response = ble_dfu_req_handler_callback,
    };

    switch (request.request)
    {
        case NRF_DFU_OP_OBJECT_SELECT:
        {
            /* Set object type to read info about */
            request.select.object_type = p_ble_write_evt->data[1];
        } break;

        case NRF_DFU_OP_OBJECT_CREATE:
        {
            /* Reset the packet receipt notification on create object */
            CRITICAL_REGION_ENTER();
            m_pkt_notif_target_cnt = m_pkt_notif_target;
            CRITICAL_REGION_EXIT();

            request.create.object_type = p_ble_write_evt->data[1];
            request.create.object_size = uint32_decode(&(p_ble_write_evt->data[2]));

            if (request.create.object_type == NRF_DFU_OBJ_TYPE_COMMAND)
            {
                /* Activity on the current transport. Close all except the current one. */
                (void) nrf_dfu_transports_close(&ble_dfu_transport);
            }
        } break;

        case NRF_DFU_OP_RECEIPT_NOTIF_SET:
        {
            NRF_LOG_DEBUG("Set receipt notif");

            CRITICAL_REGION_ENTER();
            m_pkt_notif_target     = uint16_decode(&(p_ble_write_evt->data[1]));
            m_pkt_notif_target_cnt = m_pkt_notif_target;
            CRITICAL_REGION_EXIT();
        } break;

        default:
            break;
    }
    //lint -restore : Out-of-bounds access

    return nrf_dfu_req_handler_on_req(&request);
}

static void on_flash_write(void * p_buf)
{
    NRF_LOG_DEBUG("Freeing buffer %p", p_buf);
    nrf_balloc_free(&m_buffer_pool, p_buf);
}

static void on_write(ble_dfu_t * p_dfu, ble_evt_t const * p_ble_evt)
{
    void * p_context = response_context_get();
    if (p_context == NULL) return;
    ble_gatts_evt_write_t const * const p_write_evt = &p_ble_evt->evt.gatts_evt.params.write;

    if (p_write_evt->handle != p_dfu->dfu_pkt_handles.value_handle)
    {
        return;
    }

    /* Defensive bounds before allocation/copy. Valid SoftDevice writes already
     * satisfy the characteristic limit; malformed local events must not consume
     * buffer-pool entries or reinterpret nonzero offsets as sequential data. */
    if (p_write_evt->offset != 0 || p_write_evt->len == 0 || p_write_evt->len > MAX_DFU_PKT_LEN)
    {
        return;
    }

    /* Allocate a buffer to receive data. */
    uint8_t * p_balloc_buf = nrf_balloc_alloc(&m_buffer_pool);
    if (p_balloc_buf == NULL)
    {
        /* Operations are retried by the host; do not give up here. */
        NRF_LOG_WARNING("cannot allocate memory buffer!");
        return;
    }

    NRF_LOG_DEBUG("Buffer %p acquired, len %d (%d)",
                  p_balloc_buf, p_write_evt->len, MAX_DFU_PKT_LEN);

    /* Copy payload into buffer. */
    memcpy(p_balloc_buf, p_write_evt->data, p_write_evt->len);

    /* Set up the request. */
    nrf_dfu_request_t request =
    {
        .request      = NRF_DFU_OP_OBJECT_WRITE,
        .p_context    = p_context,
        .callback     =
        {
            .response = ble_dfu_req_handler_callback,
            .write    = on_flash_write,
        }
    };

    /* Set up the request buffer. */
    request.write.p_data   = p_balloc_buf;
    request.write.len      = p_write_evt->len;

    /* Schedule handling of the request. */
    ret_code_t rc = nrf_dfu_req_handler_on_req(&request);
    if (rc != NRF_SUCCESS)
    {
        /* The error is logged in nrf_dfu_req_handler_on_req().
         * Free the buffer.
         */
        (void) nrf_balloc_free(&m_buffer_pool, p_balloc_buf);
    }
}
static ble_dfu_t service={.dfu_pkt_handles.value_handle=12};
static void reset_ble(void) {
    sd_reset();
    pool_used=pool_full=false;
    alloc_attempts=pool_free=frames=wire_crc=wire_offset=wire_status=wire_code=0;
    response_session_reset(7);
}
static void control(unsigned code,unsigned type,unsigned size) {
    ble_gatts_evt_write_t e={.len=6};
    e.data[0]=code;e.data[1]=type;uint32_encode(size,e.data+2);
    CHECK(on_ctrl_pt_write(&service,&e)==NRF_SUCCESS);
}
static void prepare_data(unsigned prn) {
    control(NRF_DFU_OP_RECEIPT_NOTIF_SET,prn,0);
    control(NRF_DFU_OP_OBJECT_CREATE,NRF_DFU_OBJ_TYPE_DATA,100);
    app_sched_execute();backend_drain();
    CHECK(frames==2); frames=0;
}
static void packet(unsigned n) {
    ble_evt_t event={.evt.gatts_evt.params.write={.handle=12,.len=n}};
    memset(event.evt.gatts_evt.params.write.data,0x96,n);
    on_write(&service,&event);
}
static void noop(void *x,uint16_t len) {}
int main(void) {
    reset_ble();prepare_data(1);packet(4);app_sched_execute();
    CHECK(frames==1 && wire_code==3 && wire_status==1 && wire_offset==4 && pool_used && !pool_free);
    uint32_t expected_crc=wire_crc;backend_drain();
    CHECK(pool_free==1 && !pool_used);
    for(unsigned i=0;i<16;++i) CHECK(nrf_dfu_flash_store(m_firmware_start_addr+4+i*4,transport_data,4,NULL)==0);
    packet(4);app_sched_execute();
    CHECK(frames==2 && wire_offset==(EXPECT_ADMISSION_CRC_FIX?4u:0u) && wire_crc==(EXPECT_ADMISSION_CRC_FIX?expected_crc:0u));
    CHECK(pool_free==2 && !pool_used && op_count==16);
    backend_drain();pass("flash_no_mem_prn1_retains_accepted_prefix_and_single_free");

    reset_ble();prepare_data(1);pool_full=true;packet(4);app_sched_execute();
    CHECK(!frames && alloc_attempts==1 && !pool_free && !op_count);
    pass("pool_no_mem_prn1_silent");

    reset_ble();prepare_data(1);
    for(unsigned i=0;i<32;++i) CHECK(app_sched_event_put(NULL,0,noop)==NRF_SUCCESS);
    packet(4);app_sched_execute();CHECK(!frames && alloc_attempts==1 && pool_free==1 && !pool_used && !op_count);
    pass("scheduler_no_mem_packet_prn1_silent_single_free");

    reset_ble();prepare_data(0);packet(4);app_sched_execute();backend_drain();
    CHECK(!frames && pool_free==1);
    control(NRF_DFU_OP_CRC_GET,0,0);app_sched_execute();
    CHECK(frames==1 && wire_offset==4 && wire_status==1);
    pass("prn0_silent_writes_reported_by_explicit_crc_get");

    reset_ble();prepare_data(1);packet(3);app_sched_execute();backend_drain();
    CHECK(frames==1 && wire_code==3 && wire_status==(EXPECT_LENGTH_GUARD_FIX?NRF_DFU_RES_CODE_INVALID_PARAMETER:NRF_DFU_RES_CODE_SUCCESS) && pool_free==1);
    pass("nonword_data_word_guard_maps_to_wire_prn1");

    reset_ble();prepare_data(2);packet(3);app_sched_execute();backend_drain();
    CHECK(!frames && pool_free==1);
    pass("off_interval_nonword_write_has_no_immediate_prn");

    reset_ble();prepare_data(1);pool_full=true;packet(4);CHECK(!frames);
    pool_full=false;packet(4);app_sched_execute();backend_drain();
    CHECK(frames==1 && wire_offset==4 && pool_free==1 && !pool_used);
    pass("new_write_after_pool_pressure_can_advance");

    reset_ble();
    memset(application_page,0x12,sizeof(application_page));
    control(NRF_DFU_OP_OBJECT_CREATE,NRF_DFU_OBJ_TYPE_DATA,100);
    response_session_reset(BLE_CONN_HANDLE_INVALID);dfu_observer(NRF_DFU_EVT_TRANSPORT_DEACTIVATED);
    response_session_reset(7);
    app_sched_execute();CHECK(!frames && op_count==1 && hardware_pending);
    backend_drain();CHECK(application_page[0]==0xff && application_page[4095]==0xff && !frames);
    pass("previous_generation_queued_data_create_erases_after_reconnect_no_reply");

    reset_ble();control(NRF_DFU_OP_ABORT,0,0);
    response_session_reset(BLE_CONN_HANDLE_INVALID);dfu_observer(NRF_DFU_EVT_TRANSPORT_DEACTIVATED);
    response_session_reset(7);
    app_sched_execute();CHECK(reset_calls==1 && !frames);
    pass("previous_generation_queued_abort_resets_after_reconnect_no_reply");
    printf("RESULT cases=%u assertions=%u\n",scenarios,assertions);
    return 0;
}
