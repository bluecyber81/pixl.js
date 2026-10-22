from pathlib import Path
import importlib.util
import struct
import unittest

FW = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('diagnostic_reader', FW / 'scripts/read_ui_diagnostic.py')
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


class DiagnosticReaderTests(unittest.TestCase):
    def sample(self):
        raw = bytearray(104)
        raw[:5] = b'UIDG\x01'
        struct.pack_into('<H', raw, 6, 1)
        struct.pack_into('<H', raw, 22, 2)  # center short
        struct.pack_into('<IiHHB', raw, 72, 19, -5, 2, 19, 5)
        struct.pack_into('<IiHHB', raw, 88, 19, 0, 1, 19, 6)
        return raw

    def test_explicit_wire_offsets_and_preserved_short_long_results(self):
        value = reader.decode_snapshot(self.sample())
        self.assertEqual(value['raw']['center']['short'], 2)
        self.assertEqual(value['attempts']['short']['stage'], 'save_failed')
        self.assertEqual(value['attempts']['short']['save_result'], -5)
        self.assertEqual(value['attempts']['long']['stage'], 'launcher_returned')

    def test_reject_malformed_snapshot_and_pending_result(self):
        raw = self.sample()
        struct.pack_into('<i', raw, 76, -2**31)
        self.assertIsNone(reader.decode_snapshot(raw)['attempts']['short']['save_result'])
        for bad in (raw[:-1], raw+b'X', b'BAD!'+raw[4:]):
            with self.assertRaises(ValueError): reader.decode_snapshot(bad)
        for index, value in ((4,2), (5,3), (69,1), (85,1), (101,1), (84,7)):
            bad=raw.copy(); bad[index]=value
            with self.assertRaises(ValueError): reader.decode_snapshot(bad)

    def test_fragmented_responses_and_negative_protocol_controls(self):
        payload=self.sample(); reply=reader.Reply(4)
        for sequence, offset in enumerate(range(0,104,16)):
            piece=payload[offset:offset+16]
            chunk=sequence | (0x8000 if offset+16<104 else 0)
            result=reply.feed(struct.pack('<BBH',4,0,chunk)+piece)
        self.assertEqual(result,payload)
        with self.assertRaises(ValueError): reply.feed(b'\x04\x00\x00\x00')
        for frame in (b'', b'\x03\x00\x00\x00', b'\x04\x00\x01\x00',
                      b'\x04\x01\x00\x00', b'\x04\x00\x00\x00'+bytes(513)):
            with self.assertRaises(ValueError): reader.Reply(4).feed(frame)

    def test_identity_decoder_never_accepts_truncated_or_extra_fields(self):
        parts=[reader.EXPECTED_VERSION.encode(), b'C0:00:00:00:00:01']
        raw=b''.join(struct.pack('<H',len(p))+p for p in parts)
        self.assertEqual(reader.decode_version(raw)['version'],reader.EXPECTED_VERSION)
        for bad in (b'',raw[:-1],raw+b'\x00',raw+b'\x00\x00'):
            with self.assertRaises(ValueError): reader.decode_version(bad)


if __name__ == '__main__': unittest.main()
