"""Compare actual display/game arithmetic with the legacy DE3.34 formulas.

No peripherals or firmware files are modified. --probe-float evaluates a proposed
single-precision game expression in the generated host fixture only. With no
arguments the reference uses the two pinned legacy expressions below in copies
of the actual current function bodies, so an archived suite is self-contained.
--baseline instead compares the actual immutable reference source files.
"""
from pathlib import Path
import argparse, hashlib, json, re, subprocess, tempfile

FW = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
LEGACY_CONTRAST = '(value - 1) * (255.0 / 99.0)'
INTEGER_CONTRAST = '((uint32_t)value - 1u) * 255u / 99u'
LEGACY_CORRECTION = 'VAR->TrackAngleOut / 100.00)'
FLOAT_CORRECTION = 'VAR->TrackAngleOut / 100.00f)'
NAMES = ['UpdateBall', 'RecupeBALLPosForSIM', 'TestMoveBALL', 'SimulMove',
         'CheckCollisionBall', 'CheckCollisionWithBLOCK', 'RecupePositionOnGrid',
         'RecupeXPositionOnGrid', 'RecupeYPositionOnGrid', 'CheckCollisionWithTRACKBAR',
         'WriteBallMove', 'RecupeDecalageY']

def extract(text, name):
    match = re.search(r'^[\w *]+\b' + name + r'\([^;]*?\)\s*\{', text, re.M)
    assert match, name
    start = match.start(); pos = text.index('{', start); depth = 1; end = pos + 1
    while depth:
        depth += (text[end] == '{') - (text[end] == '}'); end += 1
    return text[start:end]

def rename(text, prefix):
    for name in NAMES:
        text = re.sub(r'\b' + name + r'\b', prefix + name, text)
    return text

