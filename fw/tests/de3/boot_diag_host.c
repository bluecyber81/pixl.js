/* Actual protocol/module and SDK hash/CRC; fixed registers/flash are synthetic. */
static uint8_t snapshot[BOOT_DIAG_SIZE];
static uint32_t get32(const uint8_t *p) { uint32_t n; memcpy(&n,p,4); return n; }
static void set32(unsigned address,uint32_t n) { memcpy(test_flash+address,&n,4); }
static uint16_t flags(void) { return snapshot[6] | (uint16_t)snapshot[7]<<8; }
static void set_settings_crc(void) { set32(0x7f000,crc32_compute(test_flash+0x7f004,88,NULL)); }
static void boot_setup(void) {
    ficr.CODEPAGESIZE=4096; ficr.CODESIZE=128;
    ficr.INFO.PART=0x52832; ficr.INFO.VARIANT=0x41414230; ficr.INFO.FLASH=512; ficr.INFO.RAM=64;
    uicr.NRFFW[0]=0x77000; uicr.NRFFW[1]=0x7e000;
    for(unsigned i=0;i<sizeof(test_flash);i++)test_flash[i]=(uint8_t)(i*17u+3u);
    set32(0xff8,0xffffffffu); set32(0xffc,0xffffffffu);
    test_flash[0x3000]=44; set32(0x3004,0x51b1e5db); set32(0x3008,0x19000);
    set32(0x300c,0x0103); set32(0x3010,112); set32(0x3014,7002000);
    set32(0x77000,0x20010000); set32(0x77004,0x77081);
    set32(0x7f004,2); set32(0x7f008,578); set32(0x7f00c,42); set_settings_crc();
    flash_reads=0;
}
static void snap(void) {
    uint32_t before=crc32_compute(test_flash,sizeof(test_flash),NULL);
    CHECK(boot_diag_snapshot(snapshot,sizeof(snapshot)));
    CHECK(!memcmp(snapshot,"PXBD",4)&&snapshot[4]==1);
    CHECK(before==crc32_compute(test_flash,sizeof(test_flash),NULL));
}
static void zero_hash(void) {
    uint8_t zero[32]={0}; CHECK(!(flags()&32)); CHECK(!get32(snapshot+76));
    CHECK(!memcmp(snapshot+80,zero,32));
}
int main(int argc,char **argv) {
    CHECK(argc==3); unsigned scenario=(unsigned)atoi(argv[1]),mtu=(unsigned)atoi(argv[2]);
    driver=(vfs_driver_t){.open_file=mock_open,.close_file=mock_close,.read_file=mock_read,
        .write_file=mock_write,.open_dir=mock_open_dir,.read_dir=mock_read_dir,.close_dir=mock_close_dir,.stat=mock_stat};
    reset(mtu); boot_setup();
    if(scenario==0) {
        snap(); CHECK(flags()==0x1bf && snapshot[5]==2);
        CHECK(get32(snapshot+48)==0x77000 && get32(snapshot+52)==0x7f000);
        CHECK(get32(snapshot+60)==578 && get32(snapshot+64)==42);
        CHECK(get32(snapshot+68)==get32(snapshot+72) && get32(snapshot+76)==0x7000);
        CHECK(get32(snapshot+120)==0x7e000);
        printf("WIRE ");for(unsigned i=0;i<sizeof(snapshot);i++)printf("%02x",snapshot[i]);puts("");
    } else if(scenario==1) {
        for(unsigned i=0;i<7;i++) {
            boot_setup();
            switch(i) {case 0:ficr.INFO.PART=0x52840;break;case 1:ficr.INFO.FLASH=256;break;
            case 2:ficr.INFO.RAM=32;break;case 3:ficr.CODEPAGESIZE=0;break;
            case 4:ficr.CODEPAGESIZE=UINT32_MAX;break;case 5:ficr.CODESIZE=0;break;
            case 6:ficr.INFO.RAM=UINT32_MAX;break;}
            snap(); CHECK(!flags()&&!flash_reads&&!snapshot[5]); zero_hash();
            CHECK(!get32(snapshot+44)&&!get32(snapshot+48)&&!get32(snapshot+52));
            CHECK(!get32(snapshot+116)&&!get32(snapshot+120));
        }
    } else if(scenario==2) {
        const uint32_t invalid[]={0,0xffffffffu,0x10001000,0x20000000,0x77004,0x75000,0x7e000,0x7f000};
        for(unsigned i=0;i<sizeof(invalid)/sizeof(*invalid);i++) {
            boot_setup(); uicr.NRFFW[0]=invalid[i]; snap();
            CHECK(!(flags()&4)&&!(flags()&128)&&!get32(snapshot+48));zero_hash();
        }
    } else if(scenario==3) {
        set32(0xff8,0x77000);uicr.NRFFW[0]=0x78000;snap();
        CHECK(snapshot[5]==1&&(flags()&64)&&get32(snapshot+48)==0x77000);
        set32(0xff8,0);uicr.NRFFW[0]=0x77000;snap();
        CHECK(snapshot[5]==1&&(flags()&64)&&!get32(snapshot+48));zero_hash();
        set32(0xff8,UINT32_MAX);uicr.NRFFW[0]=UINT32_MAX;snap(); CHECK(snapshot[5]==0);zero_hash();
    } else if(scenario==4) {
        const uint32_t invalid[]={0,0x20000000,0x20010008,0x2000fffc,0xffffffffu};
        for(unsigned i=0;i<sizeof(invalid)/sizeof(*invalid);i++) {
            boot_setup();set32(0x77000,invalid[i]);snap();CHECK(flags()&4);CHECK(!(flags()&128));zero_hash();
        }
        set32(0x77000,0x20000008);snap();CHECK(flags()&32);
        set32(0x77000,0x20010000);snap();CHECK(flags()&32);
    } else if(scenario==5) {
        const uint32_t invalid[]={0,0xffffffffu,0x77080,0x76fff,0x7e001};
        for(unsigned i=0;i<sizeof(invalid)/sizeof(*invalid);i++) {
            boot_setup();set32(0x77004,invalid[i]);snap();CHECK(!(flags()&128));zero_hash();
        }
        set32(0x77004,0x77001);snap();CHECK(flags()&32);
        set32(0x77004,0x7dfff);snap();CHECK(flags()&32);
    } else if(scenario==6) {
        set32(0x7f008,579);snap();CHECK((flags()&8)&&!(flags()&16));
        CHECK(!get32(snapshot+60)&&!get32(snapshot+64));
        set32(0x7f000,UINT32_MAX);snap();CHECK(!(flags()&16));
    } else if(scenario==7) {
        const uint32_t unknown[]={0,1,3,UINT32_MAX};
        for(unsigned i=0;i<sizeof(unknown)/sizeof(*unknown);i++) {
            boot_setup();set32(0x7f004,unknown[i]);set_settings_crc();snap();
            CHECK(!(flags()&8)&&!(flags()&16));CHECK(get32(snapshot+56)==unknown[i]);
            CHECK(!get32(snapshot+60)&&!get32(snapshot+64)&&!get32(snapshot+72));
        }
    } else if(scenario==8) {
        const uint32_t invalid[]={0,0x7d000,0x7f000,UINT32_MAX,0x7e004};
        for(unsigned i=0;i<sizeof(invalid)/sizeof(*invalid);i++) {
            boot_setup();uicr.NRFFW[1]=invalid[i];snap();CHECK(!(flags()&256));zero_hash();
        }
        boot_setup();set32(0xffc,0x7d000);snap();CHECK(!(flags()&256));zero_hash();
        boot_setup();set32(0xffc,0x7e000);uicr.NRFFW[1]=0;snap();CHECK(flags()&256);CHECK(flags()&32);
    } else if(scenario==9) {
        snap();uint8_t digest[32];memcpy(digest,snapshot+80,32);
        test_flash[0x7e100]^=0xff;test_flash[0x7f100]^=0xff;snap();CHECK(!memcmp(digest,snapshot+80,32));
        test_flash[0x7dfff]^=0xff;snap();CHECK(memcmp(digest,snapshot+80,32));
    } else if(scenario==10) {
        set32(0x3004,0);snap();CHECK(!(flags()&2));
        CHECK(!get32(snapshot+28)&&!get32(snapshot+32)&&!get32(snapshot+36));
    } else if(scenario==11) {
        uint8_t guarded[132];memset(guarded,0xa5,sizeof(guarded));
        CHECK(!boot_diag_snapshot(NULL,128));CHECK(!boot_diag_snapshot(guarded+2,127));
        CHECK(!flash_reads);for(unsigned i=0;i<sizeof(guarded);i++)CHECK(guarded[i]==0xa5);
        CHECK(boot_diag_snapshot(guarded+2,128));CHECK(guarded[0]==0xa5&&guarded[1]==0xa5&&guarded[130]==0xa5&&guarded[131]==0xa5);
    } else if(scenario==12) {
        modern();request(7,NULL,0);finish_stream();uint8_t merged[128];
        CHECK(merge(merged,sizeof(merged),7)==128);snap();CHECK(!memcmp(merged,snapshot,128));
        CHECK(!dfu_calls&&!disable_calls&&!write_calls&&!critical_depth);
    } else if(scenario==13) {
        modern();uint8_t invalid=0;request(7,&invalid,1);finish_stream();
        CHECK(sends==1&&replies[0].status==DF_STATUS_ERR&&!replies[0].length&&!flash_reads);
        CHECK(!dfu_calls&&!disable_calls&&!write_calls);
    } else if(scenario==14) {
        modern();open_file();request(7,NULL,0);finish_stream();
        CHECK(sends==1&&replies[0].status==DF_STATUS_ERR&&!flash_reads&&!file_closes);
        CHECK(!dfu_calls&&!disable_calls&&!write_calls);
    } else if(scenario==15) {
        /* Direct handler tests reject status/chunk and ignore non-RX events.
         * The real core already rejects invalid frames before dispatch. */
        df_frame_t in={0};df_event_t event={.type=DF_EVENT_DATA_RECEVIED,.df=&in};
        in.status=1;df_proto_handler_info_boot_diagnostic(&event);CHECK(!flash_reads);
        in.status=0;in.chunk=1;df_proto_handler_info_boot_diagnostic(&event);CHECK(!flash_reads);
        event.type=DF_EVENT_DATA_TRANSMIT_READY;df_proto_handler_info_boot_diagnostic(&event);CHECK(!flash_reads);
    } else if(scenario==16) {
        /* Exact maximum region accepted; the page below is not. */
        uicr.NRFFW[0]=0x76000;set32(0x76000,0x20010000);set32(0x76004,0x76081);snap();
        CHECK((flags()&32)&&get32(snapshot+76)==0x8000);
        uicr.NRFFW[0]=0x75000;snap();CHECK(!(flags()&4));zero_hash();
    } else CHECK(0);
    printf("PASS boot diagnostic scenario %u MTU %u (mock hardware)\n",scenario,mtu);
    return 0;
}
