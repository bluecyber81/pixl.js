"""Execute all four game loops through start, progress, loss, replay and title exit.

Fixtures inject near-win/loss conditions at renderer boundaries. Input, timing
and panel transport are modelled; game rules, transition code and pixels are real.
"""
from hashlib import sha256
import json
from pathlib import Path
import subprocess
import tempfile

from test_lcd_game_pixels import PORT


def renderer(code, start, args):
    assert code.count(start) == 1, start
    return code.replace(start, start + "\n    observe(" + args + ");")


FIXTURES = {
    "tiny_arkanoid": (
        [("void Tiny_Flip(uint8_t render0_picture1, GROUPE *VAR) {", "render0_picture1, VAR")],
        """
        GROUPE *state = pointer;
        if (mode != 0) return;
        if (stage == 0 && active >= 2) {
            memset(state->BlocsGrid, 255, sizeof(state->BlocsGrid));
            state->Frame = 48; stage = 1;
        } else if (stage == 1 && state->LEVEL == 2) {
            state->Ballxpos = -1; state->live = 0; state->Frame = 48; stage = 2;
        }
        """,
        """
        GROUPE state;
        memset(&state, 0xa5, sizeof(state)); RsVarNewGame(&state); assert(state.Frame == 0);
        for (unsigned level = 0; level < 256; level++) {
            state.LEVEL = level;
            for (unsigned i = 0; i < 7; i++) {
                assert(PannelLevel(117+i, 5, &state) == DIGITAL[(level/10%10)*7+i]);
                assert(PannelLevel(117+i, 6, &state) == DIGITAL[(level%10)*7+i]);
            }
        }
        """),
    "tiny_invaders": (
        [("void Tiny_Flip(uint8_t render0_picture1, SPACE *space) {", "render0_picture1, space")],
        """
        SPACE *state = pointer;
        if (mode != 0) return;
        if (stage == 0 && active >= 2) {
            MONSTERrest = 0; stage = 1;
        } else if (stage >= 1 && LEVELS == 1) {
            state->MonsterGroupeYpos = 6 - state->MonsterFloorMax; ShipDead = 1; stage = 2;
        }
        """, ""),
    "tiny_lander": (
        [("void Tiny_Flip(uint8_t mode, GAME * game, DIGITAL * score, DIGITAL * velX, DIGITAL * velY) {", "mode, game")],
        """
        GAME *state = pointer;
        if (mode == 2 && state->Score) score_seen = 1;
        if (mode != 0) return;
        if (stage == 0 && active >= 2) {
            state->HasLanded = 1; state->EndCounter = 9; state->LevelScore = 1;
            state->FuelBonus = 0; state->velocityY = 0; stage = 1;
        } else if (stage == 1 && state->Level == 2) {
            assert(score_seen); state->HasLanded = 0; state->Lives = 0;
            state->Collision = 1; state->EndCounter = 9; stage = 2;
        }
        """, ""),
    "tiny_tris": (
        [("void Tiny_Flip_TTRIS(uint8_t HR_TTRIS) {", "HR_TTRIS, 0"),
         ("void Flip_intro_TTRIS(uint8_t *TIMER1) {", "1, 0")],
        """
        if (stage == 0 && mode == 82 && active >= 2) {
            DROP_BREAK_TTRIS = 6;
            for (unsigned x=0;x<12;x++) CHANGE_GRID_STAT_TTRIS(x, 18, 1);
            stage = 1;
        } else if (stage == 1 && mode == 128) {
            assert(Nb_of_line_F_TTRIS == 1 && Scores_TTRIS >= 3);
            score_seen = 1;
        } else if (stage == 1 && score_seen && mode == 82) {
            DROP_BREAK_TTRIS = 6; CHANGE_GRID_STAT_TTRIS(0, 1, 1);
        }
        if (score_seen && mode == 128 && End_Play_TTRIS()) {
            stage = 2;
        }
        """, ""),
}

