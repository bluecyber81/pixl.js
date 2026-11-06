"""Deterministic rejection tests for the independent payload/export boundary."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('bootbuild',ROOT/'build.py')
build=importlib.util.module_from_spec(spec);spec.loader.exec_module(build)

def row(kind,offset,data=b''):
    value=bytes([len(data)])+offset.to_bytes(2,'big')+bytes([kind])+data
    return ':'+(value+bytes([-sum(value)%256])).hex().upper()

def image(extra=()):
    return [row(4,0,b'\x00\x07'),row(0,0x7000,b'\x00\x00\x01\x20'),*extra,
            row(4,0,b'\x10\x00'),row(0,0x1014,(0x77000).to_bytes(4,'little')+(0x7e000).to_bytes(4,'little')),row(1,0)]

class ExportContract(unittest.TestCase):
    def parse(self,lines):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'image.hex';p.write_text('\n'.join(lines)+'\n');return build.image_region(p)
    def test_payload_excludes_uicr_and_fills_region(self):
        region,used=self.parse(image());self.assertEqual(used,4);self.assertEqual(len(region),28672)
        self.assertEqual(region[:4],b'\x00\x00\x01\x20');self.assertEqual(region[4:],b'\xff'*28668)
    def test_foreign_app_address_rejected(self):
        with self.assertRaises(ValueError):self.parse(image([row(0,0x1000,b'x')]))
    def test_reserved_params_page_rejected(self):
        with self.assertRaises(ValueError):self.parse(image([row(0,0xe000,b'x')]))
    def test_minimum_flash_reserve_enforced(self):
        with self.assertRaises(ValueError):self.parse(image([row(0,0xdc00,b'x')]))
    def test_exact_flash_reserve_accepted(self):
        _,used=self.parse(image([row(0,0xdbff,b'x')]));self.assertEqual(28672-used,1024)
    def test_overlapping_records_rejected(self):
        with self.assertRaises(ValueError):self.parse(image([row(0,0x7000,b'x')]))
    def test_corrupt_checksum_rejected(self):
        lines=image();lines[1]=lines[1][:-2]+'00'
        with self.assertRaises(ValueError):self.parse(lines)
    def test_wrong_uicr_rejected(self):
        lines=image();lines[-2]=row(0,0x1014,(0x76000).to_bytes(4,'little')+(0x7e000).to_bytes(4,'little'))
        with self.assertRaises(ValueError):self.parse(lines)
    def test_missing_eof_rejected(self):
        with self.assertRaises(ValueError):self.parse(image()[:-1])
    def test_after_eof_rejected(self):
        with self.assertRaises(ValueError):self.parse(image()+[row(1,0)])
    def test_frozen_input_tamper_rejected(self):
        original=build.ROOT
        with tempfile.TemporaryDirectory() as folder:
            build.ROOT=Path(folder);(build.ROOT/'source.c').write_text('changed')
            (build.ROOT/'SOURCE_BINDING.json').write_text(json.dumps({'files':{'source.c':'0'*64}}))
            try:
                with self.assertRaises(RuntimeError):build.verify_sources()
            finally:build.ROOT=original

if __name__=='__main__':unittest.main()
