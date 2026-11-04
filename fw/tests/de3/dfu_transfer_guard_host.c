/* Appended to the existing actual DF/core/foreground-queue harness.
 * Storage and radio submission remain deterministic mocks, not hardware. */
static int32_t successful_abort(vfs_file_t *file) {
    CHECK(file->handle && !critical_depth);
    return VFS_OK;
}

static void open_with_flags(uint8_t flags) {
    const uint8_t payload[] = {4,0,'E',':','/','x',flags};
    request(0x12,payload,sizeof(payload));
    CHECK(replies[sends-1].status==DF_STATUS_OK && file_chunk_state.opened);
    ready();
}

static void expect_refusal(void) {
    void *handle=file_chunk_state.vfs_fd.handle;
    bool abandoned=file_chunk_state.abandoned;
    unsigned closed=file_closes, written=write_calls, disabled=disable_calls;
    size_t length=written_length;
    request(2,NULL,0);
    CHECK(replies[sends-1].cmd==2 && replies[sends-1].status==DF_STATUS_ERR);
    CHECK(replies[sends-1].length==0 && replies[sends-1].chunk==0);
    for(unsigned n=0;n<3;n++)ready();
    CHECK(dfu_calls==0 && disable_calls==disabled && ble_work_can_send());
    CHECK(file_chunk_state.opened && file_chunk_state.vfs_fd.handle==handle);
    CHECK(file_chunk_state.abandoned==abandoned && file_closes==closed);
    CHECK(write_calls==written && written_length==length);
}

static void expect_success(void) {
    CHECK(!file_chunk_state.opened);
    unsigned before=dfu_calls, disabled=disable_calls;
    request(2,NULL,0);
    CHECK(replies[sends-1].status==DF_STATUS_OK && !replies[sends-1].length);
    CHECK(dfu_calls==before && disable_calls==disabled);
    ready();
    CHECK(dfu_calls==before+1 && disable_calls==disabled);
    ready();
    CHECK(dfu_calls==before+1 && disable_calls==disabled);
}

static void reconnect(void) {
    ble_work_disconnected();
    ble_work_process(ble_on_disconnected);
    ble_work_connected();
    ble_work_process(ble_on_disconnected);
    CHECK(m_df_ctx.cmd==NULL && ble_work_can_send());
}

static void expect_invalid_dfu(uint8_t status,uint16_t chunk,const uint8_t *data,size_t length) {
    unsigned before=dfu_calls, disabled=disable_calls;
    sends=attempts=0;
    packet(2,status,chunk,data,length);
    CHECK(sends==1 && replies[0].cmd==2 && replies[0].status==DF_STATUS_ERR);
    CHECK(!replies[0].length && !replies[0].chunk);
    ready();ready();
    CHECK(dfu_calls==before && disable_calls==disabled && ble_work_can_send());
    CHECK(!file_chunk_state.opened && !disconnected);
}

