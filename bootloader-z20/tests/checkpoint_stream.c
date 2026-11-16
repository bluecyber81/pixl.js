/* Source-bound normal DFU transfer; radio, signed init and physical flash are modeled. */
#define MODEL_FLASH_BYTES 0x5b000
#define main previous_session_tests
#include "session_joined.c"
#undef main

#define INTERVAL 65536u
static uint8_t source_image[MODEL_FLASH_BYTES];
static uint8_t saved_image[MODEL_FLASH_BYTES], saved_primary[CODE_PAGE_SIZE], saved_backup[CODE_PAGE_SIZE];

static void boot_from_flash(uint32_t length)
{
    memcpy(saved_image, application_page, sizeof(saved_image));
    memcpy(saved_primary, m_dfu_settings_buffer, CODE_PAGE_SIZE);
    memcpy(saved_backup, m_mbr_params_page, CODE_PAGE_SIZE);
    fresh();
    m_checkpoint_needs_backup = false;
    memcpy(application_page, saved_image, sizeof(saved_image));
    memcpy(m_dfu_settings_buffer, saved_primary, CODE_PAGE_SIZE);
    memcpy(m_mbr_params_page, saved_backup, CODE_PAGE_SIZE);
    restored_image_bytes = length;
    nrf_dfu_settings_reinit();
    CHECK(restore_init_command() == NRF_SUCCESS && data_image_ready());
}

static void seed(uint32_t length, uint32_t previous)
{
    fresh();
    m_checkpoint_needs_backup = false;
    restored_image_bytes = m_firmware_size_req = length;
    s_dfu_settings.progress.command_offset = s_dfu_settings.progress.command_size = 12;
    s_dfu_settings.progress.firmware_image_offset = s_dfu_settings.progress.firmware_image_offset_last = previous;
    s_dfu_settings.progress.firmware_image_crc = s_dfu_settings.progress.firmware_image_crc_last =
        crc32_compute(source_image, previous, NULL);
    s_dfu_settings.write_offset = previous;
    stamp(&s_dfu_settings);
    memcpy(m_dfu_settings_buffer, &s_dfu_settings, sizeof(s_dfu_settings));
    memcpy(m_mbr_params_page, &s_dfu_settings, sizeof(s_dfu_settings));
}

static void ctrl(unsigned op, unsigned type, unsigned size)
{
    control(op, type, size);
    app_sched_execute();
}

static void verify_resume(uint32_t offset)
{
    ctrl(NRF_DFU_OP_OBJECT_SELECT, NRF_DFU_OBJ_TYPE_DATA, 0);
    CHECK(wire_code == NRF_DFU_OP_OBJECT_SELECT && wire_status == NRF_DFU_RES_CODE_SUCCESS);
    CHECK(wire_offset == offset && wire_crc == crc32_compute(source_image, offset, NULL));
    ctrl(NRF_DFU_OP_CRC_GET, 0, 0);
    CHECK(wire_code == NRF_DFU_OP_CRC_GET && wire_status == NRF_DFU_RES_CODE_SUCCESS);
    CHECK(wire_offset == offset && wire_crc == crc32_compute(source_image, offset, NULL));
    CHECK(s_dfu_settings.progress.firmware_image_offset_last == offset && s_dfu_settings.write_offset == offset);
}

static void packet_at(uint32_t offset, unsigned count)
{
    ble_evt_t ev = {.evt.gatts_evt.conn_handle = 7};
    ble_gatts_evt_write_t *p = &ev.evt.gatts_evt.params.write;
    CHECK(count <= sizeof(p->data));
    p->handle = 12;
    p->len = count;
    memcpy(p->data, source_image + offset, count);
    on_write(&service, &ev);
    app_sched_execute();
    backend_drain();
    CHECK(!pool_used && wire_code == NRF_DFU_OP_CRC_GET && wire_status == NRF_DFU_RES_CODE_SUCCESS);
}

