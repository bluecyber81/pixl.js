/* Appended to the existing real SPIFFS/VFS/DF lifecycle harness. No device I/O. */
static unsigned stat_calls, remove_calls;
static int32_t counted_stat(const char *path,vfs_obj_t *obj) {
    stat_calls++; return vfs_spiffs_stat_file(path,obj);
}
static int32_t counted_remove(const char *path) {
    remove_calls++; return guarded_remove(path);
}
static int32_t counted_remove_dir(const char *path) {
    remove_calls++; return guarded_remove_dir(path);
}
static void seed_file(const char *path,uint8_t value) {
    uint8_t data[20];memset(data,value,sizeof(data));
    assert(vfs_spiffs_write_file_data(path,data,sizeof(data))==sizeof(data));
}
static void check_file(const char *path,uint8_t value) {
    uint8_t data[21];assert(vfs_spiffs_read_file_data(path,data,sizeof(data))==20);
    for(unsigned i=0;i<20;i++)assert(data[i]==value);
}
static bool file_exists(const char *path) {
    spiffs_stat st;return SPIFFS_stat(&fs,path,&st)==SPIFFS_OK;
}
static void open_path(uint32_t flags) {
    const char *path="E:/parent/data.bin";uint8_t data[80];uint16_t n=(uint16_t)strlen(path);
    memcpy(data,&n,2);memcpy(data+2,path,n);data[n+2]=(uint8_t)flags;
    request(DF_PROTO_CMD_VFS_FILE_OPEN,data,n+3);assert(last_reply.status==DF_STATUS_OK);
}
static void remove_path(const char *path) {
    uint16_t n=(uint16_t)strlen(path);
    df_frame_t frame={.cmd=DF_PROTO_CMD_VFS_REMOVE,.length=(uint8_t)(n+2)};
    memcpy(frame.data,&n,2);memcpy(frame.data+2,path,n);
    df_event_t event={DF_EVENT_DATA_RECEVIED,&frame};df_proto_handler_vfs_remove(&event);
    assert(last_reply.cmd==DF_PROTO_CMD_VFS_REMOVE);
}
static void assert_removed(const char *path) {
    assert(!file_exists(path));
    if(!strcmp(path,"/parent")) {
        assert(!file_exists("/parent/data.bin"));assert(!file_exists("/parent/.folder"));
    }
}
int main(int argc,char **argv) {
    assert(argc==3);const char *state=argv[1],*target=argv[2];uint8_t zero=0;
    const char *path=!strcmp(target,"file")?"E:/parent/data.bin":
                     !strcmp(target,"parent")?"E:/parent":"E:/unrelated.bin";
    capacity=4u*1024u*1024u;flash=malloc(capacity);assert(flash);memset(flash,255,capacity);
    assert(mount_fs()==0);SPIFFS_unmount(&fs);assert(SPIFFS_format(&fs)==0);assert(mount_fs()==0);
    vfs_persist_bind(&vfs_driver_fs,&lifecycle_raw);protocol_driver=vfs_driver_fs;
    protocol_driver.stat_file=counted_stat;protocol_driver.remove_file=counted_remove;
    protocol_driver.remove_dir=counted_remove_dir;
    seed_file("/parent/.folder",0x12);seed_file("/parent/data.bin",0x31);
    seed_file("/unrelated.bin",0x45);seed_file("/parent2/keep.bin",0x56);
    bool reader=!strcmp(state,"read"),abandoned=!strcmp(state,"abandoned");
    bool failed_close=!strcmp(state,"failed_close");
    bool held=reader||abandoned||failed_close||!strcmp(state,"write");
    if(held) {
        open_path(reader?VFS_MODE_READONLY:VFS_MODE_WRITEONLY);
        if(!reader)cached_payload();
        if(abandoned||failed_close) {
            fail_on_close=true;
            if(abandoned) {protocol_driver.abort_file=abort_failure;df_proto_vfs_cleanup();}
            else {request(DF_PROTO_CMD_VFS_FILE_CLOSE,&zero,1);assert(last_reply.status==DF_STATUS_ERR);}
        }
        assert(file_chunk_state.opened && file_chunk_state.abandoned==abandoned);
        assert(open_fds()==1 && tracked_writers()==!reader && external_writers==!reader);
        void *handle=file_chunk_state.vfs_fd.handle;
        uint8_t cache_before[sizeof(cache)];memcpy(cache_before,cache,sizeof(cache));
        uint8_t *before=malloc(capacity);assert(before);memcpy(before,flash,capacity);
        unsigned writes_before=writes,reads_before=reads,erases_before=erases;
        /* Repeated rejection must neither mutate nor quietly close the owner. */
        for(unsigned i=0;i<20;i++) {
            remove_path(path);
            assert(last_reply.status==DF_STATUS_ERR && last_reply.length==0);
            assert(stat_calls==0 && remove_calls==0);
            assert(writes==writes_before && reads==reads_before && erases==erases_before);
            assert(!memcmp(before,flash,capacity) && !memcmp(cache_before,cache,sizeof(cache)));
            assert(file_chunk_state.opened && file_chunk_state.abandoned==abandoned);
            assert(file_chunk_state.vfs_fd.handle==handle && open_fds()==1);
            assert(tracked_writers()==!reader && external_writers==!reader);
        }
        free(before);fail_on_close=false;protocol_driver.abort_file=guarded_abort;
        if(abandoned)df_proto_vfs_cleanup();
        else {request(DF_PROTO_CMD_VFS_FILE_CLOSE,&zero,1);assert(last_reply.status==DF_STATUS_OK);}
        assert(!file_chunk_state.opened);empty_owners();
        check_file("/parent/data.bin",reader||abandoned?0x31:0x63);
        remove_path(path);assert(last_reply.status==DF_STATUS_OK && stat_calls==1 && remove_calls==1);
        assert_removed(path+2);
        /* A following transfer and journal write must both remain usable. */
        open_path(VFS_MODE_WRITEONLY|VFS_MODE_CREATE|VFS_MODE_TRUNC);cached_payload();
        request(DF_PROTO_CMD_VFS_FILE_CLOSE,&zero,1);assert(last_reply.status==DF_STATUS_OK);empty_owners();
        check_file("/parent/data.bin",0x63);
        uint8_t settings[9];memset(settings,0x7a,sizeof(settings));
        assert(vfs_persist_write((vfs_driver_t*)&vfs_driver_fs,"/settings-test.bin",settings,sizeof(settings))==sizeof(settings));
        uint8_t readback[10];assert(vfs_spiffs_read_file_data("/settings-test.bin",readback,sizeof(readback))==sizeof(settings));
        assert(!memcmp(settings,readback,sizeof(settings)));empty_owners();
    } else {
        if(!strcmp(state,"normal")) {
            open_path(VFS_MODE_WRITEONLY);cached_payload();
            request(DF_PROTO_CMD_VFS_FILE_CLOSE,&zero,1);assert(last_reply.status==DF_STATUS_OK);empty_owners();
            remove_path(path);assert(last_reply.status==DF_STATUS_OK);assert_removed(path+2);
            assert(stat_calls==1 && remove_calls==1);
        } else if(!strcmp(state,"io_error")) {
            write_failure=-12345;remove_path(path);write_failure=0;
            assert(last_reply.status==DF_STATUS_ERR && stat_calls==1 && remove_calls==1);
            check_file("/parent/data.bin",0x31);check_file("/unrelated.bin",0x45);
            remove_path(path);assert(last_reply.status==DF_STATUS_OK);assert_removed(path+2);
        } else if(!strcmp(state,"missing")) {
            remove_path("E:/missing.bin");assert(last_reply.status==DF_STATUS_ERR);
            assert(stat_calls==1 && remove_calls==0);
        } else assert(0);
        empty_owners();
    }
    check_file("/parent2/keep.bin",0x56);empty_owners();
    SPIFFS_unmount(&fs);assert(mount_fs()==0);check_file("/parent2/keep.bin",0x56);
    if(held)check_file("/parent/data.bin",0x63);
    SPIFFS_unmount(&fs);free(flash);
    printf("PASS state=%s target=%s: ownership, content, errors, next transfer and remount\n",state,target);
}
