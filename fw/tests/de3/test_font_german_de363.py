"""German user text must not depend on incidental current menu/catalogue glyphs.

The actual C u8g2 presence/render assertions are in test_amiidb_qr_de325.py.
This regression also keeps the offline generator from dropping those glyphs
when menus change or only a reduced language set is built.
"""
import importlib.util
import unittest
from unittest.mock import patch
from root_host import FW


class FontGermanTests(unittest.TestCase):
    def test_generator_keeps_user_umlauts_without_menu_or_catalogue_text(self):
        spec = importlib.util.spec_from_file_location("font_data_gen", FW / "scripts/font_data_gen.py")
        generator = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(generator)
        writes = []
        with patch.object(generator, "source_dirs", []), patch.object(generator, "write_to_file",
                side_effect=lambda name, content: writes.append((name, content))):
            generator.extract_non_printable_chars()
        self.assertEqual(len(writes), 1)
        characters = set(writes[0][1].splitlines())
        self.assertTrue(set("ÄÖÜäöüß").issubset(characters))
        bdf = (FW / "data/wenquanyi_9pt_u8g2.bdf").read_text(encoding="utf-8")
        for character in "ÄÖÜäöüß":
            self.assertIn("\nENCODING %d\n" % ord(character), bdf)


if __name__ == "__main__":
    unittest.main()
