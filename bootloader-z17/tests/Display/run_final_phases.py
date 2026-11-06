"""Render actual Z17 C code against modeled SPI; check new phase glyphs and lifecycle."""
from pathlib import Path
import hashlib, json, os, subprocess, sys
from run_display import host_harness

root, out = map(lambda x: Path(x).resolve(), sys.argv[1:])
out.mkdir(parents=True, exist_ok=False)
fixture = Path(__file__).resolve().parent/'host'
src = root/'fw/bootloader/src'
extra = r'''
int main(int argc, char **argv) {
    assert(argc == 2);
    const char *texts[] = {"Pruefen...", "Speichern..."};
    for(unsigned i=0;i<2;i++) for(const char *p=texts[i];*p;p++) assert(font_index(*p) != 0);
    initialize(); event_irq(NRF_DFU_EVT_TRANSPORT_ACTIVATED);
    zero_counts(); dfu_display_final_phase(false);
    assert(m_display_screen == SCREEN_CHECKING && spi_transfers == 32 && delay_ms == 0);
    assert(centered_ink(0,32) && centered_ink(32,64));
    snapshot(argv[1],"checking");
    uint8_t checking[8][LCD_X_SIZE]; memcpy(checking,m_display_content,sizeof(checking));
    zero_counts(); drain_queue(); dfu_display_final_phase(false);
    assert(spi_transfers == 0 && memcmp(checking,m_display_content,sizeof(checking)) == 0);
    dfu_display_final_phase(true);
    assert(m_display_screen == SCREEN_SAVING && spi_transfers == 32 && delay_ms == 0);
    assert(centered_ink(0,32) && centered_ink(32,64));
    snapshot(argv[1],"saving");
    assert(memcmp(checking,m_display_content,sizeof(checking)) != 0);
    zero_counts(); dfu_display_final_phase(true); assert(spi_transfers == 0);
    event_irq(NRF_DFU_EVT_DFU_COMPLETED);
    dfu_display_final_phase(false); dfu_display_final_phase(true);
    assert(spi_transfers == 0 && m_display_state == DISPLAY_INACTIVE);
    drain_queue(); assert(!m_lcd_spi.enable);
    initialize(); event_irq(NRF_DFU_EVT_TRANSPORT_DEACTIVATED); drain_queue();
    zero_counts(); dfu_display_final_phase(false); dfu_display_final_phase(true);
    assert(spi_transfers == 0 && m_display_state == DISPLAY_WAITING);
    initialize(); queued_fail=1; event_irq(NRF_DFU_EVT_TRANSPORT_ACTIVATED);
    dfu_display_final_phase(false); zero_counts(); dfu_display_process();
    assert(spi_transfers == 0 && m_display_screen == SCREEN_CHECKING);
    event_irq(NRF_DFU_EVT_DFU_ABORTED); dfu_display_final_phase(true);
    assert(spi_transfers == 0); dfu_display_process(); assert(!m_lcd_spi.enable);
    puts("{\"finalPhaseLifecyclePassed\":true,\"addedDelayMs\":0,\"extraFramesAtMost\":2}");
    return 0;
}
'''
results = {}
for oled, board in [(False,'LCD128'), (True,'SH1106_132')]:
    folder=out/board; folder.mkdir()
    code=host_harness(fixture, True).replace('int main(int argc,char **argv)', 'int original_main(int argc,char **argv)')
    c=folder/'probe.c'; c.write_text(code+extra)
    command=['gcc','-std=c11','-O1','-g','-Werror=implicit-function-declaration',
             '-Werror=incompatible-pointer-types','-Werror=int-conversion',
             '-fsanitize=address,undefined','-fno-omit-frame-pointer','-no-pie',
             '-I'+str(fixture),'-I'+str(fixture/'fixture'),'-I'+str(src)]
    for macro,name in [('BL8_MAIN_SOURCE','main.c'),('BL8_LCD_DRV_SOURCE','lcd_drv.c'),('BL8_LCD_COMM_SOURCE','lcd_comm.c')]:
        command.append(f'-D{macro}="{src/name}"')
    if oled: command.append('-DOLED_TYPE_SH1106')
    exe=folder/'probe'; subprocess.run(command+[str(c),'-o',str(exe)],check=True)
    result=subprocess.check_output([str(exe),str(folder)],text=True,env=dict(os.environ,ASAN_OPTIONS='abort_on_error=1:detect_leaks=1',UBSAN_OPTIONS='halt_on_error=1'))
    (folder/'run.log').write_text(result)
    results[board]={'observations':[json.loads(line) for line in result.splitlines()],
                    'frames':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in folder.glob('*.pbm')}}
(out/'RESULT.json').write_text(json.dumps({'passed':True,'hardwareAccess':False,'boards':results},indent=2)+'\n')
print('PASS: glyphs, centering, SPI order, no duplicate refresh, stale queue, terminal and inactive guards (both controllers).')