HARNESS = """
static unsigned titles, starts, steps, idles, active, stage, page_count, score_seen;
static bool hold;
static FILE *frames;
void game_view_wait_for_start(void) { titles++; steps=0; active=0; assert(titles <= 2); }
bool game_view_take_start(void) {
    if (!hold && starts<titles && steps) { starts++; return true; }
    return false;
}
void JOY_idle(void) { steps++; idles++; assert(idles < 1000); }
uint8_t JOY_exit(void) { return hold ? steps>2 : (starts == 2 && active >= 3); }
int game_view_key_pressed(int key) { (void)key; return 0; }
void JOY_init(void) {}
void JOY_sound(uint8_t f,uint8_t d) {}
uint16_t JOY_random(void) { return 1; }
long map(long x,long a,long b,long c,long d) {return (x-a)*(d-c)/(b-a)+c;}
void nrf_delay_ms(unsigned d) {}
uint32_t JOY_clock_ticks(void) { return steps; }
void JOY_pace_tris_step(uint32_t stamp) { assert(stamp+1==steps); }
void JOY_OLED_write_page(uint8_t page, uint8_t *data, uint8_t n) {
    assert(page == page_count%8 && (n==128 || n==82)); page_count++;
    fputc(page,frames); fputc(n,frames); assert(fwrite(data,1,n,frames)==n);
}
static void observe(unsigned mode, void *pointer) {
    if (starts == titles && mode != 1) active++;
    if (hold || starts != 1 || titles != 1) return;
    MODE_FIXTURE
}
int main(int argc, char **argv) {
    assert(argc==3); hold=!strcmp(argv[1],"hold"); frames=fopen(argv[2],"wb"); assert(frames);
    EXTRA_CHECK
    assert(RUN_GAME()==0); assert(page_count && page_count%8==0);
    assert(hold ? (titles==1 && starts==0 && stage==0) : (titles==2 && starts==2 && stage==2));
    assert(!fclose(frames)); printf("%u %u %u %u %u",titles,starts,stage,idles,page_count/8);
}
"""


def execute(name, folder):
    folder = Path(folder)
    game = (PORT/name/(name+".c")).read_text(encoding="utf-8")
    signatures, fixture, extra = FIXTURES[name]
    for signature, args in signatures:
        game = renderer(game, signature, args)
    (folder/"game_view.h").write_text("#include <stdbool.h>\nenum {INPUT_KEY_LEFT,INPUT_KEY_RIGHT,INPUT_KEY_CENTER}; int game_view_key_pressed(int); void game_view_wait_for_start(void); bool game_view_take_start(void);")
    (folder/"nrf_delay.h").write_text("void nrf_delay_ms(unsigned);")
    (folder/"run.c").write_text("#include <stdbool.h>\n#include <stdio.h>\n#include <assert.h>\n#include <string.h>\nstatic void observe(unsigned,void *);\n" + game +
                                HARNESS.replace("MODE_FIXTURE",fixture).replace("EXTRA_CHECK",extra).replace("RUN_GAME",name+"_run"), encoding="utf-8")
    exe = folder/"loop.exe"
    subprocess.run(["gcc","-Os","-std=c11","-fshort-enums","-I",str(folder),"-I",str(PORT/name),
                    str(folder/"run.c"),"-o",str(exe)], check=True)
    traces = {}
    for mode in ("hold","replay"):
        output = folder/(mode+".bin")
        values = subprocess.check_output([str(exe),mode,str(output)], timeout=10).decode().split()
        report = dict(zip(("titles","starts","terminalStage","eventPolls","frames"),map(int,values)))
        data = output.read_bytes()
        report["logicalTraceSha256"] = sha256(data).hexdigest()
        traces[mode] = report, data
    return traces


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as tmp:
        print(json.dumps({name:{mode:r for mode,(r,_) in execute(name,tmp).items()} for name in FIXTURES}, indent=2))
