"""Observe each game's real movement state while holding and releasing side keys."""
import json
from pathlib import Path
import subprocess
import tempfile

from test_game_lifecycle import FIXTURES, PORT, renderer


STATE = {
    "tiny_arkanoid": ("((GROUPE*)state)->TrackBary*8+((GROUPE*)state)->TrackBaryDecal", 96),
    "tiny_invaders": ("ShipPos", 16),
    "tiny_lander": ("((GAME*)state)->velocityX", 12),
    "tiny_tris": ("xx_TTRIS", 24),
}
DRIVER = """
static int direction,step,last_position,held_position,release_position,play_samples;
static bool released;
static bool waiting;
void game_view_wait_for_start(void) {waiting=true;}
bool game_view_take_start(void) {if(waiting) {waiting=false;return true;} return false;}
void JOY_init(void) {}
void JOY_idle(void) {step++;}
uint8_t JOY_exit(void) {return step > STOP+SETTLE;}
int game_view_key_pressed(int key) {return step < STOP && key==direction;}
uint32_t JOY_clock_ticks(void) {return 0;}
void JOY_pace_tris_step(uint32_t tick) {}
void nrf_delay_ms(unsigned d) {}
void JOY_sound(uint8_t f,uint8_t d) {}
uint16_t JOY_random(void) {return 1;}
long map(long x,long a,long b,long c,long d) {return (x-a)*(d-c)/(b-a)+c;}
void JOY_OLED_write_page(uint8_t y,uint8_t *b,uint8_t n) {}
static void observe(unsigned mode,void *state) {
    if (mode==1 || mode==2 || waiting) return;
    last_position=POSITION;
    if (step<STOP) held_position=last_position;
    else if (!released) { released=true; release_position=last_position; }
    play_samples++;
}
int main(int argc,char **argv) {
    direction=atoi(argv[1]); assert(RUN()==0 && play_samples>=3);
    assert(released); printf("%d %d %d",held_position,release_position,last_position);
}
"""


def verify(folder):
    (folder/"game_view.h").write_text("#include <stdbool.h>\nenum {INPUT_KEY_LEFT,INPUT_KEY_CENTER,INPUT_KEY_RIGHT}; int game_view_key_pressed(int); void game_view_wait_for_start(void); bool game_view_take_start(void);")
    (folder/"nrf_delay.h").write_text("void nrf_delay_ms(unsigned);")
    results={}
    for name,(position,stop) in STATE.items():
        game=(PORT/name/(name+".c")).read_text()
        for signature,args in FIXTURES[name][0]:
            game=renderer(game,signature,args)
        (folder/"probe.c").write_text("#include <assert.h>\n#include <stdint.h>\n#include <stdio.h>\n#include <stdlib.h>\nstatic void observe(unsigned,void*);\n"+game+
                                     DRIVER.replace("STOP",str(stop)).replace("SETTLE","5" if name=="tiny_lander" else "40").replace("RUN",name+"_run").replace("POSITION",position))
        prog=folder/"dir.exe"
        subprocess.run(["gcc","-std=c11","-Os","-I",str(folder),"-I",str(PORT/name),str(folder/"probe.c"),"-o",str(prog)],check=True)
        result={label:list(map(int,subprocess.check_output([str(prog),str(key)],timeout=8).split()))
                for label,key in (("neutral",-1),("left",0),("right",2))}
        sign = -1 if name=="tiny_arkanoid" else 1
        assert sign*result["left"][0] < sign*result["neutral"][0] < sign*result["right"][0], (name,result)
        # Released paddle and piece settle; the lander retains its horizontal
        # speed while thrust is off. The invader ship remains at its target.
        assert all(release==after for _,release,after in result.values()), (name,result)
        results[name]={"state":position,"releaseAtStep":stop,"heldFirstReleasedAndSettled":result}
    return results


if __name__=="__main__":
    with tempfile.TemporaryDirectory() as work:
        print(json.dumps(verify(Path(work)),indent=2))
