/* Synthetic cross-version disk test; no device, private dumps or external data. */
#include "packed_fs.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define COUNT 4096
#define DISK (PFS_BLOCK_SIZE * PFS_BLOCK_COUNT)
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"check failed at line %d: %s\n",__LINE__,#x); exit(1); } } while (0)
typedef struct { char path[64]; uint8_t meta[128]; uint32_t size, seed; int kind, active; } row_t;
static row_t rows[COUNT];
static uint8_t flash[DISK], identity[32], seen[COUNT];
static unsigned count, reads, programs, erases;
static pfs_t *store;
static uint32_t seed(const char *s) { uint32_t value=2166136261u; while (*s) { value^=(uint8_t)*s++; value*=16777619u; } return value; }
static uint8_t sample(uint32_t value, uint32_t offset) { return (uint8_t)((value^(offset*131u)^(offset>>8))&255u); }
static int valid(lfs_block_t b,lfs_off_t o,lfs_size_t n) { return b<PFS_BLOCK_COUNT && o<=PFS_BLOCK_SIZE && n<=PFS_BLOCK_SIZE-o && o%256==0 && n%256==0; }
static int rd(const struct lfs_config *cfg,lfs_block_t b,lfs_off_t o,void *dst,lfs_size_t n) { (void)cfg; CHECK(valid(b,o,n)); reads++; memcpy(dst,flash+b*PFS_BLOCK_SIZE+o,n); return 0; }
static int wr(const struct lfs_config *cfg,lfs_block_t b,lfs_off_t o,const void *src,lfs_size_t n) { (void)cfg; CHECK(valid(b,o,n)); programs++; uint8_t *dst=flash+b*PFS_BLOCK_SIZE+o; const uint8_t *p=src; for(unsigned i=0;i<n;i++){ CHECK((dst[i]&p[i])==p[i]); dst[i]&=p[i]; } return 0; }
static int er(const struct lfs_config *cfg,lfs_block_t b) { (void)cfg; CHECK(b<PFS_BLOCK_COUNT); erases++; memset(flash+b*PFS_BLOCK_SIZE,255,PFS_BLOCK_SIZE); return 0; }
static int sy(const struct lfs_config *cfg) { (void)cfg; return 0; }

