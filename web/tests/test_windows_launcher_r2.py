"""Bounded real loopback integration checks; not Windows policy/device tests."""
import contextlib
import errno
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import Mock, patch

SOURCE = Path(__file__).resolve().parents[1]


class LauncherTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='Allmiibo Test ä & space ! ')
        self.root = Path(self.tmp.name)
        for name in ['dateimanager_launcher.py', 'serve_local.py']:
            shutil.copyfile(SOURCE / name, self.root / name)
        (self.root / 'dist').mkdir()
        (self.root / 'dist/index.html').write_text('<!doctype html><title>T1</title>test', encoding='utf-8')
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            self.port = sock.getsockname()[1]
        self.state_path = self.root / ('server-state-{}.json'.format(self.port))
        self.original_state = None
        spec = importlib.util.spec_from_file_location('launcher_under_test', self.root / 'dateimanager_launcher.py')
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)

    def tearDown(self):
        if self.original_state:
            self.state_path.write_text(json.dumps(self.original_state), encoding='utf-8')
            self.run_launcher('stop')
        self.tmp.cleanup()

    def run_launcher(self, action, *extra):
        env = os.environ.copy()
        env.update({'PYTHONDONTWRITEBYTECODE': '1', 'HTTP_PROXY': 'http://127.0.0.1:1', 'HTTPS_PROXY': 'http://127.0.0.1:1', 'NO_PROXY': ''})
        return subprocess.run([sys.executable, str(self.root / 'dateimanager_launcher.py'), action,
                               '-Port', str(self.port), '-NoBrowser', *extra],
                              capture_output=True, text=True, timeout=12, env=env, cwd=self.root.parent)

    def start(self):
        result = self.run_launcher('start')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.original_state = json.loads(self.state_path.read_text())
        return result

    def test_real_start_repeat_health_and_stop_in_nontrivial_path(self):
        self.start()
        health = self.module.request(self.port)
        self.assertTrue(self.module.matches(health, self.original_state))
        repeated = self.run_launcher('start')
        self.assertEqual(repeated.returncode, 0, repeated.stderr)
        self.assertIn('laeuft bereits', repeated.stdout)
        self.assertEqual(json.loads(self.state_path.read_text()), self.original_state)
        result = self.run_launcher('stop')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.state_path.exists())
        self.assertFalse(self.module.listening(self.port))
        self.original_state = None

    def test_bom_state_from_previous_powershell_launcher(self):
        self.start()
        self.state_path.write_text(json.dumps(self.original_state), encoding='utf-8-sig')
        result = self.run_launcher('start')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.run_launcher('stop').returncode, 0)
        self.original_state = None

    def test_foreign_listener_is_never_adopted_or_stopped(self):
        calls = []
        class ForeignHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                calls.append('GET')
                body = b'{"application":"allmiibo-dateimanager","version":"3.48.3","instance":"foreign"}'
                self.send_response(200)
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            def do_POST(self):
                calls.append('POST')
                self.send_response(500)
                self.end_headers()
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(('127.0.0.1', self.port), ForeignHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            result = self.run_launcher('start')
            self.assertEqual(result.returncode, 1)
            self.assertFalse(self.state_path.exists())
            state = self.valid_state()
            self.state_path.write_text(json.dumps(state))
            before = self.state_path.read_bytes()
            result = self.run_launcher('stop')
            self.assertEqual(result.returncode, 1)
            self.assertEqual(self.state_path.read_bytes(), before)
            self.assertTrue(self.module.listening(self.port))
            self.assertNotIn('POST', calls)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def valid_state(self):
        token = 'a' * 32
        return {'schema': 1, 'port': self.port, 'url': self.module.address(self.port),
                'token': token, 'instance': hashlib.sha256(token.encode()).hexdigest()}

    def test_malformed_state_kept_without_server_start(self):
        self.state_path.write_text('{broken')
        for action in ['start', 'stop']:
            result = self.run_launcher(action)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(self.state_path.read_text(), '{broken')
            self.assertFalse(self.module.listening(self.port))

    def test_state_token_mismatch_rejected(self):
        state = self.valid_state()
        state['instance'] = '0' * 64
        self.state_path.write_text(json.dumps(state))
        self.assertEqual(self.run_launcher('start').returncode, 1)
        self.assertFalse(self.module.listening(self.port))

    def test_missing_dist_fails_before_spawn(self):
        (self.root / 'dist/index.html').unlink()
        result = self.run_launcher('start')
        self.assertEqual(result.returncode, 1)
        self.assertFalse(self.state_path.exists())
        self.assertFalse(self.module.listening(self.port))

    def test_cli_invalid_port_and_argument(self):
        self.assertEqual(self.run_launcher('start', '-Port', '80').returncode, 2)
        self.assertEqual(self.run_launcher('start', '--unknown').returncode, 2)
        self.assertFalse(self.state_path.exists())

    def test_stale_valid_state_can_restart(self):
        self.state_path.write_text(json.dumps(self.valid_state()))
        self.start()
        self.assertNotEqual(self.original_state['token'], 'a' * 32)

    def mock_listener_error(self, error):
        if os.name == 'nt':
            return patch.object(self.module, 'windows_loopback_listener', side_effect=error)
        return patch.object(self.module.socket, 'create_connection', side_effect=error)

    def test_ambiguous_port_timeout_preserves_state(self):
        self.state_path.write_text(json.dumps(self.valid_state()))
        before = self.state_path.read_bytes()
        with self.mock_listener_error(TimeoutError('test')):
            with self.assertRaises(self.module.LauncherError):
                self.module.stop(self.port)
        self.assertEqual(self.state_path.read_bytes(), before)

    def test_state_write_failure_cleans_owned_child(self):
        with patch.object(self.module, 'write_state', side_effect=OSError('controlled write failure')):
            with self.assertRaises(OSError):
                self.module.start(self.port, True)
        self.assertFalse(self.module.listening(self.port))
        self.assertFalse(self.state_path.exists())

    def test_browser_failure_keeps_started_server(self):
        # This check invokes start in the test process. Retain/reap its child
        # here; ordinary CLI use intentionally leaves the server detached.
        original_popen = self.module.subprocess.Popen
        children = []
        def tracked_popen(*args, **kwargs):
            child = original_popen(*args, **kwargs)
            children.append(child)
            return child
        with patch.object(self.module.subprocess, 'Popen', side_effect=tracked_popen), \
                patch.object(self.module.webbrowser, 'open', return_value=False), \
                contextlib.redirect_stdout(io.StringIO()) as output:
            self.module.start(self.port, False)
        self.original_state = json.loads(self.state_path.read_text())
        try:
            self.assertIn(self.module.address(self.port), output.getvalue())
            self.assertIn('selbst', output.getvalue())
            self.assertTrue(self.module.matches(self.module.request(self.port), self.original_state))
        finally:
            self.module.stop(self.port)
            for child in children:
                child.wait(timeout=2)
            self.original_state = None

    def test_folder_lock_rejects_second_operation(self):
        with self.module.port_lock(self.port):
            result = self.run_launcher('start')
        self.assertEqual(result.returncode, 1)
        self.assertIn('laeuft bereits', result.stderr)
        self.assertFalse(self.state_path.exists())

    @contextlib.contextmanager
    def owned_children(self):
        original_popen = self.module.subprocess.Popen
        children = []
        def tracked_popen(*args, **kwargs):
            child = original_popen(*args, **kwargs)
            children.append(child)
            return child
        try:
            with patch.object(self.module.subprocess, 'Popen', side_effect=tracked_popen):
                yield children
        finally:
            for child in children:
                if child.poll() is None:
                    child.terminate()
                child.wait(timeout=3)

    def test_cold_start_ignores_simulated_failed_legacy_probe(self):
        original_connect = socket.create_connection
        calls = []
        def fail_only_old_probe(address, timeout=socket._GLOBAL_DEFAULT_TIMEOUT, *args, **kwargs):
            calls.append(timeout)
            if timeout == 0.4:
                raise TimeoutError(errno.ETIMEDOUT, 'simulated legacy 0.4-second probe failure')
            return original_connect(address, timeout, *args, **kwargs)
        # Real server/HTTP on Linux; only the old short probe failure is simulated.
        with self.owned_children(), \
                patch.object(self.module.socket, 'create_connection', side_effect=fail_only_old_probe), \
                patch.object(self.module, 'listening', side_effect=AssertionError('No negative start probe')):
            self.module.start(self.port, True)
            state = json.loads(self.state_path.read_text())
            self.assertTrue(self.module.matches(self.module.request(self.port), state))
        self.assertTrue(calls)
        self.assertNotIn(0.4, calls)

    def test_existing_health_match_reuses_without_probe_or_spawn(self):
        self.start()
        before = self.state_path.read_bytes()
        with patch.object(self.module, 'listening', side_effect=AssertionError('No negative start probe')), \
                patch.object(self.module.subprocess, 'Popen', side_effect=AssertionError('No second server')):
            self.module.start(self.port, True)
        self.assertEqual(self.state_path.read_bytes(), before)

    def test_bind_failure_keeps_old_state_and_reports_own_error(self):
        class ForeignHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(404)
                self.send_header('Content-Length', '0')
                self.end_headers()
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(('127.0.0.1', self.port), ForeignHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        state = self.valid_state()
        self.state_path.write_text(json.dumps(state))
        before = self.state_path.read_bytes()
        log_path = self.module.error_log_path(self.port)
        log_path.write_text('PRIOR_ATTEMPT_SHOULD_NOT_APPEAR\n')
        try:
            result = self.run_launcher('start')
            self.assertEqual(result.returncode, 1, result.stdout)
            self.assertEqual(self.state_path.read_bytes(), before)
            self.assertTrue(self.module.listening(self.port))
            self.assertIn('SERVERFEHLER:', result.stderr)
            self.assertIn('errno=', result.stderr)
            self.assertIn('winerror=', result.stderr)
            self.assertIn(str(log_path), result.stderr)
            self.assertNotIn('PRIOR_ATTEMPT_SHOULD_NOT_APPEAR', result.stderr)
            self.assertNotIn(state['token'], result.stderr + log_path.read_text())
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_stop_timeout_and_simulated_winerror_keep_state_with_details(self):
        failures = [TimeoutError(errno.ETIMEDOUT, 'simulated timeout'),
                    PermissionError(errno.EACCES, 'simulated Windows socket denial')]
        failures[1].winerror = 10013
        for failure in failures:
            with self.subTest(exception=type(failure).__name__):
                self.state_path.write_text(json.dumps(self.valid_state()))
                before = self.state_path.read_bytes()
                with self.mock_listener_error(failure) as check_port, \
                        contextlib.redirect_stderr(io.StringIO()) as errors:
                    code = self.module.main(['stop', '-Port', str(self.port)])
                self.assertEqual(code, 1)
                self.assertEqual(self.state_path.read_bytes(), before)
                check_port.assert_called_once()
                self.assertIn(type(failure).__name__, errors.getvalue())
                self.assertIn('errno={}'.format(failure.errno), errors.getvalue())
                self.assertIn('winerror={}'.format(getattr(failure, 'winerror', None)), errors.getvalue())
                self.assertIn(str(self.module.error_log_path(self.port)), errors.getvalue())

    def test_stop_explicit_refusal_removes_stale_state(self):
        self.state_path.write_text(json.dumps(self.valid_state()))
        refusal = OSError('simulated Windows connection refusal')
        refusal.winerror = 10061
        probe = (patch.object(self.module, 'windows_loopback_listener', return_value=False)
                 if os.name == 'nt' else self.mock_listener_error(refusal))
        with probe:
            self.module.stop(self.port)
        self.assertFalse(self.state_path.exists())

    def test_spawn_failure_reports_errno_winerror_without_token(self):
        state = self.valid_state()
        self.state_path.write_text(json.dumps(state))
        before = self.state_path.read_bytes()
        failure = PermissionError(errno.EACCES, 'controlled denial ' + state['token'])
        failure.winerror = 5
        with patch.object(self.module, 'request', return_value=None), \
                patch.object(self.module.subprocess, 'Popen', side_effect=failure), \
                contextlib.redirect_stderr(io.StringIO()) as errors:
            code = self.module.main(['start', '-Port', str(self.port), '-NoBrowser'])
        self.assertEqual(code, 1)
        self.assertEqual(self.state_path.read_bytes(), before)
        self.assertIn('PermissionError', errors.getvalue())
        self.assertIn('errno={}'.format(errno.EACCES), errors.getvalue())
        self.assertIn('winerror=5', errors.getvalue())
        self.assertIn(str(self.module.error_log_path(self.port)), errors.getvalue())
        self.assertNotIn(state['token'], errors.getvalue())

    def test_health_errors_expose_exception_details_without_token(self):
        failure = TimeoutError(errno.ETIMEDOUT, 'simulated health timeout')
        failure.winerror = 10060
        errors = []
        with patch.object(self.module.socket, 'create_connection', side_effect=failure) as connect:
            self.assertIsNone(self.module.request(self.port, errors=errors))
        self.assertEqual(connect.call_args.args[1], 2.0)
        self.assertIn('TimeoutError', errors[-1])
        self.assertIn('winerror=10060', errors[-1])

    @unittest.skipIf(os.name == 'nt', 'POSIX signal integration; native Windows Ctrl+C is not tested here')
    def test_real_direct_start_ctrl_c_and_unchanged_state(self):
        # An unreadable-as-JSON state deliberately proves direct mode is independent.
        self.state_path.write_bytes(b'{this state must stay untouched}')
        before = self.state_path.read_bytes()
        child = subprocess.Popen([sys.executable, str(self.root / 'dateimanager_launcher.py'),
                                  'direct', '-Port', str(self.port)],
                                 cwd=str(self.root.parent), start_new_session=True,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            deadline = time.monotonic() + 5
            health = None
            while time.monotonic() < deadline and child.poll() is None:
                health = self.module.request(self.port, timeout=0.3)
                if health is not None:
                    break
                time.sleep(0.05)
            self.assertIsNotNone(health, 'Direct server did not answer')
            self.assertEqual(health['version'], '3.48.3')
            self.assertEqual(self.state_path.read_bytes(), before)
            self.assertFalse((self.root / 'launcher-{}.lock'.format(self.port)).exists())
            self.assertFalse(self.module.error_log_path(self.port).exists())
            os.killpg(child.pid, signal.SIGINT)
            output, errors = child.communicate(timeout=5)
            self.assertIn(child.returncode, (0, 130), errors)
            self.assertIn(self.module.address(self.port), output)
            self.assertIn('Strg+C', output)
            self.assertIn('Stop-Dateimanager.cmd', output)
            self.assertFalse(self.module.listening(self.port))
            self.assertEqual(self.state_path.read_bytes(), before)
        finally:
            if child.poll() is None:
                os.killpg(child.pid, signal.SIGKILL)
                child.communicate(timeout=3)

    def test_real_direct_bind_error_has_no_probe_or_state_change(self):
        calls = []
        class ForeignHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                calls.append('GET')
                self.send_response(404)
                self.end_headers()
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(('127.0.0.1', self.port), ForeignHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.state_path.write_bytes(b'{unchanged even on direct bind failure}')
        before = self.state_path.read_bytes()
        try:
            result = self.run_launcher('direct')
            self.assertEqual(result.returncode, 1)
            self.assertIn('SERVERFEHLER:', result.stderr)
            self.assertIn('errno=', result.stderr)
            self.assertNotIn(self.module.address(self.port), result.stdout)
            self.assertEqual(self.state_path.read_bytes(), before)
            self.assertEqual(calls, [])
            self.assertTrue(self.module.listening(self.port))
            self.assertFalse((self.root / 'launcher-{}.lock'.format(self.port)).exists())
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_direct_propagates_server_exit_code(self):
        (self.root / 'serve_local.py').write_text('raise SystemExit(23)\n')
        result = self.run_launcher('direct')
        self.assertEqual(result.returncode, 23)
        self.assertFalse(self.state_path.exists())

    def test_windows_exclusive_bind_options_simulated_before_bind(self):
        # Explicit simulation on this Linux runner: no native Winsock claim.
        spec = importlib.util.spec_from_file_location('server_under_test', self.root / 'serve_local.py')
        server_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(server_module)
        server = server_module.LocalHTTPServer.__new__(server_module.LocalHTTPServer)
        server.socket = Mock()
        events = []
        server.socket.setsockopt.side_effect = lambda *args: events.append(('option', args))
        with patch.object(server_module.os, 'name', 'nt'), \
                patch.object(server_module.socket, 'SO_EXCLUSIVEADDRUSE', -5, create=True), \
                patch.object(server_module.ThreadingHTTPServer, 'server_bind',
                             side_effect=lambda: events.append(('bind', None))):
            server.server_bind()
        self.assertFalse(server.allow_reuse_address)
        self.assertFalse(server.allow_reuse_port)
        expected = [('option', (socket.SOL_SOCKET, socket.SO_REUSEADDR, 0))]
        if hasattr(socket, 'SO_REUSEPORT'):
            expected.append(('option', (socket.SOL_SOCKET, socket.SO_REUSEPORT, 0)))
        expected.extend([('option', (socket.SOL_SOCKET, -5, 1)), ('bind', None)])
        self.assertEqual(events, expected)

    @unittest.skipIf(os.name == 'nt', 'Linux/POSIX socket behavior check')
    def test_linux_bind_behavior_is_preserved(self):
        spec = importlib.util.spec_from_file_location('server_under_test', self.root / 'serve_local.py')
        server_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(server_module)
        with server_module.LocalHTTPServer(('127.0.0.1', 0), BaseHTTPRequestHandler) as server:
            self.assertEqual(server.socket.getsockname()[0], '127.0.0.1')
            self.assertEqual(server.socket.getsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR),
                             int(ThreadingHTTPServer.allow_reuse_address))


if __name__ == '__main__':
    unittest.main(verbosity=2)
