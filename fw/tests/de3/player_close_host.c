#include "player_view.h"
static uint8_t file_data[1040];
static size_t file_size, cursor;
static unsigned close_calls, abort_calls, events;
static int close_error, read_error;
static bool descriptor_live;
static int stat_fake(const char *path, vfs_obj_t *obj) {
    (void)path; obj->size = file_size; obj->type = VFS_TYPE_REG; return VFS_OK;
}
static int open_fake(const char *path, vfs_file_t *fd, uint32_t flags) {
    (void)path; assert(flags == VFS_MODE_READONLY && !descriptor_live);
    descriptor_live = true; fd->handle = (void *)1; cursor = 0; return VFS_OK;
}
static int close_fake(vfs_file_t *fd) {
    assert(descriptor_live && fd->handle == (void *)1); close_calls++;
    if (close_error) return close_error; /* Failed close retains descriptor ownership. */
    descriptor_live = false; fd->handle = NULL; return VFS_OK;
}
static int abort_fake(vfs_file_t *fd) {
    assert(descriptor_live && fd->handle == (void *)1); abort_calls++;
    descriptor_live = false; fd->handle = NULL; return VFS_OK;
}
static int read_fake(vfs_file_t *fd, void *data, size_t length) {
    assert(descriptor_live && fd->handle == (void *)1);
    if (read_error && cursor) return VFS_ERR_FAIL;
    if (length > file_size - cursor) length = file_size - cursor;
    memcpy(data, file_data + cursor, length); cursor += length; return (int)length;
}
static vfs_driver_t driver = {.stat_file = stat_fake, .open_file = open_fake, .close_file = close_fake,
                             .abort_file = abort_fake, .read_file = read_fake};
vfs_driver_t *vfs_get_driver(vfs_drive_t drive) { assert(drive == VFS_DRIVE_EXT); return &driver; }
#include PLAYER_SOURCE
static void prepare(void) {
    assert(!descriptor_live); memset(file_data, 0, sizeof file_data);
    file_data[0] = 0x56; file_data[1] = 0x58; file_data[2] = 0x49; file_data[3] = 0x50;
    file_data[4] = 1; file_data[6] = 10; file_data[8] = 128; file_data[10] = 64;
    file_size = sizeof file_data; cursor = 0;
    close_calls = abort_calls = events = 0; close_error = read_error = timer_error = 0;
}
static void stopped(player_view_event_t event, player_view_t *player) {
    assert(event == PLAYER_VIEW_EVENT_PLAY_STOPPED && player->play_error && !descriptor_live); events++;
}
static void verify_released(player_view_t *player) {
    assert(close_calls == 1 && abort_calls == 1 && !descriptor_live);
    assert(player->play_error && !player->file_open && !player->p_dirver);
    assert(!player->frame_buffer && !player->frame_buffer_size && !player->is_playing);
    player_view_stop(player); assert(close_calls == 1 && abort_calls == 1);
}
int main(void) {
    mui_canvas_t canvas = {128, 64};
    player_view_t *player = player_view_create(); assert(player);
    prepare(); assert(player_view_play(player, VFS_DRIVE_EXT, "/ok"));
    player_view_stop(player); assert(close_calls == 1 && !abort_calls && !descriptor_live && !player->play_error);
    prepare(); assert(player_view_play(player, VFS_DRIVE_EXT, "/stop")); close_error = VFS_ERR_FAIL;
    player_view_stop(player); verify_released(player);
    prepare(); assert(player_view_play(player, VFS_DRIVE_EXT, "/end")); close_error = VFS_ERR_FAIL;
    player->event_cb = stopped; player->p_view->draw_cb(player->p_view, &canvas);
    player_view_on_frame_tick(player); player->p_view->draw_cb(player->p_view, &canvas);
    verify_released(player); assert(events == 1);
    prepare(); assert(player_view_play(player, VFS_DRIVE_EXT, "/read")); close_error = VFS_ERR_FAIL; read_error = 1;
    player->p_view->draw_cb(player->p_view, &canvas); verify_released(player); assert(events == 1);
    prepare(); close_error = VFS_ERR_FAIL; file_data[0] = 0;
    assert(!player_view_play(player, VFS_DRIVE_EXT, "/badheader")); verify_released(player);
    prepare(); close_error = VFS_ERR_FAIL; timer_error = 7;
    assert(!player_view_play(player, VFS_DRIVE_EXT, "/timer")); verify_released(player);
    prepare(); assert(player_view_play(player, VFS_DRIVE_EXT, "/free")); close_error = VFS_ERR_FAIL;
    player_view_free(player); assert(close_calls == 1 && abort_calls == 1 && !descriptor_live && allocations == frees);
    puts("PASS seven player close lifecycles including failed-close abandonment and visible error"); return 0;
}
