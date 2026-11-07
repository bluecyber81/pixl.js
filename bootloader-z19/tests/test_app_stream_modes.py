"""CLI/sanitizer-report contracts; native DFU execution is intentionally not mocked as PASS."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('stream', HERE/'DFU_Stream/check_app_stream.py')
stream = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stream)


class StreamModeTests(unittest.TestCase):
    def test_current_signed_release_is_pinned_for_resume(self):
        root = HERE.parents[1]
        if not (root / 'RELEASE_INFO.json').exists() and not (root / 'fw/releases').is_dir():
            self.skipTest('Release ZIP binding requires the complete repository.')
        release = json.loads((root / 'RELEASE_INFO.json').read_text())
        archive = root / release['application_ota_path']
        archive_hash = hashlib.sha256(archive.read_bytes()).hexdigest()
        self.assertEqual(archive_hash, release['ota_sha256'])
        self.assertEqual(stream.RELEASE_PAYLOADS[archive_hash], release['application_sha256'])

    def check_blocked(self, no_leak):
        with tempfile.TemporaryDirectory() as tmp:
            stage = Path(tmp)
            image = stage/'app.bin'
            image.write_bytes(bytes(12288))
            output = stage/'result.json'
            argv = ['check_app_stream.py', '--test-bin', str(image), '--expected-sha256',
                    hashlib.sha256(image.read_bytes()).hexdigest(), '--output', str(output)]
            if no_leak:
                argv.append('--no-leak-check')
            observed = []
            def control(env, leaks, out):
                observed.append((env, leaks))
                (out/'sanitizer-control.log').write_text('Controlled unavailable sanitizer fixture.\n')
                return 'Controlled prerequisite unavailable'
            with mock.patch.object(sys, 'argv', argv), \
                 mock.patch.object(stream, 'verify_sanitizer_environment', side_effect=control), \
                 mock.patch.object(stream.subprocess, 'run') as native:
                self.assertEqual(stream.main(), 2)
                native.assert_not_called()
            result = json.loads(output.read_text())
            self.assertFalse(result['passed'])
            self.assertEqual(result['status'], 'BLOCKED')
            self.assertFalse(result['leakDetectionConfirmed'])
            self.assertEqual(result['leakDetectionEnabled'], not no_leak)
            self.assertEqual(observed[0][1], not no_leak)
            self.assertIn('detect_leaks='+str(int(not no_leak)), result['sanitizerOptions']['ASAN_OPTIONS'])
            self.assertEqual(result['sanitizerOptions']['UBSAN_OPTIONS'], 'halt_on_error=1')
            self.assertIn('Controlled unavailable', result['sanitizerControlLog'])

    def test_default_keeps_leaks_and_reports_blocked(self):
        self.check_blocked(False)

    def test_explicit_no_leaks_is_truthful_and_keeps_ubsan(self):
        self.check_blocked(True)

    def test_missing_compiler_is_reported_as_blocked(self):
        with tempfile.TemporaryDirectory() as tmp:
            stage = Path(tmp)
            image = stage/'app.bin'
            image.write_bytes(bytes(12288))
            output = stage/'result.json'
            argv = ['check_app_stream.py', '--test-bin', str(image), '--expected-sha256',
                    hashlib.sha256(image.read_bytes()).hexdigest(), '--output', str(output)]
            with mock.patch.object(sys, 'argv', argv), mock.patch.dict(os.environ, PATH=''):
                self.assertEqual(stream.main(), 2)
            result = json.loads(output.read_text())
            self.assertEqual(result['status'], 'BLOCKED')
            self.assertFalse(result['passed'])
            self.assertFalse(result['leakDetectionConfirmed'])
            self.assertIn('gcc', result['sanitizerControlLog'])


if __name__ == '__main__':
    unittest.main()
