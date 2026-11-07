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
#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include "sdk_config.h"
#include "nrf_dfu.h"
#include "nrf_dfu_types.h"
#include "nrf_dfu_req_handler.h"
#include "nrf_dfu_handling_error.h"
#include "nrf_dfu_settings.h"
#include "nrf_dfu_utils.h"
#include "nrf_dfu_flash.h"
#include "nrf_fstorage.h"
#include "nrf_bootloader_info.h"
#include "app_util.h"
#include "pb.h"
#include "pb_common.h"
#include "pb_decode.h"
#include "dfu-cc.pb.h"
#include "crc32.h"
#include "app_scheduler.h"
#include "sdk_macros.h"
#include "nrf_crypto.h"
#include "nrf_assert.h"
#include "nrf_dfu_validation.h"
#include "dfu_completion.h"

#define NRF_LOG_MODULE_NAME nrf_dfu_req_handler
#include "nrf_log.h"
NRF_LOG_MODULE_REGISTER();

#define NRF_DFU_PROTOCOL_VERSION    (0x01)

#ifndef NRF_DFU_PROTOCOL_REDUCED
#define NRF_DFU_PROTOCOL_REDUCED 0
#endif

STATIC_ASSERT(DFU_SIGNED_COMMAND_SIZE <= INIT_COMMAND_MAX_SIZE);

static uint32_t m_firmware_start_addr;          /**< Start address of the current firmware image. */
static uint32_t m_firmware_size_req;            /**< The size of the entire firmware image. Defined by the init command. */
/* Main-context ownership of the object until its queued Execute finishes. */
static bool m_execute_deferred;

static nrf_dfu_observer_t m_observer;
static nrf_dfu_obj_type_t m_current_object = NRF_DFU_OBJ_TYPE_COMMAND;

volatile bool g_dfu_finalizing;
volatile bool g_dfu_final_success;

/* The scheduled request is temporary. Retain only its callback and opaque
 * transport generation; never retain a pointer to the scheduler's request. */
static nrf_dfu_response_callback_t m_final_response;
static void * m_final_context;
static nrf_dfu_result_t m_final_result;

/* Queued writes own a transport buffer even when their operation is discarded.
 * Returning success at admission prevents the transport from freeing it twice. */
