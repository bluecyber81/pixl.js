"""Run-mode contracts, independent of native compiler and Unicorn availability."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

import run_offline as runner


class ModeTests(unittest.TestCase):
    def invoke(self, mode, blocked=False):
        with tempfile.TemporaryDirectory() as stage:
            out = Path(stage)/'run'
            groups = []
            def require(group):
                groups.append(group)
                return 'Unavailable in this fixture' if blocked else None
            with mock.patch.object(sys, 'argv', ['run_offline.py', mode, '--output', str(out)]), \
                 mock.patch.object(runner, 'prerequisites', side_effect=require), \
                 mock.patch.object(runner, 'verify_sanitizer_environment', return_value=None), \
                 mock.patch.object(runner.subprocess, 'run', return_value=subprocess.CompletedProcess([],0,'','')):
                code = runner.main()
            return code, groups, json.loads((out/'RUN_RESULT.json').read_bytes())

    def test_host_only_with_no_arm_dependencies(self):
        with mock.patch.object(runner.importlib, 'import_module', side_effect=AssertionError('Unicorn import')), \
             mock.patch.object(runner.shutil, 'which', return_value='/usr/bin/tool'):
            self.assertIsNone(runner.prerequisites('host'))
        code, groups, result = self.invoke('--host-only')
        self.assertEqual((code, groups), (0,['host']))
        self.assertFalse(result['fullSuitePassed'])
        self.assertIsNone(result['elfSha256'])
        self.assertEqual([r['status'] for r in result['tests'] if r['group']=='arm'], ['SKIPPED']*2)

    def test_arm_only_without_unicorn_is_blocked(self):
        with mock.patch.object(runner.importlib, 'import_module', side_effect=ImportError('missing')):
            self.assertIn('Unicorn unavailable', runner.prerequisites('arm'))
        code, groups, result = self.invoke('--arm-only', blocked=True)
        self.assertEqual((code, groups), (2,['arm']))
        self.assertFalse(result['passed'])
        self.assertIsNone(result['hostSanitizers'])
        self.assertEqual([r['status'] for r in result['tests'] if r['group']=='arm'], ['BLOCKED']*2)


if __name__ == '__main__':
    unittest.main()
