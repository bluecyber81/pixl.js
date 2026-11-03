# Pinned Nordic NVIC test fixture

This file is the deployed S112 7.3.0 NVIC header override used by DE3.38 and BL7.
SHA-256: `555417cf107cab5569878ee4f8b1d91e783b55dddc7e2900e204f624e107d7ef`.
The complete Nordic copyright and license are retained in the header.

Only its actual EnableIRQ, DisableIRQ and critical-region enter/exit functions
are compiled into the host regression. NVIC W1S/W1C register behavior is modeled
at the hardware boundary. Two application IRQs map to two host mask bits; no
device, RF, SVC, flash, or timing emulation is performed.
