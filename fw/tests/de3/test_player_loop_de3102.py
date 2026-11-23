"""Current Player loop and clean-image controls with real C, mocked VFS/timer/display."""
from pathlib import Path
import importlib.util
import unittest

HERE = Path(__file__).resolve().parent
SRC = HERE.parents[1] / 'application/src'
spec = importlib.util.spec_from_file_location('player_fixture', HERE.parent / 'de2/test_player_v3.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)


class PlayerLoopTests(unittest.TestCase):
    compile_run = fixture.NativeTests.compile_run

    def test_loop_counter_bounds_and_failed_restart_cleanup(self):
        source = (HERE / 'player_loop_host.c').read_text().replace('PLAYER_SOURCE',
                  '"' + (SRC / 'app/player/view/player_view.c').as_posix() + '"')
        stubs = {'mui_include.h': fixture.STUB_MUI, 'app_timer.h': fixture.STUB_TIMER,
                 'boards.h': '', 'nrf_log.h': '', 'i18n/language.h': '#define _T(x) #x\n',
                 'nrf_pwr_mgmt.h': 'static void nrf_pwr_mgmt_feed(void) {}\n'}
        self.compile_run(source, stubs, [SRC / 'app/player/view', SRC / 'mod/vfs'])


if __name__ == '__main__':
    unittest.main()
