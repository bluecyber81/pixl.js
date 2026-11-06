/* Included by the host display harness, after the real driver and SPI model. */
static void check_full_frame_counts(void)
{
    assert(spi_transfers == 32 && command_bytes == 24 && data_bytes == 8 * LCD_X_SIZE);
    assert_wire_matches();
}

static void test_queue_retry(void)
{
    initialize();
    zero_counts();
    queued_fail = 1;
    event_irq(NRF_DFU_EVT_TRANSPORT_ACTIVATED);
    assert(!queued_handler && m_display_retry && !spi_transfers);
    dfu_display_process();
    assert(m_display_rendered == SCREEN_CONNECTED && !m_display_retry);
    check_full_frame_counts();
    zero_counts();
    dfu_display_process();
    assert(!spi_transfers);
    event_irq(NRF_DFU_EVT_TRANSPORT_DEACTIVATED);
    dfu_display_process();
    assert(m_display_rendered == SCREEN_WAITING);
    check_full_frame_counts();
    zero_counts();
    event_irq(NRF_DFU_EVT_TRANSPORT_ACTIVATED);
    dfu_observer(NRF_DFU_EVT_DFU_STARTED);
    assert(m_display_rendered == SCREEN_RECEIVING);
    dfu_display_process();
    check_full_frame_counts();

    /* Accepted notification supersedes failed enqueue before poll. */
    event_irq(NRF_DFU_EVT_TRANSPORT_DEACTIVATED);
    queued_fail = 0;
    event_irq(NRF_DFU_EVT_TRANSPORT_ACTIVATED);
    zero_counts();
    dfu_display_process();
    assert(!spi_transfers && queued_handler);
    drain_queue();
    assert(m_display_rendered == SCREEN_CONNECTED && !m_display_retry);
    check_full_frame_counts();

    /* Terminal cleanup survives saturation and ignores late connect/disconnect. */
    unsigned cleaned = spi_uninit_count;
    zero_counts();
    queued_fail = 1;
    event_irq(NRF_DFU_EVT_TRANSPORT_DEACTIVATED);
    event_irq(NRF_DFU_EVT_DFU_COMPLETED);
    event_irq(NRF_DFU_EVT_TRANSPORT_ACTIVATED);
    event_irq(NRF_DFU_EVT_TRANSPORT_DEACTIVATED);
    assert(cleaned == spi_uninit_count && !spi_transfers);
    dfu_display_process();
    dfu_display_process();
    assert(spi_uninit_count == cleaned + 1 && !spi_transfers && !reset_count);
}

static void test_raw_transfers(void)
{
    uint8_t bytes[255];
    for (unsigned n = 0; n < sizeof(bytes); ++n) bytes[n] = (uint8_t)(n ^ 0xaa);
    initialize();
    assert(sizeof(m_lcd_spi.tx_buff) == 132);
    for (unsigned fill = 0; fill < 2; ++fill) {
        for (unsigned len = 0; len <= sizeof(bytes); ++len) {
            capture_length = select_writes = 0;
            zero_counts();
            capture_raw = true;
            lcd_write_data(fill ? NULL : bytes, len);
            capture_raw = false;
            assert(capture_length == len && spi_transfers == (len + 131) / 132);
            assert(select_writes == (len ? 2u : 0u));
            for (unsigned n = 0; n < len; ++n) assert(capture_bytes[n] == (fill ? 255 : bytes[n]));
        }
    }
    for (unsigned at = 1; at <= 2; ++at) {
        initialize();
        zero_counts();
        select_writes = capture_length = 0;
        capture_raw = true;
        injected_busy_at = at;
        unsigned aborted = spi_abort_count;
        lcd_write_data(bytes, sizeof(bytes));
        assert(m_lcd_spi.faulted && spi_abort_count == aborted+1 && spi_transfers == at);
        assert(select_writes == 2 && capture_length == (at == 1 ? 0u : 132u));
        lcd_write_data(bytes, sizeof(bytes));
        assert(select_writes == 2 && spi_transfers == at);
        capture_raw = false;
        injected_busy_at = 0;
    }
}

static void test_full_frames(void)
{
    static const char *const messages[] = {
        "", "Ready", "DFU Update", "Waiting...", "Receiving...", "Retry...",
        "DFU Error", "\xff", "ABCDEFGHIJKLMNOPQ!"
    };
    uint8_t expected[8][LCD_X_SIZE];
    initialize();
    for (unsigned offset = 0; offset <= UINT8_MAX; offset++) {
        for (size_t i = 0; i < sizeof(messages) / sizeof(messages[0]); i++) {
            unsigned left = offset;
            unsigned right = UINT8_MAX - offset;
            const char *title = messages[i];
            const char *detail = messages[(i+1) % (sizeof(messages) / sizeof(messages[0]))];
            lcd_clear();
            /* Reference uses the pre-existing generic clipped blitter. */
            size_t room = left > 128 ? 0 : (128 - left) / 8;
            size_t len = strlen(title);
            show_str_1608(left, 16, (uint8_t *)title, len < room ? len : room);
            room = right > 128 ? 0 : (128 - right) / 8;
            len = strlen(detail);
            show_str_1608(right, 32, (uint8_t *)detail, len < room ? len : room);
            memcpy(expected, m_display_content, sizeof(expected));
            memset(m_display_content, 0xaa, sizeof(m_display_content));
            memset(wire_ram, 0x55, sizeof(wire_ram));
            zero_counts();
            single_frame_wire_check = true;
            lcd_draw_dfu_status(left, title, right, detail);
            single_frame_wire_check = false;
            check_full_frame_counts();
            assert(memcmp(expected, m_display_content, sizeof(expected)) == 0);
        }
    }
    /* Existing communication fault contract: one abort and no further bus
     * traffic, including any repeated draw; a new initialization can recover. */
    for (unsigned transfer = 1; transfer <= 32; transfer++) {
        initialize();
        injected_busy_at = transfer;
        unsigned aborts = spi_abort_count;
        zero_counts();
        lcd_draw_dfu_status(25, "DFU Update", 45, "Ready");
        assert(m_lcd_spi.faulted && spi_transfers == transfer && spi_abort_count == aborts+1);
        injected_busy_at = 0;
        lcd_draw_dfu_status(25, "DFU Update", 45, "Ready");
        assert(spi_transfers == transfer && reset_count == 0);
    }
    initialize();
    zero_counts();
    memcpy(expected, m_display_content, sizeof(expected));
    m_screen_enabled = false;
    lcd_draw_dfu_status(25, "DFU Update", 45, "Ready");
    assert(spi_transfers == 0 && memcmp(expected, m_display_content, sizeof(expected)) == 0);
    m_screen_enabled = true;
}
