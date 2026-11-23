"""Normal-release identity gates before compilation; no SDK or device required."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import build_lcd


class NormalReleaseIdentityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='normal-lcd-release-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.header = self.root / 'fw/application/src/version.inc.h'
        self.header.parent.mkdir(parents=True)
        self.header.write_text('#define VERSION "2.22.0-DE3.98"\n#define TARGET 0\n')
        self.info = {'firmware_channel': 'normal', 'board': 'LCD',
                     'version': '2.22.0-DE3.98', 'counter': 671,
                     'version_header_sha256': hashlib.sha256(self.header.read_bytes()).hexdigest(),
                     'application_sha256': '1' * 64, 'production_source_id_sha256': '2' * 64}

    def identity(self, mode='release', **overrides):
        (self.root / 'RELEASE_INFO.json').write_text(json.dumps({**self.info, **overrides}))
        return build_lcd.build_identity(self.root, mode, None, None)

    def test_release_uses_bound_normal_identity(self):
        self.assertEqual(self.identity(), ('2.22.0-DE3.98', 671, self.info['version_header_sha256']))

    def test_candidate_does_not_claim_unavailable_binary_qualification(self):
        self.assertEqual(self.identity('candidate', application_sha256=None,
                                      production_source_id_sha256=None)[:2], ('2.22.0-DE3.98', 671))
        for field in ('application_sha256', 'production_source_id_sha256'):
            for value in (None, '', 'not-a-digest', '1' * 63, 'F' * 64):
                with self.subTest(field=field, value=value), self.assertRaisesRegex(ValueError, 'qualified'):
                    self.identity(**{field: value})

    def test_changed_header_version_board_and_counter_fail_closed(self):
        for change in ({'board': 'OLED'}, {'version': '2.22.0-DE3.97'},
                       {'version': '2.22.0-DE3.98-test.1'}, {'counter': True},
                       {'counter': 662}, {'counter': 0x100000000}, {'version_header_sha256': '0' * 64}):
            with self.subTest(change=change), self.assertRaisesRegex(ValueError, 'exact header'):
                self.identity(**change)
        self.header.write_text(self.header.read_text() + '#define ALTERED 1\n')
        with self.assertRaisesRegex(ValueError, 'exact header'):
            self.identity()

    def test_normal_release_cannot_be_relabelled_by_cli(self):
        self.identity()
        with self.assertRaisesRegex(ValueError, 'identity is fixed'):
            build_lcd.build_identity(self.root, 'release', '2.22.0-DE3.99', 672)


if __name__ == '__main__':
    unittest.main()
