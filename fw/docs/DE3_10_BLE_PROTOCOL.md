# DE3.10 datafile transport: negotiated request framing and MTU23

This extension belongs to the application firmware and bundled web file manager.
It does not replace the Nordic SoftDevice, bootloader or PC Bluetooth driver.
Host tests use the actual C/JavaScript protocol code with mocked radio, timer and
VFS boundaries. They are not a physical Bluetooth interoperability test.

## Negotiation and compatibility

Each new connection starts in **legacy request mode**. Existing request frames
are delivered unchanged, including the documented FILE_WRITE stream: every
physical frame contains its own file ID, each frame is written separately, and
only the final frame is acknowledged. A MORE bit alone must never change that
meaning or concatenate repeated file IDs into a file.

The new client first sends `[03,00,00,00]`. A valid capability request has no
payload, zero status and zero chunk. Accepting it explicitly opts this connection
into the new request-fragment mode. A malformed capability request does not opt
in. Disconnect, driver initialization or transfer abort clears the mode.

The successful response has the existing four-byte header and this payload:

| Offset | Bytes | Meaning |
| --- | --- | --- |
| 0 | `50 58 44 46` | ASCII `PXDF` magic |
| 4 | `01` | Capability format version |
| 5 | `03` | Bit 0: bounded request reassembly; bit 1: all reply types can stream |
| 6 | `F3 00` | Maximum complete request payload: 243 bytes, little endian |
| 8 | `14 00`, `B6 00` or `F7 00` | Current device GATT value capacity: 20, 182 or 247 bytes, examples |

The ten-byte payload fits the minimum 20-byte GATT value. Firmware clamps an
unclear capacity to 20. The browser validates 20..247 and also uses 20 for a
missing or unclear capacity; it accepts the eight-byte base format for this safe
fallback. This is a **device-reported capacity**, not an ATT MTU measurement by
Web Bluetooth. An increase after negotiation leaves the client conservatively
using the earlier, smaller size until reconnect.

Unknown-command status 255 from older firmware selects legacy client framing.
Other errors or malformed capability responses stop startup rather than claiming
support. The normal UI awaits `get_version()`, which performs negotiation before
version retrieval and before opening file actions. Direct protocol consumers
must likewise await `negotiate_transport()` or `get_version()` before requesting
the new behavior. Capability promises/cache and pending operations are discarded
on disconnect; a replacement connection must negotiate again.

## New request mode

The header remains `command:u8, status:u8, chunk:u16LE`. Status is zero. Sequence
starts at zero for each logical request; bit 15 means MORE. A physical payload
is at most `reported GATT value capacity - 4`. At ATT MTU23 this is 16 bytes;
at ATT MTU185 it is 178, and at ATT MTU250 it is 243.

Only payload bytes are concatenated. The complete logical request is limited to
243 bytes, including a file ID or path fields. The existing handler is called
exactly once after the final fragment with chunk zero. A zero-payload command is
one four-byte final frame. An exactly full final payload does not need an empty
terminator. FILE_WRITE requests therefore contain their file ID once; a large
file uses multiple acknowledged logical writes, with up to 242 file bytes each.

Wrong commands, nonzero status, missing/duplicate/out-of-order sequence numbers,
empty continuation/final continuation, payload overflow, interleaved requests
during pending TX, or ten seconds without RX/TX progress abort the connection.
No incomplete request reaches its handler. File and directory cleanup remains
in the foreground work queue, outside the Bluetooth IRQ. Legacy streaming has
its preexisting write-as-received semantics; negotiation does not make those
writes atomic or retroactively add modern fragment validation to them.

## Replies, completion and memory

Version, drive list and storage diagnostic replies now use the same sequence/MORE
framing at small MTUs as file/directory replies. Nonzero terminal status remains
an error; partial data must not be reported as a complete successful download.
Existing file/directory handlers still stream their data at the current device
capacity. An unexpected capacity shrink during one of these streams aborts
rather than silently renumbering already transmitted frames.

The existing 248-byte frame allocation serves either request reassembly or a
pending logical reply. There is no second large static buffer or new dynamic
allocation. Handler TX_READY is delivered only after the entire logical reply
has completed. In particular, entering DFU is requested only after its ACK has
completed TX; a send failure/disconnect before completion cannot trigger it.
Command acknowledgement does not prove the bootloader is advertising, flashing
has completed, or the replacement application has booted.

Browser writes are sequential. Each successful fragment refreshes the browser's
30-second idle deadline. Success waits for both final reply and final GATT write
completion; an early reply before the whole request or a late write error cannot
turn into success. Old connection callbacks cannot continue fragments into a new
session. Firmware uses a ten-second inter-fragment/TX timeout with RTC wrap-aware
counter arithmetic and foreground polling.

## Verification and remaining hardware check

`tests/de3/test_ble_mtu.py` compiles actual driver/core/info/VFS/work-queue C. It
covers MTU23/185/250 replies, bounded reassembly, a real VFS write after reassembly,
legacy short and full-payload FILE_WRITE streams, mode reset, malformed input,
timeouts/RTC wrap, disconnect, TX failure and DFU ACK ordering. The optional
`--negative-controls` requires deliberately regressed production-source variants
to fail their assertions. `--sanitize` enables AddressSanitizer/UBSan on a suitable
host compiler.

`tests/de3/df_mtu_wire_vectors.json` contains actual-C response frames. Every
normal C test run regenerates them in memory and compares them to this fixture.
The web `tests/transport.test.cjs` consumes the same frames through the production
decoder and checks capability/version/drives/diagnostics, MTU-sized request
writes, boundaries, compatibility, cancellation and file progress. The C test's
version/address/VFS data are explicit host stubs, not device readback.

A physical test is still required with ATT MTU23 and a larger negotiated MTU,
including long-path rename, metadata, uploads/downloads, reconnect and DFU. Host
tests verify the expected order where the final notification TX_READY precedes
the next central request; they do not establish every SoftDevice/controller
radio timing. A request received while the prior notification is still pending
is deliberately rejected rather than reusing an ambiguous shared buffer.
