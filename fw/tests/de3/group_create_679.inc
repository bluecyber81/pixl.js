/* Actual df_core, storage adapter, persistence guard, PackedFS and LittleFS.
 * Test builds opt in with PIXL_GROUP_CREATE_ENABLE. */
static void group_contract(void) {
    const char *parent="/~u0123456789"; const size_t parent_length=strlen(parent);
    const uint16_t sizes[4]={572,540,0,1};
    uint8_t payload[1500];
    unsigned tests=0;
    for(unsigned what=0;what<11;what++) {
        fresh(sizes); REQUIRE(!driver()->create_dir(parent));
        if(what==4) REQUIRE(driver()->write_file_data("/~u0123456789/c",old_data,3)==3);
        if(what==5) {
            uint8_t raw[PFS_META_SIZE]; memset(raw,0xff,sizeof(raw));
            REQUIRE(vfs_meta_set_readonly(raw,sizeof(raw),true));REQUIRE(pfs_setattr(store,parent,raw)==0);
        }
        baseline_live=live;
        uint64_t revision=vfs_packed_revision();
        payload_capacity=what==0?16:243;
        df_frame_t cap={.cmd=DF_PROTO_CMD_VFS_GROUP_CAP};reply_count=0;send_request(&cap);
        REQUIRE(reply_count==1 && replies[0].length==16 && !memcmp(replies[0].data,"PXBG\1\4\x3c\2",8));
        REQUIRE(!memcmp(replies[0].data+8,&revision,8));
        const uint32_t id=0x4209;
        uint16_t n=0;payload[n++]=4;payload[n++]=(uint8_t)parent_length;
        memcpy(payload+n,parent,parent_length);n+=parent_length;
        for(unsigned i=0;i<4;i++){
            payload[n++]=1;memcpy(payload+n,&sizes[i],2);n+=2;payload[n++]=(uint8_t)('a'+i);
            memcpy(payload+n,new_data+i,sizes[i]);n+=sizes[i];
        }
        REQUIRE(mbedtls_sha256_ret(payload,n,payload+n,0)==0);n+=32;
        if(what==3)payload[n-1]^=1;
        df_frame_t f={.cmd=DF_PROTO_CMD_VFS_GROUP_CREATE,.length=15};
        memcpy(f.data+1,&id,4);memcpy(f.data+5,&revision,8);memcpy(f.data+13,&n,2);
        reply_count=0;send_request(&f);REQUIRE(!reply_count && df_small_create_pending());
        if(what==6){event(DF_EVENT_LINK_DISCONNECTED);REQUIRE(live==baseline_live && !timer_context);++tests;continue;}
        if(what==7){timer_callback(timer_context);df_proto_vfs_expire_small();REQUIRE(live==baseline_live && !timer_context);++tests;continue;}
        if(what==8){send_request(&cap);REQUIRE(live==baseline_live && reply_count==1 && !timer_context);++tests;continue;}
        f.data[0]=1;
        for(uint16_t off=0;off<n;){
            uint16_t take=n-off;if(take>payload_capacity-7)take=(uint16_t)(payload_capacity-7);
            f.length=(uint8_t)(7+take);memcpy(f.data+5,&off,2);memcpy(f.data+7,payload+off,take);
            send_request(&f);REQUIRE(!reply_count);off+=take;
        }
        if(what==2) { REQUIRE(!driver()->create_dir("/foreign")); }
        if(what==9)recovery_mode=true;
        if(what==10)tx_fail_at=1;
        f.length=5;f.data[0]=2;send_request(&f);
        REQUIRE(reply_count==1 && !df_small_create_pending() && live==baseline_live && !timer_context);
        bool committed=what<=1 || what==10;
        REQUIRE((replies[0].status==0)==committed);
        pfs_info_t info;
        if(committed){
            uint64_t after=vfs_packed_revision();
            REQUIRE(after==revision+1 && replies[0].length==14 && replies[0].data[0]==1 && replies[0].data[1]==4);
            REQUIRE(!memcmp(replies[0].data+2,&id,4) && !memcmp(replies[0].data+6,&after,8));
            if(what==10)REQUIRE(aborts==1);
            REQUIRE(!pfs_unmount(store) && !pfs_mount(store));
            for(unsigned i=0;i<4;i++){
                char path[32];snprintf(path,sizeof(path),"%s/%c",parent,'a'+i);
                uint8_t data[573];
                REQUIRE(driver()->read_file_data(path,data,sizeof(data))==sizes[i]);
                REQUIRE(!memcmp(data,new_data+i,sizes[i]));
                REQUIRE(!pfs_stat(store,path,&info));
                for(unsigned k=0;k<128;k++)REQUIRE(info.meta[k]==255);
            }
        } else {
            REQUIRE(pfs_stat(store,"/~u0123456789/a",&info)==LFS_ERR_NOENT);
            if(what==4){uint8_t data[4];REQUIRE(driver()->read_file_data("/~u0123456789/c",data,sizeof(data))==3 && !memcmp(data,old_data,3));}
        }
        ++tests;
    }
    recovery_mode=false;
    puts("PASS 11 actual bulk firmware cases, ACL/CAS/preexisting, reset/disconnect/timeout, corrupt digest, RCPT loss, live heap released");
    REQUIRE(tests==11);
}

