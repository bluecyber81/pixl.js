/* Actual DF/Core/BLE foreground event path, deterministic VFS/radio endpoints. */
typedef struct {
    bool opened, abandoned;
    vfs_file_t vfs_fd;
    vfs_driver_t *vfs_driver;
    int32_t err_code;
    uint16_t chunk;
} previous_file_state_t;
_Static_assert(sizeof(previous_file_state_t)==sizeof(file_chunk_state_t), "No added state RAM");
_Static_assert(offsetof(previous_file_state_t,vfs_fd)==offsetof(file_chunk_state_t,vfs_fd), "FD unchanged");
_Static_assert(offsetof(previous_file_state_t,vfs_driver)==offsetof(file_chunk_state_t,vfs_driver), "Driver unchanged");
_Static_assert(offsetof(previous_file_state_t,err_code)==offsetof(file_chunk_state_t,err_code), "Error unchanged");
_Static_assert(offsetof(previous_file_state_t,chunk)==offsetof(file_chunk_state_t,chunk), "Chunk unchanged");
#if HAS_READ_PENDING
_Static_assert(offsetof(file_chunk_state_t,read_pending)==2, "Flag uses former padding");
#define PENDING(value) CHECK(file_chunk_state.read_pending==(value))
#else
#define PENDING(value) ((void)0)
#endif

static void open_mode(uint8_t mode) {
    const uint8_t path[]={4,0,'E',':','/','x',mode};
    request(0x12,path,sizeof(path));CHECK(replies[sends-1].status==0);ready();
    CHECK(file_chunk_state.opened);sends=attempts=0;
}

static void close_good(void) {
    uint8_t id=0;request(0x13,&id,1);ready();
    CHECK(!file_chunk_state.opened && replies[sends-1].status==0);PENDING(false);
}

static void verify_full_read(size_t length) {
    sends=attempts=0;file();finish_stream();
    uint8_t actual[4096];CHECK(length<=sizeof(actual));
    CHECK(merge(actual,sizeof(actual),0x14)==length);
    for(size_t i=0;i<length;i++)CHECK(actual[i]==(uint8_t)(i*17u+3u));
    PENDING(false);
    unsigned sent=sends;ready();ready();CHECK(sends==sent);
    CHECK(file_chunk_state.opened && file_offset==length);
}

static void rejected_read(bool empty) {
    unsigned calls=read_calls;
    size_t position=file_offset;
    void *handle=file_chunk_state.vfs_fd.handle;
    vfs_driver_t *owned=file_chunk_state.vfs_driver;
    bool opened=file_chunk_state.opened,abandoned=file_chunk_state.abandoned;
    int32_t error=file_chunk_state.err_code;
    uint16_t chunk=file_chunk_state.chunk;
    uint8_t invalid=1;
    sends=attempts=0;
    request(0x14,empty?NULL:&invalid,empty?0:1);
    CHECK(sends==1 && replies[0].status==DF_STATUS_ERR && !replies[0].length && !replies[0].chunk);
    ready();ready();
    CHECK(sends==1 && file_offset==position && read_calls==calls);
    CHECK(file_chunk_state.opened==opened && file_chunk_state.abandoned==abandoned);
    CHECK(file_chunk_state.vfs_fd.handle==handle && file_chunk_state.vfs_driver==owned);
    CHECK(file_chunk_state.err_code==error && file_chunk_state.chunk==chunk);PENDING(false);
}

static int32_t failed_abort(vfs_file_t *file) { (void)file;return VFS_ERR_FAIL; }
static int32_t successful_abort(vfs_file_t *file) { CHECK(file->handle);return VFS_OK; }

