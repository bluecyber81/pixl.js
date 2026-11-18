static void small_read_request(const char *path,uint16_t size) {
    size_t n=strlen(path);
    df_frame_t f={.cmd=DF_PROTO_CMD_VFS_SMALL_READ,.length=(uint8_t)(n+4)};
    f.data[0]=(uint8_t)n;memcpy(f.data+2,path,n);memcpy(f.data+2+n,&size,2);
    send_request(&f);
}

static void small_read_contract(void) {
    small_baseline();
    const char *path="E:/~u12345678/r.bin";
    df_event_t ready={.type=DF_EVENT_DATA_TRANSMIT_READY};
    const uint16_t sizes[]={0,1,16,243,244,486,540,572};
    for(size_t i=0;i<sizeof(sizes)/sizeof(sizes[0]);i++){
        uint16_t size=sizes[i],offset=0,chunk=0;
        REQUIRE(driver()->write_file_data(path+2,new_data,size)==size);
        size_t owned=live;
        small_read_request(path,size);
        for(;;){
            REQUIRE(answer.cmd==DF_PROTO_CMD_VFS_SMALL_READ && !answer.status);
            REQUIRE((answer.chunk&0x7fff)==chunk++ && offset+answer.length<=size);
            REQUIRE(!memcmp(answer.data,new_data+offset,answer.length));
            offset+=answer.length;
            if(!(answer.chunk&0x8000))break;
            REQUIRE(!df_proto_vfs_is_idle() && live>owned);
            df_proto_handler_vfs_small_read(&ready);
        }
        REQUIRE(offset==size && live==owned && df_proto_vfs_is_idle());
        small_read_request(path,size+1);REQUIRE(answer.status && live==owned);
        if(size){small_read_request(path,size-1);REQUIRE(answer.status && live==owned);}
    }
    small_read_request("I:/~u12345678/r.bin",572); REQUIRE(answer.status);
    small_read_request("E:/../r.bin",1); REQUIRE(answer.status);
    small_read_request(path,573); REQUIRE(answer.status);
    small_read_request(path,572); REQUIRE(!answer.status && (answer.chunk&0x8000));
    df_proto_vfs_cleanup(); REQUIRE(!small_read.bytes && df_proto_vfs_is_idle());
    puts("PASS exact small read, fragmented, empty, short/growing, cancelled and no retained allocation");
}
