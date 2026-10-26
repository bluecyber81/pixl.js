"""Read DE3.17 navigation observations only. Device access requires --execute."""
import argparse
import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
import struct

NUS = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
WRITE = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'
NOTIFY = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'
EXPECTED_VERSION = '2.21.0-DE3.17'
TYPES = ('press', 'release', 'short', 'long', 'repeat')
STAGES = ('none', 'list_callback', 'settings_callback', 'save_started',
          'save_succeeded', 'save_failed', 'launcher_returned')


def decode_snapshot(raw):
    if len(raw) != 104 or raw[:5] != b'UIDG\x01':
        raise ValueError('Unexpected diagnostic payload/version')
    if raw[5] not in (0, 1) or any(raw[69:72]) or any(raw[85:88]) or any(raw[101:104]):
        raise ValueError('Malformed diagnostic flags/reserved bytes')
    def counters(offset):
        return dict(zip(TYPES, struct.unpack_from('<5H', raw, offset)))
    attempts = {}
    for name, offset in (('short', 72), ('long', 88)):
        selection, result, count, focus, stage = struct.unpack_from('<IiHHB', raw, offset)
        if stage >= len(STAGES):
            raise ValueError('Unknown diagnostic stage')
        attempts[name] = dict(selection_id=selection, save_result=None if result == -2**31 else result,
                              count=count, focus_index=focus, stage=STAGES[stage])
    return dict(active=bool(raw[5]), session=struct.unpack_from('<H', raw, 6)[0],
                raw={name: counters(8 + i*10) for i, name in enumerate(('left', 'center', 'right'))},
                center_posted=counters(38), center_dropped=counters(48),
                center_queue_dispatched=counters(58), queue_high_water_at_center_input=raw[68],
                attempts=attempts)


def decode_version(raw):
    parts = []
    offset = 0
    while offset < len(raw):
        if len(raw) - offset < 2:
            raise ValueError('Truncated version length')
        length = struct.unpack_from('<H', raw, offset)[0]
        offset += 2
        if length > len(raw) - offset:
            raise ValueError('Truncated version text')
        parts.append(raw[offset:offset+length].decode('utf-8', errors='strict'))
        offset += length
    if len(parts) != 2:
        raise ValueError('Expected version and BLE address')
    return dict(version=parts[0], reported_address=parts[1])


class Reply:
    def __init__(self, command):
        self.command, self.next_chunk, self.data = command, 0, bytearray()
        self.done = False

    def feed(self, frame):
        if self.done or len(frame) < 4:
            raise ValueError('Extra or truncated response')
        command, status, chunk = struct.unpack_from('<BBH', frame)
        if command != self.command or (chunk & 0x7fff) != self.next_chunk:
            raise ValueError('Unexpected response command/chunk')
        if status:
            raise ValueError(f'Device command 0x{command:02x} failed with status {status}')
        self.data.extend(frame[4:])
        if len(self.data) > 512 or ((chunk & 0x8000) and self.next_chunk == 0x7fff):
            raise ValueError('Oversized response')
        self.next_chunk += 1
        self.done = not bool(chunk & 0x8000)
        return bytes(self.data) if self.done else None


async def read_device(address):
    from bleak import BleakClient, BleakScanner
    device = await BleakScanner.find_device_by_address(address, timeout=12)
    if device is None:
        raise RuntimeError('Selected device is not advertising; no request sent')
    queue = asyncio.Queue()
    async with BleakClient(device, timeout=20) as client:
        if client.services.get_service(NUS) is None:
            raise RuntimeError('Selected device has no Pixl UART service')
        await asyncio.wait_for(client.start_notify(NOTIFY, lambda _, value: queue.put_nowait(bytes(value))), 15)
        async def request(command):
            if command not in (1, 4) or not queue.empty():
                raise RuntimeError('Read-only command/session guard failed')
            reply = Reply(command)
            # Four bytes always fit MTU23. Firmware fragments its reply as needed.
            await asyncio.wait_for(client.write_gatt_char(WRITE, bytes((command, 0, 0, 0)), response=True), 15)
            async def receive():
                while True:
                    result = reply.feed(await asyncio.wait_for(queue.get(), 8))
                    if result is not None:
                        return result
            return await asyncio.wait_for(receive(), 20)
        version = decode_version(await request(1))
        if version['version'] != EXPECTED_VERSION:
            raise RuntimeError(f"Expected {EXPECTED_VERSION}, got {version['version']}; snapshot not requested")
        raw = await request(4)
        return dict(read_utc=datetime.now(timezone.utc).isoformat(), selected_address=address,
                    identity=version, device_commands=['0x01 version', '0x04 read RAM diagnostic'],
                    device_file_writes=False, snapshot=decode_snapshot(raw), raw_hex=raw.hex())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--address', required=True)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    if not args.execute:
        print('Preview only: no Bluetooth access. Add --execute to read version and navigation RAM snapshot.')
        return
    if args.output.exists():
        parser.error('Output exists; choose a new path to preserve previous evidence')
    result = asyncio.run(read_device(args.address))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x', encoding='utf-8') as output:
        json.dump(result, output, indent=2)
        output.write('\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