static uint32_t transfer(uint32_t length)
{
    const uint32_t mid_page = length / (2 * CODE_PAGE_SIZE);
    const uint32_t last_page = (length - 41) / CODE_PAGE_SIZE;
    const uint32_t cuts[] = {40, (mid_page < 16 ? 16 : mid_page) * CODE_PAGE_SIZE + 40,
                             last_page * CODE_PAGE_SIZE + 40};
    CHECK(cuts[1] < cuts[2] && cuts[2] < length);
    seed(length, 0);
    memset(application_page, 0xff, sizeof(application_page));
    ctrl(NRF_DFU_OP_RECEIPT_NOTIF_SET, 1, 0);
    unsigned next_cut = 0, checkpoints = 0, settings_erases = 0;
    uint32_t offset = 0, crc = 0, recovered[3] = {0};
    while (offset < length) {
        const uint32_t remain = length - offset;
        const uint32_t size = remain < CODE_PAGE_SIZE ? remain : CODE_PAGE_SIZE;
        const uint32_t end = offset + size;
        ctrl(NRF_DFU_OP_OBJECT_CREATE, NRF_DFU_OBJ_TYPE_DATA, size);
        backend_drain();
        CHECK(wire_status == NRF_DFU_RES_CODE_SUCCESS && wire_code == NRF_DFU_OP_OBJECT_CREATE);
        while (offset < end) {
            const unsigned n = end - offset < 20 ? end - offset : 20;
            packet_at(offset, n);
            crc = crc32_compute(source_image + offset, n, &crc);
            offset += n;
            CHECK(wire_offset == offset && wire_crc == crc);
            if (next_cut < 3 && offset == cuts[next_cut]) {
                if (next_cut == 2) {
                    boot_from_flash(length);
                } else {
                    disconnect_irq();
                    nrf_dfu_ble_disconnect_process();
                    CHECK(!m_disconnect_pending);
                    response_session_reset(7);
                }
                offset = (offset / INTERVAL) * INTERVAL;
                verify_resume(offset);
                crc = wire_crc;
                recovered[next_cut++] = offset;
                ctrl(NRF_DFU_OP_RECEIPT_NOTIF_SET, 1, 0);
                break;
            }
        }
        if (offset != end) continue;
        const unsigned before = op_completed;
        const unsigned notifications = frames;
        ctrl(NRF_DFU_OP_OBJECT_EXECUTE, 0, 0);
        if (end != length && end % INTERVAL == 0) {
            CHECK(frames == notifications && m_execute_deferred && op_count == 2);
            final_reset_process();
            CHECK(frames == notifications);
            backend_drain();
            final_reset_process();
            CHECK(frames == notifications && op_count == 2);
            backend_drain();
            final_reset_process();
            CHECK(op_completed - before == 4 && !m_execute_deferred && !g_dfu_finalizing);
            ++checkpoints;
            settings_erases += 2;
        } else {
            backend_drain();
            final_reset_process();
            CHECK(op_completed - before == (end == length ? 4u : 0u));
        }
        CHECK(wire_code == NRF_DFU_OP_OBJECT_EXECUTE && wire_status == NRF_DFU_RES_CODE_SUCCESS);
    }
    CHECK(next_cut == 3 && g_dfu_final_success && validation_calls == 1 && !reset_while_busy);
    CHECK(!memcmp(application_page, source_image, length));
    CHECK(checkpoints == (length - 1) / INTERVAL);
    printf("{\"payloadBytes\":%u,\"cutOffsets\":[%u,%u,%u],\"resumeOffsets\":[%u,%u,%u],"
           "\"checkpointCount\":%u,\"additionalPageErases\":%u,\"finalCrc32\":%u}",
           length,cuts[0],cuts[1],cuts[2],recovered[0],recovered[1],recovered[2],checkpoints,settings_erases,crc);
    return crc;
}

static void begin_checkpoint(void)
{
    const uint32_t previous = INTERVAL, current = 2 * INTERVAL;
    seed(3 * INTERVAL, previous);
    s_dfu_settings.progress.firmware_image_offset_last = current - CODE_PAGE_SIZE;
    s_dfu_settings.progress.data_object_size = CODE_PAGE_SIZE;
    s_dfu_settings.progress.firmware_image_offset = s_dfu_settings.write_offset = current;
    s_dfu_settings.progress.firmware_image_crc = crc32_compute(source_image, current, NULL);
    m_current_object = NRF_DFU_OBJ_TYPE_DATA;
}