int main(int argc,char **argv) {
    CHECK(argc==3);
    unsigned scenario=(unsigned)strtoul(argv[1],NULL,10);
    unsigned mtu=(unsigned)strtoul(argv[2],NULL,10);
    driver=(vfs_driver_t){.stat=mock_stat,.open_file=mock_open,.close_file=mock_close,
        .read_file=mock_read,.write_file=mock_write,.open_dir=mock_open_dir,
        .read_dir=mock_read_dir,.close_dir=mock_close_dir};
    reset(mtu);
    uint8_t zero=0;
    if(scenario<4) {
        open_with_flags(scenario==0 ? VFS_MODE_READONLY : VFS_MODE_WRITEONLY|VFS_MODE_CREATE);
        if(scenario!=0) {
            const uint8_t data[]={0,11,22,33,44,55,66,77,88,99,111,122,133};
            request(0x15,data,sizeof(data));ready();
            CHECK(written_length==12 && !memcmp(written_data,data+1,12));
        }
        if(scenario>=2) {
            fail_close_for_dfu=true;
            request(0x13,&zero,1);ready();
            CHECK(replies[sends-1].status==DF_STATUS_ERR && file_chunk_state.opened);
        }
        if(scenario==3) {
            reconnect();
            CHECK(file_chunk_state.opened && file_chunk_state.abandoned);
        }
        expect_refusal();
        fail_close_for_dfu=false;
        if(scenario==3) {
            driver.abort_file=successful_abort;
            df_proto_vfs_cleanup();
        } else {
            request(0x13,&zero,1);ready();
            CHECK(replies[sends-1].status==DF_STATUS_OK);
        }
        CHECK(!file_chunk_state.opened && dfu_calls==0);
        expect_success();
    } else if(scenario==4) {
        expect_success();
    } else if(scenario==5) {
        /* An accepted but uncompleted reply must not survive link turnover. */
        request(2,NULL,0);CHECK(replies[sends-1].status==DF_STATUS_OK && !dfu_calls);
        reconnect();ready();CHECK(!dfu_calls);
        open_with_flags(VFS_MODE_READONLY);
        expect_refusal();
        request(0x13,&zero,1);ready();CHECK(!dfu_calls);
        expect_success();
    } else if(scenario==6) {
        /* Failed notification submission cannot lead to reset via stale TX. */
        send_error_code=19;
        request(2,NULL,0);
        CHECK(!sends && disconnected==1 && !dfu_calls && !ble_work_can_send());
        ready();CHECK(!dfu_calls);
        send_error_code=0;reconnect();ready();CHECK(!dfu_calls);
        request(1,NULL,0);finish_stream();CHECK(!dfu_calls);
        expect_success();
    } else if(scenario==7) {
        /* Every nonzero legacy status is a response, not a DFU command. */
        for(unsigned value=1;value<=255;value++)expect_invalid_dfu((uint8_t)value,0,NULL,0);
        expect_success();
    } else if(scenario==8) {
        /* Exercise every bit plus sequence/MORE boundary values in legacy RX. */
        for(unsigned bit=0;bit<16;bit++)expect_invalid_dfu(0,(uint16_t)(1u<<bit),NULL,0);
        expect_invalid_dfu(0,0x7fff,NULL,0);expect_invalid_dfu(0,0xffff,NULL,0);
        expect_success();
    } else if(scenario==9) {
        /* Nonempty legacy commands fit this link but must never reset. */
        uint8_t payload[DF_PAYLOAD_LEN]={0xa5};
        for(size_t length=1;length<=mtu-7;length++)expect_invalid_dfu(0,0,payload,length);
        expect_success();
    } else if(scenario==10) {
        /* A reassembled modern request also needs an empty DFU payload. */
        modern();
        uint8_t payload[DF_PAYLOAD_LEN];memset(payload,0x5a,sizeof(payload));
        for(size_t length=1;length<=sizeof(payload);length++) {
            sends=attempts=0;
            for(size_t pos=0,seq=0;pos<length;seq++) {
                size_t count=length-pos;if(count>mtu-7)count=mtu-7;
                packet(2,0,(uint16_t)(seq|(pos+count<length?0x8000:0)),payload+pos,count);
                pos+=count;
                if(pos<length)CHECK(!sends && !dfu_calls);
            }
            CHECK(sends==1 && replies[0].status==DF_STATUS_ERR);
            ready();ready();CHECK(!dfu_calls && !disable_calls && !disconnected);
        }
        expect_success();
    } else if(scenario==11) {
        /* Lost/late completion followed by an invalid command cannot reuse
         * the function's pending bit across a new connection. */
        request(2,NULL,0);CHECK(!dfu_calls && !replies[0].status);
        reconnect();expect_invalid_dfu(1,0,NULL,0);
        expect_success();
    } else return 2;
    CHECK(!critical_depth);
    printf("PASS DFU ownership scenario %u at ATT MTU %u\n",scenario,mtu);
    return 0;
}
