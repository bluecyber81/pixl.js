#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stddef.h>
#include <stdalign.h>
#include "spiffs.h"
#include "spiffs_nucleus.h"

/* Real SPIFFS, deterministic synthetic NOR; no hardware/device access. */
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"FAIL line %d: %s\n",__LINE__,#x); exit(71); } } while (0)
#define CAPACITY (2u*1024u*1024u)
#define FAULT (-12345)
static spiffs fs;
static spiffs_config cfg;
static uint8_t flash[CAPACITY], snapshot[CAPACITY], work[512];
static alignas(max_align_t) uint8_t fds[8*sizeof(spiffs_fd)], cache[(256+32)*4];
static uint32_t fail_address=UINT32_MAX;
static unsigned writes, erases, failures, partial_read;
static const char *original="/original.bin", *fresh="/new/.folder";
static const uint8_t contents[]={7,1,9,3,0,255,92};

static s32_t read_flash(u32_t address,u32_t length,u8_t *data) {
  CHECK(address<=cfg.phys_size && length<=cfg.phys_size-address);
  if(fail_address>=address && fail_address-address<length) {
    unsigned n=partial_read<length?partial_read:length;
    if(n)memcpy(data,flash+address,n);
    failures++; return FAULT;
  }
  memcpy(data,flash+address,length);return 0;
}
static s32_t write_flash(u32_t address,u32_t length,u8_t *data) {
  CHECK(address<=cfg.phys_size && length<=cfg.phys_size-address);
  CHECK(!length || length<=256u-(address&255u)); writes++;
  for(u32_t i=0;i<length;i++)flash[address+i]&=data[i];return 0;
}
static s32_t erase_flash(u32_t address,u32_t length) {
  CHECK(address<=cfg.phys_size && length<=cfg.phys_size-address);
  CHECK(!(address&4095u) && length==4096u);erases++;memset(flash+address,255,length);return 0;
}
static void mount_fs(void) {
  CHECK(SPIFFS_mount(&fs,&cfg,work,fds,sizeof fds,cache,sizeof cache,NULL)==0);
}
static spiffs_stat seed(unsigned capacity) {
  memset(&fs,0,sizeof fs);memset(&cfg,0,sizeof cfg);memset(flash,255,sizeof flash);
  fail_address=UINT32_MAX;partial_read=failures=0;writes=erases=0;
  cfg.phys_size=capacity;cfg.phys_erase_block=cfg.log_block_size=4096;cfg.log_page_size=256;
  cfg.hal_read_f=read_flash;cfg.hal_write_f=write_flash;cfg.hal_erase_f=erase_flash;
  (void)SPIFFS_mount(&fs,&cfg,work,fds,sizeof fds,cache,sizeof cache,NULL);
  SPIFFS_unmount(&fs);CHECK(SPIFFS_format(&fs)==0);mount_fs();
  spiffs_file fd=SPIFFS_open(&fs,original,SPIFFS_CREAT|SPIFFS_WRONLY,0);CHECK(fd>=0);
  CHECK(SPIFFS_write(&fs,fd,(void*)contents,sizeof contents)==sizeof contents);CHECK(SPIFFS_close(&fs,fd)==0);
  spiffs_stat st;CHECK(SPIFFS_stat(&fs,original,&st)==0);
  SPIFFS_unmount(&fs);mount_fs();writes=erases=0;memcpy(snapshot,flash,sizeof flash);return st;
}
static void verify_original(unsigned id) {
  spiffs_stat st;CHECK(SPIFFS_stat(&fs,original,&st)==0 && st.obj_id==id && st.size==sizeof contents);
  spiffs_file fd=SPIFFS_open(&fs,original,SPIFFS_RDONLY,0);CHECK(fd>=0);uint8_t actual[sizeof contents];
  CHECK(SPIFFS_read(&fs,fd,actual,sizeof actual)==sizeof actual);CHECK(!memcmp(actual,contents,sizeof actual));
  CHECK(SPIFFS_close(&fs,fd)==0);
}
static int operation(const char *which,spiffs_obj_id *chosen) {
  if(!strcmp(which,"allocator"))return spiffs_obj_lu_find_free_obj_id(&fs,chosen,NULL);
  if(!strcmp(which,"new"))return SPIFFS_creat(&fs,fresh,0);
  if(!strcmp(which,"same"))return SPIFFS_creat(&fs,original,0);
  CHECK(0);return 0;
}
static void fault_case(unsigned capacity,const char *which,unsigned partial) {
  spiffs_stat st=seed(capacity);fail_address=(uint32_t)st.pix*256u;partial_read=partial;
  spiffs_obj_id chosen=0x7fffu;
  int result=operation(which,&chosen);
  CHECK(result==FAULT && failures>0);
  CHECK(writes==0 && erases==0 && !memcmp(snapshot,flash,sizeof flash));
  if(!strcmp(which,"allocator"))CHECK(chosen==0x7fffu);
  else CHECK(SPIFFS_errno(&fs)==FAULT);
  fail_address=UINT32_MAX;verify_original(st.obj_id);
  if(!strcmp(which,"allocator")) {
    CHECK(operation(which,&chosen)==0 && chosen!=st.obj_id && chosen!=0 && chosen!=0xffff);
    CHECK(writes==0 && erases==0 && !memcmp(snapshot,flash,sizeof flash));
  } else if(!strcmp(which,"same")) {
    CHECK(operation(which,&chosen)==SPIFFS_ERR_CONFLICTING_NAME);
    CHECK(writes==0 && erases==0 && !memcmp(snapshot,flash,sizeof flash));
  } else {
    CHECK(operation(which,&chosen)==0);spiffs_stat added;
    CHECK(SPIFFS_stat(&fs,fresh,&added)==0 && added.obj_id!=st.obj_id);
    verify_original(st.obj_id);
  }
  printf("PASS capacity=%u operation=%s partial=%u: error propagated, zero writes, clean retry\n",capacity,which,partial);
}
static void healthy(unsigned capacity) {
  spiffs_stat st=seed(capacity);spiffs_obj_id chosen=0;
  CHECK(operation("allocator",&chosen)==0 && chosen!=st.obj_id && chosen!=0 && chosen!=0xffff);
  CHECK(!writes && !erases && !memcmp(snapshot,flash,sizeof flash));
  CHECK(SPIFFS_creat(&fs,fresh,0)==0);spiffs_stat added;CHECK(SPIFFS_stat(&fs,fresh,&added)==0);
  CHECK(added.obj_id!=st.obj_id);verify_original(st.obj_id);
  printf("PASS healthy capacity=%u distinct object IDs and preserved file bytes\n",capacity);
}
int main(int argc,char **argv) {
  if(argc==4) {fault_case(CAPACITY,argv[1],(unsigned)strtoul(argv[2],NULL,10));return 0;}
  CHECK(argc==1);
  unsigned cases=0;
  for(unsigned i=0;i<2;i++) {
    unsigned capacity=i?CAPACITY:256u*1024u;healthy(capacity);cases++;
    const char *ops[]={"new","same","allocator"};
    for(unsigned k=0;k<3;k++)for(unsigned p=0;p<3;p++) {
      /* Small bitmap allocation without name checking does not read headers. */
      if(!i && k==2)continue;
      fault_case(capacity,ops[k],p==0?0:p==1?4:sizeof(spiffs_page_object_ix_header)-1);cases++;
    }
  }
  printf("PASS %u allocator scenarios\n",cases);return 0;
}
