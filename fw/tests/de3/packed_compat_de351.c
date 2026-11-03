/* Read the candidate's image with DE350, mutate once, then read with DE351. */
#include "packed_fs.h"
#include "packed_vfs_nor_de344.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
static nor_fixture_t media;
int main(int argc,char **argv) {
    REQUIRE(argc==3);unsigned phase=(unsigned)strtoul(argv[2],NULL,10);
    nor_init(&media);FILE *in=fopen(argv[1],"rb");REQUIRE(in);
    REQUIRE(fread(media.disk,1,NOR_BYTES,in)==NOR_BYTES);REQUIRE(fclose(in)==0);
    pfs_t *fs=pfs_new(&media.config,malloc,free);REQUIRE(fs);REQUIRE(pfs_mount(fs)==0);
    uint8_t data[2048],meta[128];pfs_info_t obj;
    for(unsigned i=0;i<=100;i++){
        char path[32];if(i==100)strcpy(path,"/saved");else snprintf(path,sizeof(path),"/amiibo%03u",i);
        unsigned size=i==100?2048:phase==2&&i==0?541:540;
        REQUIRE(pfs_stat(fs,path,&obj)==0);REQUIRE(obj.size==size);
        for(unsigned j=0;j<128;j++)meta[j]=(uint8_t)(i==100?j*9+17:phase==2&&i==0?j+5:j*11+19);
        REQUIRE(!memcmp(meta,obj.meta,128));pfs_file_t *f;REQUIRE(pfs_open(fs,path,LFS_O_RDONLY,&f)==0);
        REQUIRE(pfs_read(f,data,sizeof(data))==(int)size);REQUIRE(pfs_close(f)==0);
        for(unsigned j=0;j<size;j++)REQUIRE(data[j]==(uint8_t)(i==100?j*7+3:phase==2&&i==0?j+7:j*13+5));
    }
    pfs_dir_t *dir;REQUIRE(pfs_opendir(fs,"/",&dir)==0);unsigned count=0;int r;
    while((r=pfs_readdir(dir,&obj))>0)count++;REQUIRE(r==0&&count==101);REQUIRE(pfs_closedir(dir)==0);
    if(phase==1){
        for(unsigned j=0;j<541;j++)data[j]=(uint8_t)(j+7);
        for(unsigned j=0;j<128;j++)meta[j]=(uint8_t)(j+5);
        REQUIRE(pfs_replace(fs,"/amiibo000",data,541,meta)==541);
    }
    REQUIRE(pfs_unmount(fs)==0);REQUIRE(pfs_destroy(fs)==0);
    if(phase==1){FILE *out=fopen(argv[1],"wb");REQUIRE(out);REQUIRE(fwrite(media.disk,1,NOR_BYTES,out)==NOR_BYTES);REQUIRE(fclose(out)==0);}
    puts("PASS101 files and raw128 across DE350/DE351 engine boundary");return 0;
}
