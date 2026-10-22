@rem Legacy factory flashing is intentionally disabled in this application package.
@echo off
echo This Allmiibo package supports application-only Bluetooth OTA updates.
echo Use the supplied OTA ZIP with Web Bluetooth Secure DFU.
echo Bootloader and SoftDevice must remain unchanged for this update.
echo The old factory erase helper is disabled: no verified board-specific full image is supplied.
echo Factory recovery needs a separate verified hardware and complete-image procedure.
exit /b 1
