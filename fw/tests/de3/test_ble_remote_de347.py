"""Actual remote protocol/bridge/IRQ queue; bounded mock SDK, no radio access."""
from pathlib import Path
import os,re,subprocess,tempfile
from input_context_support import context_state, context_functions, TOKEN_FUNCTIONS
HERE=Path(__file__).resolve().parent
FW=HERE.parents[1]
SRC=FW/'application/src/mod/ble'
strip=lambda s: re.sub(r'(?m)^\s*#include[^\n]*\n','',s)
code=(HERE/'ble_remote_de347.c.in').read_text(encoding='utf-8').replace('/* ACTUAL_REMOTE_SOURCE */',strip((SRC/'ble_remote.c').read_text(encoding='utf-8')))
code=code.replace('/* ACTUAL_INPUT_CONTEXT */',context_state()+context_functions((*TOKEN_FUNCTIONS,'mui_input_context_changed')))
with tempfile.TemporaryDirectory(prefix='ble-remote-de347-') as tmp:
    p=Path(tmp);c=p/'harness.c';exe=p/'test.exe';c.write_text(code,encoding='utf-8')
    (p/'app_util_platform.h').write_text('extern int critical_depth;\n#define CRITICAL_REGION_ENTER() do { critical_depth++;\n#define CRITICAL_REGION_EXIT() critical_depth--; } while(0)\n')
    arm=os.environ.get('PIXL_ARM32')=='1';san=os.environ.get('PIXL_SANITIZE')=='1' and not arm
    cmd=['arm-linux-gnueabihf-gcc' if arm else 'gcc','-std=c11','-O1','-g','-fshort-enums','-Wall','-Wextra','-Werror','-Wno-unused-function','-Wno-unused-parameter','-Wno-misleading-indentation','-I',str(p),'-I',str(SRC),str(c),str(SRC/'ble_remote_protocol.c'),str(SRC/'ble_work.c'),'-o',str(exe)]
    if arm:cmd+=['-static']
    if san:cmd+=['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer','-fno-pie','-no-pie']
    subprocess.run(cmd,check=True,timeout=60)
    subprocess.run((['qemu-arm'] if arm else [])+[str(exe)],check=True,timeout=45)
main=(FW/'application/src/main.c').read_text(encoding='utf-8')
assert main.index('mui_tick(p_mui);')<main.index('ble_remote_poll();')
assert 'ble_remote_shutdown();\n        ble_disable();' in main
inputs=(FW/'application/src/mui/mui_input.c').read_text(encoding='utf-8')
assert 'ble_remote_local_activity();' in inputs
settings=(FW/'application/src/app/settings/scene/settings_scene_main.c').read_text(encoding='utf-8')
toggle=settings.split('case SETTINGS_MAIN_MENU_REMOTE:',1)[1].split('case ',1)[0]
assert 'ble_remote_set_enabled' in toggle and 'settings_save' not in toggle
assert 'REMOTE_SESSION' in settings
print('PASS remote integration/source invariants (RAM-only local toggle, physical input, foreground and shutdown)')
