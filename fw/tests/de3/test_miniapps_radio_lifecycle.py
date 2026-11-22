"""Compile actual miniapp radio ownership code against a strict mock boundary."""
from pathlib import Path
import os,re,subprocess,tempfile
HERE=Path(__file__).resolve().parent
FW=HERE.parents[1]
SRC=FW/'application/src'
strip=lambda s:re.sub(r'(?m)^\s*#include[^\n]*\n','',s)
def run(name,source,extra):
    fixture=(HERE/(name+'.c.in')).read_text()
    fixture=fixture.replace('/* ACTUAL_SCANNER */',strip(source)).replace('/* ACTUAL_RAW_ADVERTISER */',strip(source))
    with tempfile.TemporaryDirectory(prefix=name+'-') as tmp:
        d=Path(tmp);c=d/'test.c';exe=d/'test';c.write_text(fixture)
        cmd=['gcc','-std=c11','-O1','-g','-Wall','-Wextra','-Werror','-I',str(SRC/'app/switch2_wake'),str(c),*map(str,extra),'-o',str(exe)]
        if os.environ.get('UI_SANITIZE')=='1':cmd+=['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer','-fno-pie','-no-pie']
        subprocess.run(cmd,check=True,timeout=60)
        subprocess.run([str(exe)],check=True,timeout=30)
run('miniapps_scan_lifecycle',(SRC/'mod/ble/ble_switch2_scan.c').read_text(),[SRC/'app/switch2_wake/switch2_protocol.c'])

raw=(SRC/'mod/ble/ble_main.c').read_text().split('/* A short Switch-2 advertisement',1)[1].split('bool ble_stream_rssi',1)[0]
run('miniapps_raw_lifecycle','/* A short Switch-2 advertisement'+raw,[])
