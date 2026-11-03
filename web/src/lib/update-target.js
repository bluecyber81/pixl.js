// A local release target, not an online 'latest version' lookup. A matching
// observation is not permission to flash another device or proof of its wiring.
export const UPDATE_TARGET = Object.freeze({
  profileSchema: 1, profileRevision: '2026-11-03-de357-bl8-bv11',
  id: 'allmiibo-lcd-de3.57-bl8-bv11-s112-7.3.0',
  application: Object.freeze({ version: '2.22.0-DE3.57', counter: 629 }),
  bootloader: Object.freeze({ name: 'BL8', counter: 11, address: 0x77000, bytes: 28672,
    sha256: 'add1f8f0422dc9da6c4e2ce90899e3fc7b5d0498993030c0bd5110cdc5b66130',
    paramsAddress: 0x7e000, settingsAddress: 0x7f000, settingsVersion: 2 }),
  softDevice: Object.freeze({ variant: 112, version: 7003000, fwid: 0x126 }),
  hardware: Object.freeze({ chip: 0x52832, variant: 0x41414530, flash: 524288, ram: 65536, page: 4096 })
});

