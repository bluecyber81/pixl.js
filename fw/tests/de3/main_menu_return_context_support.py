#!/usr/bin/env python3
"""Production-source assembly support for main-menu input-context regression.

Production module bodies are included without includes. SDK/RF/flash/display
boundaries and non-desktop startup/teardown are fixture services, explicitly
listed in RESULTS. Home callbacks for Chameleon and Amiibo are extracted intact.
No claim of a physical LCD or device/IRQ test is made.

The assemble/function/strip_includes bodies and companion C template are kept
unchanged from the focused lifecycle harness. Only repository-path defaults and
the module wrapper are adapted. Its separate direct-input runner is omitted: the
context regression includes the complete actual mui_input.c instead.
"""
import hashlib
from pathlib import Path
import re

BASE = Path(__file__).resolve().parents[3]
DEFAULT = BASE


def strip_includes(text):
    return re.sub(r"^\s*#\s*include[^\n]*", "", text, flags=re.M)


def function(text, name):
    match = re.search(r"^[A-Za-z_][^\n;{}]*\b" + re.escape(name) + r"\([^;{}]*?\)\s*\{", text, re.M)
    if not match:
        raise AssertionError("function missing: " + name)
    pos = text.index("{", match.start()) + 1
    depth = 1
    while depth:
        depth += (text[pos] == "{") - (text[pos] == "}")
        pos += 1
    return text[match.start():pos]


def assemble(root):
    src = root / "fw/application/src"
    reads = {}

    def read(relative):
        path = src / relative
        reads[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
        return strip_includes(path.read_text(encoding="utf-8"))

    types = "\n".join(read(name) for name in [
        "mui/mui_defines.h", "mui/mui_event.h", "mui/mui_input.h",
        "core/mini_app_defines.h", "core/mini_app_launcher.h", "core/mini_app_registry.h",
        "mui/mui_math.h", "mui/mui_anim.h", "mui/mui_view.h", "mui/mui_view_port.h",
        "mui/mui_core.h", "mui/mui_view_dispatcher.h", "app/desktop/view/app_list_view.h"])
    metadata, images, strings = [], [], []
    apps = ["status_bar", "amiibo", "amiidb", "amiibolink", "chameleon", "player", "game", "ble", "settings"]
    for app in apps:
        text = read(f"app/{app}/app_{app}.c")
        match = re.search(r"(?:const\s+)?mini_app_t\s+app_" + app + r"_info\s*=\s*\{.*?\};", text, re.S)
        assert match, app
        original = match.group()
        body = original
        for field, callback in [("run_cb", "fixture_app_run"), ("kill_cb", "fixture_app_kill"),
                                ("on_event_cb", "fixture_app_event"),
                                ("prepare_exit_cb", "fixture_app_prepare"), ("cancel_exit_cb", "fixture_app_cancel")]:
            body = re.sub(r"(\." + field + r"\s*=\s*)\w+", r"\g<1>" + callback, body)
        body = body.replace("const mini_app_t", "mini_app_t")
        metadata.append(body)
        img = re.search(r"\.icon_32x32\s*=\s*&([A-Za-z0-9_]+)", original)
        if img:
            images.append("static const uint8_t " + img[1] + "_pixels[1]={0};\nstatic const xbm_t " + img[1] + "={.data=" + img[1] + "_pixels};")
        key = re.search(r"\.name_i18n_key\s*=\s*([A-Za-z0-9_]+)", original)
        if key:
            strings.append(key[1])
    symbols = "enum { " + ", ".join(strings) + " };\n" + "\n".join(images)
    modules = "\n".join(read(name) for name in [
        "mui/mui_math.c", "mui/mui_anim.c", "mui/mui_view.c", "mui/mui_view_port.c",
        "mui/mui_view_dispatcher.c", "core/mini_app_launcher.c", "app/desktop/view/app_list_view.c",
        "app/desktop/app_desktop.c"])
    core = read("mui/mui_core.c")
    core_functions = "\n".join(function(core, name) for name in [
        "mui", "mui_find_view_port_enabled", "mui_add_view_port", "mui_remove_view_port",
        "mui_process_input"])
    cham = read("app/chameleon/scene/chameleon_scene_menu.c")
    cham_enum = re.search(r"typedef enum\s*\{.*?\}\s*chameleon_menu_item_t;", cham, re.S).group()
    amiibo = read("app/amiibo/scene/amiibo_scene_file_browser.c")
    amiibo_defines = "\n".join(re.findall(r"^#define\s+(?:ICON_\w+|FOLDER_LIST_\w+|AMIIBO_BROWSER_PAGE_SIZE)\s+[^\n]+", amiibo, re.M))
    homes = cham_enum + "\n" + function(cham, "chameleon_scene_menu_on_event") + "\n" + amiibo_defines + "\n" + function(amiibo, "amiibo_scene_file_browser_on_selected")
    registry = "\n".join(metadata) + "\n" + read("core/mini_app_data.c") + "\n" + read("core/mini_app_registry.c")
    text = (Path(__file__).with_suffix(".c.in")).read_text(encoding="utf-8")
    for key, value in {"TYPES": types, "SYMBOLS": symbols, "MODULES": modules,
                       "CORE_FUNCTIONS": core_functions, "HOMES": homes, "REGISTRY": registry}.items():
        text = text.replace("@" + key + "@", value)
    return text, reads

