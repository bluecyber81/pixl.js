#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include "mui_event.h"
static unsigned irq_depth, allocations, frees, fail_alloc, dispatches, last, observed[256];
static bool loop_posts, inject_on_exit;
static mui_event_queue_t *active;
static mui_event_t injected={.id=MUI_EVENT_ID_INPUT,.arg_int=999};
void *mui_mem_malloc(size_t n){assert(!irq_depth);allocations++;return fail_alloc?NULL:malloc(n);}
void mui_mem_free(void*p){assert(!irq_depth);if(p)frees++;free(p);}
void app_util_critical_region_enter(uint8_t *nested){*nested=irq_depth!=0;irq_depth++;}
void app_util_critical_region_exit(uint8_t nested){assert(irq_depth);irq_depth--;assert((irq_depth!=0)==(nested!=0));
 if(!irq_depth && inject_on_exit){inject_on_exit=false;mui_event_post(active,&injected);}}
#include "mui_event.c"
static void callback(void*context,mui_event_t*event){assert(!irq_depth && context==active);observed[dispatches++]=event->arg_int;last=event->arg_int;
 if(loop_posts){mui_event_t next={.id=MUI_EVENT_ID_INPUT,.arg_int=event->arg_int+1};mui_event_post(active,&next);}}
int main(void){mui_event_queue_t q={0};active=&q;
 mui_event_t e={.id=MUI_EVENT_ID_INPUT,.arg_int=7};mui_event_post(&q,&e);assert(q.count==0);
 fail_alloc=1;assert(!mui_event_queue_init(&q));mui_event_post(&q,&e);mui_event_dispatch(&q);assert(!q.count && !dispatches);mui_event_queue_deinit(&q);
 fail_alloc=0;assert(mui_event_queue_init(&q));mui_event_set_callback(&q,callback,&q);unsigned alloc_before=allocations;
 for(unsigned i=0;i<MAX_EVENT_MSG+100;i++){e.arg_int=i;mui_event_post(&q,&e);}
 assert(q.count==MAX_EVENT_MSG && allocations==alloc_before);mui_event_dispatch(&q);assert(dispatches==64 && last==63 && q.count==0);
 for(unsigned i=0;i<64;i++)assert(observed[i]==i);
 /* Wraparound and burst redraws preserve FIFO for ordinary input. */
 mui_event_t redraw={.id=MUI_EVENT_ID_REDRAW};e.arg_int=100;mui_event_post(&q,&e);
 for(unsigned i=0;i<100;i++){mui_event_post(&q,&redraw);}
 e.arg_int=101;mui_event_post(&q,&e);
 assert(q.count==3 && q.redraw_pending);mui_event_dispatch(&q);assert(last==101 && dispatches==67 && !q.redraw_pending);
 mui_event_post(&q,&redraw);assert(q.count==1);mui_event_dispatch(&q);assert(dispatches==68);
 /* An IRQ immediately after unlocking sees fully published ring state. */
 e.arg_int=103;inject_on_exit=true;mui_event_post(&q,&e);assert(q.count==2);mui_event_dispatch(&q);assert(last==999);
 uint8_t nested;app_util_critical_region_enter(&nested);mui_event_post(&q,&e);assert(irq_depth==1);app_util_critical_region_exit(nested);mui_event_dispatch(&q);
 /* Callbacks can produce events; work per pass remains bounded. */
 loop_posts=true;mui_event_post(&q,&e);unsigned before=dispatches;mui_event_dispatch(&q);assert(dispatches-before==MAX_EVENT_MSG && q.count==1);
 loop_posts=false;mui_event_dispatch(&q);assert(q.count==0 && allocations==alloc_before);
 inject_on_exit=true;mui_event_queue_deinit(&q);assert(!q.events && !q.count && !q.dispatcher);assert(frees==1);
 mui_event_post(&q,&e);mui_event_dispatch(&q);mui_event_dispatch_now(&q,&e);mui_event_queue_deinit(&q);assert(frees==1);
 puts("PASS: bounded ring, no post/pop allocations, FIFO, redraw coalescing, IRQ boundaries, failure/deinit and dispatch fairness");return 0;}
