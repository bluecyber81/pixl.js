#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "cwalk2.h"
#include "vfs.h"

int main(void) {
    struct {uint8_t before; char path[VFS_MAX_PATH_LEN]; uint8_t after;} out={0xa5,{0},0x5a};
    assert(cwalk_append_segment(out.path,"/","test.bin") && !strcmp(out.path,"/test.bin"));
    assert(cwalk_append_segment(out.path,"/amiibo/","test.bin") && !strcmp(out.path,"/amiibo/test.bin"));
    assert(cwalk_append_segment(out.path,"/amiibo","test.bin") && !strcmp(out.path,"/amiibo/test.bin"));
    assert(!cwalk_append_segment(out.path,"","test") && !out.path[0]);
    assert(!cwalk_append_segment(out.path,"/","") && !out.path[0]);
    assert(!cwalk_append_segment(out.path,NULL,"test") && !out.path[0]);
    assert(!cwalk_append_segment(NULL,"/","test"));
    char left[80],right[80];
    for(size_t a=1;a<=70;a++) for(size_t b=1;b<=70;b++) {
        memset(left,'a',a);left[0]='/';left[a]=0;
        memset(right,'b',b);right[b]=0;
        bool expected=a+b+(a==1?0:1)<64;
        assert(cwalk_append_segment(out.path,left,right)==expected);
        if(expected) assert(strlen(out.path)==a+b+(a==1?0:1));
        else assert(out.path[0]==0);
        assert(out.before==0xa5 && out.after==0x5a);
    }
    strcpy(out.path,"/base");assert(cwalk_append_segment(out.path,out.path,"child") && !strcmp(out.path,"/base/child"));
    strcpy(out.path,"child");assert(cwalk_append_segment(out.path,"/base",out.path) && !strcmp(out.path,"/base/child"));
    puts("PASS append path boundaries, no truncation, aliases, guards and 4900 length pairs");

    assert(!cwalk_dir_prefix_match(out.path,"") && !out.path[0]);
    assert(!cwalk_dir_prefix_match(out.path,NULL) && !out.path[0]);
    assert(!cwalk_dir_prefix_match(NULL,"/"));
    assert(cwalk_dir_prefix_match(out.path,"/") && !strcmp(out.path,"/"));
    for(size_t length=1;length<=70;length++) {
        memset(left,'a',length);left[0]='/';left[length]=0;
        bool expected=length+(length==1?0:1)<64;
        assert(cwalk_dir_prefix_match(out.path,left)==expected);
        if(!expected) assert(!out.path[0]);
        left[length-1]='/';
        assert(cwalk_dir_prefix_match(out.path,left)==(length<64));
        assert(out.before==0xa5 && out.after==0x5a);
    }
    strcpy(out.path,"/base");assert(cwalk_dir_prefix_match(out.path,out.path) && !strcmp(out.path,"/base/"));
    assert(cwalk_same_prefix_segment("/foo","/foo"));
    assert(cwalk_same_prefix_segment("/foo","/foo/bar"));
    assert(cwalk_same_prefix_segment("/foo/","/foo/bar"));
    assert(cwalk_same_prefix_segment("/","/foo"));
    assert(!cwalk_same_prefix_segment("/foo","/foobar"));
    assert(!cwalk_same_prefix_segment("/foo/","/foo"));
    assert(!cwalk_same_prefix_segment("/foo","/fo"));
    assert(!cwalk_same_prefix_segment("","/foo"));
    assert(!cwalk_same_prefix_segment(NULL,"/foo"));
    assert(!cwalk_same_prefix_segment("/foo",NULL));
    assert(cwalk_get_segment_size(NULL)==0 && cwalk_get_segment_size("")==0);
    assert(cwalk_get_segment_size("/foo/bar")==2);
    puts("PASS directory prefix bounds, root handling and exact segment boundary");
    return 0;
}
