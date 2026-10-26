"""Execute the actual player against a close that fails while retaining its handle."""
from pathlib import Path
import importlib.util
import unittest

HERE = Path(__file__).resolve().parent
FW = HERE.parents[1]
SRC = FW / 'application/src'
spec = importlib.util.spec_from_file_location('player_existing_fixture', HERE.parent / 'de2/test_player_v3.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)

class PlayerCloseLifecycleTests(unittest.TestCase):
    compile_run = fixture.NativeTests.compile_run

    def test_close_errors_release_operation_local_read_handle(self):
        source = (HERE / 'player_close_host.c').read_text().replace('PLAYER_SOURCE',
                  '"' + (SRC / 'app/player/view/player_view.c').as_posix() + '"')
        stubs = {'mui_include.h': fixture.STUB_MUI, 'app_timer.h': fixture.STUB_TIMER,
                 'boards.h': '', 'nrf_log.h': '', 'i18n/language.h': '#define _T(x) #x\n',
                 'nrf_pwr_mgmt.h': 'static void nrf_pwr_mgmt_feed(void) {}\n'}
        self.compile_run(source, stubs, [SRC / 'app/player/view', SRC / 'mod/vfs'])

if __name__ == '__main__':
    unittest.main()
