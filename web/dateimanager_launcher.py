"""Start/stop the packaged loopback server without a PowerShell script.

Standard library only. Existing listeners are used only after checking this
folder's saved instance. A stop request never uses a PID or a proxy/redirect.
"""
import argparse
from contextlib import contextmanager
import errno
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import webbrowser

ROOT = Path(__file__).resolve().parent
VERSION = '3.48.0'
HEALTH = '/.well-known/allmiibo-dateimanager'


class LauncherError(Exception):
    pass


def address(port):
    return 'http://127.0.0.1:{}/'.format(port)


def safe_detail(value):
    # Do not disclose instance tokens (or their hashes) in diagnostics.
    return re.sub(r'[a-fA-F0-9]{32,64}', '[Kennung ausgeblendet]', str(value))


def exception_detail(exc):
    return '{} (errno={}, winerror={}): {}'.format(
        type(exc).__name__, getattr(exc, 'errno', None),
        getattr(exc, 'winerror', None), safe_detail(exc))


def error_log_path(port):
    return ROOT / ('server-{}-errors.log'.format(port))


def child_failure(child, log_path, log_start):
    # Read only this launch attempt, not an earlier failure in the append log.
    detail = ''
    try:
        with log_path.open('rb') as stream:
            stream.seek(log_start)
            lines = stream.read(8192).decode('utf-8', errors='replace').strip().splitlines()
        if lines:
            detail = ' Servermeldung: ' + safe_detail(lines[-1])
    except OSError as exc:
        detail = ' Protokoll nicht lesbar: ' + exception_detail(exc)
    return LauncherError('Der eigene Server konnte nicht starten (Exitcode {}).{} Fehlerprotokoll: {}'.format(
        child.returncode, detail, log_path))


def listening(port):
    # Used only by stop: an ambiguous result must retain the saved state.
    try:
        if os.name == 'nt':
            return windows_loopback_listener(port)
        with socket.create_connection(('127.0.0.1', port), timeout=2.0):
            return True
    except OSError as exc:
        if os.name != 'nt' and (exc.errno == errno.ECONNREFUSED or getattr(exc, 'winerror', None) == 10061):
            return False
        raise LauncherError('Der Zustand von Port {} konnte nicht sicher bestimmt werden. Status bleibt erhalten. {} Fehlerprotokoll (falls angelegt): {}'.format(
            port, exception_detail(exc), error_log_path(port))) from None


def windows_loopback_listener(port):
    """Check for an IPv4 LISTEN socket on this loopback port without opening a connection."""
    import ctypes
    from ctypes import wintypes

    class TcpRow(ctypes.Structure):
        _fields_ = [(field, wintypes.DWORD) for field in
                    ('state', 'local_addr', 'local_port', 'remote_addr', 'remote_port')]

    class TcpTable(ctypes.Structure):
        _fields_ = [('count', wintypes.DWORD), ('rows', TcpRow * 1)]

    get_table = ctypes.WinDLL('iphlpapi').GetTcpTable
    get_table.argtypes = (ctypes.c_void_p, ctypes.POINTER(wintypes.DWORD), wintypes.BOOL)
    get_table.restype = wintypes.DWORD
    size = wintypes.DWORD()
    buffer = None
    # The table can grow after Windows returns the required buffer size.
    for _ in range(4):
        status = get_table(buffer, ctypes.byref(size), False)
        if status == 122:  # ERROR_INSUFFICIENT_BUFFER
            buffer = ctypes.create_string_buffer(size.value)
            continue
        if status:
            raise ctypes.WinError(status)
        if buffer is None or len(buffer) < TcpTable.rows.offset:
            raise OSError('Unvollstaendige Windows-TCP-Tabelle.')
        count = wintypes.DWORD.from_buffer(buffer).value
        if count > (len(buffer) - TcpTable.rows.offset) // ctypes.sizeof(TcpRow):
            raise OSError('Unvollstaendige Windows-TCP-Tabelle.')
        rows = (TcpRow * count).from_buffer(buffer, TcpTable.rows.offset)
        loopback = int.from_bytes(socket.inet_aton('127.0.0.1'), sys.byteorder)
        return any(row.state == 2 and row.local_addr in (0, loopback)
                   and socket.ntohs(row.local_port & 0xffff) == port for row in rows)
    raise OSError('Windows-TCP-Tabelle konnte nicht stabil gelesen werden.')


def request(port, path=HEALTH, token=None, timeout=2.0, errors=None):
    # Direct loopback HTTPConnection ignores proxy environment and redirects.
    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=timeout)
    try:
        headers = {'X-Allmiibo-Token': token} if token is not None else {}
        connection.request('POST' if token is not None else 'GET', path,
                           body=b'' if token is not None else None, headers=headers)
        response = connection.getresponse()
        body = response.read(4097)
        if response.status != 200 or len(body) > 4096:
            if errors is not None:
                errors.append('HTTP-Status {}; Antwort ist keine gueltige Health-Antwort.'.format(response.status))
            return None
        result = json.loads(body)
        return result if isinstance(result, dict) else None
    except (OSError, TimeoutError, ValueError, http.client.HTTPException) as exc:
        if errors is not None:
            errors.append(exception_detail(exc))
        return None
    finally:
        connection.close()


