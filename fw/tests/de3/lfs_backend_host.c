/* Real littlefs 2.8 + complete VFS driver + persistence journal.
 * Only synchronous SPI flash and mui heap are simulated. */
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "hal_spi_flash.h"
#include "vfs.h"
#include "vfs_persist.h"
#define CHECK(x) do {if(!(x)){fprintf(stderr,"CHECK %d: %s\n",__LINE__,#x);exit(71);}}while(0)
#define BLOCKS 32u
static uint8_t disk[BLOCKS*4096], saved[BLOCKS*4096];
static unsigned reads,programs,erases,allocated,alloc_calls,fail_alloc;
static unsigned fail_read,fail_program,fail_erase;
static unsigned geometry_blocks=BLOCKS,geometry_page=256,geometry_block=4096;
static int init_error,info_error;
ret_code_t hal_spi_flash_init(void){return init_error;}
ret_code_t hal_spi_flash_info(flash_info_t *info){
 info->page_size=geometry_page;info->block_size=geometry_block;info->block_count=geometry_blocks;return info_error;
}
ret_code_t hal_spi_flash_read(uint32_t a,void*b,size_t n){
 reads++;if(reads==fail_read)return 7;CHECK(a<=sizeof(disk)&&n<=sizeof(disk)-a);memcpy(b,disk+a,n);return 0;
}
ret_code_t hal_spi_flash_prog(uint32_t a,const void*b,size_t n){
 programs++;if(programs==fail_program)return 7;CHECK(a<=sizeof(disk)&&n<=sizeof(disk)-a);
 const uint8_t*p=b;for(size_t i=0;i<n;i++){CHECK((disk[a+i]&p[i])==p[i]);disk[a+i]&=p[i];}return 0;
}
ret_code_t hal_spi_flash_erase(uint32_t a){
 erases++;if(erases==fail_erase)return 7;CHECK(a%4096==0 && a<sizeof(disk));memset(disk+a,255,4096);return 0;
}
void *mui_mem_malloc(size_t n){alloc_calls++;if(alloc_calls==fail_alloc)return NULL;void*p=malloc(n);CHECK(p);allocated++;return p;}
void mui_mem_free(void*p){if(p){CHECK(allocated);allocated--;free(p);}}
#include "vfs_driver_lfs.c"
static const vfs_driver_t *driver=&vfs_driver_fs;
static uint8_t data[2048],copy[2048],meta[128];
static void reset_faults(void){fail_alloc=fail_read=fail_program=fail_erase=0;}
static void fresh(void){
 CHECK(!allocated);memset(disk,255,sizeof(disk));mounted=false;memset(&lfs,0,sizeof(lfs));
 vfs_persist_unmounted(driver);reset_faults();CHECK(driver->format()==VFS_OK);CHECK(!driver->mounted());
 CHECK(driver->mount()==VFS_OK);CHECK(driver->mounted());
 for(unsigned i=0;i<sizeof(data);i++)data[i]=(uint8_t)(i*13+7);
 for(unsigned i=0;i<sizeof(meta);i++)meta[i]=(uint8_t)(i*7+1);
}
static void finish(void){CHECK(!allocated);CHECK(!lfs.mlist);CHECK(driver->umount()==VFS_OK);CHECK(!mounted);}
static void write_data(const char*p,size_t n){CHECK(driver->write_file_data(p,data,n)==(int)n);}
static void check_data(const char*p,size_t n){memset(copy,0,sizeof(copy));CHECK(driver->read_file_data(p,copy,sizeof(copy))==(int)n);CHECK(!memcmp(copy,data,n));}
static void drop_read_cache(void){lfs.rcache.block=(lfs_block_t)-1;}
int main(int argc,char **argv){
 CHECK(argc==2);int scenario=atoi(argv[1]);
 if(scenario==0){
  memset(disk,0xa5,sizeof(disk));memcpy(saved,disk,sizeof(disk));
  int status=driver->mount();
  if(status!=VFS_ERR_CRPT || programs || erases)fprintf(stderr,"mount=%d prog=%u erase=%u\n",status,programs,erases);
  CHECK(status==VFS_ERR_CRPT);CHECK(!mounted && !programs && !erases && !memcmp(disk,saved,sizeof(disk)));
  vfs_stat_t stat;CHECK(driver->stat(&stat)==VFS_OK && !stat.avaliable && !stat.total_bytes && !stat.free_bytes);
  vfs_file_t file;CHECK(driver->open_file("/x",&file,VFS_MODE_READONLY)==VFS_ERR_NODEV);
  CHECK(driver->write_file_data("/x",data,1)==VFS_ERR_NODEV);
  CHECK(!programs && !erases && !memcmp(disk,saved,sizeof(disk)));goto done;
 }
 if(scenario==1){
  geometry_blocks=0;CHECK(driver->mount()==VFS_ERR_UNSUPT);geometry_blocks=BLOCKS;geometry_page=128;
  CHECK(driver->format()==VFS_ERR_UNSUPT);geometry_page=256;geometry_blocks=4097;
  CHECK(driver->mount()==VFS_ERR_UNSUPT);geometry_blocks=BLOCKS;init_error=1;
  CHECK(driver->mount()==VFS_ERR_NODEV);init_error=0;info_error=1;
  CHECK(driver->format()==VFS_ERR_NODEV);CHECK(!reads&&!programs&&!erases);goto done;
 }
 fresh();
 switch(scenario){
 case 2:{
  write_data("/tag.bin",540);CHECK(driver->update_file_meta("/tag.bin",meta,96)==VFS_OK);
  vfs_obj_t obj;CHECK(driver->stat_file("/tag.bin",&obj)==VFS_OK && obj.size==540 && obj.type==VFS_TYPE_REG);
  CHECK(!memcmp(obj.meta,meta,96));for(unsigned i=96;i<128;i++)CHECK(!obj.meta[i]);check_data("/tag.bin",540);
  CHECK(driver->umount()==VFS_OK && driver->mount()==VFS_OK);check_data("/tag.bin",540);
  CHECK(driver->stat_file("/tag.bin",&obj)==VFS_OK && !memcmp(obj.meta,meta,96));break;
 }
 case 3:{
  CHECK(driver->create_dir("/empty")==VFS_OK);CHECK(driver->update_file_meta("/empty",meta,128)==VFS_OK);
  vfs_dir_t d;vfs_obj_t o;CHECK(driver->open_dir("/",&d)==VFS_OK);CHECK(driver->read_dir(&d,&o)==VFS_OK);
  CHECK(!strcmp(o.name,"empty")&&o.type==VFS_TYPE_DIR&&!memcmp(o.meta,meta,128));
  CHECK(driver->read_dir(&d,&o)==VFS_ERR_EOF && driver->close_dir(&d)==VFS_OK && !d.handle);
  CHECK(driver->open_dir("/empty",&d)==VFS_OK);CHECK(driver->read_dir(&d,&o)==VFS_ERR_EOF);CHECK(driver->close_dir(&d)==VFS_OK);
  CHECK(driver->umount()==VFS_OK && driver->mount()==VFS_OK);CHECK(driver->stat_file("/empty",&o)==VFS_OK && o.type==VFS_TYPE_DIR);break;
 }
 case 4:{
  const char*bad[]={"x","/a//b","/a/../b","/./a","/a/","/"};
  unsigned before=programs;for(unsigned i=0;i<sizeof(bad)/sizeof(*bad);i++)CHECK(driver->write_file_data(bad[i],data,1)<0);
  char big[65];memset(big,'x',64);big[0]='/';big[64]=0;vfs_obj_t obj;CHECK(driver->stat_file(big,&obj)==VFS_ERR_MAXNM);
  char longname[50];memset(longname,'n',49);longname[0]='/';longname[49]=0;CHECK(driver->create_dir(longname)==VFS_ERR_MAXNM);
  CHECK(programs==before);break;
 }
 case 5:{
  vfs_file_t f;fail_alloc=alloc_calls+1;CHECK(driver->open_file("/x",&f,VFS_MODE_CREATE|VFS_MODE_WRITEONLY)==VFS_ERR_NOMEM && !f.handle);
  reset_faults();vfs_dir_t d;fail_alloc=alloc_calls+1;CHECK(driver->open_dir("/",&d)==VFS_ERR_NOMEM && !d.handle);
  reset_faults();CHECK(driver->open_file("/missing",&f,VFS_MODE_READONLY)==VFS_ERR_NOOBJ && !f.handle && !allocated);
  CHECK(driver->open_dir("/missing",&d)==VFS_ERR_NOOBJ && !d.handle && !allocated);
  CHECK(vfs_persist_recover((vfs_driver_t*)driver)==VFS_OK);break;
 }
 case 6:{
  write_data("/a",32);write_data("/b",32);CHECK(driver->rename_file("/a","/b")==VFS_ERR_OBJEX);check_data("/a",32);check_data("/b",32);
  CHECK(driver->create_dir("/dir")==VFS_OK);CHECK(driver->create_dir("/other")==VFS_OK);
  CHECK(driver->rename_dir("/dir","/other")==VFS_ERR_OBJEX);CHECK(driver->rename_dir("/dir","/dir/sub")<0);
  CHECK(driver->rename_file("/a","/dir")==VFS_ERR_OBJEX);CHECK(driver->rename_file("/dir","/wrong")<0);
  CHECK(driver->rename_dir("/dir","/renamed")==VFS_OK);CHECK(driver->rename_file("/a","/renamed/a")==VFS_OK);check_data("/renamed/a",32);break;
 }
 case 7:{
  CHECK(driver->create_dir("/d")==VFS_OK);CHECK(driver->create_dir("/d/e")==VFS_OK);CHECK(driver->create_dir("/d/e/empty")==VFS_OK);
  write_data("/d/a",540);write_data("/d/e/b",2048);write_data("/keep",32);
  CHECK(driver->remove_dir("/")<0);CHECK(driver->remove_dir("/keep")<0);CHECK(driver->remove_dir("/d")==VFS_OK);
  vfs_obj_t o;CHECK(driver->stat_file("/d",&o)==VFS_ERR_NOOBJ);check_data("/keep",32);break;
 }
 case 8:{
  write_data("/keep",32);vfs_file_t f;CHECK(driver->open_file("/keep",&f,VFS_MODE_WRITEONLY|VFS_MODE_TRUNC)==VFS_OK);
  CHECK(driver->write_file(&f,data,16)==16);CHECK(vfs_persist_recover((vfs_driver_t*)driver)==VFS_ERR_FAIL);
  unsigned p=programs,e=erases;CHECK(driver->format()==VFS_ERR_FAIL && driver->umount()==VFS_ERR_FAIL);
  CHECK(driver->abort_file(&f)==VFS_OK && !f.handle && programs==p && erases==e);check_data("/keep",32);
  CHECK(vfs_persist_recover((vfs_driver_t*)driver)==VFS_OK);CHECK(driver->abort_file(&f)==VFS_OK);break;
 }
 case 9:{
  write_data("/keep",32);vfs_file_t f;CHECK(driver->open_file("/keep",&f,VFS_MODE_WRITEONLY|VFS_MODE_TRUNC)==VFS_OK);
  CHECK(driver->write_file(&f,data,16)==16);fail_program=programs+1;
  CHECK(driver->close_file(&f)<0 && f.handle);CHECK(vfs_persist_recover((vfs_driver_t*)driver)==VFS_ERR_FAIL);
  unsigned p=programs,e=erases;reset_faults();CHECK(driver->abort_file(&f)==VFS_OK && !f.handle && programs==p && erases==e);
  CHECK(driver->umount()==VFS_OK && driver->mount()==VFS_OK);check_data("/keep",32);break;
 }
 case 10:{
  vfs_stat_t stat;unsigned p=programs,e=erases;CHECK(driver->stat(&stat)==VFS_OK && stat.avaliable && stat.total_bytes==sizeof(disk) && stat.free_bytes<=stat.total_bytes);
  CHECK(programs==p && erases==e);write_data("/x",540);drop_read_cache();fail_read=reads+1;
  vfs_obj_t o;CHECK(driver->stat_file("/x",&o)==VFS_ERR_FAIL);reset_faults();drop_read_cache();fail_read=reads+1;
  CHECK(driver->stat(&stat)==VFS_ERR_FAIL && !stat.avaliable && !stat.total_bytes);reset_faults();break;
 }
 case 11:{
  write_data("/x",32);vfs_file_t f;CHECK(driver->open_file("/x",&f,VFS_MODE_READONLY)==VFS_OK);
  CHECK(driver->write_file(&f,data,1)==VFS_ERR_FAIL);CHECK(driver->close_file(&f)==VFS_OK);
  CHECK(driver->open_file("/x",&f,VFS_MODE_WRITEONLY)==VFS_OK);CHECK(driver->read_file(&f,copy,1)==VFS_ERR_FAIL);
  CHECK(driver->close_file(&f)==VFS_OK);CHECK(driver->open_file("/x",&f,0x8000)==VFS_ERR_FAIL);
  CHECK(driver->open_file("/x",&f,VFS_MODE_TRUNC)==VFS_ERR_FAIL);CHECK(driver->read_file(&f,copy,1)==VFS_ERR_FAIL);break;
 }
 case 12:{
  write_data("/x",540);CHECK(vfs_persist_write_meta((vfs_driver_t*)driver,"/x",data,572,meta)==572);check_data("/x",572);
  vfs_obj_t o;CHECK(driver->stat_file("/x",&o)==VFS_OK && !memcmp(o.meta,meta,128));
  CHECK(driver->stat_file("/.pixl_txn_new",&o)==VFS_OK && o.meta[0]==2 && o.meta[1]==2 && o.meta[2]==3);
  CHECK(driver->remove_file("/.pixl_txn_new")==VFS_ERR_FAIL);CHECK(driver->write_file_data("/.pixl_txn_new",data,1)==VFS_ERR_FAIL);
  CHECK(driver->umount()==VFS_OK && driver->mount()==VFS_OK && vfs_persist_recover((vfs_driver_t*)driver)==VFS_OK);check_data("/x",572);break;
 }
 case 13:{
  write_data("/x",540);CHECK(driver->update_file_meta("/x",meta,128)==VFS_OK);CHECK(driver->umount()==VFS_OK);memcpy(saved,disk,sizeof(saved));
  unsigned failed=0,blocked=0;
  for(unsigned cut=1;cut<=48;cut++){
   memcpy(disk,saved,sizeof(disk));CHECK(driver->mount()==VFS_OK);fail_program=programs+cut;
   int result=vfs_persist_write((vfs_driver_t*)driver,"/x",data,572);if(result<0)failed++;
   reset_faults();CHECK(!allocated && !lfs.mlist);CHECK(driver->umount()==VFS_OK && driver->mount()==VFS_OK);
   int recovered=vfs_persist_recover((vfs_driver_t*)driver);
   CHECK(recovered==VFS_OK || recovered==VFS_ERR_CRPT);
   if(recovered==VFS_ERR_CRPT)blocked++;
   int n=driver->read_file_data("/x",copy,sizeof(copy));CHECK((n==540 || n==572) && !memcmp(data,copy,n));
   vfs_obj_t o;CHECK(driver->stat_file("/x",&o)==VFS_OK && !memcmp(o.meta,meta,128));
   CHECK(driver->umount()==VFS_OK);
  }
  CHECK(failed>=10);CHECK(driver->mount()==VFS_OK);printf("journal cutpoints: 48 (%u injected failures, %u fail-closed incomplete markers)\n",failed,blocked);break;
 }
 case 14:{
  unsigned p=programs,e=erases,r=reads;CHECK(block_device_read(&lfs_config,BLOCKS,0,copy,1)<0);
  CHECK(block_device_prog(&lfs_config,0,4095,data,256)<0);CHECK(block_device_prog(&lfs_config,0,1,data,256)<0);
  CHECK(block_device_erase(&lfs_config,BLOCKS)<0);CHECK(p==programs&&e==erases&&r==reads);
  CHECK(vfs_lfs_map_error_code(LFS_ERR_NOSPC)==VFS_ERR_NOSPC && vfs_lfs_map_error_code(LFS_ERR_NOMEM)==VFS_ERR_NOMEM);
  CHECK(vfs_lfs_map_error_code(LFS_ERR_CORRUPT)==VFS_ERR_CRPT);break;
 }
 case 15:{
  write_data("/x",32);vfs_dir_t d;CHECK(driver->open_dir("/",&d)==VFS_OK);unsigned p=programs,e=erases;
  CHECK(driver->format()==VFS_ERR_FAIL && driver->umount()==VFS_ERR_FAIL && p==programs && e==erases);
  CHECK(driver->close_dir(&d)==VFS_OK);CHECK(driver->format()==VFS_OK && !mounted);CHECK(driver->mount()==VFS_OK);
  vfs_obj_t o;CHECK(driver->stat_file("/x",&o)==VFS_ERR_NOOBJ);break;
 }
 case 16:{
  unsigned files=0;int result=0;
  for(unsigned i=0;i<100;i++){
   char path[24];snprintf(path,sizeof(path),"/full%u",i);
   result=driver->write_file_data(path,data,sizeof(data));
   if(result<0)break;
   CHECK(result==sizeof(data));files++;
  }
  CHECK(files>5 && result==VFS_ERR_NOSPC && !allocated && !lfs.mlist);break;
 }
 case 17:{
  write_data("/raw",32);memset(meta,0xff,sizeof(meta));
  CHECK(driver->update_file_meta("/raw",meta,128)==VFS_OK);
  vfs_obj_t o;CHECK(driver->stat_file("/raw",&o)==VFS_OK && !memcmp(o.meta,meta,128));
  vfs_dir_t d;CHECK(driver->open_dir("/",&d)==VFS_OK);CHECK(driver->read_dir(&d,&o)==VFS_OK);
  CHECK(!strcmp(o.name,"raw")&&!memcmp(o.meta,meta,128));CHECK(driver->close_dir(&d)==VFS_OK);
  CHECK(driver->update_file_meta("/raw",NULL,129)==VFS_ERR_FAIL);
  CHECK(driver->umount()==VFS_OK && driver->mount()==VFS_OK);
  CHECK(driver->stat_file("/raw",&o)==VFS_OK && !memcmp(o.meta,meta,128));break;
 }
 case 18:{
  write_data("/open",32);vfs_file_t f;CHECK(driver->open_file("/open",&f,VFS_MODE_WRITEONLY)==VFS_OK);
  CHECK(driver->write_file(&f,data,16)==16);CHECK(driver->remove_file("/open")==VFS_OK);
  CHECK(driver->close_file(&f)==VFS_OK);vfs_obj_t o;CHECK(driver->stat_file("/open",&o)==VFS_ERR_NOOBJ);
  CHECK(driver->umount()==VFS_OK && driver->mount()==VFS_OK);CHECK(driver->stat_file("/open",&o)==VFS_ERR_NOOBJ);break;
 }
 default: return 2;
 }
 finish();
done: CHECK(!allocated);printf("PASS actual-LFS scenario %d (read=%u prog=%u erase=%u)\n",scenario,reads,programs,erases);return 0;
}
