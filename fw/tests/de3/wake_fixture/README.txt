GPIO wake regression fixture, 19 October 2026

provenance.json records the immutable build-image digest, exact SDK paths,
whole-source SHA-256 and stored-fixture SHA-256. The three SDK source files
are byte-for-byte copies from the already installed nRF5 SDK 17.1.0 image.
gpio_bitfields.h contains the original copyright and all unmodified
GPIO_PIN_CNF definitions from that SDK's nrf52_bitfields.h. No network or
device access was used to obtain these fixtures.

test_wake_gpio.py checks those hashes before extracting function definitions.
It uses the real GPIO port decode/config/input/default/sense setters, GPIOTE
input-event disable/uninit, and BSP wakeup functions. The complete product
bsp_btn.c is compiled, together with the actual extracted mui_input_deinit,
mui_deinit, and shutdown_handler, and the actual LCD board/BTN_ID_SLEEP values.

GPIOTE allocation/bookkeeping, timers, and peripherals other than GPIO are
host mocks. Initial app_button setup models the verified SDK configuration:
app_button.c lines 288-298 uses GPIOTE_CONFIG_IN_SENSE_TOGGLE(false), then
pull_cfg; nrfx_gpiote.h lines 99-106 sets skip_gpio_setup=false, and
nrfx_gpiote.c lines 581-583 configures and marks the input. Shutdown therefore
executes the real uninit/reset GPIO semantics, not an ownership-only stub.

The test checks final PIN_CNF direction/input/pull/sense, real button/timer
cleanup, unmodified non-wake inputs and a separate GPIO owner, and 12
deinit/reinit cycles with successful/positive-error/negative-error saves.
The unknown shutdown event must not modify active GPIOs or UI state.

Run directly (default this checkout), or use --source-root <repo> for an
untouched baseline. --report <new.json> records compile/runtime outcomes and
source hashes; --sanitize enables ASan/UBSan. Test-generated C/executables
are temporary. In Docker use a writable executable tmpfs, for example
--read-only --network none --tmpfs /tmp:rw,exec,size=64m, and read-only source
mounts. The evidence directory is the only persistent writable mount.

This is host register-semantics evidence. It does not emulate electrical
GPIO edges, System OFF silicon behavior, battery condition, or the physical
board. A real sleep/middle-button wake check remains required after flashing.
