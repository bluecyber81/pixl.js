"""Reproduce the compact boot font from unchanged BL2 glyph bytes.

Only this isolated candidate's bitmap.h is written. The explicit character map
is reviewed with the fixed DFU status strings; no runtime text or user data is
rendered by this bootloader.
"""
from pathlib import Path
import hashlib
import re

ROOT = Path(__file__).resolve().parents[1]
ORIGINAL = ROOT / "tests/Display/host/original_bitmap.h"
DESTINATION = ROOT / "fw/bootloader/src/bitmap.h"
CHARACTERS = "?" + "".join(sorted(set(" .DEFRUWacdeginoprtvyPruefenSpeichern")))

def full_fonts():
    text = ORIGINAL.read_text(encoding="utf-8")
    result = {}
    for name, width in (("figure_6x8_str", 6), ("ascii_1608", 16)):
        match = re.search(r"const uint8_t " + name + r"\[95\]\[" + str(width) + r"\]\s*=\s*\{(.*?)\n\};", text, re.S)
        assert match, name
        rows = [[int(value, 16) for value in re.findall(r"0x([0-9a-fA-F]{2})", row)]
                for row in re.findall(r"\{([^{}]+)\}", match[1])]
        assert len(rows) == 95 and all(len(row) == width for row in rows), name
        result[name] = rows
    return result

def render():
    fonts = full_fonts()
    digest = hashlib.sha256(ORIGINAL.read_bytes()).hexdigest()
    lines = ["#ifndef BOOTLOADER_COMPACT_BITMAP_H", "#define BOOTLOADER_COMPACT_BITMAP_H", "", "#include <stdint.h>", "",
             "/* Exact original glyphs for the fixed DFU screens plus '?' fallback.",
             " * Other ASCII is intentionally not retained: this bootloader displays",
             " * no dynamic user text. Extend this map and its tests for new messages.",
             " * Reproduce with tests/generate_boot_font.py; original SHA-256:",
             " * " + digest + " */",
             "#define BOOT_FONT_GLYPH_COUNT " + str(len(CHARACTERS)) + "u",
             "static const uint8_t boot_font_chars[BOOT_FONT_GLYPH_COUNT] = {",
             "    " + ", ".join("0x%02x" % ord(c) for c in CHARACTERS), "};", ""]
    for name, width in (("figure_6x8_str", 6), ("ascii_1608", 16)):
        lines += ["static const uint8_t " + name + "[BOOT_FONT_GLYPH_COUNT][" + str(width) + "] = {"]
        for character in CHARACTERS:
            values = fonts[name][ord(character) - 32]
            lines += ["    {" + ",".join("0x%02X" % value for value in values) + "}, /* ASCII " + str(ord(character)) + " */"]
        lines += ["};", ""]
    return "\n".join(lines + ["#endif", ""])

if __name__ == "__main__":
    DESTINATION.write_text(render(), encoding="utf-8", newline="\n")
    print(f"Wrote {DESTINATION}: {len(CHARACTERS)} exact glyphs per font")
