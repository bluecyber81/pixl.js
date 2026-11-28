/* SPDX-License-Identifier: GPL-2.0-only */
#include "pfs_guard_new.h"
#include <string.h>

static unsigned char ascii_fold(char c) {
    return (unsigned char)(c >= 'A' && c <= 'Z' ? c + 'a' - 'A' : c);
}
static bool same_key(const char *a, const char *b) {
    while (*a && *b && ascii_fold(*a) == ascii_fold(*b)) { ++a; ++b; }
    return !*a && !*b;
}
static bool ascii_only(const char *s) {
    for (; *s; ++s) if ((unsigned char)*s >= 128u) return false;
    return true;
}
static bool reserved_stem(const char *s) {
    char stem[8];
    size_t end=strcspn(s,".");
    while (end && s[end-1]==' ') --end;
    if (!end || end>=sizeof(stem)) return false;
    memcpy(stem,s,end); stem[end]='\0';
    if (same_key(stem,"con") || same_key(stem,"prn") || same_key(stem,"aux") ||
        same_key(stem,"nul") || same_key(stem,"conin$") || same_key(stem,"conout$")) return true;
    if (end != 4 || stem[3] < '1' || stem[3] > '9') return false;
    stem[3]='\0';
    return same_key(stem,"com") || same_key(stem,"lpt");
}
static int portable_leaf(const char *s) {
    size_t n=strlen(s);
    if (!n || n>=PFS_NAME_MAX || s[n-1]=='.' || s[n-1]==' ' || reserved_stem(s)) return PFS_GUARD_INVALID;
    for (; *s; ++s) {
        const unsigned char c=(unsigned char)*s;
        if (c>=128) return PFS_GUARD_DEFER;
        if (c<32 || c==127 || strchr("<>:\"/\\|?*",c)) return PFS_GUARD_INVALID;
    }
    return PFS_GUARD_OK;
}
/* Empty metadata or a single flags record has unambiguous permissions.
 * Notes, unknown/invalid/duplicate fields defer to existing browser validation. */
static int check_parent_meta(const uint8_t *m) {
    if (m[0]==0 || m[0]==255) return PFS_GUARD_OK;
    if (m[0]==2 && m[1]==2) return (m[2]&4u) ? PFS_GUARD_DENIED : PFS_GUARD_OK;
    return PFS_GUARD_DEFER;
}
static int scan_parent(pfs_t *fs, const char *parent, const char *const *names,
                       unsigned count, bool require_directory) {
    pfs_dir_t *dir=NULL;
    int r=pfs_opendir(fs,parent,&dir);
    if (r) return r;
    int decision=PFS_GUARD_OK;
    bool matched=false;
    pfs_info_t info;
    while (decision==PFS_GUARD_OK && (r=pfs_readdir(dir,&info))==1) {
        const char *leaf=strrchr(info.path,'/');
        if (!leaf || !leaf[1]) { decision=PFS_GUARD_INVALID; break; }
        ++leaf;
        if (!ascii_only(leaf)) { decision=PFS_GUARD_DEFER; break; }
        for (unsigned i=0; i<count; ++i) {
            if (!same_key(leaf,names[i])) continue;
            if (!require_directory || strcmp(leaf,names[i]) || matched) decision=PFS_GUARD_COLLISION;
            else if (info.type!=PFS_DIR) decision=PFS_GUARD_DENIED;
            else { matched=true; decision=check_parent_meta(info.meta); }
            break;
        }
    }
    const int closed=pfs_closedir(dir);
    if (r<0 || closed<0) return r<0 ? r : closed;
    if (decision!=PFS_GUARD_OK) return decision;
    if (require_directory && !matched) return LFS_ERR_NOENT;
    return PFS_GUARD_OK;
}
int pfs_guard_new_files(pfs_t *fs, const pfs_small_item_t *items, unsigned count) {
    if (!fs || !items || !count || count>PFS_BULK_LIMIT) return PFS_GUARD_INVALID;
    const char *names[PFS_BULK_LIMIT];
    char parent[PFS_PATH_MAX];
    size_t parent_len=0;
    for (unsigned i=0; i<count; ++i) {
        const char *p=items[i].path;
        /* Same NUL-terminated canonical C-string contract as PackedFS. */
        if (!p || p[0]!='/' || !p[1] || strlen(p)>=PFS_PATH_MAX || strstr(p,"//") ||
            !items[i].bytes || items[i].size>572) return PFS_GUARD_INVALID;
        if (!strncmp(p,"/.pixl_txn",sizeof("/.pixl_txn")-1)) return PFS_GUARD_DENIED;
        const char *slash=strrchr(p,'/');
        names[i]=slash+1;
        int r=portable_leaf(names[i]);
        if (r) return r;
        size_t len=(size_t)(slash-p);
        if (!len) len=1;
        if (i==0) { memcpy(parent,p,len); parent[len]='\0'; parent_len=len; }
        else if (len!=parent_len || memcmp(parent,p,len)) return PFS_GUARD_INVALID;
        for (unsigned j=0;j<i;++j) if (same_key(names[i],names[j])) return PFS_GUARD_COLLISION;
    }
    char current[PFS_PATH_MAX]="/";
    char *segment=parent+1;
    while (*segment) {
        char *next=strchr(segment,'/');
        if (next) *next='\0';
        int r=portable_leaf(segment);
        if (r) return r;
        const char *name=segment;
        r=scan_parent(fs,current,&name,1,true);
        if (r) return r;
        if (current[1]) strcat(current,"/");
        strcat(current,segment);
        if (!next) break;
        segment=next+1;
    }
    return scan_parent(fs,current,names,count,false);
}
