"""Build the real Save As scene handlers against the host view callbacks."""
import re


def function_body(source, name):
    declaration = re.search(r"(?m)^(?:static )?void " + name + r"\([^;{}]*\)\s*\{", source)
    if not declaration:
        raise ValueError(f"Missing scene function: {name}")
    depth = 1
    for i in range(declaration.end(), len(source)):
        if source[i] == "{":
            depth += 1
        elif source[i] == "}":
            depth -= 1
            if depth == 0:
                return source[declaration.start():i + 1]
    raise ValueError(f"Unclosed scene function: {name}")


def render_slot_scene(work, tests, src):
    (work / "settings.h").write_text("""#pragma once
#include <stdint.h>
typedef struct {uint8_t amiidb_data_slot_num;} settings_data_t;
settings_data_t *settings_get_data(void);
#define LANGUAGE_DE_DE 3
int getLanguage(void);
int isChineseLanguage(void);
""")
    (work / "amiibo_helper.h").write_text("""#pragma once
#include <stdint.h>
static inline uint32_t to_little_endian_int32(const uint8_t *p) {
    return ((uint32_t)p[0]<<24) | ((uint32_t)p[1]<<16) | ((uint32_t)p[2]<<8) | p[3];
}
""")
    scene = src / "app/amiidb/scene"
    list_scene = (scene / "amiidb_scene_data_list.c").read_text(encoding="utf-8")
    select_scene = (scene / "amiidb_scene_data_select.c").read_text(encoding="utf-8")
    start = select_scene.index("static void save_to_slot")
    end = select_scene.index("static void amiidb_scene_data_select_setup")
    handlers = [
        function_body(list_scene, "amiidb_scene_data_list_amiibo_slot_info_cb"),
        function_body(list_scene, "amiidb_scene_data_list_reload"),
        select_scene[start:end],
        function_body(select_scene, "amiidb_scene_data_select_on_enter"),
    ]
    harness = (tests / "slot_save_guard_host.c.in").read_text(encoding="utf-8")
    return harness.replace("UI_FUNCTIONS", "\n".join(handlers))
