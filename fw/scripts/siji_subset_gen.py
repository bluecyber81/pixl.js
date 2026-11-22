#!/usr/bin/env python3
"""Subset the pinned Siji font without recompressing any glyph.

Keep every printable ASCII character and every private-use code point found in
the application sources. The latter is deliberately a conservative superset
of the LCD's icon calls, including optional applications and both board paths.
The full font is a generation/test input only, never a firmware build input.
"""
import argparse
import ast
import hashlib
import json
from pathlib import Path
import re
import tempfile

FONT_SYMBOL = "u8g2_font_siji_t_6x10"
HEADER_SIZE = 23
ASCII = set(range(32, 127))
INDEX_GROUP_SIZE = 32
TOKEN = re.compile(
    r'(?P<comment>/\*.*?\*/|//[^\n]*)'
    r'|(?P<string>"(?:\\.|[^"\\])*")'
    r"|(?P<char>'(?:\\.|[^'\\])*')"
    r'|(?P<number>\b(?:0[xX][0-9a-fA-F]+|[0-9]+)[uUlL]*\b)',
    re.DOTALL,
)


def load_c_font(path):
    source = Path(path).read_text(encoding="utf8")
    declaration = re.search(r'const\s+uint8_t\s+' + FONT_SYMBOL + r'\[(\d+)\]', source)
    if declaration is None:
        raise ValueError("Siji array declaration missing")
    body = source[source.index("=", declaration.end()) + 1:source.rindex(";")]
    data = b"".join(ast.literal_eval("b" + literal)
                    for literal in re.findall(r'"(?:[^"\\]|\\.)*"', body))
    declared = int(declaration.group(1))
    if not data or len(data) > declared:
        raise ValueError("Invalid Siji array size")
    return data + b"\0" * (declared - len(data))


def parse_font(data):
    """Read the format used by this tree's u8g2_font.c, with strict bounds."""
    if len(data) < HEADER_SIZE + 8:
        raise ValueError("Truncated font")
    records = {}
    positions = {}
    pos = HEADER_SIZE
    while pos + 2 <= len(data) and data[pos + 1]:
        code, size = data[pos:pos + 2]
        if size <= 2 or pos + size > len(data) or code in records:
            raise ValueError("Invalid ASCII glyph record")
        records[code] = data[pos:pos + size]
        positions[code] = pos - HEADER_SIZE
        pos += size
    if data[pos:pos + 2] != b"\0\0":
        raise ValueError("ASCII terminator missing")
    pos += 2
    unicode_pos = HEADER_SIZE + int.from_bytes(data[21:23], "big")
    if unicode_pos != pos:
        raise ValueError("Unicode position does not follow ASCII")
    for code, header_pos in ((ord("A"), 17), (ord("a"), 19)):
        if positions.get(code) != int.from_bytes(data[header_pos:header_pos + 2], "big"):
            raise ValueError("ASCII lookup offset mismatch")
    index_size = int.from_bytes(data[pos:pos + 2], "big")
    if index_size < 4 or index_size % 4 or pos + index_size + 2 > len(data):
        raise ValueError("Invalid Unicode lookup table")
    if data[pos + index_size - 2:pos + index_size] != b"\xff\xff":
        raise ValueError("Unicode index must cover the final lookup range")
    pos += index_size
    previous = 255
    while pos + 2 <= len(data) and (code := int.from_bytes(data[pos:pos + 2], "big")):
        if pos + 3 > len(data):
            raise ValueError("Truncated Unicode glyph")
        size = data[pos + 2]
        if code <= previous or size <= 3 or pos + size > len(data):
            raise ValueError("Invalid Unicode glyph record")
        records[code] = data[pos:pos + size]
        previous = code
        pos += size
    if data[pos:] != b"\0\0":
        raise ValueError("Unicode terminator or font size mismatch")
    if data[0] != len(records) % 256:
        raise ValueError("Glyph count mismatch")
    return records, unicode_pos


def c_literal_bytes(literal):
    """Decode C strings/chars so UTF-8, octal, hex and universal icons count."""
    result = bytearray()
    text = literal[1:-1]
    escapes = {"a": 7, "b": 8, "f": 12, "n": 10, "r": 13, "t": 9, "v": 11,
               "\\": 92, '"': 34, "'": 39, "?": 63}
    pos = 0
    while pos < len(text):
        char = text[pos]
        pos += 1
        if char != "\\":
            result.extend(char.encode("utf8"))
            continue
        if pos >= len(text):
            raise ValueError("Incomplete C escape")
        char = text[pos]
        pos += 1
        if char in escapes:
            result.append(escapes[char])
        elif char == "\n":
            continue
        elif char in "01234567":
            digits = char
            while pos < len(text) and len(digits) < 3 and text[pos] in "01234567":
                digits += text[pos]
                pos += 1
            result.append(int(digits, 8) & 255)
        elif char == "x":
            end = pos
            while end < len(text) and text[end] in "0123456789abcdefABCDEF":
                end += 1
            if end == pos:
                raise ValueError("Incomplete C hex escape")
            result.append(int(text[pos:end], 16) & 255)
            pos = end
        elif char in "uU":
            size = 4 if char == "u" else 8
            result.extend(chr(int(text[pos:pos + size], 16)).encode("utf8"))
            pos += size
        else:
            raise ValueError("Unsupported C escape: " + char)
    return bytes(result)


