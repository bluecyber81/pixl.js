static void fresh(void) {
    reset_ble();advert_calls=flags_for_ble=command_requests=cached_decodes=cached_executes=0;
    m_execute_deferred=false;
    restored_image_bytes=100;
    m_disconnect_pending=g_dfu_reset_pending=bad_size=false;
    m_current_object=NRF_DFU_OBJ_TYPE_COMMAND;
}
static void expect_advertised(void)
{
    nrf_dfu_ble_disconnect_process();
    CHECK(!m_disconnect_pending && advert_calls==1 && observer_counts[NRF_DFU_EVT_TRANSPORT_DEACTIVATED]==1);
}
static void quiet_disconnect(void *p,uint16_t size) {disconnect_irq();}
/* ORIGINAL INTEROP CASES */
    fresh();
    memset(application_page,0x12,sizeof(application_page));
    control(NRF_DFU_OP_OBJECT_CREATE,NRF_DFU_OBJ_TYPE_DATA,100);
    disconnect_irq();
    app_sched_execute();
    CHECK(!frames && !op_count && !hardware_pending && !reset_calls && application_page[0]==0x12);
    expect_advertised();response_session_reset(7);
    control(NRF_DFU_OP_OBJECT_SELECT,NRF_DFU_OBJ_TYPE_DATA,0);
    app_sched_execute();CHECK(frames==1 && wire_status==NRF_DFU_RES_CODE_SUCCESS);
    pass("previous_session_queued_create_cannot_erase_fresh_peer_works");

    fresh();control(NRF_DFU_OP_ABORT,0,0);
    disconnect_irq();app_sched_execute();expect_advertised();CHECK(!reset_calls && !frames);
    pass("previous_session_queued_abort_cannot_reset");

    fresh();prepare_data(1);packet(4);disconnect_irq();
    CHECK(pool_used && !pool_free);
    app_sched_execute();expect_advertised();CHECK(pool_free==1 && !pool_used && !op_count && !frames);
    pass("queued_stale_write_releases_one_buffer_without_prn_or_write");

    fresh();prepare_data(1);packet(4);app_sched_execute();
    CHECK(pool_used && frames==1 && nrf_fstorage_is_busy(NULL));
    disconnect_irq();nrf_dfu_ble_disconnect_process();
    CHECK(m_disconnect_pending && !advert_calls && !cached_decodes && pool_used);
    backend_drain();CHECK(!pool_used && pool_free==1 && application_page[0]==0x96);
    expect_advertised();CHECK(cached_decodes==1 && frames==1);
    nrf_dfu_ble_disconnect_process();CHECK(advert_calls==1);
    pass("already_submitted_write_drains_then_rollback_and_one_advertisement");

    fresh();prepare_data(1);packet(4);disconnect_on_crc=true;app_sched_execute();
    CHECK(!disconnect_on_crc && m_disconnect_pending && !advert_calls && !frames &&
          !cached_decodes && pool_used && nrf_fstorage_is_busy(NULL));
    nrf_dfu_ble_disconnect_process();CHECK(!advert_calls);
    backend_drain();expect_advertised();
    CHECK(pool_free==1 && !pool_used && application_page[0]==0x96 && !s_dfu_settings.progress.firmware_image_offset);
    pass("irq_during_an_already_dispatched_write_allows_drain_before_flash_rollback_and_readvertising");

    fresh();CHECK(nrf_dfu_flash_store(m_firmware_start_addr,transport_data,4,NULL)==0);
    s_dfu_settings.progress.firmware_image_offset=m_firmware_size_req;
    nrf_dfu_request_t retry={.request=NRF_DFU_OP_OBJECT_EXECUTE,.p_context=response_context_get(),.callback.response=ble_dfu_req_handler_callback};
    on_data_obj_execute_request_sched(&retry,sizeof retry);
    disconnect_irq();backend_drain();
    app_sched_execute();expect_advertised();CHECK(!validation_calls && !g_dfu_finalizing && !frames && !op_count);
    pass("deferred_execute_rechecks_original_session");

    fresh();prepare_data(1);control(NRF_DFU_OP_ABORT,0,0);packet(4);
    disconnect_irq();response_session_reset(7); /* Deliberately force earlier than production advertising. */
    control(NRF_DFU_OP_CRC_GET,0,0);app_sched_execute();
    CHECK(frames==1 && !reset_calls && pool_free==1 && !pool_used && !op_count);
    pass("reused_handle_old_queued_abort_and_write_rejected_current_command_replies");

    fresh();m_response_session=UINT32_MAX-1;response_session_reset(7);CHECK(m_response_session==UINT32_MAX);
    control(NRF_DFU_OP_ABORT,0,0);disconnect_irq();CHECK(m_response_session==1);
    app_sched_execute();expect_advertised();CHECK(!reset_calls);
    pass("generation_wrap_skips_zero_and_invalidates_previous_token");

    fresh();prepare_data(0);disconnect_irq();expect_advertised();response_session_reset(7);
    control(NRF_DFU_OP_CRC_GET,0,0);app_sched_execute();
    CHECK(command_requests==1 && frames==1);
    pass("new_session_starts_with_command_object_instead_of_previous_data");

    fresh();prepare_data(0);control(NRF_DFU_OP_ABORT,0,0);m_response_failed=true;app_sched_execute();
    CHECK(!reset_calls && !frames);
    pass("unusable_transport_cannot_dispatch_older_abort");

    fresh();nrf_dfu_request_t other=request(NRF_DFU_OP_CRC_GET);
    CHECK(nrf_dfu_req_handler_on_req(&other)==NRF_SUCCESS);app_sched_execute();
    CHECK(response_calls==1 && !frames);pass("non_ble_context_keeps_protocol_semantics");

    fresh();control(NRF_DFU_OP_ABORT,0,0);app_sched_execute();CHECK(reset_calls==1);
    pass("abort_dispatched_on_live_link_still_works");

    fresh();g_dfu_finalizing=true;disconnect_irq();nrf_dfu_ble_disconnect_process();
    CHECK(!m_disconnect_pending && !cached_decodes && !advert_calls);
    fresh();g_dfu_reset_pending=true;disconnect_irq();nrf_dfu_ble_disconnect_process();
    CHECK(!cached_decodes && !advert_calls);
    pass("terminal_commit_and_pending_reset_avoid_rollback_and_no_readvertising");

    fresh();disconnect_irq();flags_for_ble=DFU_BLE_RESETTING_SOON;
    nrf_dfu_ble_disconnect_process();CHECK(!advert_calls && cached_decodes==1);
    pass("closing_transport_never_readvertises");

    fresh();s_dfu_settings.progress.command_offset=s_dfu_settings.progress.command_size=12;
    stamp(&s_dfu_settings);memcpy(m_dfu_settings_buffer,&s_dfu_settings,sizeof(s_dfu_settings));
    memcpy(m_mbr_params_page,&s_dfu_settings,sizeof(s_dfu_settings));
    init_command_valid=false;m_firmware_size_req=9;
    disconnect_irq();expect_advertised();CHECK(cached_executes==1 && init_command_valid && m_firmware_size_req==100);
    pass("restore_link_rollback_refreshes_signed_command_geometry");
    CHECK(data_image_ready());
    bad_size=true;advert_calls=observer_counts[NRF_DFU_EVT_TRANSPORT_DEACTIVATED]=0;
    disconnect_irq();expect_advertised();CHECK(!init_command_valid && !s_dfu_settings.progress.command_size);
    pass("restored_invalid_geometry_requires_fresh_init");

    fresh();
    for(unsigned valid=0;valid<=1;++valid){
        init_command_valid=(bool)valid;
        m_firmware_size_req=0; CHECK(!data_image_ready());
        m_firmware_size_req=100; CHECK(data_image_ready()==(bool)valid);
    }
    pass("execute_readiness_requires_valid_command_and_positive_extent");

    fresh();
    s_dfu_settings.progress.command_offset=s_dfu_settings.progress.command_size=12;
    restored_image_bytes=CODE_PAGE_SIZE+100;
    s_dfu_settings.progress.firmware_image_offset_last=s_dfu_settings.progress.firmware_image_offset=CODE_PAGE_SIZE;
    s_dfu_settings.progress.firmware_image_crc_last=s_dfu_settings.progress.firmware_image_crc=123;
    stamp(&s_dfu_settings);memcpy(m_dfu_settings_buffer,&s_dfu_settings,sizeof(s_dfu_settings));
    memcpy(m_mbr_params_page,&s_dfu_settings,sizeof(s_dfu_settings));
    disconnect_irq();expect_advertised();response_session_reset(7);
    CHECK(data_image_ready() && s_dfu_settings.progress.firmware_image_offset==CODE_PAGE_SIZE &&
          s_dfu_settings.progress.firmware_image_crc==123);
    control(NRF_DFU_OP_OBJECT_SELECT,NRF_DFU_OBJ_TYPE_DATA,0);app_sched_execute();
    control(NRF_DFU_OP_OBJECT_EXECUTE,0,0);app_sched_execute();
    CHECK(wire_status==NRF_DFU_RES_CODE_SUCCESS && !g_dfu_finalizing &&
          !validation_calls && s_dfu_settings.progress.firmware_image_offset_last==CODE_PAGE_SIZE);
    pass("resume_after_disconnect_allows_confirmed_object_boundary");

    /* Production saves the init command, but does not persist every data
     * object. A peer must be able to retransmit from the device's checkpoint. */
    fresh();
    s_dfu_settings.progress.command_offset=s_dfu_settings.progress.command_size=12;
    stamp(&s_dfu_settings);
    memcpy(m_dfu_settings_buffer,&s_dfu_settings,sizeof(s_dfu_settings));
    memcpy(m_mbr_params_page,&s_dfu_settings,sizeof(s_dfu_settings));
    prepare_data(1);packet(40);app_sched_execute();backend_drain();
    CHECK(wire_offset==40 && !pool_used && !g_dfu_finalizing);
    disconnect_irq();expect_advertised();response_session_reset(7);
    control(NRF_DFU_OP_OBJECT_SELECT,NRF_DFU_OBJ_TYPE_DATA,0);app_sched_execute();
    control(NRF_DFU_OP_CRC_GET,0,0);app_sched_execute();
    CHECK(data_image_ready() && !wire_offset && !wire_crc);
    control(NRF_DFU_OP_OBJECT_CREATE,NRF_DFU_OBJ_TYPE_DATA,100);app_sched_execute();backend_drain();
    packet(100);app_sched_execute();backend_drain();
    CHECK(!memcmp(application_page,transport_data,100));
    control(NRF_DFU_OP_CRC_GET,0,0);app_sched_execute();
    CHECK(wire_status==NRF_DFU_RES_CODE_SUCCESS && wire_offset==100 &&
          wire_crc==crc32_compute(application_page,100,NULL));
    control(NRF_DFU_OP_OBJECT_EXECUTE,0,0);app_sched_execute();
    CHECK(g_dfu_finalizing && validation_calls==1 && !reset_calls);
    backend_drain();final_reset_process();
    CHECK(g_dfu_final_success && wire_code==NRF_DFU_OP_OBJECT_EXECUTE &&
          wire_status==NRF_DFU_RES_CODE_SUCCESS && !reset_while_busy && !pool_used);
    pass("normal_link_loss_retransmits_from_reported_checkpoint_and_finishes");

    fresh();
    m_execute_deferred=true;
    nrf_dfu_request_t next = request(NRF_DFU_OP_OBJECT_CREATE);
    nrf_dfu_response_t answer = {0};
    next.create.object_type=NRF_DFU_OBJ_TYPE_COMMAND;
    m_current_object=NRF_DFU_OBJ_TYPE_DATA;
    CHECK(nrf_dfu_obj_op(&next,&answer) && answer.result==NRF_DFU_RES_CODE_OPERATION_NOT_PERMITTED &&
          !command_requests && m_current_object==NRF_DFU_OBJ_TYPE_DATA);
    nrf_dfu_request_session_restore();CHECK(!m_execute_deferred);
    pass("pending_object_owns_state_until_drain_or_session_restore");

    fresh();
    for(unsigned i=0;i<32;i++)CHECK(app_sched_event_put(NULL,0,noop)==0);
    disconnect_irq();CHECK(m_disconnect_pending);
    app_sched_execute();expect_advertised();
    pass("full_scheduler_queue_cannot_lose_disconnect");

    printf("RESULT cases=%u assertions=%u\n",scenarios,assertions);
    return 0;
}
