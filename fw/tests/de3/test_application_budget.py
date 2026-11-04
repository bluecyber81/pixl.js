import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from application_budget import check_budget


class LinkerBudgetTest(unittest.TestCase):
    MAP = """FLASH 0x19000 0x5b000 xr
RAM 0x20003600 0xca00 xrw
  0x59000 TotalFlashUsed = (CodeFlashUsed + DataInitFlashUsed)
  0x20010000 __StackTop = (ORIGIN (RAM) + LENGTH (RAM))
  0x2000e000 __StackLimit = (__StackTop - SIZEOF (.stack_dummy))
  0x2000da00 __HeapLimit = .
"""

    def test_inclusive_minima(self):
        result = check_budget(self.MAP, 0x58ff8)
        self.assertEqual(result["minimum"], result["observed"])

    def test_oversized_images_and_missing_reserves(self):
        for original, changed in (("0x59000", "0x59001"), ("0x2000da00", "0x2000da01"),
                                  ("0x2000e000", "0x2000e004"), ("__HeapLimit", "missing"),
                                  ("0x5b000", "0x5d000")):
            with self.subTest(changed=changed), self.assertRaises(ValueError):
                check_budget(self.MAP.replace(original, changed), 0x58ff8)
        for length in (0, 0x59001):
            with self.assertRaises(ValueError):
                check_budget(self.MAP, length)


if __name__ == "__main__":
    unittest.main()