static bool discard_final_request(nrf_dfu_request_t * p_req)
{
    /* At dispatch and at every deferred Execute, discard work from an old
     * link. A flash operation already submitted still owns its buffer. */
    if (!g_dfu_finalizing && !g_dfu_reset_pending && nrf_dfu_ble_request_current(p_req))
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


#if !NRF_DFU_PROTOCOL_REDUCED
static void on_protocol_version_request(nrf_dfu_request_t const * p_req, nrf_dfu_response_t * p_res)
{
    UNUSED_PARAMETER(p_req);
    NRF_LOG_DEBUG("Handle NRF_DFU_OP_PROTOCOL_VERSION");

    if (NRF_DFU_PROTOCOL_VERSION_MSG)
    {
        p_res->protocol.version = NRF_DFU_PROTOCOL_VERSION;
    }
    else
    {
        NRF_LOG_DEBUG("NRF_DFU_OP_PROTOCOL_VERSION disabled.");
        p_res->result = NRF_DFU_RES_CODE_OP_CODE_NOT_SUPPORTED;
    }
}


static void on_hw_version_request(nrf_dfu_request_t const * p_req, nrf_dfu_response_t * p_res)
{
    NRF_LOG_DEBUG("Handle NRF_DFU_OP_HARDWARE_VERSION");

    p_res->hardware.part    = NRF_FICR->INFO.PART;
    p_res->hardware.variant = NRF_FICR->INFO.VARIANT;

    /* FICR values are in Kilobytes, we report them in bytes. */
    p_res->hardware.memory.ram_size      = NRF_FICR->INFO.RAM   * 1024;
    p_res->hardware.memory.rom_size      = NRF_FICR->INFO.FLASH * 1024;
    p_res->hardware.memory.rom_page_size = NRF_FICR->CODEPAGESIZE;
}


static void on_fw_version_request(nrf_dfu_request_t const * p_req, nrf_dfu_response_t * p_res)
{
    NRF_LOG_DEBUG("Handle NRF_DFU_OP_FIRMWARE_VERSION");
    NRF_LOG_DEBUG("Firmware image requested: %d", p_req->firmware.image_number);

    if (NRF_DFU_PROTOCOL_FW_VERSION_MSG)
    {
        uint8_t fw_count = 1;

        if (SD_PRESENT)
        {
            fw_count++;
        }

        if (s_dfu_settings.bank_0.bank_code == NRF_DFU_BANK_VALID_APP)
        {
            fw_count++;
        }

        p_res->result = NRF_DFU_RES_CODE_SUCCESS;

        if (p_req->firmware.image_number == 0)
        {
            /* Bootloader is always present and it is always image zero. */
            p_res->firmware.type    = NRF_DFU_FIRMWARE_TYPE_BOOTLOADER;
            p_res->firmware.version = s_dfu_settings.bootloader_version;
            p_res->firmware.addr    = BOOTLOADER_START_ADDR;
            p_res->firmware.len     = BOOTLOADER_SIZE;
        }
        else if ((p_req->firmware.image_number == 1) && SD_PRESENT)
        {
            /* If a SoftDevice is present, it will be firmware image one. */
            p_res->firmware.type    = NRF_DFU_FIRMWARE_TYPE_SOFTDEVICE;
            p_res->firmware.version = SD_VERSION_GET(MBR_SIZE);
            p_res->firmware.addr    = MBR_SIZE;
            p_res->firmware.len     = SD_SIZE_GET(MBR_SIZE);
        }
        else if ((p_req->firmware.image_number < fw_count))
        {
            /* Either there is no SoftDevice and the firmware image requested is one,
             * or there is a SoftDevice and the firmware image requested is two.
             */
            p_res->firmware.type    = NRF_DFU_FIRMWARE_TYPE_APPLICATION;
            p_res->firmware.version = s_dfu_settings.app_version;
            p_res->firmware.addr    = nrf_dfu_app_start_address();
            p_res->firmware.len     = s_dfu_settings.bank_0.image_size;
        }
        else
        {
            NRF_LOG_DEBUG("No such firmware image");
            p_res->firmware.type    = NRF_DFU_FIRMWARE_TYPE_UNKNOWN;
            p_res->firmware.version = 0x00;
            p_res->firmware.addr    = 0x00;
            p_res->firmware.len     = 0x00;
        }
    }
    else
    {
        NRF_LOG_DEBUG("NRF_DFU_OP_FIRMWARE_VERSION disabled.");
        p_res->result        = NRF_DFU_RES_CODE_OP_CODE_NOT_SUPPORTED;
        p_res->firmware.type = NRF_DFU_FIRMWARE_TYPE_UNKNOWN;
    }
}


static void on_ping_request(nrf_dfu_request_t * p_req, nrf_dfu_response_t * p_res)
{
    NRF_LOG_DEBUG("Handle NRF_DFU_OP_PING");
    p_res->ping.id = p_req->ping.id;
}


static void on_mtu_get_request(nrf_dfu_request_t * p_req, nrf_dfu_response_t * p_res)
{
    NRF_LOG_DEBUG("Handle NRF_DFU_OP_MTU_GET");
    p_res->mtu.size = p_req->mtu.size;
}
#endif // !NRF_DFU_PROTOCOL_REDUCED


static void on_prn_set_request(nrf_dfu_request_t * p_req, nrf_dfu_response_t * p_res)
{
    UNUSED_PARAMETER(p_req);
    UNUSED_PARAMETER(p_res);
    NRF_LOG_DEBUG("Handle NRF_DFU_OP_RECEIPT_NOTIF_SET");
}


static void on_abort_request(nrf_dfu_request_t * p_req, nrf_dfu_response_t * p_res)
{
    UNUSED_PARAMETER(p_req);
    UNUSED_PARAMETER(p_res);
    NRF_LOG_DEBUG("Handle NRF_DFU_OP_ABORT");

    m_observer(NRF_DFU_EVT_DFU_ABORTED);
}


/* Set offset and CRC fields in the response for a 'command' message. */
static void cmd_response_offset_and_crc_set(nrf_dfu_response_t * const p_res)
{
    ASSERT(p_res);

    /* Copy the CRC and offset of the init packet. */
    p_res->crc.offset = s_dfu_settings.progress.command_offset;
    p_res->crc.crc    = s_dfu_settings.progress.command_crc;
}


static void on_cmd_obj_select_request(nrf_dfu_request_t const * p_req, nrf_dfu_response_t * p_res)
{
    UNUSED_PARAMETER(p_req);
    NRF_LOG_DEBUG("Handle NRF_DFU_OP_OBJECT_SELECT (command)");

    p_res->select.max_size = INIT_COMMAND_MAX_SIZE;
    cmd_response_offset_and_crc_set(p_res);
}


static void on_cmd_obj_create_request(nrf_dfu_request_t * p_req, nrf_dfu_response_t * p_res)
{
    ASSERT(p_req);
    ASSERT(p_res);

    NRF_LOG_DEBUG("Handle NRF_DFU_OP_OBJECT_CREATE (command)");

    m_observer(NRF_DFU_EVT_DFU_STARTED);

    nrf_dfu_result_t ret_val = nrf_dfu_validation_init_cmd_create(p_req->create.object_size);
    p_res->result = ext_err_code_handle(ret_val);
}


static void on_cmd_obj_write_request(nrf_dfu_request_t * p_req, nrf_dfu_response_t * p_res)
{
    ASSERT(p_req);
    ASSERT(p_req->write.p_data);
    ASSERT(p_req->write.len);
    ASSERT(p_res);

    NRF_LOG_DEBUG("Handle NRF_DFU_OP_OBJECT_WRITE (command)");

    nrf_dfu_result_t ret_val;

    ret_val = nrf_dfu_validation_init_cmd_append(p_req->write.p_data, p_req->write.len);
    p_res->result = ext_err_code_handle(ret_val);

    /* Update response. This is only used when the PRN is triggered and the 'write' message
     * is answered with a CRC message and these field are copied into the response. */
    cmd_response_offset_and_crc_set(p_res);

    /* If a callback to free the request payload buffer was provided, invoke it now. */
    if (p_req->callback.write)
    {
        p_req->callback.write((void*)p_req->write.p_data);
    }
}


static void on_cmd_obj_execute_request(nrf_dfu_request_t const * p_req, nrf_dfu_response_t * p_res)
{
    ASSERT(p_req);
    ASSERT(p_res);

    NRF_LOG_DEBUG("Handle NRF_DFU_OP_OBJECT_EXECUTE (command)");

    nrf_dfu_result_t ret_val;
    ret_val = nrf_dfu_validation_init_cmd_execute(&m_firmware_start_addr, &m_firmware_size_req);
    p_res->result = ext_err_code_handle(ret_val);

    if (p_res->result == NRF_DFU_RES_CODE_SUCCESS)
    {
        if (nrf_dfu_settings_write_and_backup(NULL) == NRF_SUCCESS)
        {
            /* Setting DFU to initialized */
            NRF_LOG_DEBUG("Writing valid init command to flash.");
        }
        else
        {
            p_res->result = NRF_DFU_RES_CODE_OPERATION_FAILED;
        }
    }
}


static void on_cmd_obj_crc_request(nrf_dfu_request_t const * p_req, nrf_dfu_response_t * p_res)
{
    UNUSED_PARAMETER(p_req);
    NRF_LOG_DEBUG("Handle NRF_DFU_OP_CRC_GET (command)");

    cmd_response_offset_and_crc_set(p_res);
}


/** @brief Function handling command requests from the transport layer.
 *
 * @param   p_req[in]       Pointer to the structure holding the DFU request.
 * @param   p_res[out]      Pointer to the structure holding the DFU response.
 *
 * @retval NRF_SUCCESS      If the command request was executed successfully.
 *                          Any other error code indicates that the data request
 *                          could not be handled.
 */
static void nrf_dfu_command_req(nrf_dfu_request_t * p_req, nrf_dfu_response_t * p_res)
{
    ASSERT(p_req);
    ASSERT(p_res);

    switch (p_req->request)
    {
        case NRF_DFU_OP_OBJECT_CREATE:
        {
            on_cmd_obj_create_request(p_req, p_res);
        } break;

        case NRF_DFU_OP_CRC_GET:
        {
            on_cmd_obj_crc_request(p_req, p_res);
        } break;

        case NRF_DFU_OP_OBJECT_WRITE:
        {
            on_cmd_obj_write_request(p_req, p_res);
        } break;

        case NRF_DFU_OP_OBJECT_EXECUTE:
        {
            on_cmd_obj_execute_request(p_req, p_res);
        } break;

        case NRF_DFU_OP_OBJECT_SELECT:
        {
            on_cmd_obj_select_request(p_req, p_res);
        } break;

        default:
        {
            ASSERT(false);
        } break;
    }
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

static bool data_image_ready(void)
{
    return m_firmware_size_req != 0 && nrf_dfu_validation_init_cmd_present();
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

    m_execute_deferred = false;
    if (!data_image_ready())
    {
        nrf_dfu_response_t response = {
            .request = NRF_DFU_OP_OBJECT_EXECUTE,
            .result = NRF_DFU_RES_CODE_OPERATION_NOT_PERMITTED,
        };
        p_req->callback.response(&response, p_req->p_context);
        m_observer(NRF_DFU_EVT_DFU_FAILED);
        return;
    }

    /* Wait for all buffers to be written in flash. */
    if (nrf_fstorage_is_busy(NULL))
    {
        ret = app_sched_event_put(p_req, sizeof(nrf_dfu_request_t), on_data_obj_execute_request_sched);
        m_execute_deferred = (ret == NRF_SUCCESS);
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
        dfu_display_final_phase(false);

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
        /* The settings are persisted even after rejected validation, to keep
         * the invalid bank state durable. Do not label that as a successful
         * image; the terminal response still verifies the commit separately. */
        dfu_display_final_phase(true);
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

    if (!data_image_ready())
    {
        p_res->result = NRF_DFU_RES_CODE_OPERATION_NOT_PERMITTED;
        return true;
    }

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


/**@brief Function for handling requests to manipulate data or command objects.
 *
 * @param[in]  p_req    Request.
 * @param[out] p_res    Response.
 *
 * @return  Whether response is ready to be sent.
 */
static bool nrf_dfu_obj_op(nrf_dfu_request_t * p_req, nrf_dfu_response_t * p_res)
{
    /* Keep the pending request bound to the same init and data object. SELECT
     * and CRC only inspect progress and remain usable while flash drains. */
    if (m_execute_deferred &&
        (p_req->request == NRF_DFU_OP_OBJECT_CREATE ||
         p_req->request == NRF_DFU_OP_OBJECT_WRITE ||
         p_req->request == NRF_DFU_OP_OBJECT_EXECUTE))
    {
        if (p_req->request == NRF_DFU_OP_OBJECT_WRITE && p_req->callback.write)
        {
            p_req->callback.write((void *)p_req->write.p_data);
        }
        p_res->result = NRF_DFU_RES_CODE_OPERATION_NOT_PERMITTED;
        return true;
    }
    if (    (p_req->request == NRF_DFU_OP_OBJECT_SELECT)
        ||  (p_req->request == NRF_DFU_OP_OBJECT_CREATE))
    {
        STATIC_ASSERT(offsetof(nrf_dfu_request_select_t, object_type) ==
                      offsetof(nrf_dfu_request_create_t, object_type),
                      "Wrong object_type offset!");

        m_current_object = (nrf_dfu_obj_type_t)(p_req->select.object_type);
    }

    bool response_ready = true;

    switch (m_current_object)
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
            m_current_object = NRF_DFU_OBJ_TYPE_INVALID;
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


static ret_code_t restore_init_command(void)
{
    nrf_dfu_validation_init();
    if (nrf_dfu_validation_init_cmd_present() &&
        nrf_dfu_validation_init_cmd_execute(&m_firmware_start_addr, &m_firmware_size_req) != NRF_DFU_RES_CODE_SUCCESS)
    {
        return NRF_ERROR_INTERNAL;
    }
    return NRF_SUCCESS;
}

void nrf_dfu_request_session_restore(void)
{
    m_execute_deferred = false;
    nrf_dfu_settings_reinit();
    m_current_object = NRF_DFU_OBJ_TYPE_COMMAND;
    /* Decode the signed command corresponding to the restored settings. On
     * failure require a fresh init object before accepting any image data. */
    if (restore_init_command() != NRF_SUCCESS)
    {
        nrf_dfu_settings_progress_reset();
        nrf_dfu_validation_init();
    }
}


ret_code_t nrf_dfu_req_handler_init(nrf_dfu_observer_t observer)
{
    ret_code_t       ret_val;
    nrf_dfu_result_t result;

    if (observer == NULL)
    {
        return NRF_ERROR_INVALID_PARAM;
    }

#if defined(BLE_STACK_SUPPORT_REQD) || defined(ANT_STACK_SUPPORT_REQD)
    ret_val  = nrf_dfu_flash_init(true);
#else
    ret_val = nrf_dfu_flash_init(false);
#endif
    if (ret_val != NRF_SUCCESS)
    {
        return ret_val;
    }

    ret_val = restore_init_command();
    VERIFY_SUCCESS(ret_val);

    m_observer = observer;

    /* Initialize extended error handling with "No error" as the most recent error. */
    result = ext_error_set(NRF_DFU_EXT_ERROR_NO_ERROR);
    UNUSED_RETURN_VALUE(result);

    return NRF_SUCCESS;
}
