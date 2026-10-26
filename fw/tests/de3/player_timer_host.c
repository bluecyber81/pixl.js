/* Actual player and Nordic timer operations; FIFO, clock, sortlist and UI are
 * deterministic host boundaries. This is not an RTC hardware timing test. */
#include "player_view.h"
#include <stdio.h>
#include "sdk_timer_functions.h"

static uint8_t file_data[1040];
static size_t cursor;
static unsigned opens, closes;
static bool file_live;
static int stat_fake(const char *path, vfs_obj_t *obj) {
    (void)path; obj->type = VFS_TYPE_REG; obj->size = sizeof file_data; return VFS_OK;
}
static int open_fake(const char *path, vfs_file_t *fd, uint32_t mode) {
    (void)path; assert(mode == VFS_MODE_READONLY && !file_live);
    file_live = true; opens++; cursor = 0; fd->handle = (void *)1; return VFS_OK;
}
static int close_fake(vfs_file_t *fd) {
    assert(file_live && fd->handle == (void *)1); file_live = false;
    closes++; fd->handle = NULL; return VFS_OK;
}
static int read_fake(vfs_file_t *fd, void *out, size_t length) {
    assert(file_live && fd->handle == (void *)1 && length <= sizeof file_data - cursor);
    memcpy(out, file_data + cursor, length); cursor += length; return (int)length;
}
static vfs_driver_t driver = {.stat_file = stat_fake, .open_file = open_fake,
                              .close_file = close_fake, .read_file = read_fake};
vfs_driver_t *vfs_get_driver(vfs_drive_t drive) { assert(drive == VFS_DRIVE_EXT); return &driver; }
#include "player_view.c"

static void prepare_file(void) {
    file_data[0] = 0x56; file_data[1] = 0x58; file_data[2] = 0x49; file_data[3] = 0x50;
    file_data[4] = 1; file_data[6] = 10; file_data[8] = 128; file_data[10] = 64;
}
static player_view_t *play(void) {
    player_view_t *p = player_view_create(); assert(p);
    assert(player_view_play(p, VFS_DRIVE_EXT, "/synthetic")); return p;
}
static void process(void) { timer_req_process(NULL); }
static void invoke_and_expect_no_ui(app_timer_timeout_handler_t handler, void *context) {
    unsigned before = ui_updates; handler(context); assert(ui_updates == before);
}
static void assert_clean(void) {
    assert(!file_live && opens == closes && allocations == frees && !q_count);
}
int main(int argc, char **argv) {
    assert(argc == 2); prepare_file(); const char *mode = argv[1];
    if (!strcmp(mode, "init_once")) {
        player_view_t *a = player_view_create(), *b = player_view_create(); assert(a && b);
        player_view_free(a); player_view_free(b);
        player_view_t *c = player_view_create(); assert(c); player_view_free(c);
        assert(create_calls == 1); process();
    } else if (!strcmp(mode, "delayed_stop")) {
        player_view_t *p = play(); process(); assert(sort_item);
        player_view_free(p); assert(q_count == 1); process(); assert(!sort_item);
    } else if (!strcmp(mode, "late_callback")) {
        player_view_t *p = play(); process();
        app_timer_timeout_handler_t cb = last_timer->handler; void *context = last_timer->p_context;
        player_view_free(p); invoke_and_expect_no_ui(cb, context); process();
    } else if (!strcmp(mode, "queued_recreate")) {
        player_view_t *a = play(); app_timer_t *old_timer = last_timer;
        app_timer_timeout_handler_t cb = old_timer->handler; void *context = old_timer->p_context;
        player_view_free(a); /* START A and STOP A are both still pending. */
        player_view_t *b = play(); assert(last_timer == old_timer && q_count == 3);
        process(); assert(sort_item == &last_timer->list_item && !APP_TIMER_IS_IDLE(last_timer));
        b->frame_due = false; cb(context); assert(b->frame_due);
        player_view_free(b); process(); assert(!sort_item);
    } else if (!strcmp(mode, "competing_view")) {
        player_view_t *a = play(), *b = player_view_create(); assert(b); process();
        unsigned before = opens; assert(!player_view_play(b, VFS_DRIVE_EXT, "/other"));
        assert(opens == before && a->is_playing && !b->is_playing);
        player_view_free(b); a->frame_due = false; last_timer->handler(last_timer->p_context);
        assert(a->frame_due); player_view_free(a); process();
    } else if (!strcmp(mode, "start_queue_full")) {
        player_view_t *p = player_view_create(); assert(p); force_queue_full = true;
        assert(!player_view_play(p, VFS_DRIVE_EXT, "/queue"));
        assert(queue_failures == 2 && !file_live && !p->frame_buffer && !p->is_playing);
        invoke_and_expect_no_ui(last_timer->handler, last_timer->p_context);
        player_view_free(p); force_queue_full = false; process();
    } else if (!strcmp(mode, "stop_queue_full")) {
        player_view_t *p = play(); process(); force_queue_full = true;
        player_view_free(p); assert(queue_failures == 1 && !q_count);
        /* The failed STOP can leave the old node in the engine until its next
         * update. Reading it and expiring an idle timer must remain safe. */
        assert(APP_TIMER_IS_IDLE(last_timer)); assert(!timer_expire(last_timer));
        invoke_and_expect_no_ui(last_timer->handler, last_timer->p_context);
        force_queue_full = false; sort_item = NULL;
    } else if (!strcmp(mode, "stop_queue_full_recreate")) {
        player_view_t *a = play(); process(); force_queue_full = true;
        player_view_free(a); assert(queue_failures == 1 && sort_item);
        force_queue_full = false;
        /* Do not simulate an engine update between the failed STOP and the
         * next START: that is exactly the previously untested corner case. */
        player_view_t *b = player_view_create(); assert(b); unsigned before = opens;
        bool restarted = player_view_play(b, VFS_DRIVE_EXT, "/immediate-retry");
        if (restarted) process(); /* An unfixed implementation reinserts the linked node. */
        assert(!restarted && b->play_error && opens == before);
        player_view_free(b); process(); sort_item = NULL;
    } else if (!strcmp(mode, "irq_teardown")) {
        player_view_t *p = play(); process(); p->frame_due = false;
        sort_item = NULL; clock_now = last_timer->end_val;
        assert(timer_expire(last_timer) && p->frame_due);
        invoke_on_stop_enqueue = true; player_view_free(p); process();
        assert(stop_callback_injections == 1);
    } else if (!strcmp(mode, "create_failure")) {
        fail_create = true; assert(!player_view_create() && allocations == frees);
        fail_create = false; player_view_t *p = play(); process();
        player_view_free(p); process(); assert(create_calls == 2);
    } else { assert(!"unknown mode"); }
    assert_clean(); printf("PASS %s\n", mode); return 0;
}
