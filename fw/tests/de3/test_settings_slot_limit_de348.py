"""All serialized slot-count values against the real settings and slot API.

Reuses the existing settings storage mocks; no device or personal files.
"""
from pathlib import Path
import hashlib,json,os,subprocess,sys,tempfile,unittest

FW=Path(__file__).resolve().parents[2]

def function(source,name):
    start=source.rfind('\n',0,source.index(name+'('))+1
    end=source.index('{',start)+1;depth=1
    while depth:
        depth+=(source[end]=='{')-(source[end]=='}');end+=1
    return source[start:end]

class SettingsSlotLimitTests(unittest.TestCase):
    def test_all_serialized_slot_counts_match_actual_api_capacity(self):
        source=FW/'application/src/mod/settings.c'
        api=FW/'application/src/app/amiidb/api/amiidb_api_slot.c'
        inherited=FW/'tests/de2/test_settings.py'
        files=[source,api,inherited,Path(__file__)]
        hashes={p.relative_to(FW).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
        script=inherited.read_text()
        script=script.replace('FW = Path(__file__).resolve().parents[2]','FW = Path('+repr(str(FW))+')')
        extra='''
#include "amiidb_api_slot.h"
vfs_driver_t *vfs_get_driver(vfs_drive_t which){(void)which;return &driver;}
void vfs_meta_decode(uint8_t*a,uint8_t n,vfs_meta_t*m){(void)a;(void)n;memset(m,0,sizeof(*m));}
static void callback(amiidb_slot_info_t*i,void*c){(void)i;(void)c;assert(0);}
'''+function(api.read_text(),'amiidb_api_slot_list')+'\n'
        check=r'''
    assert(MAX_SLOT_COUNT==50);
    for(unsigned value=0;value<256;value++){
        reset();stored[offsetof(settings_data_t,amiidb_data_slot_num)]=value;
        assert(settings_init()==0);
        unsigned expected=(value>=1 && value<=MAX_SLOT_COUNT)?value:20;
        assert(settings_get_data()->amiidb_data_slot_num==expected);
    }
    reset();assert(settings_init()==0);
    settings_get_data()->amiidb_data_slot_num=MAX_SLOT_COUNT+1;
    assert(amiidb_api_slot_list(callback,NULL)==VFS_ERR_FAIL);
    puts("PASS all256 stored slot counts fit actual50-slot API; valid1..50 unchanged");
'''
        script=script.replace('int main(void) {',extra+'int main(void) {\n'+check)
        script=script.replace("'-I', str(FW/'application/src/mod/ble'), str(cfile)","'-I', str(FW/'application/src/mod/ble'), '-I', str(FW/'application/src/mod'), '-I', str(FW/'application/src/app/amiidb/api'), '-I', str(FW/'application/src/ntag'), str(cfile)")
        arm=os.environ.get('PIXL_ARM32')=='1'
        sanitize=os.environ.get('PIXL_SANITIZE')=='1' and not arm
        if arm:
            script=script.replace("shutil.which('gcc') or 'gcc'","shutil.which('arm-linux-gnueabihf-gcc') or 'arm-linux-gnueabihf-gcc'")
            script=script.replace('subprocess.run(command, check=True',"command += ['-static']\n    subprocess.run(command, check=True")
            script=script.replace('subprocess.run([str(exe)]',"subprocess.run(['qemu-arm',str(exe)]")
        elif sanitize:
            script=script.replace('subprocess.run(command, check=True',"command += ['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer','-fno-pie','-no-pie']\n    subprocess.run(command, check=True")
        with tempfile.TemporaryDirectory(prefix='settings-slot-de348-') as tmp:
            run=Path(tmp)/'settings_contract.py';run.write_text(script)
            command=[sys.executable,str(run)]
            result=subprocess.run(command,capture_output=True,text=True,timeout=60)
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)
            self.assertIn('PASS all256',result.stdout)
            self.assertEqual(hashes,{p.relative_to(FW).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in files})
            print(result.stdout)
            destination=os.environ.get('PIXL_SETTINGS_SLOT_REPORT')
            if destination:
                Path(destination).write_text(json.dumps({'passed':True,'deviceAccess':False,'cases':256,'sanitize':sanitize,'arm32':arm,'sourceHashes':hashes,'sourcesUnchanged':True,'generatedRunnerSha256':hashlib.sha256(script.encode()).hexdigest(),'invocation':command,'exitCode':result.returncode,'stdout':result.stdout,'stderr':result.stderr,'limits':['Mocked settings storage; actual settings loading and API guard.','Values51..100 require imported, edited or damaged settings; normal UI offers10..50.']},indent=2)+'\n')

if __name__=='__main__':unittest.main()
