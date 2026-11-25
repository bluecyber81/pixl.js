/* SPDX-License-Identifier: GPL-2.0-only */
#include "bulk_wire.h"
#include <string.h>
static uint16_t le16(const uint8_t *p){return p[0]|((uint16_t)p[1]<<8);}
static uint32_t le32(const uint8_t *p){return le16(p)|((uint32_t)le16(p+2)<<16);}
static uint64_t le64(const uint8_t *p){return le32(p)|((uint64_t)le32(p+4)<<32);}
void bulk_forget(bulk_rx_t *rx){rx->id=0;rx->used=0;rx->total=0;rx->expected=0;}
static int reject(bulk_rx_t *rx){bulk_forget(rx);return BULK_INVALID;}
static bool name_ok(const uint8_t *p, size_t n){
    if(!n || n>=PFS_NAME_MAX || p[n-1]=='.' || p[n-1]==' ')return false;
    for(size_t i=0;i<n;i++) if(p[i]<32 || p[i]==127 || strchr("<>:\"/\\|?*",p[i]))return false;
    return true;
}
static bool stage_component(const uint8_t *p,size_t n){
    if(n<10 || n>14 || memcmp(p,"~u",2))return false;
    for(size_t i=2;i<n;i++)if(!(p[i]>='0'&&p[i]<='9') && !(p[i]>='a'&&p[i]<='f'))return false;
    return true;
}
static bool stage_path(const uint8_t *p,size_t n){
    if(n<2 || n>=PFS_PATH_MAX || p[0]!='/')return false;
    size_t start=1;bool staged=false;
    for(size_t i=1;i<=n;i++){
        if(i!=n && p[i]!='/')continue;
        size_t len=i-start;
        if(!name_ok(p+start,len))return false;
        if(start==1 && len>=9 && !memcmp(p+start,".pixl_txn",9))return false;
        staged|=stage_component(p+start,len);start=i+1;
    }
    return staged;
}
static int finish(bulk_rx_t *rx,bulk_hash_fn hash,bulk_commit_fn commit,bulk_receipt_t *receipt){
    if(rx->used!=rx->total || rx->total<36)return reject(rx);
    const size_t limit=rx->total-32;
    const uint8_t *b=rx->body;
    unsigned count=b[0],parent=b[1];size_t at=2;
    if(!count || count>PFS_BULK_LIMIT || parent>limit-at || !stage_path(b+at,parent))return reject(rx);
    at+=parent;char paths[PFS_BULK_LIMIT][PFS_PATH_MAX];pfs_small_item_t items[PFS_BULK_LIMIT];
    for(unsigned i=0;i<count;i++){
        if(limit-at<3)return reject(rx);
        size_t n=b[at++],size=le16(b+at);at+=2;
        if(size>572 || n>limit-at || !name_ok(b+at,n) || parent+1+n>=PFS_PATH_MAX)return reject(rx);
        memcpy(paths[i],b+2,parent);paths[i][parent]='/';memcpy(paths[i]+parent+1,b+at,n);
        paths[i][parent+1+n]=0;at+=n;
        if(size>limit-at)return reject(rx);
        items[i]=(pfs_small_item_t){paths[i],b+at,(uint16_t)size};at+=size;
    }
    uint8_t sum[32];uint64_t after=0;
    if(at!=limit || hash(b,limit,sum) || memcmp(sum,b+limit,sizeof(sum)))return reject(rx);
    if(commit(rx->expected,items,count,&after) || !after || after==rx->expected)return reject(rx);
    receipt->id=rx->id;receipt->revision=after;receipt->files=(uint8_t)count;
    bulk_forget(rx);return BULK_COMMITTED;
}
int bulk_frame(bulk_rx_t *rx,const uint8_t *f,size_t n,bulk_hash_fn hash,bulk_commit_fn commit,bulk_receipt_t *receipt){
    if(!rx || !f || !hash || !commit || !receipt)return BULK_INVALID;
    if(n<5 || n>247)return reject(rx);
    const uint32_t id=le32(f+1);
    if(!id)return reject(rx);
    if(f[0]==0){
        if(n!=15 || rx->id)return reject(rx);
        uint16_t total=le16(f+13);uint64_t expected=le64(f+5);
        if(!expected || total<36 || total>BULK_BODY_MAX)return reject(rx);
        rx->id=id;rx->used=0;rx->total=total;rx->expected=expected;return BULK_MORE;
    }
    if(!rx->id || id!=rx->id)return reject(rx);
    if(f[0]==1){
        if(n<=7 || le16(f+5)!=rx->used || n-7>(size_t)(rx->total-rx->used))return reject(rx);
        memcpy(rx->body+rx->used,f+7,n-7);rx->used+=(uint16_t)(n-7);return BULK_MORE;
    }
    if(f[0]==2 && n==5)return finish(rx,hash,commit,receipt);
    return reject(rx);
}

