"""Central launcher exit contract, using complete production C and real types.

The fixture supplies app callbacks, allocators and hardware boundaries; it does
not reimplement the launcher. These are new behavior checks, not replacements
for existing startup/NFC/remote tests.
"""
import unittest
from pathlib import Path
from exit_contract_support_de358 import HERE, SRC, actual, function, launcher_fixture, compile_cases
from input_context_support import context_functions

LAUNCHER_CASES = (
    "save failure preserves old owner on switch",
    "save failure preserves old owner on kill and exit",
    "NTAG denial precedes app guard",
    "successful switch keeps writers paused through cleanup",
    "successful exit reaches Desktop",
    "sleep failure preserves retain and cache",
    "hibernate-enabled cleanup",
    "settings-disabled hibernate cleanup",
    "app-disabled hibernate cleanup",
    "prepared sleep locks owner and commits once",
    "prepared reset locks owner until cancel",
    "daemon is independent of main-app dirty state",
    "failed init does not gain a false live callback owner",
    "NTAG callback reentrancy",
    "prepare callback reentrancy",
    "kill callback reentrancy",
    "run callback reentrancy",
    "cancel callback reentrancy",
    "prepared token binds exact instance, handle, state and reason",
    "recovery redirect cannot discard current owner",
    "same-app restart still needs save",
    "cancel is idempotent",
    "unknown app IDs are side-effect free",
    "legacy NULL callbacks retain NTAG guard",
    "prepared and busy transitions also block main-app event callbacks",
    "independent daemon events remain available while main is reserved",
)


class ExitLifecycleContractTests(unittest.TestCase):
    def test_real_launcher_exit_contract(self):
        source = launcher_fixture()
        source += (HERE / "launcher_exit_contract_de358.c.in").read_text(encoding="utf-8")
        compile_cases(self, source, LAUNCHER_CASES, "launcher-exit")

    def test_desktop_reselects_last_visible_foreground_app(self):
        desktop = (SRC / "app/desktop/app_desktop.c").read_text(encoding="utf-8")
        fixture = (HERE / "desktop_menu_focus.c.in").read_text(encoding="utf-8")
        source = launcher_fixture() + actual("mui/mui_nav_diag.h") + fixture.replace(
            "/* PRODUCTION_DESKTOP */", actual("app/desktop/view/app_list_view.h") + "\n" +
            function(desktop, "app_desktop_populate_list") + "\n" +
            function(desktop, "app_desktop_list_view_on_selected"))
        compile_cases(self, source, (
            "cold desktop and return from an app selected in the carousel",
            "hidden selected app and shifted visible indexes",
            "daemon, denied switch and failed start preserve the last app",
            "wake resumes an app; exiting it focuses its icon",
            "cold reset forgets the prior session",
        ), "desktop-menu-focus")

    def test_first_menu_selection_observes_actual_launcher_outcome(self):
        desktop = (SRC / "app/desktop/app_desktop.c").read_text(encoding="utf-8")
        boundary = r'''
#define PIXL_RUNTIME_DIAGNOSTICS 1
#define BOARD_LCD 1
#define APP_TIMER_CLOCK_FREQ 32768u
#define APP_TIMER_CONFIG_RTC_FREQUENCY 1u
static uint32_t tick;
static uint32_t app_timer_cnt_get(void) { tick+=2048; return tick; }
static uint32_t app_timer_cnt_diff_compute(uint32_t a,uint32_t b) { return (a-b)&0xffffffu; }
static void app_util_critical_region_enter(uint8_t *nested) { *nested=0; }
static void app_util_critical_region_exit(uint8_t nested) { (void)nested; }
typedef int mui_view_t, mui_anim_t;
'''
        source = launcher_fixture() + boundary + actual("mui/mui_nav_diag.h") + actual("mui/mui_nav_diag.c")
        source += actual("app/desktop/view/app_list_view.h") + function(desktop, "app_desktop_list_view_on_selected")
        source += r'''
int main(int argc,char **argv) {
    assert(argc==2);
    int scenario=atoi(argv[1]);
    fixture_start(MINI_APP_ID_DESKTOP);
    unsigned id=scenario==2?TEST_APP_FAILED_INIT:MINI_APP_ID_CHAMELEON;
    app_list_view_t menu={0};
    app_list_view_add_app(&menu,mini_app_registry_find_by_id(id),true);
    mui_menu_diag_enter();
    mui_nav_diag_raw(1,0); mui_nav_diag_raw(1,1); mui_nav_diag_raw(1,2);
    if(scenario==1) allow_ntag=false;
    if(scenario==3) recovery=true;
    app_desktop_list_view_on_selected(APP_LIST_ITEM_SELECTED,&menu);
    uint8_t wire[16]; assert(mui_menu_diag_snapshot(wire,sizeof(wire)));
    assert(wire[6]==(scenario==0?15:7) && wire[7]==id);
    assert(wire[8]==1 && wire[9]==1 && wire[10]==1 && wire[12]==125 && wire[13]==0);
    assert(!settings_saves && !cache_saves);
    fixture_dispose(); puts("PASS"); return 0;
}
'''
        compile_cases(self, source, ("requested app runs", "guard denies switch", "app init fails",
                                     "storage recovery changes target"), "first-menu-selection")

    def test_real_shutdown_handler_uses_guard_before_teardown(self):
        body = function((SRC / "main.c").read_text(encoding="utf-8"), "shutdown_handler")
        source = launcher_fixture() + "\n" + body + "\n"
        source += (HERE / "shutdown_exit_contract_de358.c.in").read_text(encoding="utf-8")
        cases = ("app-save failure vetoes before all teardown",
                 "NTAG save failure vetoes before app callback",
                 "success orders prepare, BLE stop, cleanup and flash sleep",
                 "success without hibernate",
                 "settings journal failure remains nonblocking after tag commit",
                 "recovery sleep avoids NFC and invalid retained tag",
                 "cancelled failed sleep can be retried",
                 "prepared reset cannot be consumed by a sleep request")
        compile_cases(self, source, cases, "shutdown-exit")


    def test_real_input_guard_blocks_modal_and_view_dispatch_until_cancel(self):
        body = function((SRC / "mui/mui_core.c").read_text(encoding="utf-8"), "mui_process_input")
        tail = (HERE / "input_exit_contract_de358.c.in").read_text(encoding="utf-8")
        source = launcher_fixture() + "\n" + tail.replace("/* ACTUAL_INPUT_HANDLER */", context_functions() + body)
        compile_cases(self, source, (
            "prepared RESET blocks first possible input handler",
            "prepared SLEEP blocks first possible input handler",
            "busy callback phase blocks input",
            "cancel restores original NTAG-before-view routing",
            "reservation cannot be bypassed by save modal or memory fallback",
            "failed prepare leaves retry UI available"), "input-exit")

    def test_real_ntag_cancel_only_releases_clean_buffers_without_callback(self):
        body = function((SRC / "ntag/ntag_emu_v2.c").read_text(encoding="utf-8"), "ntag_emu_cancel_change")
        source = (HERE / "ntag_cancel_contract_de358.c.in").read_text(encoding="utf-8")
        compile_cases(self, source.replace("/* ACTUAL_NTAG_CANCEL */", body),
                      ("initially active:16 state combinations",
                       "initially paused:16 state combinations"), "ntag-cancel")


if __name__ == "__main__":
    unittest.main()

