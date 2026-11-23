"""LCD Chameleon FDS and settings against the actual PackedFS/LittleFS backend."""
from pathlib import Path
import tempfile
import unittest

from test_packed_vfs_persistence_de344 import FW, HERE, run_packed_harness


class ChameleonPackedFSTests(unittest.TestCase):
    def test_slot_and_settings_retry_and_remount(self):
        src = FW / 'application/src'
        core = FW / 'components/chameleon-ultra/firmware'
        tag = core / 'application/src/rfid/nfctag'
        port = src / 'app/chameleon/port'
        headers = {
            'app_util.h': '#define STATIC_ASSERT(x) _Static_assert(x, #x)\n',
            'fds.h': '',
            'app_amiibolink.h': '#include "ble_amiibolink.h"\n',
            'nrf_error.h': '#define NRF_SUCCESS 0\n#define NRF_ERROR_NOT_SUPPORTED 1\n#define NRF_ERROR_INVALID_STATE 2\n',
            'nrf_log.h': '#include "nrf_error.h"\n#define NRF_LOG_INFO(...) ((void)0)\n#define NRF_LOG_WARNING(...) ((void)0)\n',
        }
        with tempfile.TemporaryDirectory(prefix='chameleon-packedfs-') as tmp:
            result = run_packed_harness(
                self, Path(tmp), HERE / 'chameleon_packedfs.c', headers=headers,
                sources=[port / 'fds_utils.c', src / 'mod/settings.c', src / 'mod/vfs/vfs_meta.c'],
                include_dirs=[src, src / 'mod', src / 'mod/ble', src / 'mod/df',
                              port, core / 'common', core / 'application/src/utils', tag, tag / 'hf'],
                flags=['-fshort-enums', '-Wno-pointer-sign', '-Wno-unused-parameter',
                       '-Wno-unused-variable', '-Wno-type-limits'],
            )
            self.assertIn('PASS Chameleon PackedFS', result.stdout)


if __name__ == '__main__':
    unittest.main()
