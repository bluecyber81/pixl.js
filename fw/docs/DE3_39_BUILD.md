# Building the DE3.39 application

This LCD application is based on the existing DE3.38 Packed LittleFS installation.
Its application version is `2.22.0-DE3.39`, with DFU version counter `611`.

Use the pinned SDK environment and `bash fw/scripts/build_de3.sh` from the
repository root to compile the application. The reviewed build uses the S112
SDK header correction recorded in its build evidence. Compilation does not sign
an update, access a device, or update the installed bootloader or SoftDevice.

The historical top-level default, `all` and `ota` recipes, and the application
`full`, `settingsgen`, `flash_softdevice` and `flash_all_ocd` recipes are disabled
before their prerequisites can run. They contain older full-image assumptions,
including SoftDevice 7.2.0 and settings counters/layouts that do not describe
this custom installation. Use the separately verified, signed update packages.
The bootloader source embedded in this application tree is not the reviewed BL7
release source; do not use it to recreate the installed bootloader.

The DE3.39 application package preserves the existing PFS1 layout. It does not
format external storage, replace BL7, or replace S112 7.3.0. Devices still using
SPIFFS or a different LittleFS layout require their own verified migration.

The runtime correction makes NFC shutdown update the SDK's saved interrupt mask
inside a critical section, so exiting that section cannot re-enable the stopped
NFCT and TIMER4 interrupts. The new host test models the NVIC write-one register
semantics and executes the pinned SDK inline functions; reverting to the old
raw disable calls is checked as a negative control.

Host tests and ARM builds do not replace an on-device NFC/wake/Bluetooth check.
The actual SoftDevice RAM minimum has not been measured on the current device;
DE3.39 does not introduce a speculative RAM boundary guard or a new memory map.