static void powercut(unsigned operation, unsigned words)
{
    begin_checkpoint();
    ctrl(NRF_DFU_OP_OBJECT_EXECUTE, 0, 0);
    for (unsigned n=0; n<operation; n++) {
        backend_finish(true);
        if (n == 1) final_reset_process();
    }
    if (words) {
        /* Interruption during programming of settings words, before the SDK completion event. */
        CHECK(hardware_pending && hardware_kind == NRF_FSTORAGE_EVT_WRITE_RESULT);
        uint8_t *dest = (uint8_t *)(uintptr_t)hardware_dest;
        const uint8_t *src = (const uint8_t *)hardware_src;
        for (unsigned n=0; n<words*4; n++) dest[n] &= src[n];
    }
    boot_from_flash(3 * INTERVAL);
    const uint32_t actual = s_dfu_settings.progress.firmware_image_offset;
    CHECK(actual == INTERVAL || actual == 2 * INTERVAL);
    CHECK(actual == 2 * INTERVAL || operation <= 2);
    verify_resume(actual);
}

static void fail_checkpoint(unsigned op, bool during_flash)
{
    begin_checkpoint();
    if (during_flash) fail_event = op;
    else fail_admission = op;
    ctrl(NRF_DFU_OP_OBJECT_EXECUTE, 0, 0);
    for (unsigned n=0; n<2; n++) { backend_drain(); final_reset_process(); }
    CHECK(wire_code == NRF_DFU_OP_OBJECT_EXECUTE && wire_status == NRF_DFU_RES_CODE_OPERATION_FAILED);
    CHECK(!m_execute_deferred && !g_dfu_finalizing);
    /* Retry this closed object, keeping validated data in place. */
    fail_event = fail_admission = 0;
    ctrl(NRF_DFU_OP_OBJECT_EXECUTE, 0, 0);
    for (unsigned n=0; n<2; n++) { backend_drain(); final_reset_process(); }
    CHECK(wire_status == NRF_DFU_RES_CODE_SUCCESS && !m_execute_deferred);
    boot_from_flash(3 * INTERVAL);
    verify_resume(2 * INTERVAL);
}


static void disconnect_during_checkpoint(unsigned completed)
{
    begin_checkpoint();
    const unsigned old_frames = frames;
    ctrl(NRF_DFU_OP_OBJECT_EXECUTE, 0, 0);
    for (unsigned n=0;n<completed;n++) {
        backend_finish(true);
        if (n == 1) final_reset_process();
    }
    disconnect_irq();
    backend_drain();
    nrf_dfu_ble_disconnect_process();
    final_reset_process();
    CHECK(!m_disconnect_pending && !m_final_response && !m_execute_deferred && frames == old_frames);
    response_session_reset(7);
    verify_resume(completed < 2 ? INTERVAL : 2 * INTERVAL);
}

static void repeat_confirmed_execute(void)
{
    begin_checkpoint();
    ctrl(NRF_DFU_OP_OBJECT_EXECUTE, 0, 0);
    for (unsigned n=0;n<2;n++) { backend_drain(); final_reset_process(); }
    unsigned previous = op_completed, replies = frames;
    ctrl(NRF_DFU_OP_OBJECT_EXECUTE, 0, 0);
    final_reset_process();
    CHECK(frames == replies+1 && wire_status == NRF_DFU_RES_CODE_SUCCESS &&
          op_count == 0 && op_completed == previous && !m_execute_deferred);
}

int main(int argc, char **argv)
{
    CHECK(argc == 3);
    FILE *f = fopen(argv[1], "rb");
    CHECK(f);
    size_t size = fread(source_image, 1, sizeof(source_image), f);
    CHECK(!ferror(f) && fgetc(f)==EOF && fclose(f)==0 && (size & 3) == 0);
    transfer((uint32_t)size);
    FILE *out = fopen(argv[2],"wb");
    CHECK(out && fwrite(application_page,1,size,out)==size && fclose(out)==0);
    repeat_confirmed_execute();
    for(unsigned op=0; op<=4; op++) disconnect_during_checkpoint(op);
    for(unsigned op=0; op<=4; op++) powercut(op,0);
    for(unsigned n=0;n<=sizeof(nrf_dfu_settings_t)/4;n++) { powercut(1,n); powercut(3,n); }
    for(unsigned op=1;op<=4;op++) { fail_checkpoint(op,false); fail_checkpoint(op,true); }
    printf("\n");
    return 0;
}
