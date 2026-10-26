"""Actual DE3.17 diagnostics, TLSF/MUI and DF/queue framing; hardware mocked.

Baseline control confirms DE3.16 lacks this optional feature, not a hardware bug.
Mutation controls must compile and then fail assertions; compile failures do not count.
"""
import argparse
import ast
import hashlib
import inspect
import json
from pathlib import Path
import subprocess
import tempfile
import test_dfu_transfer_guard as fixture

HERE=Path(__file__).resolve().parent
FW=HERE.parents[1]
SRC=FW/'application/src'

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline',type=Path)
    parser.add_argument('--sanitize',action='store_true')
    parser.add_argument('--negative-controls',action='store_true')
    parser.add_argument('--report',type=Path)
    args=parser.parse_args()
    sources=list(fixture.PRODUCTION)+['main.c','bat.c','mod/runtime_diag.c','mod/runtime_diag.h','mui/mui_mem.c',
                                      'mod/ble/ble_main.c','mod/df/df_proto_info.h']
    report={'device_access':False,'sanitizers':args.sanitize,'cases':[],
            'source_sha256':{p:hashlib.sha256((SRC/p).read_bytes()).hexdigest() for p in sources},
            'test_sha256':{p:hashlib.sha256((HERE/p).read_bytes()).hexdigest() for p in
                           ('test_runtime_diag.py','runtime_diag_host.c','ble_mtu_host.c')},
            'limits':['Nordic events/radio and VFS endpoints mocked; no physical MTU or flash timing.',
                      'Actual TLSF heap on host ABI; payload high-water is not whole-system RAM usage.',
                      'Sampled free minima are not continuous minima; stack low-water unsupported.']}
    with tempfile.TemporaryDirectory(prefix='pixl-runtime-diag-') as temporary:
        folder=Path(temporary)
        tree=ast.parse(inspect.getsource(fixture.main))
        stubs=next(ast.literal_eval(n.value) for n in ast.walk(tree) if isinstance(n,ast.Assign)
                   and any(isinstance(t,ast.Name) and t.id=='stubs' for t in n.targets))
        for name,text in stubs.items(): (folder/name).write_text(text)
        def build(name, baseline=False, mutation=None):
            src=args.baseline.resolve()/'application/src' if baseline else SRC
            harness=(HERE/'ble_mtu_host.c').read_text().split('int main(',1)[0]
            harness='\n'.join(line for line in harness.splitlines()
                              if not line.startswith('static const df_cmd_entry_t capture_entries[]='))+'\n'
            protocol='\n'.join('#include "'+(src/p).as_posix()+'"' for p in fixture.PRODUCTION)
            harness=harness.replace('/* ACTUAL_PROTOCOL_INCLUDES */',protocol)
            ble=(src/'mod/ble/ble_main.c').read_text()
            harness=harness.replace('/* ACTUAL_BLE_FUNCTIONS */','\n'.join(fixture.function(ble,s) for s in
                 ('ret_code_t ble_nus_tx_data(','size_t ble_nus_max_data_length(','void ble_nus_abort_transfer(')))
            for signature,variable in [('static int32_t mock_open(','open_error'),('static int32_t mock_write(','write_error'),('static int32_t mock_close(','close_error')]:
                function=fixture.function(harness,signature)
                harness=harness.replace(function,'static int32_t '+variable+';\n'+function.replace('{','{\n    if('+variable+')return '+variable+';\n',1))
            runtime=(SRC/'mod/runtime_diag.c').read_text()
            if mutation:
                old,new=mutation
                assert runtime.count(old)==1,(name,'mutation anchor')
                runtime=runtime.replace(old,new)
            runtime_file=folder/(name+'_module.c');runtime_file.write_text(runtime)
            harness+='\n#include "'+runtime_file.as_posix()+'"\n'
            harness+='#include "'+(SRC/'mui/mui_mem.c').as_posix()+'"\n'
            tests=(HERE/'runtime_diag_host.c').read_text()
            if baseline:
                # Old command lookup returns unsupported; use only wire case0.
                handler='static void df_proto_handler_info_runtime_diagnostic(df_event_t *e){(void)e;}\n'
                harness+=handler
            harness+=tests
            c=folder/(name+'.c');c.write_text(harness)
            exe=folder/(name+'.exe')
            cmd=['gcc','-std=c11','-O1','-g','-Wall','-Wextra','-Werror','-Wno-unused-parameter',
                 '-Wno-sign-compare','-Wno-unused-function','-DPIXL_RUNTIME_DIAGNOSTICS=1']
            for include in [folder,SRC/'mod',SRC/'mui',FW/'components/tlsf',src/'mod/df',src/'mod/vfs',src/'mod/ble']:
                cmd+=['-I',str(include)]
            if args.sanitize:
                cmd+=['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer','-fno-pie','-no-pie']
            compiled=subprocess.run(cmd+[str(c),str(FW/'components/tlsf/tlsf.c'),'-o',str(exe)],capture_output=True,text=True,timeout=60)
            assert compiled.returncode==0,compiled.stdout+compiled.stderr
            return exe
        exe=build('candidate')
        for mtu in (23,185,250):
            for scenario in range(8):
                run=subprocess.run([str(exe),str(scenario),str(mtu)],capture_output=True,text=True,timeout=20)
                row={'mtu':mtu,'scenario':scenario,'exit_code':run.returncode,'output':run.stdout+run.stderr}
                report['cases'].append(row)
                assert run.returncode==0,row
                if scenario==3:
                    wire=next(line[5:] for line in run.stdout.splitlines() if line.startswith('WIRE '))
                    assert len(bytes.fromhex(wire))==64
                    if 'wire_fixture_hex' in report: assert report['wire_fixture_hex']==wire
                    report['wire_fixture_hex']=wire
                print(run.stdout,end='')
        report['negative_controls']=[]
        controls=[]
        if args.baseline: controls.append(('DE316_unsupported',build('baseline',baseline=True),0))
        if args.negative_controls:
            controls += [('counter_wrap',build('wrap',mutation=('if (*value != UINT16_MAX) ++*value;','++*value;')),4),
                         ('lost_allocation_failure',build('alloc',mutation=('if (failed) increment16(&state.allocation_failures);','(void)failed;')),1),
                         ('false_stack_measurement',build('stack',mutation=('put32(out + 52, UINT32_MAX);','put32(out + 52, 0);')),0),
                         ('reset_reason_overwrite',build('reset',mutation=('if (!(power_state.flags & 1u)) {','if (1) {')),6),
                         ('stale_adc_voltage',build('voltage',mutation=('valid ? voltage_mv : 0','voltage_mv')),6)]
        for name,binary,scenario in controls:
            run=subprocess.run([str(binary),str(scenario),'23'],capture_output=True,text=True,timeout=20)
            assert run.returncode==71 and 'CHECK' in run.stderr,(name,run.returncode,run.stdout,run.stderr)
            report['negative_controls'].append({'name':name,'exit_code':run.returncode,'output':run.stderr.strip()})
            print('PASS rejected control',name)
    main_source=(SRC/'main.c').read_text(encoding='utf-8').split('int main(void) {',1)[1]
    assert main_source.index('runtime_diag_boot_capture(nrf_power_resetreas_get());') < main_source.index('log_init();')
    battery=(SRC/'bat.c').read_text(encoding='utf-8')
    for signature in ('static void chrg_read(', 'void chrg_init('):
        body=fixture.function(battery, signature)
        assert body.index('bat_measure();') < body.index('bat_diagnostic_sample();')
    report['passed']=True
    if args.report:
        args.report.parent.mkdir(parents=True,exist_ok=True)
        args.report.write_text(json.dumps(report,indent=2)+'\n')
    print('PASS 24 actual-C runtime/power diagnostic cases; no device access')

if __name__=='__main__': main()
