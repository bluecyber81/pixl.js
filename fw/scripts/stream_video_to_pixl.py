#!/usr/bin/env python3
"""Incoming 128x64 LCD stream. Adapted from Aragamiz/solosky PR479 b0ade162.

The custom S112 build uses explicit stop-and-wait acknowledgements. No device
or file-manager connection is opened until this CLI is deliberately started.
Bleak is required for BLE; ffmpeg only for a supplied video file.
"""
import argparse
import asyncio
import math
import struct
import subprocess
import sys
import time


try:
    import msvcrt
except ImportError:
    msvcrt = None

NUS_RX_CHAR_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
NUS_TX_CHAR_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
MAGIC = b"\xA5\x5A"
FLAG_RAW = 0x00
FLAG_RLE = 0x01
FLAG_DELTA_RLE = 0x02

SCALE_MODES = ["fit", "stretch", "crop"]


def packbits_rle(data: bytes) -> bytes:
    out = bytearray()
    n = len(data)
    i = 0
    while i < n:
        run_len = 1
        while i + run_len < n and data[i + run_len] == data[i] and run_len < 129:
            run_len += 1
        if run_len >= 2:
            out.append(128 + (run_len - 2))
            out.append(data[i])
            i += run_len
        else:
            lit_start = i
            i += 1
            while i < n and (i - lit_start) < 128:
                if i + 1 < n and data[i] == data[i + 1]:
                    break
                i += 1
            lit_len = i - lit_start
            out.append(lit_len - 1)
            out.extend(data[lit_start:i])
    return bytes(out)


def encode_frame_packet(xbm_1024: bytes, prev_xbm: bytes | None = None, force_keyframe: bool = False) -> bytes:
    if len(xbm_1024) != 1024 or (prev_xbm is not None and len(prev_xbm) != 1024):
        raise ValueError("Each frame and delta reference must contain exactly 1024 bytes")
    key_rle = packbits_rle(xbm_1024)
    if prev_xbm is not None and not force_keyframe:
        xor_bytes = bytes(a ^ b for a, b in zip(prev_xbm, xbm_1024))
        delta_rle = packbits_rle(xor_bytes)
        if len(delta_rle) < len(key_rle) and len(delta_rle) < len(xbm_1024):
            return MAGIC + struct.pack("<BH", FLAG_DELTA_RLE, len(delta_rle)) + delta_rle
    if len(key_rle) < len(xbm_1024):
        return MAGIC + struct.pack("<BH", FLAG_RLE, len(key_rle)) + key_rle
    return MAGIC + struct.pack("<BH", FLAG_RAW, len(xbm_1024)) + xbm_1024


def gray_bytes_to_xbm_128x64(gray_bytes: bytes, threshold: int = 128, invert: bool = False) -> bytes:
    if len(gray_bytes) != 8192 or not 0 <= threshold <= 255:
        raise ValueError("Expected 8192 gray pixels and threshold 0..255")
    dark, light = (b"0", b"1") if invert else (b"1", b"0")
    cutoff = math.ceil(threshold)
    shades = dark * cutoff + light * (256 - cutoff)
    bits = bytes(gray_bytes).translate(shades)
    # The first source pixel is bit 0 of the first LCD byte. Binary digits
    # are read most significant first, so reverse them before packing.
    return int(bits[::-1], 2).to_bytes(1024, "little")


def generate_demo_frame(frame_idx: int) -> bytes:
    buf = bytearray(1024)
    cx = 64 + int(38 * math.sin(frame_idx * 0.12))
    cy = 32 + int(16 * math.cos(frame_idx * 0.17))
    r2 = 16 * 16
    for y in range(64):
        dy2 = (y - cy) * (y - cy)
        row_off = y * 16
        for x in range(128):
            dx = x - cx
            in_circle = (dx * dx + dy2) <= r2
            in_wave = (y > 32 + int(12 * math.sin((x + frame_idx * 4) * 0.08)))
            if in_circle ^ in_wave:
                buf[row_off + (x >> 3)] |= (1 << (x & 7))
    return bytes(buf)


def build_vf_filter(fps: float, scale_mode: str) -> str:
    if scale_mode == "fit":
        return f"fps={fps},scale=128:64:force_original_aspect_ratio=decrease:flags=area,pad=128:64:(ow-iw)/2:(oh-ih)/2:black,format=gray"
    if scale_mode == "crop":
        return f"fps={fps},scale=128:64:force_original_aspect_ratio=increase:flags=area,crop=128:64,format=gray"
    return f"fps={fps},scale=128:64:flags=area,format=gray"


def close_ffmpeg(proc):
    if proc is None:
        return
    if proc.stdout is not None:
        try:
            proc.stdout.close()
        except Exception:
            pass
    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                pass


def open_ffmpeg(video_path: str, fps: float, scale_mode: str, start_sec: float = 0.0):
    cmd = ["ffmpeg", "-v", "error"]
    if start_sec > 0.1:
        cmd += ["-ss", f"{start_sec:.2f}"]
    cmd += [
        "-i", video_path,
        "-vf", build_vf_filter(fps, scale_mode),
        "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1",
    ]
    return subprocess.Popen(cmd, stdout=subprocess.PIPE, bufsize=128 * 64 * 8)


