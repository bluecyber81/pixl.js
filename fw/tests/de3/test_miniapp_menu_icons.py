"""Bind native monochrome BMP art to the exact XBM bytes drawn by the LCD menu."""
from pathlib import Path
import re
import struct

FW = Path(__file__).resolve().parents[2]
SOURCE = FW / 'application/src'
resource = (SOURCE / 'mui/mui_resource.c').read_text()
icons = {
    'app_switch2_wake_32x32': 'app/switch2_wake/app_switch2_wake.c',
    'app_ble_stream_32x32': 'app/ble_stream/app_ble_stream.c',
}
decoded = []
for name, app in icons.items():
    bitmap = (FW / 'resources/bmp' / (name + '.bmp')).read_bytes()
    assert bitmap[:2] == b'BM'
    offset, = struct.unpack_from('<I', bitmap, 10)
    header, width, height, planes, depth, compression = struct.unpack_from('<IiiHHI', bitmap, 14)
    assert header == 40 and (width, height, planes, depth, compression) == (32, 32, 1, 1, 0)
    assert bitmap[54:57] == b'\0\0\0' and bitmap[58:61] == b'\xff\xff\xff'
    assert len(bitmap) == offset + 128
    expected = bytearray(128)
    # BMP is bottom-up, MSB first, palette index zero is black. XBM is top-down,
    # LSB first and one means a foreground pixel. Check orientation and polarity.
    for y in range(32):
        for x in range(32):
            black = not (bitmap[offset + (31 - y) * 4 + x // 8] & (0x80 >> (x % 8)))
            if black:
                expected[y * 4 + x // 8] |= 1 << (x % 8)
    initializer = re.search(r'const uint8_t ' + name + r'_data\[\] = \{(.*?)\};', resource, re.S)
    assert initializer, name
    data = bytes(int(v, 16) for v in re.findall(r'0x([0-9a-fA-F]{2})', initializer[1]))
    assert len(data) == 128 and data == expected, name
    assert f'const xbm_t {name} = {{.width = 32, .height = 32, .data = {name}_data}};' in resource
    assert f'.icon_32x32 = &{name},' in (SOURCE / app).read_text()
    assert 128 <= sum(b.bit_count() for b in data) <= 512, name
    assert not any(data[:4]) and not any(data[-4:]), 'vertical menu margin'
    assert all(not (data[y * 4] & 1 or data[y * 4 + 3] & 0x80) for y in range(32)), 'horizontal menu margin'
    decoded.append(data)
assert decoded[0] != decoded[1]
print('PASS: two 32x32 LCD menu resources match their 1-bit BMPs, orientation, polarity, bounds and app pointers')