int main(int argc,char **argv) {
    CHECK(argc==5);
    unsigned mtu=(unsigned)strtoul(argv[1],NULL,10),framed=(unsigned)strtoul(argv[2],NULL,10);
    unsigned scenario=(unsigned)strtoul(argv[3],NULL,10);
    size_t length=(size_t)strtoul(argv[4],NULL,10);
    driver=(vfs_driver_t){.stat=mock_stat,.open_file=mock_open,.close_file=mock_close,
        .read_file=mock_read,.write_file=mock_write,.open_dir=mock_open_dir,
        .read_dir=mock_read_dir,.close_dir=mock_close_dir,.abort_file=successful_abort};
    reset(mtu);if(framed)modern();
    file_length=length;read_calls=0;fail_close_for_read=false;
    uint8_t zero=0;
    if(scenario<2) {
        open_mode(VFS_MODE_READONLY);rejected_read(scenario==0);
        verify_full_read(length);close_good();
    } else if(scenario==2) {
        open_mode(VFS_MODE_READONLY);verify_full_read(length);
        /* A second valid READ at EOF is accepted and terminates once. */
        sends=0;file();finish_stream();CHECK(sends==1 && !replies[0].length);PENDING(false);
        close_good();
    } else if(scenario==3) {
        open_mode(VFS_MODE_READONLY);fail_read=true;
        file();CHECK(sends==1 && replies[0].status==DF_STATUS_ERR);PENDING(false);
        ready();CHECK(sends==1 && !file_offset);
        rejected_read(false);CHECK(file_chunk_state.err_code==VFS_ERR_FAIL);
        fail_read=false;verify_full_read(length);close_good();
    } else if(scenario==4 || scenario==5) {
        open_mode(VFS_MODE_WRITEONLY|VFS_MODE_CREATE);
        const uint8_t first[]={0,4,5,6},second[]={0,7,8,9,10};
        request(0x15,first,sizeof(first));ready();CHECK(written_length==3);
        rejected_read(scenario==4);
        request(0x15,second,sizeof(second));ready();
        const uint8_t all[]={4,5,6,7,8,9,10};
        CHECK(written_length==sizeof(all) && !memcmp(written_data,all,sizeof(all)));
        CHECK(write_calls==2 && !read_calls && file_chunk_state.err_code==VFS_OK);
        close_good();
    } else if(scenario==6) {
        rejected_read(true);rejected_read(false);
        sends=0;request(0x14,&zero,1);ready();CHECK(sends==1 && replies[0].status==DF_STATUS_ERR);PENDING(false);
        open_mode(VFS_MODE_READONLY);verify_full_read(length);close_good();
    } else if(scenario==7 || scenario==8) {
        open_mode(VFS_MODE_READONLY);file();PENDING(true);
        CHECK(replies[sends-1].chunk&0x8000);
        if(scenario==8) { fail_close_for_read=true;driver.abort_file=failed_abort; }
        ble_work_disconnected();ble_work_process(ble_on_disconnected);PENDING(false);
        CHECK(!m_tx_active && !m_df_ctx.cmd);
        if(scenario==8) {
            CHECK(file_chunk_state.opened && file_chunk_state.abandoned);
            driver.abort_file=successful_abort;df_proto_vfs_cleanup();
            CHECK(!file_chunk_state.opened);PENDING(false);fail_close_for_read=false;
        } else CHECK(!file_chunk_state.opened);
        unsigned before=sends;ready();CHECK(sends==before);
        ble_work_connected();ble_work_process(ble_on_disconnected);
        CHECK(!m_framed_rx);sends=attempts=0;if(framed)modern();
        open_mode(VFS_MODE_READONLY);verify_full_read(length);close_good();
    } else if(scenario==9) {
        open_mode(VFS_MODE_READONLY);verify_full_read(length);
        rejected_read(false);CHECK(file_chunk_state.err_code==VFS_ERR_EOF);
        close_good();open_mode(VFS_MODE_READONLY);verify_full_read(length);close_good();
    } else if(scenario==10) {
        open_mode(VFS_MODE_READONLY);overlong_read=true;file();
        CHECK(sends==1 && replies[0].status==DF_STATUS_ERR && !replies[0].length);PENDING(false);
        ready();CHECK(sends==1);overlong_read=false;close_good();
    } else if(scenario==11) {
        open_mode(VFS_MODE_READONLY);m_ble_nus_max_data_len=4;file();
        CHECK(sends==1 && replies[0].status==DF_STATUS_ERR && !read_calls);PENDING(false);
        ready();CHECK(sends==1);m_ble_nus_max_data_len=mtu-3;close_good();
    } else if(scenario==12) {
        open_mode(VFS_MODE_READONLY);file();PENDING(true);
        file_chunk_state.chunk=0x7fff;ready();
        CHECK(sends==2 && replies[1].status==DF_STATUS_ERR && !replies[1].length);PENDING(false);
        ready();CHECK(sends==2);close_good();
    } else return 2;
    CHECK(!critical_depth && !dfu_calls);
    printf("PASS READ lifecycle scenario%u length%zu framed%u MTU%u state_bytes%zu\n",
           scenario,length,framed,mtu,sizeof(file_chunk_state_t));
    return 0;
}
