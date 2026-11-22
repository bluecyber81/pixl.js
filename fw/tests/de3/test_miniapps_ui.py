"""Actual new miniapp UI/callback code with allocation, SDK and VFS boundaries mocked."""
from pathlib import Path
import os,re,subprocess,tempfile
HERE=Path(__file__).resolve().parent
SRC=HERE.parents[1]/'application/src'
def function(text,name):
    m=re.search(r'^[^\n;]*\b'+re.escape(name)+r'\([^;]*?\)\s*\{',text,re.M)
    assert m,name
    end=text.index('{',m.start())+1;depth=1
    while depth:
        depth+=(text[end]=='{')-(text[end]=='}');end+=1
    return text[m.start():end]
def run(name,code,extra=()):
    with tempfile.TemporaryDirectory(prefix=name+'-') as tmp:
        d=Path(tmp);c=d/'test.c';exe=d/'test';c.write_text(code)
        cmd=['gcc','-std=c11','-O1','-g','-Wall','-Wextra','-Werror','-I',str(SRC/'app/ble_stream'),'-I',str(SRC/'app/switch2_wake'),str(c),*map(str,extra),'-o',str(exe)]
        if os.environ.get('UI_SANITIZE')=='1':cmd+=['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer','-fno-pie','-no-pie']
        subprocess.run(cmd,check=True,timeout=60);subprocess.run([str(exe)],check=True,timeout=30)
stream=(SRC/'app/ble_stream/app_ble_stream.c').read_text()
struct=stream[stream.index('typedef struct {'):stream.index('static const char *stream_tr')]
callbacks='\n'.join(function(stream,n) for n in ('stream_session','stream_flush_ack','stream_link_changed','stream_on_ble_rx','stream_view_on_draw','stream_view_on_input'))
run('miniapps_stream_ui',(HERE/'miniapps_stream_ui.c.in').read_text().replace('/* ACTUAL_STREAM_UI */',struct+callbacks),(SRC/'app/ble_stream/stream_codec.c',))

switch=(SRC/'app/switch2_wake/app_switch2_wake.c').read_text()
types=switch[switch.index('typedef enum {'):switch.index('static const char *s2_tr')]
functions='\n'.join(function(switch,n) for n in ('switch2_wake_load_cfg','switch2_wake_save_cfg','switch2_save_current','switch2_save_feedback','switch2_wake_on_ble_done','switch2_wake_on_scan_done','switch2_wake_toggle_scan','switch2_wake_trigger','app_switch2_wake_prepare_exit','switch2_wake_list_selected_cb','app_switch2_wake_on_boot'))
run('miniapps_switch_ui',(HERE/'miniapps_switch_ui.c.in').read_text().replace('/* ACTUAL_SWITCH_TYPES */',types).replace('/* ACTUAL_SWITCH_FUNCTIONS */',functions),(SRC/'app/switch2_wake/switch2_protocol.c',))
