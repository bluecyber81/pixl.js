"""Check game page, length and pixel traces against LCD DE3.81/App654."""
import argparse
from hashlib import sha256
from pathlib import Path
import struct
import subprocess
import tempfile

PORT = Path(__file__).resolve().parents[2] / "application/src/app/game/port"
CASES = {
    "tiny_arkanoid": """
        GROUPE state = {0};
        Tiny_Flip(1,&state); RsVarNewGame(&state); Tiny_Flip(2,&state);
        LoadLevel(state.LEVEL-1,&state); Tiny_Flip(0,&state);
    """,
    "tiny_invaders": """
        SPACE state = {0}; Live=3; LEVELS=0; Tiny_Flip(1,&state);
        VarResetNewLevel(&state); Tiny_Flip(0,&state);
    """,
    "tiny_lander": """
        GAME state={.Level=1,.Lives=4}; DIGITAL score={0},vx={0},vy={0};
        Tiny_Flip(1,&state,&score,&vx,&vy);
        initGame(&state); Tiny_Flip(0,&state,&score,&vx,&vy);
        Tiny_Flip(2,&state,&score,&vx,&vy);
    """,
    "tiny_tris": """
        uint8_t timer=7; Flip_intro_TTRIS(&timer);
        Tiny_Flip_TTRIS(128); Tiny_Flip_TTRIS(82);
    """,
}
# Each pair is the number of frames and digest from the original App654
# game's series of (page, count, raw pixel bytes), including partial redraws.
REFERENCE = {
    "tiny_arkanoid": (3, "bf7ab733d99537055dea724e47196f44676f2bb101b111937e8959fba03c61b7"),
    "tiny_invaders": (2, "53f678c3cf564f90d28b02c8f2877ab85ea0ce06dd59ea5328707c77d62b931d"),
    "tiny_lander": (3, "817c559064846e025353a8ca7efdcd3713a3cd0162c94cdd1c53c6f8a0483300"),
    "tiny_tris": (3, "fab16c85097bc3537a797261a419b65fc596c3bdc94d19e18c126202f86205f1"),
}

STREAM = """
static void output_page(uint8_t y, uint8_t *data, uint8_t length) {
    assert(y == pages % 8 && length <= 128);
    assert(putchar(y) != EOF && putchar(length) != EOF);
    assert(fwrite(data,1,length,stdout) == length);
    pages++;
}
"""
OLD = """
static uint8_t row[128],offset,page;
void JOY_OLED_data_start(uint8_t y) {page=y;offset=0;}
void JOY_OLED_send(uint8_t b) {assert(offset < 128); row[offset++]=b;}
void JOY_OLED_end(void) {output_page(page,row,offset);}
"""
NEW = """
void JOY_OLED_write_page(uint8_t page,uint8_t *data,uint8_t count) {
    output_page(page,data,count);
}
"""
DRIVER = """
void JOY_sound(uint8_t f,uint8_t d) {(void)f;(void)d;}
uint16_t JOY_random(void) {return 1;}
long map(long x,long a,long b,long c,long d) {return (x-a)*(d-c)/(b-a)+c;}
void JOY_init(void) {}
void JOY_idle(void) {}
uint8_t JOY_exit(void) {return 0;}
int game_view_key_pressed(int key) {return 0;}
void nrf_delay_ms(unsigned delay) {}
"""

def capture(port, name, legacy, *, raw=False):
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        (folder / "game_view.h").write_text("enum {INPUT_KEY_LEFT,INPUT_KEY_RIGHT,INPUT_KEY_CENTER}; int game_view_key_pressed(int);")
        (folder / "nrf_delay.h").write_text("void nrf_delay_ms(unsigned);")
        src = folder / "trace.c"
        src.write_text("#include <stdint.h>\n#include <stdio.h>\n#include <assert.h>\n"
                       "#ifdef _WIN32\n#include <io.h>\n#include <fcntl.h>\n"
                       "#define BINARY_STDOUT() _setmode(_fileno(stdout),_O_BINARY)\n"
                       "#else\n#define BINARY_STDOUT() ((void)0)\n#endif\n"
                       + f'#include "{name}.c"\nstatic unsigned pages;\n'
                       + STREAM + (OLD if legacy else NEW) + DRIVER
                       + "\nint main(void) { BINARY_STDOUT();" + CASES[name] + "return 0;}\n")
        exe = folder / "game.exe"
        subprocess.run(["gcc", "-std=c11","-Os","-ffunction-sections","-fdata-sections","-fshort-enums",
                        "-I",str(folder),"-I",str(port/name),str(src),"-Wl,--gc-sections","-o",str(exe)], check=True)
        trace = subprocess.check_output([str(exe)],timeout=10)
        widths = []
        pos = 0
        while pos < len(trace):
            page, count = struct.unpack_from("BB", trace, pos)
            assert page == len(widths) % 8
            widths.append(count)
            pos += count + 2
        assert pos == len(trace) and len(widths) % 8 == 0
        assert set(widths) == ({128,82} if name=="tiny_tris" else {128})
        observed = len(widths)//8, sha256(trace).hexdigest()
        if raw:
            assert observed == REFERENCE[name], (name, observed)
            return trace
        return observed

if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference-port",type=Path,help="Compare directly with the original game port directory from de3.81")
    args=parser.parse_args()
    for name in CASES:
        result=capture(PORT,name,False)
        if args.reference_port:
            old=capture(args.reference_port,name,True)
            assert result==old,(name,result,old)
        assert result==REFERENCE[name],(name,result)
        print(name,*result)
