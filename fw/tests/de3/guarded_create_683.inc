/* Guarded add runs through the production dispatcher and PackedFS adapter. */
static void guarded_contract(void) {
    enum sample { ROOT, NESTED, UNICODE, ALIAS, PROTECTED, BAD_HASH, STALE,
                  SWITCH_TO_STAGING, SWITCH_FROM_STAGING, LOST_RECEIPT, OPAQUE, JOURNAL };
    const uint16_t sizes[4] = {572,540,0,1};
    uint8_t payload[1500];
    for(unsigned what=ROOT; what<=JOURNAL; ++what) {
        fresh(sizes);
        if(what!=UNICODE) REQUIRE(!driver()->remove_file(paths[3]+2));
        const bool stage = what==SWITCH_FROM_STAGING;
        const char *parent=what==ROOT?"/":stage?"/~u0123456789":"/ordinary";
        if (what!=ROOT) REQUIRE(!driver()->create_dir(parent));
        if (what==ALIAS) REQUIRE(driver()->write_file_data("/ordinary/W",old_data,1)==1);
        if (what==PROTECTED || what==OPAQUE) {
            uint8_t raw[PFS_META_SIZE]; memset(raw,255,sizeof(raw));
            if(what==PROTECTED) REQUIRE(vfs_meta_set_readonly(raw,sizeof(raw),true));
            else { raw[0]=1;raw[1]=77; }
            REQUIRE(!pfs_setattr(store,parent,raw));
        }
        if (what==JOURNAL) {
            uint8_t raw[PFS_META_SIZE]; memset(raw,255,sizeof(raw));
            REQUIRE(pfs_replace(store,"/.pixl_txn_pending",old_data,1,raw)==1);
        }
        const uint64_t revision=vfs_packed_revision();
        df_frame_t cap={.cmd=DF_PROTO_CMD_VFS_GUARD_CAP};
        send_request(&cap);
        REQUIRE(reply_count==1 && replies[0].length==16 && !memcmp(replies[0].data,"PXGA\1\4\x3c\2",8));
        REQUIRE(!memcmp(replies[0].data+8,&revision,8));
        const size_t plen=strlen(parent);
        uint16_t n=0;
        payload[n++]=4;payload[n++]=(uint8_t)plen;memcpy(payload+n,parent,plen);n+=plen;
        for(unsigned i=0;i<4;i++) {
            payload[n++]=1;memcpy(payload+n,&sizes[i],2);n+=2;payload[n++]=(uint8_t)('w'+i);
            memcpy(payload+n,new_data+i,sizes[i]);n+=sizes[i];
        }
        REQUIRE(!mbedtls_sha256_ret(payload,n,payload+n,0));n+=32;
        if(what==BAD_HASH) payload[n-1]^=1;
        const uint32_t id=0x6823;
        df_frame_t f={.cmd=stage?DF_PROTO_CMD_VFS_GROUP_CREATE:DF_PROTO_CMD_VFS_GUARD_CREATE,.length=15};
        memcpy(f.data+1,&id,4);memcpy(f.data+5,&revision,8);memcpy(f.data+13,&n,2);
        reply_count=0;send_request(&f);REQUIRE(!reply_count && df_small_create_pending());
        f.data[0]=1;
        for (uint16_t off=0;off<n;) {
            const uint16_t take=n-off>236?236:n-off;
            f.length=(uint8_t)(7+take);memcpy(f.data+5,&off,2);memcpy(f.data+7,payload+off,take);
            send_request(&f);REQUIRE(!reply_count);off+=take;
        }
        if (what==STALE) REQUIRE(!driver()->create_dir("/changed"));
        if (what==LOST_RECEIPT) tx_fail_at=1;
        if (what==SWITCH_TO_STAGING) f.cmd=DF_PROTO_CMD_VFS_GROUP_CREATE;
        if (what==SWITCH_FROM_STAGING) f.cmd=DF_PROTO_CMD_VFS_GUARD_CREATE;
        nor_reset_observation(&media);
        const uint64_t before=vfs_packed_revision();
        f.length=5;f.data[0]=2;send_request(&f);
        REQUIRE(reply_count==1 && !df_small_create_pending() && !timer_context);
        const bool committed=what==ROOT || what==NESTED || what==LOST_RECEIPT;
        const bool deferred=what==UNICODE || what==OPAQUE;
        if(committed || deferred) {
            const uint64_t want=revision+(committed?1:0);
            REQUIRE(!replies[0].status && replies[0].length==14 && replies[0].data[0]==(committed?1:2));
            REQUIRE(replies[0].data[1]==(committed?4:0) && !memcmp(replies[0].data+2,&id,4));
            REQUIRE(!memcmp(replies[0].data+6,&want,8) && vfs_packed_revision()==want);
        } else REQUIRE(replies[0].status!=0 && vfs_packed_revision()==before);
        if (!committed) REQUIRE(!media.stats.programs && !media.stats.erases);
        if (what==LOST_RECEIPT) REQUIRE(aborts==1);
        if (committed) REQUIRE(!pfs_unmount(store) && !pfs_mount(store));
        for(unsigned i=0;i<4;i++) {
            char path[PFS_PATH_MAX]; snprintf(path,sizeof(path),"%s%s%c",parent,what==ROOT?"":"/",'w'+i);
            pfs_info_t info;int result=pfs_stat(store,path,&info);
            if (!committed) { REQUIRE(result==LFS_ERR_NOENT);continue; }
            REQUIRE(!result && info.size==sizes[i]);
            for(unsigned j=0;j<PFS_META_SIZE;j++) REQUIRE(info.meta[j]==255);
            uint8_t data[573];REQUIRE(driver()->read_file_data(path,data,sizeof(data))==sizes[i]);
            REQUIRE(!memcmp(data,new_data+i,sizes[i]));
        }
    }
    puts("PASS 12 guarded BLE transactions: add, fallback, denial, stale, mode crossover, journal and lost receipt");
}

