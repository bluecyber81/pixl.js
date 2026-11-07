/* Host-only normal data transfer in the source-bound Z19 scheduler/flash fixture. */
#define MODEL_FLASH_BYTES 0x5b000
#define main legacy_session_test_main
#include "session_joined.c"
#undef main

static uint8_t source_bytes[MODEL_FLASH_BYTES];

static void payload_packet(const uint8_t *data, unsigned length) {
    ble_evt_t event = {.evt.gatts_evt.conn_handle = 7};
    ble_gatts_evt_write_t *write = &event.evt.gatts_evt.params.write;
    CHECK(length <= sizeof(write->data));
    write->handle = 12;
    write->len = length;
    memcpy(write->data, data, length);
    on_write(&service, &event);
    app_sched_execute();
    backend_drain();
    CHECK(wire_code == NRF_DFU_OP_CRC_GET && wire_status == NRF_DFU_RES_CODE_SUCCESS && !pool_used);
}

static void receipts_on(void) {
    control(NRF_DFU_OP_RECEIPT_NOTIF_SET, 1, 0);
    app_sched_execute();
    CHECK(wire_status == NRF_DFU_RES_CODE_SUCCESS);
}

int main(int argc, char **argv) {
    CHECK(argc == 3);
    FILE *input = fopen(argv[1], "rb");
    CHECK(input != NULL);
    const size_t length = fread(source_bytes, 1, sizeof(source_bytes), input);
    CHECK(!ferror(input) && fgetc(input) == EOF && length > 2 * CODE_PAGE_SIZE && length % 4 == 0);
    CHECK(fclose(input) == 0);
    const uint32_t cut = CODE_PAGE_SIZE + 40;
    uint32_t offset = 0, reconnected_at = 0, crc = 0, packets = 0, executes = 0;
    bool reconnect_done = false;
    fresh();
    m_firmware_size_req = restored_image_bytes = (uint32_t)length;
    memset(application_page, 0xff, sizeof(application_page));
    /* STARTING CONDITION: the init was already accepted and saved. Signature
     * verification is independently covered by check_kombi.py on the linked ELF. */
    s_dfu_settings.progress.command_offset = s_dfu_settings.progress.command_size = 12;
    stamp(&s_dfu_settings);
    memcpy(m_dfu_settings_buffer, &s_dfu_settings, sizeof(s_dfu_settings));
    memcpy(m_mbr_params_page, &s_dfu_settings, sizeof(s_dfu_settings));
    receipts_on();
    while (offset < length) {
        const uint32_t object = length - offset < CODE_PAGE_SIZE ? (uint32_t)length - offset : CODE_PAGE_SIZE;
        const uint32_t end = offset + object;
        control(NRF_DFU_OP_OBJECT_CREATE, NRF_DFU_OBJ_TYPE_DATA, object);
        app_sched_execute();
        backend_drain();
        CHECK(wire_code == NRF_DFU_OP_OBJECT_CREATE && wire_status == NRF_DFU_RES_CODE_SUCCESS);
        while (offset < end) {
            const uint32_t n = end - offset < 20 ? end - offset : 20;
            payload_packet(source_bytes + offset, n);
            crc = crc32_compute(source_bytes + offset, n, &crc);
            offset += n;
            ++packets;
            CHECK(wire_offset == offset && wire_crc == crc);
            if (!reconnect_done && offset == cut) {
                disconnect_irq();
                expect_advertised();
                response_session_reset(7);
                control(NRF_DFU_OP_OBJECT_SELECT, NRF_DFU_OBJ_TYPE_DATA, 0);
                app_sched_execute();
                CHECK(wire_code == NRF_DFU_OP_OBJECT_SELECT && wire_status == NRF_DFU_RES_CODE_SUCCESS);
                control(NRF_DFU_OP_CRC_GET, 0, 0);
                app_sched_execute();
                CHECK(wire_status == NRF_DFU_RES_CODE_SUCCESS && data_image_ready());
                CHECK(wire_offset <= cut && wire_offset % CODE_PAGE_SIZE == 0);
                CHECK(wire_crc == crc32_compute(source_bytes, wire_offset, NULL));
                reconnected_at = offset = wire_offset;
                crc = wire_crc;
                reconnect_done = true;
                receipts_on();
                break;
            }
        }
        if (offset != end) continue;
        control(NRF_DFU_OP_OBJECT_EXECUTE, 0, 0);
        app_sched_execute();
        backend_drain();
        final_reset_process();
        ++executes;
        CHECK(wire_code == NRF_DFU_OP_OBJECT_EXECUTE && wire_status == NRF_DFU_RES_CODE_SUCCESS);
    }
    CHECK(reconnect_done && g_dfu_final_success && validation_calls == 1 && !reset_while_busy);
    CHECK(memcmp(application_page, source_bytes, length) == 0);
    FILE *recovered = fopen(argv[2], "wb");
    CHECK(recovered && fwrite(application_page, 1, length, recovered) == length && fclose(recovered) == 0);
    printf("{\"payloadBytes\":%zu,\"linkCutOffset\":%u,\"reportedResumeOffset\":%u,"
           "\"packetReceipts\":%u,\"objectExecutes\":%u,\"finalCrc32\":%u}\n",
           length, cut, reconnected_at, packets, executes, crc);
    return 0;
}
