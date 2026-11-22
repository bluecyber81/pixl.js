"""New miniapp constructors: every real allocation prelude/rollback failure.

The successful hardware/UI activation body is deliberately excluded. This
checks ownership rollback, not rendering or device startup.
"""
from pathlib import Path
import re,unittest
from test_app_startup_allocations import ALLOC,function,compile_run
SRC=Path(__file__).resolve().parents[2]/'application/src'
class MiniappStartupTests(unittest.TestCase):
    def test_all_constructor_allocations(self):
        total=0
        for name,param in (('ble_stream','inst'),('switch2_wake','p_app_inst')):
            with self.subTest(app=name):
                text=(SRC/f'app/{name}/app_{name}.c').read_text()
                body=function(text,f'app_{name}_on_run')
                before,remainder=body.split(f'    {param}->p_handle = app;',1)
                cleanup='startup_failed:'+remainder.split('startup_failed:',1)[1]
                allocations=re.findall(r'app->(\w+) = (\w+)_create\(\);',before)
                self.assertEqual(len(allocations),2 if name=='ble_stream' else 5)
                total+=len(allocations)+1
                body=before+f'    {param}->p_handle = app;\n    return;\n'+cleanup
                fields='\n'.join(f'void*{field};' for field,_ in allocations)
                stubs='\n'.join(f'static void*{typ}_create(void){{return mui_mem_malloc(8);}}\nstatic void {typ}_free(void*p){{mui_mem_free(p);}}' for typ in sorted({typ for _,typ in allocations}))
                release='\n'.join(f'{typ}_free(v->{field});' for field,typ in reversed(allocations))
                code=ALLOC+f'''
typedef struct{{void*p_handle;}}mini_app_inst_t;
typedef struct{{{fields}}}app_{name}_t;
{stubs}
{body}
int main(void){{
 for(unsigned failure=1;failure<={len(allocations)+1};failure++){{
  calls=0;fail_at=failure;mini_app_inst_t inst={{0}};app_{name}_on_run(&inst);
  assert(!inst.p_handle&&!live&&calls==failure);
  calls=0;fail_at=0;app_{name}_on_run(&inst);assert(inst.p_handle&&live=={len(allocations)+1});
  app_{name}_t*v=inst.p_handle;{release}
  mui_mem_free(v);assert(!live);
 }}
 puts("PASS new miniapp constructor unwind");return 0;
}}
'''
                compile_run(code)
        print(f'PASS {total} constructor failure stages plus successful retries; real preludes/rollback')
if __name__=='__main__':unittest.main()
