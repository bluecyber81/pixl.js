"""Extract the real input-generation state/API for otherwise isolated fixtures.

Pass source_text when testing another firmware root, so a predecessor/negative
control cannot silently acquire current production behavior. Consumers must
stamp intentionally current synthetic events; stale events stay unmodified.
"""
from pathlib import Path
import re

INPUT = Path(__file__).resolve().parents[2] / "application/src/mui/mui_input.c"
TOKEN_FUNCTIONS = ("mui_input_context_token", "mui_input_tag_current_event", "mui_input_event_is_current")


def input_source(source_text=None):
    return INPUT.read_text(encoding="utf-8") if source_text is None else source_text


def has_context_api(source_text=None):
    return "void mui_input_context_changed(void)" in input_source(source_text)


def context_state(gestures=False, source_text=None):
    text = input_source(source_text)
    names = ["input_context"] + (["button_context"] if gestures else [])
    pieces = []
    for name in names:
        found = re.search(r"^static[^\n;]*\b" + name + r"\b[^\n;]*;", text, re.M)
        if not found:
            raise AssertionError("Production input state missing: " + name)
        pieces.append(found.group())
    return "\n".join(pieces) + "\n"


def context_functions(names=TOKEN_FUNCTIONS, source_text=None):
    text = input_source(source_text)
    pieces = []
    for name in names:
        match = re.search(r"^[A-Za-z_][^\n;{}]*\b" + re.escape(name) + r"\([^;{}]*?\)\s*\{", text, re.M)
        if not match:
            raise AssertionError("Production input function missing: " + name)
        end = text.index("{", match.start()) + 1
        depth = 1
        while depth:
            depth += (text[end] == "{") - (text[end] == "}")
            end += 1
        pieces.append(text[match.start():end])
    return "\n".join(pieces) + "\n"
