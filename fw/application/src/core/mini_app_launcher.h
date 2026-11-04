#ifndef MINI_APP_LAUNCHER_H
#define MINI_APP_LAUNCHER_H

#include "mui_include.h"

#include "mini_app_defines.h"




typedef struct {
    mini_app_inst_t* p_main_app_inst; 
    mini_app_inst_t *instances;
    mini_app_inst_t *prepared_inst;
    void *prepared_handle;
    mini_app_exit_reason_t exit_reason;
    bool exit_prepared;
    bool exit_busy;
} mini_app_launcher_t;


mini_app_launcher_t* mini_app_launcher();
void mini_app_launcher_run(mini_app_launcher_t* p_launcher, uint32_t id);
void mini_app_launcher_kill(mini_app_launcher_t* p_launcher, uint32_t id);
void mini_app_launcher_exit(mini_app_launcher_t* p_launcher);
void mini_app_launcher_init(mini_app_launcher_t* p_launcher, uint32_t wakeup_reason);
/* Prepare before BLE/cache/UI teardown; reservation freezes app transitions.
 * Cancel an abandoned asynchronous request before allowing input again. */
bool mini_app_launcher_prepare_exit(mini_app_launcher_t *, mini_app_exit_reason_t);
bool mini_app_launcher_exit_prepared(mini_app_launcher_t *, mini_app_exit_reason_t);
void mini_app_launcher_cancel_exit(mini_app_launcher_t *);
bool mini_app_launcher_input_blocked(mini_app_launcher_t *);
bool mini_app_launcher_sleep(mini_app_launcher_t* p_launcher);
void mini_app_launcher_post_event(mini_app_launcher_t* p_launcher, uint32_t id, mini_app_event_t* p_event);
void* mini_app_launcher_get_app_handle(mini_app_launcher_t* p_launcher, uint32_t id);

void mini_app_launcher_run_with_retain_data(mini_app_launcher_t *p_launcher, uint32_t id, uint8_t *retain_data);

#endif 