def source_references(source_root):
    references = {}
    source_root = Path(source_root)
    for path in sorted(source_root.rglob("*")):
        if path.suffix not in (".c", ".h") or path.name.startswith("u8g2_font_"):
            continue
        source = path.read_text(encoding="utf8")
        for match in TOKEN.finditer(source):
            if match.lastgroup == "comment":
                continue
            if match.lastgroup == "number":
                literal = match.group().rstrip("uUlL")
                number = int(literal, 16 if literal.lower().startswith("0x") else 10)
                codes = [number]
            else:
                codes = map(ord, c_literal_bytes(match.group()).decode("utf8", errors="ignore"))
            for code in codes:
                if 0xe000 <= code <= 0xf8ff:
                    location = f"{path.relative_to(source_root).as_posix()}:{source.count(chr(10), 0, match.start()) + 1}"
                    locations = references.setdefault(code, [])
                    if location not in locations:
                        locations.append(location)
    return references


def subset_font(full_font, required):
    records, unicode_pos = parse_font(full_font)
    required = set(required) | ASCII
    missing = required - records.keys()
    if missing:
        raise ValueError("Missing source glyphs: " + ", ".join(f"U+{code:04X}" for code in sorted(missing)))
    # Preserve the entire original ASCII section and its 'A'/'a' lookup offsets.
    required.update(code for code in records if code <= 255)
    unicode_codes = sorted(code for code in required if code > 255)
    groups = [unicode_codes[pos:pos + INDEX_GROUP_SIZE]
              for pos in range(0, len(unicode_codes), INDEX_GROUP_SIZE)] or [[]]
    index = bytearray()
    offset = 4 * len(groups)
    for group_number, group in enumerate(groups):
        upper = group[-1] if group_number + 1 < len(groups) else 0xffff
        if offset > 65535:
            raise ValueError("Unicode lookup offset overflow")
        index.extend(offset.to_bytes(2, "big") + upper.to_bytes(2, "big"))
        offset = sum(len(records[code]) for code in group)
    output = bytearray(full_font[:unicode_pos])
    output[0] = len(required) % 256
    output.extend(index)
    for code in unicode_codes:
        output.extend(records[code])
    output.extend(b"\0\0")
    parsed, _ = parse_font(output)
    if set(parsed) != required or any(parsed[code] != records[code] for code in required):
        raise ValueError("Subset changed a retained glyph")
    return bytes(output)


def render_c(font):
    lines = ['/* Generated by fw/scripts/siji_subset_gen.py; retained glyph records are unchanged. */',
             '#include "mui_u8g2.h"', '#include "u8x8.h"', '',
             f'const uint8_t {FONT_SYMBOL}[{len(font)}] U8G2_FONT_SECTION("{FONT_SYMBOL}") =']
    # The final C string terminator supplies exactly the last font terminator.
    for pos in range(0, len(font) - 1, 24):
        lines.append('    "' + ''.join(f'\\{byte:03o}' for byte in font[pos:min(pos + 24, len(font) - 1)]) + '"')
    lines[-1] += ';'
    return "\n".join(lines) + "\n"


def atomic_write(path, text):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf8", newline="\n",
                                     dir=path.parent, delete=False) as temp:
        temporary = Path(temp.name)
        try:
            temp.write(text)
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    fw = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", type=Path, default=fw / "data/siji_t_6x10_full.c")
    parser.add_argument("--source-root", type=Path, default=fw / "application/src")
    parser.add_argument("--output", type=Path, default=fw / "application/src/mui/u8g2_font_siji_t_6x10.c")
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    full_font = load_c_font(args.base)
    references = source_references(args.source_root)
    font = subset_font(full_font, references)
    rendered = render_c(font)
    if args.check:
        if not args.output.exists() or args.output.read_text(encoding="utf8") != rendered:
            raise SystemExit("Siji subset is stale; rerun fw/scripts/siji_subset_gen.py")
    else:
        atomic_write(args.output, rendered)
    manifest = {
        "fullBytes": len(full_font), "subsetBytes": len(font),
        "savedFontBytes": len(full_font) - len(font), "asciiGlyphs": len(ASCII),
        "privateUseGlyphs": len(references), "fullFontSha256": hashlib.sha256(full_font).hexdigest(),
        "subsetFontSha256": hashlib.sha256(font).hexdigest(),
        "references": {f"U+{code:04X}": references[code] for code in sorted(references)},
    }
    if args.manifest:
        atomic_write(args.manifest, json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({key: value for key, value in manifest.items() if key != "references"}, sort_keys=True))


if __name__ == "__main__":
    main()
