# Allmiibo Dateimanager DE3.12

Local browser companion for the custom Allmiibo LCD DE3.12 release, based on Pixl.js. This application runs on the PC. It is separate from the LCD firmware OTA and does not replace an installed bootloader or Nordic SoftDevice. Original Pixl.js authorship and GPL licensing remain applicable.

## Start the delivered application

Use `Start-Dateimanager.cmd` in the delivered directory containing `dist/`. It starts the existing local Python runtime, binds only to `127.0.0.1:8765` and opens the browser. Use Chrome or Edge for Web Bluetooth. Select the device yourself when connecting; simply opening the application performs no device write. Direct `file://` opening is not supported.

Use `Stop-Dateimanager.cmd` to stop the matching local server. There is no autostart, background schedule, firewall change or global package installation. PowerShell users may set `-Port 8766` or `-NoBrowser` on the start script. The launcher prefers the existing Agent-Tools Python environment, then Scoop Python, and rejects the Windows Store alias.

## Modernized build

The application uses Vue 3, Element Plus, Vue I18n and Vite. Obsolete Vue 2, Element UI and Webpack 2 tooling is replaced. Exact dependency versions and integrities are recorded in `package-lock.json`; use npm rather than the old Yarn workflow. See `package.json` for the supported Node version.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
```

The delivered `dist/` is already built; installing npm dependencies is not required for normal use. Development and preview servers must stay on loopback.

## Reliability changes

- Wait for notification readiness before announcing a BLE connection; clean up failed/cancelled connection attempts and copy exactly the received DataView.
- Assemble ordered response chunks, preserve terminal error status and reject malformed, incomplete or timed-out exchanges. Wait for both the GATT write and final response before completing a command.
- Reject active and queued work on disconnect. Prevent stale callbacks from a prior connection from altering a new transfer.
- Serialize complete downloads and uploads around the device's single file handle; check OPEN, READ, WRITE and CLOSE status before reporting success.
- Release failed FileReader work so that later queued uploads can proceed.
- Use a browser-native event dispatcher instead of a Node events polyfill.
- Detect German correctly, persist supported language selections locally and tolerate blocked browser storage. No remote analytics or MAC-address telemetry is included.
- Preserve unknown/system metadata flags, enforce the firmware's 89-byte UTF-8 notes limit, and isolate malformed metadata records without corrupting the directory view.
- Keep file actions keyboard-accessible, label available storage correctly, and expose the external DFU page independently of the device-mode command.
- Negotiate request fragmentation with DE3.10 before reading the version. Long requests and replies can be split for the minimum ATT MTU23. Use the device-advertised GATT value limit when valid and fall back to 20-byte values when it is unavailable. Older firmware retains legacy request framing.
- Match the firmware's stored-path budget: up to 63 UTF-8 bytes after the two-byte drive label, and up to 47 bytes for a file name.
- Decode device strings strictly and preserve a leading UTF-8 BOM in file names. Invalid UTF-8 rejects the directory response with an error and leaves no actionable rows; it must never silently select a different file. Healthy directories remain usable. This does not repair malformed stored names.

The legacy `fw/scripts/fw_update.bat` factory-flash helper is deliberately disabled. It previously erased hardware before verifying that a complete firmware image was available. This application-only package supplies no verified complete factory image or board-specific recovery procedure. Use its application OTA ZIP; the disabled helper performs no download or hardware command.

## Validation boundaries

Production-module tests use mocked GATT and FileReader. UI checks and a successful production build do not prove a physical Bluetooth/NFC transfer. Refer to the DE3.12 release receipts for the checks actually completed, exact counts and outstanding findings; prior physical DE3.10 results are not proof of a DE3.12 device test.

The DFU page link opens the existing external thegecko flasher even without a connected device. The separate device-mode button requests entry into DFU mode. This is not a new DFU implementation and does not fix that external page's historical CRC/false-success issue. A disconnect during the entry command can leave its result ambiguous even if the device entered DFU. MTU23 operation is host-tested with the matching DE3.10 firmware; physical radio tests remain pending. Web Bluetooth does not expose the negotiated ATT MTU, so the device's reported limit is not a browser measurement. Do not expose the local server publicly. The firmware package and browser application have separate roles.