def path_arg(value):
    value = str(value).replace('\\', '/')
    return '/mnt/' + value[0].lower() + value[2:] if len(value) > 2 and value[1] == ':' else value

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', type=Path, help='Optional actual DE3.34 source tree for release proof')
    parser.add_argument('--report', type=Path, help='Optional JSON evidence output; default prints results only')
    parser.add_argument('--probe-float', action='store_true')
    parser.add_argument('--arm-assembly', action='store_true')
    args = parser.parse_args()
    files = [Path(__file__), HERE / 'math_precision_de335.c.in']
    texts = {}
    trees = [('new', FW)]
    if args.baseline:
        trees.append(('old', args.baseline.resolve()))
    for label, tree in trees:
        contrast = tree / 'application/src/mui/mui_u8g2.c'
        game = tree / 'application/src/app/game/port/tiny_arkanoid/tiny_arkanoid.c'
        header = tree / 'application/src/app/game/port/tiny_arkanoid/spritebank.h'
        files += [contrast, game, header]
        texts[label] = {'contrast': contrast.read_text(), 'game': game.read_text(), 'header': header.read_text()}
    if not args.baseline:
        # Pin just the deliberately changed arithmetic, keeping this ordinary
        # regression test independent of sibling checkouts and private files.
        assert texts['new']['contrast'].count(INTEGER_CONTRAST) == 1
        assert texts['new']['game'].count(FLOAT_CORRECTION) == 1
        texts['old'] = dict(texts['new'])
        texts['old']['contrast'] = texts['old']['contrast'].replace(INTEGER_CONTRAST, LEGACY_CONTRAST)
        texts['old']['game'] = texts['old']['game'].replace(FLOAT_CORRECTION, LEGACY_CORRECTION)
    hashes = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    if args.probe_float:
        assert texts['new']['game'].count('VAR->TrackAngleOut / 100.00)') == 1
        texts['new']['game'] = texts['new']['game'].replace('VAR->TrackAngleOut / 100.00)', 'VAR->TrackAngleOut / 100.00f)')
    struct = re.search(r'typedef struct GROUPE\{.*?\}GROUPE;', texts['new']['header'], re.S).group()
    source = (HERE / 'math_precision_de335.c.in').read_text().replace('@STRUCT@', struct)
    for label in ('old', 'new'):
        contrast = extract(texts[label]['contrast'], 'mui_u8g2_set_contrast_level').replace('mui_u8g2_set_contrast_level', label + '_contrast')
        bodies = [rename(extract(texts[label]['game'], name), label + '_') for name in NAMES]
        declarations = '\n'.join(body[:body.index('{')].strip() + ';' for body in bodies)
        source = source.replace('@' + label.upper() + '_CONTRAST@', contrast)
        source = source.replace('@' + label.upper() + '_GAME@', declarations + '\n' + '\n'.join(bodies))
    report = {'passed': False, 'device_access': False, 'proposed_float_only': args.probe_float,
              'reference': str(args.baseline.resolve()) if args.baseline else 'pinned_legacy_formulas_in_current_function_bodies',
              'source_sha256': hashes, 'runs': [], 'assembly': []}
    with tempfile.TemporaryDirectory(prefix='pixl-math-de335-') as temp:
        temp = Path(temp); cfile = temp / 'fixture.c'; cfile.write_text(source)
        for lcd in (0, 1):
            exe = temp / ('test' + str(lcd) + '.exe')
            command = ['gcc', '-std=c11', '-O1', '-Wall', '-Wextra', '-Werror', '-Wno-unused-parameter',
                       '-ffp-contract=off', '-DTEST_LCD=' + str(lcd)]
            if lcd: command.append('-DLCD_SCREEN')
            command += [str(cfile), '-lm', '-o', str(exe)]
            built = subprocess.run(command, capture_output=True, text=True, timeout=120)
            assert built.returncode == 0, built.stdout + built.stderr
            ran = subprocess.run([str(exe)], capture_output=True, text=True, timeout=120)
            assert ran.returncode == 0, ran.stdout + ran.stderr
            rows = [json.loads(line) for line in ran.stdout.splitlines() if line.startswith('{')]
            report['runs'].append({'lcd': bool(lcd), 'results': rows})
        if args.arm_assembly:
            # Compile the extracted actual functions for Cortex-M4/FPv4-SP.
            # The separate firmware release build uses its pinned arm-none-eabi toolchain.
            assembly_source = '#include <stdint.h>\n' + struct + '\nuint8_t RecupeDecalageY(uint8_t);\n'
            assembly_source += extract(texts['new']['game'], 'WriteBallMove') + '\n'
            afile = temp / 'hardware_float.c'; afile.write_text(assembly_source)
            asm = temp / 'hardware_float.s'
            cmd = ['wsl.exe', '--distribution', 'Ubuntu-24.04-Codex-New', '--user', 'bluec', '--exec',
                   'arm-linux-gnueabihf-gcc', '-std=c11', '-Os', '-mcpu=cortex-m4', '-mthumb',
                   '-mfpu=fpv4-sp-d16', '-mfloat-abi=hard', '-ffp-contract=off', '-S', path_arg(afile), '-o', path_arg(asm)]
            built = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            assert built.returncode == 0, built.stdout + built.stderr
            assembly = asm.read_text()
            double_helpers = sorted(set(re.findall(r'__aeabi_(?:d\w+|[ifu]2d)\w*', assembly)))
            assert not double_helpers, 'Unexpected software double operation in the game correction'
            assert re.search(r'vdiv\.f32', assembly) and re.search(r'vadd\.f32', assembly)
            report['assembly'].append({'target': 'cortex-m4/FPv4-SP', 'double_helpers': double_helpers,
                'has_float_divide': bool(re.search(r'vdiv\.f32', assembly)),
                'has_float_add': bool(re.search(r'vadd\.f32', assembly)),
                'sha256': hashlib.sha256(asm.read_bytes()).hexdigest(), 'text': assembly})
    report['sources_unchanged'] = hashes == {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    report['passed'] = report['sources_unchanged']
    report['limits'] = ['Trajectory comparison uses actual update/collision functions with deterministic inputs and silent sound stubs, not a complete game or device test.',
        'Float proposal may change rounding; trajectory differences are reported rather than hidden behind a tolerance.',
        'Assembly inspection uses GCC13.3 Cortex-M4 target; the final release map must independently confirm size and helper removal.']
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'passed': report['passed'], 'report': str(args.report) if args.report else None, 'reference': report['reference'], 'runs': report['runs'],
                      'assembly': [{k:v for k,v in row.items() if k != 'text'} for row in report['assembly']]}))

if __name__ == '__main__': main()