def matches(health, state):
    return (isinstance(health, dict) and
            health.get('application') == 'allmiibo-dateimanager' and
            health.get('version') == VERSION and
            health.get('instance') == state['instance'])


def read_state(path, port):
    if not path.exists():
        return None
    try:
        # Windows PowerShell's earlier writer emitted a UTF-8 BOM.
        if not path.is_file() or path.stat().st_size > 8192:
            raise ValueError('invalid state file')
        state = json.loads(path.read_text(encoding='utf-8-sig'))
        valid = (isinstance(state, dict) and type(state.get('schema')) is int and
                 state.get('schema') == 1 and type(state.get('port')) is int and
                 state['port'] == port and state.get('url') == address(port) and
                 isinstance(state.get('token'), str) and
                 re.fullmatch('[a-f0-9]{32}', state['token']) and
                 isinstance(state.get('instance'), str) and
                 re.fullmatch('[a-f0-9]{64}', state['instance']) and
                 hashlib.sha256(state['token'].encode('ascii')).hexdigest() == state['instance'])
        if not valid:
            raise ValueError('invalid state fields')
        return state
    except (OSError, ValueError):
        raise LauncherError('Die Statusdatei {} ist ungueltig. Es wurde kein Server gestartet oder beendet.'.format(path.name)) from None


