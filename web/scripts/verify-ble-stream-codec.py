#!/usr/bin/env python3
"""Cross-check the browser sender against the Python encoder and actual C decoder.

Usage: python3 scripts/verify-ble-stream-codec.py --firmware-root ../firmware
The given checkout must contain fw/scripts/stream_video_to_pixl.py and
fw/application/src/app/ble_stream/stream_codec.c. No radio or device is used.
--write-fixture regenerates only the small synthetic fixture used by Node CI.
"""
import argparse
import ctypes
import hashlib
import importlib.util
import json
from pathlib import Path
import random
import subprocess
import tempfile


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--firmware-root', required=True, type=Path)
    parser.add_argument('--write-fixture', action='store_true')
    args = parser.parse_args()
    web = Path(__file__).resolve().parents[1]
    firmware = args.firmware_root.resolve() / 'fw'
    sender_path = firmware / 'scripts/stream_video_to_pixl.py'
    codec_path = firmware / 'application/src/app/ble_stream'
    spec = importlib.util.spec_from_file_location('stream_sender', sender_path)
    sender = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(sender)

    raw = bytes(index & 255 for index in range(1024))
    delta = bytearray(raw)
    for index in (0, 511, 1023):
        delta[index] ^= 0x81
    runs = bytes([11]) * 129 + bytes([22]) * 128 + bytes(index & 255 for index in range(767))
    adversarial = bytes((index % 127) + 1 if index % 3 == 0 else 0 for index in range(1024))
    cases = [
        ('black', bytes(1024), None, False),
        ('white', bytes([255]) * 1024, None, False),
        ('raw-literals', raw, None, False),
        ('xor-delta-edges', bytes(delta), raw, False),
        ('forced-keyframe', bytes(delta), raw, True),
        ('maximum-runs-and-literals', runs, None, False),
        ('isolated-literals-between-short-runs', adversarial, None, False),
        ('python-demo-1', sender.generate_demo_frame(1), None, False),
        ('python-demo-2-delta', sender.generate_demo_frame(2), sender.generate_demo_frame(1), False),
    ]
    fixed_count = len(cases)
    rng = random.Random(673364)
    previous = raw
    for index in range(120):
        if index % 3 == 0:
            frame = bytes(rng.randrange(256) for _ in range(1024))
        elif index % 3 == 1:
            changed = bytearray(previous)
            for _ in range(12):
                changed[rng.randrange(1024)] ^= rng.randrange(256)
            frame = bytes(changed)
        else:
            frame = sender.generate_demo_frame(index)
        cases.append((f'deterministic-sequence-{index}', frame, previous, index % 17 == 0))
        previous = frame

    vectors = []
    for name, frame, previous, force in cases:
        packet = sender.encode_frame_packet(frame, previous, force)
        vectors.append(dict(name=name, frameHex=frame.hex(), previousHex=previous.hex() if previous is not None else None,
                            forceKeyframe=force, packetHex=packet.hex(), decodedSha256=hashlib.sha256(frame).hexdigest()))

    node_program = '''
import fs from 'node:fs';
const {encodeStreamFrame} = await import(process.argv[1]);
const inputs = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(inputs.map(row => Buffer.from(encodeStreamFrame(
  Uint8Array.from(Buffer.from(row.frameHex, 'hex')),
  row.previousHex === null ? null : Uint8Array.from(Buffer.from(row.previousHex, 'hex')),
  {forceKeyframe: row.forceKeyframe}).packet).toString('hex'))));
'''
    node = subprocess.run(['node', '--input-type=module', '-e', node_program,
                           (web / 'src/lib/ble-image-stream.js').as_uri()],
                          input=json.dumps(vectors), text=True, capture_output=True, check=True)
    browser_packets = json.loads(node.stdout)
    assert len(browser_packets) == len(vectors)
    for vector, browser_packet in zip(vectors, browser_packets):
        assert browser_packet == vector['packetHex'], vector['name'] + ': Python / browser mismatch'

    with tempfile.TemporaryDirectory(prefix='web-stream-codec-') as temporary:
        temp = Path(temporary)
        (temp / 'bridge.c').write_text('''#include <string.h>
#include "stream_codec.h"
static stream_codec_t state;
void reset(void){memset(&state,0,sizeof state);stream_codec_reset(&state);}
unsigned feed(const unsigned char*p,unsigned n){return stream_codec_feed(&state,p,n);}
void copy(unsigned char*p){memcpy(p,state.frame,1024);}
''')
        subprocess.run(['gcc', '-std=c11', '-O1', '-Wall', '-Wextra', '-Werror', '-shared', '-fPIC',
                        '-I', str(codec_path), str(temp / 'bridge.c'), str(codec_path / 'stream_codec.c'),
                        '-o', str(temp / 'codec.so')], check=True)
        codec = ctypes.CDLL(str(temp / 'codec.so'))
        codec.feed.argtypes = [ctypes.c_char_p, ctypes.c_uint]
        codec.feed.restype = ctypes.c_uint

        def decode(packet, chunk):
            count = sum(codec.feed(packet[offset:offset + chunk], len(packet[offset:offset + chunk]))
                        for offset in range(0, len(packet), chunk))
            assert count == 1, 'actual C receiver did not complete exactly one frame'
            output = ctypes.create_string_buffer(1024)
            codec.copy(output)
            return output.raw

        for chunk in (1, 20, 247):
            for vector, browser_packet in zip(vectors, browser_packets):
                codec.reset()
                if vector['previousHex'] is not None:
                    previous = bytes.fromhex(vector['previousHex'])
                    assert decode(sender.encode_frame_packet(previous), chunk) == previous
                assert decode(bytes.fromhex(browser_packet), chunk).hex() == vector['frameHex'], vector['name']

    fixture = dict(
        description='Synthetic Python-encoded vectors also decoded by the actual App673 C receiver; regenerate with scripts/verify-ble-stream-codec.py.',
        receiverCommit='68b7d6e0cceadbc4c0801092ddc2e65947dd6e88',
        receiverSha256=sha(codec_path / 'stream_codec.c'),
        pythonSenderSha256=sha(sender_path), actualCDecoderPassed=True, chunkSizes=[1, 20, 247],
        vectors=vectors[:fixed_count],
    )
    fixture_path = web / 'tests/fixtures/ble-stream-app673-vectors.json'
    if args.write_fixture:
        fixture_path.write_text(json.dumps(fixture, ensure_ascii=False, indent=2) + '\n')
    else:
        assert json.loads(fixture_path.read_text()) == fixture, 'pinned synthetic fixture differs'
    print(json.dumps(dict(passed=True, cases=len(cases), cDecoderRuns=len(cases) * 3, chunkSizes=[1, 20, 247],
                          actualCDecoderSha256=fixture['receiverSha256'], pythonSenderSha256=fixture['pythonSenderSha256'],
                          browserEncoderSha256=sha(web / 'src/lib/ble-image-stream.js'), fixtureSha256=sha(fixture_path)), indent=2))


if __name__ == '__main__':
    main()
