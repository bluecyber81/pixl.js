#include <assert.h>
static unsigned host_critical_depth;
#define CRITICAL_REGION_ENTER() { assert(host_critical_depth == 0); ++host_critical_depth
#define CRITICAL_REGION_EXIT() assert(host_critical_depth == 1); --host_critical_depth; }