async def find_pixljs(mac_filter: str | None = None):
    from bleak import BleakScanner
    print("Suche Pixl.js: am LCD zuerst 'BLE-Bildempfang' öffnen.", flush=True)
    found = await BleakScanner.discover(timeout=6.0, return_adv=True)
    matches = []
    for d, adv in found.values():
        name = (d.name or "").strip()
        if mac_filter and d.address.upper() == mac_filter.upper():
            return d, adv.rssi
        if not mac_filter and name.lower() == "pixl.js":
            matches.append((d, adv.rssi))
    if len(matches) > 1:
        raise RuntimeError("Mehrere Pixl.js gefunden; Ziel mit --mac auswählen.")
    return matches[0] if matches else (None, None)


class StreamAcks:
    """Bounded notification parser; RSSI never counts as flow-control credit."""
    def __init__(self):
        self.replies = asyncio.Queue(maxsize=2)
        self.partial = bytearray()
        self.rssi = None
        self.error = None

    def receive(self, _sender, data):
        self.partial.extend(data)
        if len(self.partial) > 128:
            self.error = "Überlange Stream-Notification"
            self.partial.clear()
            return
        while b"\n" in self.partial:
            line, _, rest = self.partial.partition(b"\n")
            self.partial[:] = rest
            if line in (b"ACK1", b"OK"):
                if self.replies.full():
                    self.error = "Unerwartete zusätzliche Stream-Quittung"
                else:
                    self.replies.put_nowait(bytes(line))
            elif line.startswith(b"RSSI:"):
                try:
                    value = int(line[5:])
                    if -127 <= value <= 20:
                        self.rssi = value
                except ValueError:
                    pass
            # Legacy/unknown text is ignored and cannot unblock a write.

    async def expect(self, expected, timeout=3.0):
        if self.error:
            raise RuntimeError(self.error)
        try:
            reply = await asyncio.wait_for(self.replies.get(), timeout)
        except asyncio.TimeoutError as exc:
            raise RuntimeError("Keine Stream-Quittung; Verbindung wird beendet. "
                               "BLE-Bildempfang mit ACK1-Unterstützung erforderlich.") from exc
        if self.error or reply != expected:
            raise RuntimeError(self.error or "Unerwartete Stream-Quittung")


def stream_chunk_size(characteristic):
    # Bleak's characteristic value is the platform's actual writable capacity;
    # the Linux client MTU property may still report its default of 23.
    size = int(getattr(characteristic, "max_write_without_response_size", 20))
    if size < 20:
        raise RuntimeError("Ungültige BLE-Schreibkapazität")
    return min(247, size)


async def send_stream_packet(client, characteristic, packet, chunk_size, acks):
    if not 20 <= chunk_size <= 247:
        raise ValueError("Chunkgröße außerhalb 20..247")
    for off in range(0, len(packet), chunk_size):
        await client.write_gatt_char(characteristic, packet[off:off + chunk_size], response=False)
        # No blind retry: a duplicate chunk would corrupt an incomplete frame.
        await acks.expect(b"OK")


