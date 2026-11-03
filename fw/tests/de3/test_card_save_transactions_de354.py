"""Real MF1 callback and FDS transactions: retry, exact comparisons, close errors."""
from pathlib import Path
import os
import unittest
from root_host import FW
from test_chameleon_state_load import definition
from test_chameleon_factory_errors_de349 import compile_actual

class CardSaveTransactionTests(unittest.TestCase):
    def test_actual_mf1_and_fds_save_error_paths(self):
        tag_dir=FW/'components/chameleon-ultra/firmware/application/src/rfid/nfctag'
        tag=(tag_dir/'tag_emulation.c').read_text(encoding='utf8')
        mf=(tag_dir/'hf/nfc_mf1.c').read_text(encoding='utf8')
        port=(FW/'application/src/app/chameleon/port/fds_utils.c').read_text(encoding='utf8')
        code=Path(__file__).with_suffix('.c.in').read_text(encoding='utf8')
        header=(tag_dir/'hf/nfc_mf1.h').read_text(encoding='utf8').replace('#include "netdata.h"','').replace('"nfc_14a.h"','"hf/nfc_14a.h"')
        code=code.replace('@HEADER@',header)
        code=code.replace('@VFS@',(FW/'application/src/mod/vfs/vfs.h').read_text(encoding='utf8').replace('#include "boards.h"',''))
        code=code.replace('@CRC@',(tag_dir.parent/'crc_utils.c').read_text(encoding='utf8').replace('#include "crc_utils.h"',''))
        for mark,text,name,ret in [
            ('BLOCKS',mf,'get_block_max_by_tag_type','int'),('SIZE',mf,'get_information_size_by_tag_type','int'),
            ('SAVER',mf,'nfc_tag_mf1_data_savecb','int'),('MAP',port,'fds_map_file_name','void'),
            ('COMPARE',port,'fds_compare_sync','int32_t'),('WRITE',port,'fds_write_sync','bool'),
            ('SAVE',tag,'save_data_by_tag_type','bool'),('CONFIG',tag,'tag_emulation_save_config','bool')]:
            code=code.replace('@'+mark+'@',definition(text,name,ret))
        # Deliberate changes affect only the temporary extracted harness.
        changes={
            'no-shadow-rollback':('if (pending_shadow) pending_shadow->mode_block_write = NFC_TAG_MF1_WRITE_SHADOW_REQ;', '(void)pending_shadow;'),
            'crc-only-data':('int32_t equal = fds_compare_sync(map_info.id, map_info.key, data_byte_length, buffer->buffer);', 'int32_t equal = 1;'),
            'crc-only-config':('changed = equal == 0;', 'changed = false;'),
            'compare-error-success':('return equal > 0;', 'return true;'),
            'close-error-success':('vfs_abort_file(driver, &file);\n        result = -1;', 'vfs_abort_file(driver, &file);'),
            'config-full-length':('length = stored_length;', '(void)stored_length;'),
            'always-write':('if (equal != 0) {', 'if (equal < 0) {'),
        }
        mutant=os.environ.get('PIXL_SAVE_MUTANT')
        if mutant:
            self.assertIn(mutant,changes)
            before,after=changes[mutant]
            self.assertGreater(code.count(before),0)
            code=code.replace(before,after)
        compile_actual(self,code,tag_dir)

if __name__=='__main__':unittest.main()