@contextmanager
def port_lock(port):
    # A process lock avoids two launchers replacing each other's state. The
    # file can remain after a crash; the OS releases the lock automatically.
    path = ROOT / ('launcher-{}.lock'.format(port))
    with path.open('a+b') as lock:
        lock.seek(0, os.SEEK_END)
        if lock.tell() == 0:
            lock.write(b'0')
            lock.flush()
        lock.seek(0)
        acquired = False
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            acquired = True
        except OSError:
            raise LauncherError('Ein Start-/Stop-Vorgang fuer diesen Port laeuft bereits. Bitte kurz warten.') from None
        try:
            yield
        finally:
            if acquired:
                lock.seek(0)
                if os.name == 'nt':
                    msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def write_state(path, state):
    fd, name = tempfile.mkstemp(prefix=path.stem + '-', suffix='.tmp', dir=str(ROOT))
    try:
        with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as stream:
            json.dump(state, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
        os.replace(name, path)
    finally:
        try:
            os.unlink(name)
        except FileNotFoundError:
            pass


def cleanup_child(child, port, state):
    # Only this invocation's Popen child can be terminated, never a listener
    # discovered by PID/port. Prefer its authenticated HTTP shutdown.
    if child.poll() is not None:
        return
    if matches(request(port), state):
        request(port, HEALTH + '/shutdown', state['token'])
    else:
        child.terminate()
    try:
        child.wait(timeout=2)
    except subprocess.TimeoutExpired:
        child.kill()
        child.wait(timeout=2)


def show_browser(port, no_browser):
    url = address(port)
    print('Dateimanager {}: {} (nur auf diesem PC erreichbar)'.format(VERSION, url))
    print('Beenden: Stop-Dateimanager.cmd -Port {}'.format(port))
    if not no_browser:
        try:
            opened = webbrowser.open(url, new=2)
        except Exception:
            opened = False
        if not opened:
            print('Der Browser wurde nicht geoeffnet. Oeffne die Adresse oben selbst; der Server laeuft.')


def check_package():
    if not (ROOT / 'dist/index.html').is_file() or not (ROOT / 'serve_local.py').is_file():
        raise LauncherError('Der gebaute Dateimanager oder serve_local.py fehlt. Bitte die ganze ZIP entpacken.')


def start(port, no_browser):
    check_package()
    state_path = ROOT / ('server-state-{}.json'.format(port))
    state = read_state(state_path, port)
    # Only positive identity evidence permits reuse. A failed connect probe
    # must never block a new start: the server's exclusive bind decides.
    if state is not None and matches(request(port), state):
        print('Der Dateimanager dieser Kopie laeuft bereits.')
        show_browser(port, no_browser)
        return
    token = secrets.token_hex(16)
    state = {'schema': 1, 'port': port, 'url': address(port), 'token': token,
             'instance': hashlib.sha256(token.encode('ascii')).hexdigest()}
    options = {'cwd': str(ROOT), 'stdin': subprocess.DEVNULL, 'close_fds': True}
    if os.name == 'nt':
        options['creationflags'] = subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        options['start_new_session'] = True
    log_path = error_log_path(port)
    with (ROOT / ('server-{}.log'.format(port))).open('ab') as stdout, \
            log_path.open('ab') as stderr:
        log_start = stderr.tell()
        child = subprocess.Popen([sys.executable, str(ROOT / 'serve_local.py'), '--port', str(port),
                                  '--directory', str(ROOT / 'dist'), '--instance-token', token],
                                 stdout=stdout, stderr=stderr, **options)
    try:
        deadline = time.monotonic() + 6
        errors = []
        while time.monotonic() < deadline:
            if child.poll() is not None:
                raise child_failure(child, log_path, log_start)
            health = request(port, timeout=min(2.0, max(0.001, deadline - time.monotonic())), errors=errors)
            if child.poll() is not None:
                raise child_failure(child, log_path, log_start)
            if matches(health, state):
                write_state(state_path, state)
                break
            time.sleep(0.1)
        else:
            detail = errors[-1] if errors else 'Keine passende Health-Antwort.'
            raise LauncherError('Der eigene Server wurde innerhalb der Startfrist nicht bestaetigt. Status bleibt erhalten. {} Fehlerprotokoll: {}'.format(detail, log_path))
    except BaseException:
        cleanup_child(child, port, state)
        raise
    show_browser(port, no_browser)


def stop(port):
    state_path = ROOT / ('server-state-{}.json'.format(port))
    state = read_state(state_path, port)
    if state is None:
        print('Kein gespeicherter Dateimanager fuer Port {}.'.format(port))
        return
    if not listening(port):
        state_path.unlink()
        print('Kein Server auf Port {} aktiv; veralteter Status entfernt.'.format(port))
        return
    errors = []
    if not matches(request(port, errors=errors), state):
        detail = errors[-1] if errors else 'Die Health-Antwort passt nicht zur gespeicherten Instanz.'
        raise LauncherError('Der gespeicherte Server wurde nicht sicher erkannt. Es wurde nichts beendet; Status bleibt erhalten. {} Fehlerprotokoll (falls angelegt): {}'.format(detail, error_log_path(port)))
    reply = request(port, HEALTH + '/shutdown', state['token'], errors=errors)
    if not reply or reply.get('stopping') is not True:
        detail = errors[-1] if errors else 'Keine gueltige Shutdown-Bestaetigung.'
        raise LauncherError('Der eigene Server hat das Beenden nicht bestaetigt. Status bleibt erhalten. {} Fehlerprotokoll: {}'.format(detail, error_log_path(port)))
    # The server creates an IPv4 listener. After its authenticated acknowledgement
    # a TIME_WAIT row belongs to a closed connection. A remaining listener or
    # a failed observation must keep the state; the table never authorizes a stop.
    deadline = time.monotonic() + 4
    while time.monotonic() < deadline:
        if not listening(port):
            state_path.unlink()
            print('Der lokale Dateimanager auf Port {} ist beendet.'.format(port))
            return
        time.sleep(0.1)
    raise LauncherError('Beenden wurde angefordert, der Port ist noch belegt. Status bleibt erhalten; bitte erneut pruefen.')


def direct(port):
    check_package()
    print('Direktstart im sichtbaren Fenster; kein gespeicherter Serverstatus wird geaendert.', flush=True)
    print('Nach erfolgreichem Start die angezeigte Adresse selbst im Browser oeffnen.', flush=True)
    print('Dieses Fenster offen lassen. Beenden mit Strg+C.', flush=True)
    print('Stop-Dateimanager.cmd ist fuer den normalen Hintergrundstart, nicht fuer diesen Direktstart.', flush=True)
    # Inherit this console. No probe, state write, browser open or detached job.
    return subprocess.call([sys.executable, str(ROOT / 'serve_local.py'), '--port', str(port),
                            '--directory', str(ROOT / 'dist')], cwd=str(ROOT))


def main(argv=None):
    parser = argparse.ArgumentParser(description='Lokalen Allmiibo-Dateimanager ohne PowerShell-Skript starten oder stoppen.')
    parser.add_argument('action', choices=('start', 'stop', 'direct'))
    parser.add_argument('-Port', '--port', type=int, default=8765)
    parser.add_argument('-NoBrowser', '--no-browser', action='store_true')
    args = parser.parse_args(argv)
    if not 1024 <= args.port <= 65535:
        parser.error('Der Port muss zwischen 1024 und 65535 liegen.')
    try:
        if args.action == 'direct':
            return direct(args.port)
        with port_lock(args.port):
            if args.action == 'start':
                start(args.port, args.no_browser)
            else:
                stop(args.port)
        return 0
    except LauncherError as exc:
        print('FEHLER: {}'.format(exc), file=sys.stderr)
        return 1
    except OSError as exc:
        print('FEHLER: {} Fehlerprotokoll (falls angelegt): {}'.format(exception_detail(exc), error_log_path(args.port)), file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print('Abgebrochen.', file=sys.stderr)
        return 130


if __name__ == '__main__':
    sys.exit(main())