async def stream_video(video_path: str | None, fps: float, threshold: int, invert: bool,
                       scale_mode: str, mac: str | None):
    from bleak import BleakClient
    if not 1 <= fps <= 30 or not 0 <= threshold <= 255:
        raise ValueError("FPS muss 1..30 und Schwelle 0..255 sein")
    dev, scan_rssi = await find_pixljs(mac)
    if dev is None:
        raise RuntimeError("Pixl.js nicht gefunden; BLE-Bildempfang am Gerät öffnen.")

    print(f"Connecting to {dev.name} ({dev.address}) [Scan RSSI: {scan_rssi} dBm]...", flush=True)
    async with BleakClient(dev) as client:
        rx = client.services.get_characteristic(NUS_RX_CHAR_UUID)
        if rx is None:
            raise RuntimeError("NUS-Empfänger fehlt")
        chunk_size = stream_chunk_size(rx)
        acks = StreamAcks()
        acks.rssi = scan_rssi
        await client.start_notify(NUS_TX_CHAR_UUID, acks.receive)
        await client.write_gatt_char(rx, b"PXSTREAM:ACK1\n", response=False)
        await acks.expect(b"ACK1")
        print(f"Verbunden; Chunk={chunk_size}B, ACK1; Ziel-FPS={fps:g}, "
              f"RSSI={acks.rssi}dBm. Ziel-FPS sind keine gemessene LCD-Bildrate.", flush=True)
        if msvcrt is not None:
            print("Hotkeys: '['/']' FPS | '-'/ '=' Threshold | 's' Scale(fit/stretch/crop) | 'i' Invert | 'p' Pause | 'r' Restart | 'q' Quit", flush=True)
        else:
            print("Press Ctrl+C to quit (interactive hotkeys are Windows-only).", flush=True)

        scale_idx = SCALE_MODES.index(scale_mode) if scale_mode in SCALE_MODES else 0
        paused = False
        play_sec = 0.0
        proc = open_ffmpeg(video_path, fps, SCALE_MODES[scale_idx], 0.0) if video_path else None

        frame_idx = 0
        prev_xbm = None
        start_time = time.perf_counter()
        sent_bytes = 0

        try:
            while True:
                # Non-blocking Windows hotkey polling
                if msvcrt is not None and msvcrt.kbhit():
                    ch = msvcrt.getwch().lower()
                    reopen = False
                    if ch == "q":
                        print("Quitting...", flush=True)
                        break
                    elif ch == "p":
                        paused = not paused
                        print(f"[{'PAUSED' if paused else 'RESUMED'}]", flush=True)
                    elif ch == "i":
                        invert = not invert
                        print(f"[Invert={invert}]", flush=True)
                    elif ch == "-":
                        threshold = max(10, threshold - 10)
                        print(f"[Threshold={threshold}]", flush=True)
                    elif ch == "=":
                        threshold = min(245, threshold + 10)
                        print(f"[Threshold={threshold}]", flush=True)
                    elif ch == "[":
                        fps = max(1.0, fps - 2.0)
                        print(f"[Target FPS={fps:.0f}]", flush=True)
                        reopen = video_path is not None
                    elif ch == "]":
                        fps = min(30.0, fps + 2.0)
                        print(f"[Target FPS={fps:.0f}]", flush=True)
                        reopen = video_path is not None
                    elif ch == "s":
                        scale_idx = (scale_idx + 1) % len(SCALE_MODES)
                        print(f"[Scale={SCALE_MODES[scale_idx]}]", flush=True)
                        reopen = video_path is not None
                    elif ch == "r" and video_path is not None:
                        play_sec = 0.0
                        print("[Restarting video]", flush=True)
                        reopen = True

                    if reopen and proc is not None:
                        close_ffmpeg(proc)
                        proc = open_ffmpeg(video_path, fps, SCALE_MODES[scale_idx], play_sec)

                if paused:
                    await asyncio.sleep(0.05)
                    continue

                t0 = time.perf_counter()
                if proc is not None:
                    raw_gray = await asyncio.to_thread(proc.stdout.read, 128 * 64)
                    if len(raw_gray) < 128 * 64:
                        print("Video finished!", flush=True)
                        break
                    xbm = gray_bytes_to_xbm_128x64(raw_gray, threshold=threshold, invert=invert)
                    play_sec += 1.0 / fps
                else:
                    xbm = generate_demo_frame(frame_idx)
                    if invert:
                        xbm = bytes(b ^ 0xFF for b in xbm)

                pkt = encode_frame_packet(xbm, prev_xbm=prev_xbm, force_keyframe=(frame_idx % 150 == 0))
                await send_stream_packet(client, rx, pkt, chunk_size, acks)
                prev_xbm = xbm
                sent_bytes += len(pkt)
                frame_idx += 1

                if frame_idx % 30 == 0:
                    elapsed = time.perf_counter() - start_time
                    print(f"Mode: {SCALE_MODES[scale_idx]} | Frames: {frame_idx} | Avg FPS: {frame_idx / elapsed:.1f} | "
                          f"RSSI: {acks.rssi} dBm | Pkt: {sent_bytes / frame_idx:.0f}B | Thr: {threshold}"
                          f"{' | INV' if invert else ''}", flush=True)

                sleep_time = (1.0 / fps) - (time.perf_counter() - t0)
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)
        finally:
            close_ffmpeg(proc)


def main():
    parser = argparse.ArgumentParser(description="128x64-Bildempfang für Allmiibo LCD über BLE (ACK1)")
    parser.add_argument("video", nargs="?", default=None, help="Path to video file. Omit for built-in demo.")
    parser.add_argument("--fps", type=float, default=5.0, help="Target FPS 1..30 (default: 5; actual rate depends on BLE/LCD)")
    parser.add_argument("--threshold", type=int, default=128, help="B/W threshold 0-255 (default: 128)")
    parser.add_argument("--scale", choices=SCALE_MODES, default="fit", help="Scale mode: fit / stretch / crop (default: fit)")
    parser.add_argument("--invert", action="store_true", help="Invert black/white")
    parser.add_argument("--mac", type=str, default=None, help="Optional Pixl.js BLE MAC address")
    args = parser.parse_args()
    if not 1 <= args.fps <= 30 or not 0 <= args.threshold <= 255:
        parser.error("--fps muss 1..30 und --threshold 0..255 sein")
    try:
        asyncio.run(stream_video(args.video, args.fps, args.threshold, args.invert, args.scale, args.mac))
    except KeyboardInterrupt:
        pass
    except (RuntimeError, OSError, ImportError) as exc:
        parser.exit(1, f"Stream beendet: {exc}\n")


if __name__ == "__main__":
    main()
