"""Actual diagnostic module and SPIFFS, bounded synthetic NOR; no device use."""
from pathlib import Path
import os
import subprocess
import tempfile

FW = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent

def function(text, signature):
    start = text.index(signature); opening = text.index('{', start); depth = 1
    for i in range(opening + 1, len(text)):
        depth += (text[i] == '{') - (text[i] == '}')
        if not depth: return text[start:i + 1]
    raise ValueError(signature)

driver = (FW/'application/src/mod/vfs/vfs_driver_spiffs.c').read_text()
functions = '\n'.join(function(driver, name) for name in (
    'static s32_t vfs_spiffs_map_error_code(', 'static int32_t vfs_check_namespace(',
        'static s32_t spiffs_block_read(',
    'int32_t vfs_spiffs_open_file('))
with tempfile.TemporaryDirectory(prefix='pixl-storage-diag-') as tmp:
    temp = Path(tmp)
    (temp/'boards.h').write_text('#define BOARD_LCD 1\n#define VFS_SPIFFS_ENABLE 1\n')
    (temp/'hal_spi_flash.h').write_text('#include <stddef.h>\n#include <stdint.h>\nuint32_t hal_spi_flash_read(uint32_t,void*,size_t);\n')
    source = (HERE/'storage_diag_host.c').read_text().replace('/* ACTUAL_VFS_FUNCTIONS */', functions)
    cfile = temp/'host.c'; cfile.write_text(source)
    exe = temp/('storage_diag.exe' if os.name == 'nt' else 'storage_diag')
    cmd = ['gcc', '-std=c11', '-O1', '-g', '-include', 'stdint.h', '-I', str(temp),
           '-I', str(FW/'application/src/mod/vfs'), '-I', str(FW/'components/spiffs/src')]
    if os.environ.get('SPIFFS_SANITIZE'):
        cmd += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all', '-fno-omit-frame-pointer']
    cmd += [str(cfile), str(FW/'application/src/mod/vfs/vfs_spiffs_diag.c')]
    cmd += list(map(str, sorted((FW/'components/spiffs/src').glob('*.c'))))
    subprocess.run(cmd + ['-o', str(exe)], check=True, timeout=60)
    subprocess.run([str(exe)], check=True, timeout=60)
    protocol = (FW/'application/src/mod/df/df_proto_vfs.c').read_text()
    handler = function(protocol, 'void df_proto_handler_vfs_storage_diag(')
    (temp/'protocol.c').write_text((HERE/'storage_diag_protocol_host.c').read_text().replace('/* ACTUAL_HANDLER */', handler))
    protocol_cmd = cmd[:cmd.index(str(cfile))] + ['-I', str(FW/'application/src/mod/df'), str(temp/'protocol.c')]
    protocol_exe = temp/('protocol.exe' if os.name == 'nt' else 'protocol')
    subprocess.run(protocol_cmd + ['-o', str(protocol_exe)], check=True, timeout=60)
    subprocess.run([str(protocol_exe)], check=True, timeout=60)
    # Non-LCD builds do not even compile the diagnostic state or implementation.
    (temp/'boards.h').write_text('#define BOARD_OLED 1\n#define VFS_SPIFFS_ENABLE 1\n')
    stripped = subprocess.run(['gcc', '-E', '-P', '-I', str(temp),
                              str(FW/'application/src/mod/vfs/vfs_spiffs_diag.c')],
                             capture_output=True, text=True, check=True, timeout=30)
    assert not stripped.stdout.strip()
    print('PASS diagnostic implementation/state absent on OLED')
print('PASS production storage diagnostic regression')
