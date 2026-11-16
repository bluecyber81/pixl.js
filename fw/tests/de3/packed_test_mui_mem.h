/* Synthetic bounded allocator used by the PackedFS NOR tests. */
#pragma once
#include <stddef.h>
#include <stdint.h>
typedef struct { uint32_t total_size, free_size, free_biggest_size; } mui_mem_monitor_t;
void mui_mem_monitor(mui_mem_monitor_t *);
void *mui_mem_malloc(size_t);
void mui_mem_free(void *);
