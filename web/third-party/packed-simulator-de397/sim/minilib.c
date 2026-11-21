/* Freestanding byte/string primitives for the locally compiled WASM simulator. */
#include <stddef.h>
void *memcpy(void *d,const void *s,size_t n){unsigned char *a=d;const unsigned char *b=s;for(size_t i=0;i<n;i++)a[i]=b[i];return d;}
void *memmove(void *d,const void *s,size_t n){unsigned char *a=d;const unsigned char *b=s;if(a<b)for(size_t i=0;i<n;i++)a[i]=b[i];else for(size_t i=n;i;i--)a[i-1]=b[i-1];return d;}
void *memset(void *d,int c,size_t n){unsigned char *a=d;for(size_t i=0;i<n;i++)a[i]=(unsigned char)c;return d;}
int memcmp(const void *a,const void *b,size_t n){const unsigned char *x=a,*y=b;for(size_t i=0;i<n;i++)if(x[i]!=y[i])return x[i]<y[i]?-1:1;return 0;}
void *memchr(const void *p,int c,size_t n){const unsigned char *a=p;for(size_t i=0;i<n;i++)if(a[i]==(unsigned char)c)return (void*)(a+i);return NULL;}
size_t strlen(const char *p){size_t n=0;while(p[n])n++;return n;}
char *strcpy(char *d,const char *s){char *r=d;do{*d++=*s;}while(*s++);return r;}
int strcmp(const char *a,const char *b){while(*a&&*a==*b){a++;b++;}return (unsigned char)*a-(unsigned char)*b;}
int strncmp(const char *a,const char *b,size_t n){for(size_t i=0;i<n;i++){if(a[i]!=b[i])return (unsigned char)a[i]-(unsigned char)b[i];if(!a[i])return 0;}return 0;}
char *strchr(const char *p,int c){do{if(*p==(char)c)return (char*)p;}while(*p++);return NULL;}
char *strrchr(const char *p,int c){const char *r=NULL;do{if(*p==(char)c)r=p;}while(*p++);return (char*)r;}
size_t strspn(const char *p,const char *s){size_t n=0;while(p[n]&&strchr(s,p[n]))n++;return n;}
size_t strcspn(const char *p,const char *s){size_t n=0;while(p[n]&&!strchr(s,p[n]))n++;return n;}
