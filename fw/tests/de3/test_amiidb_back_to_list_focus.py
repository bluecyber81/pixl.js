"""Run the real Back action and slot re-entry C against a small in-memory list."""
from pathlib import Path
import re
import subprocess
import unittest

from test_app_startup_allocations import compile_run, function


SRC = Path(__file__).resolve().parents[2] / "application/src"


class BackToListFocus(unittest.TestCase):
    def test_chosen_row_after_detail(self):
        menu = (SRC / "app/amiidb/scene/amiidb_scene_amiibo_detail_menu.c").read_text(encoding="utf-8")
        slots = (SRC / "app/amiidb/scene/amiidb_scene_data_list.c").read_text(encoding="utf-8")
        games = (SRC / "app/amiidb/scene/amiidb_scene_game_list.c").read_text(encoding="utf-8")
        list_view = (SRC / "mui/view/mui_list_view.c").read_text(encoding="utf-8")
        handler = function(menu, "amiidb_scene_amiibo_detail_menu_on_selected")
        action = re.search(r"case AMIIDB_DETAIL_MENU_BACK_FILE_BROWSER:\s*(.*?)\s*break;", handler, re.S)
        self.assertIsNotNone(action)
        # Existing production code redundantly checks uint16_t >= 0.
        functions = ['#pragma GCC diagnostic push\n#pragma GCC diagnostic ignored "-Wtype-limits"',
                     function(list_view, "mui_list_view_set_focus"), '#pragma GCC diagnostic pop',
                     function(list_view, "mui_list_view_get_focus"),
                     function(slots, "amiidb_scene_data_list_reload"),
                     function(slots, "amiidb_scene_data_list_on_enter"),
                     function(games, "amiidb_scene_game_list_on_enter")]
        if "amiidb_scene_detail_back_to_list(" in menu:
            functions.append(function(menu, "amiidb_scene_detail_back_to_list"))
        functions.append("static void back(app_amiidb_t *app) {" + action[1] + "}")
        fixture = Path(__file__).with_name("amiidb_back_to_list_focus.c.in").read_text(encoding="utf-8")
        try:
            compile_run(fixture.replace("/* PRODUCTION */", "\n".join(functions)))
        except subprocess.CalledProcessError as error:
            self.fail(error.stderr or str(error))


if __name__ == "__main__":
    unittest.main()