static void load_rows(const char *path) {
    FILE *input=fopen(path,"rb"); CHECK(input); char line[512];
    while(fgets(line,sizeof(line),input)) {
        CHECK(count<COUNT); row_t *r=&rows[count]; unsigned kind,size; int start=0;
        CHECK(sscanf(line,"%u %u\t%n",&kind,&size,&start)==2 && start>0 && kind<=1);
        char *name=line+start, *tab=strchr(name,'\t'); CHECK(tab); *tab++=0;
        CHECK(strlen(name)>0 && strlen(name)<64 && name[0]=='/'); strcpy(r->path,name);
        CHECK(strcspn(tab,"\r\n")==256);
        for(unsigned i=0;i<128;i++){ unsigned value; CHECK(sscanf(tab+2*i,"%2x",&value)==1); r->meta[i]=(uint8_t)value; }
        r->kind=(int)kind; r->size=size; r->seed=seed(name); r->active=1; count++;
    }
    CHECK(!ferror(input)); CHECK(fclose(input)==0); CHECK(count==1208);
    for(unsigned i=0;i<32;i++)identity[i]=(uint8_t)(17+i*3);
}
static void initialize(void) {
    struct lfs_config cfg={0}; cfg.read=rd;cfg.prog=wr;cfg.erase=er;cfg.sync=sy;
    cfg.read_size=cfg.prog_size=cfg.cache_size=256;cfg.block_size=4096;cfg.block_count=512;
    cfg.lookahead_size=64;cfg.block_cycles=500;cfg.name_max=47;cfg.attr_max=128;
    store=pfs_new(&cfg,malloc,free);CHECK(store);
}
static void write_row(const row_t *r) {
    pfs_file_t *file=NULL; CHECK(pfs_open(store,r->path,LFS_O_WRONLY|LFS_O_CREAT|LFS_O_TRUNC,&file)==0);
    CHECK(pfs_file_set_meta(file,r->meta)==0); uint8_t data[256];
    for(uint32_t offset=0;offset<r->size;){unsigned n=r->size-offset;if(n>sizeof(data))n=sizeof(data);
        for(unsigned j=0;j<n;j++)data[j]=sample(r->seed,offset+j);
        CHECK(pfs_write(file,data,n)==(lfs_ssize_t)n);offset+=n;}
    CHECK(pfs_close(file)==0);
}
static void verify(void) {
    unsigned writes_before=programs, erases_before=erases, listed=0, expected=0; uint8_t bound[32];
    CHECK(!pfs_import_pending(store)); CHECK(pfs_get_import_identity(store,bound)); CHECK(!memcmp(bound,identity,32));
    for(unsigned i=0;i<count;i++) if(rows[i].active){
        const row_t *r=&rows[i]; pfs_info_t info; CHECK(pfs_stat(store,r->path,&info)==0);expected++;
        CHECK(info.type==(r->kind?PFS_DIR:PFS_FILE));CHECK(info.size==r->size);CHECK(!memcmp(info.meta,r->meta,128));
        if(!r->kind){pfs_file_t *file=NULL;uint8_t data[256];CHECK(pfs_open(store,r->path,LFS_O_RDONLY,&file)==0);
            for(uint32_t offset=0;offset<r->size;){unsigned n=r->size-offset;if(n>sizeof(data))n=sizeof(data);
                CHECK(pfs_read(file,data,n)==(lfs_ssize_t)n);for(unsigned j=0;j<n;j++)CHECK(data[j]==sample(r->seed,offset+j));offset+=n;}
            CHECK(pfs_read(file,data,1)==0);CHECK(pfs_close(file)==0);}
    }
    memset(seen,0,sizeof(seen));
    for(unsigned i=0;i<=count;i++){
        if(i&&(!rows[i-1].active||!rows[i-1].kind))continue;
        pfs_dir_t *dir=NULL;CHECK(pfs_opendir(store,i?rows[i-1].path:"/",&dir)==0);pfs_info_t info;int result;
        while((result=pfs_readdir(dir,&info))>0){unsigned j=0;for(;j<count;j++)if(rows[j].active&&!strcmp(rows[j].path,info.path))break;
            CHECK(j<count);CHECK(!seen[j]);seen[j]=1;listed++;}
        CHECK(result==0);CHECK(pfs_closedir(dir)==0);
    }
    CHECK(listed==expected);CHECK(programs==writes_before);CHECK(erases==erases_before);
}
static void expected_phase(unsigned phase, int apply) {
    if(!phase)return;
    CHECK(phase<=2);unsigned first=COUNT,last=COUNT,previous=COUNT;
    for(unsigned i=0;i<count;i++)if(!rows[i].kind){if(first==COUNT)first=i;previous=last;last=i;}
    CHECK(first!=COUNT&&previous!=COUNT&&first!=previous);
    row_t *changed=&rows[first];changed->size+=37*phase;changed->seed^=0x55u*phase;
    for(unsigned i=0;i<128;i++)changed->meta[i]^=(uint8_t)(0x5au*phase);
    if(apply)write_row(changed);
    char original[64];strcpy(original,rows[last].path);
    if(apply&&phase==1)CHECK(pfs_rename(store,original,"/compat-renamed.bin")==0);
    strcpy(rows[last].path,"/compat-renamed.bin");
    if(apply&&phase==1)CHECK(pfs_remove(store,rows[previous].path,false)==0);
    rows[previous].active=0;
    for(unsigned i=0;i<2;i++){
        CHECK(count<COUNT);row_t *r=&rows[count++];strcpy(r->path,i?"/compat-empty.bin":"/compat-added.bin");
        r->kind=0;r->active=1;r->size=i?0:8193;r->seed=seed(r->path);
        for(unsigned j=0;j<128;j++)r->meta[j]=(uint8_t)(j*13+i);
        if(apply&&phase==1)write_row(r);
    }
    pfs_info_t absent;CHECK(pfs_stat(store,original,&absent)==LFS_ERR_NOENT);CHECK(pfs_stat(store,rows[previous].path,&absent)==LFS_ERR_NOENT);
}
int main(int argc,char **argv) {
    CHECK(argc==5);load_rows(argv[2]);unsigned phase=(unsigned)strtoul(argv[4],NULL,10);CHECK(phase<=2);
    int create=!strcmp(argv[1],"create"),modify=!strcmp(argv[1],"modify"),readonly=!strcmp(argv[1],"verify");CHECK(create||modify||readonly);
    if(create){CHECK(phase==0);memset(flash,255,sizeof(flash));}else{FILE *f=fopen(argv[3],"rb");CHECK(f);CHECK(fread(flash,1,sizeof(flash),f)==sizeof(flash));CHECK(fgetc(f)==EOF);CHECK(fclose(f)==0);}
    initialize();
    if(create){CHECK(pfs_format(store)==0);CHECK(pfs_bind_import(store,identity)==0);
        for(unsigned i=0;i<count;i++){if(rows[i].kind)CHECK(pfs_mkdir(store,rows[i].path)==0);else write_row(&rows[i]);}
        for(unsigned i=count;i;i--)if(rows[i-1].kind)CHECK(pfs_setattr(store,rows[i-1].path,rows[i-1].meta)==0);
        CHECK(pfs_finish_import(store)==0);
    }else{CHECK(pfs_mount(store)==0);CHECK(programs==0&&erases==0);expected_phase(modify?phase-1:phase,0);}
    verify();
    if(modify){CHECK(phase>=1);count=0;memset(rows,0,sizeof(rows));load_rows(argv[2]);expected_phase(phase,1);CHECK(pfs_gc(store)==0);verify();}
    CHECK(pfs_unmount(store)==0);CHECK(pfs_mount(store)==0);verify();CHECK(pfs_unmount(store)==0);CHECK(pfs_destroy(store)==0);
    if(readonly)CHECK(programs==0&&erases==0);
    if(create||modify){FILE *f=fopen(argv[3],"wb");CHECK(f);CHECK(fwrite(flash,1,sizeof(flash),f)==sizeof(flash));CHECK(fclose(f)==0);}
    printf("{\"passed\":true,\"phase\":%u,\"expectedRows\":%u,\"reads\":%u,\"programs\":%u,\"erases\":%u,\"readonly\":%s}\n",phase,count-(phase?1:0),reads,programs,erases,readonly?"true":"false");return 0;
}
