// A local release target, not an online 'latest version' lookup. A matching
// observation is not permission to flash another device or proof of its wiring.
export const UPDATE_TARGET = Object.freeze({
  profileSchema: 1, profileRevision: '2026-11-05-de360-bl8-z13',
  id: 'allmiibo-lcd-de3.60-bl8-z13-s112-7.3.0',
  application: Object.freeze({ version: '2.22.0-DE3.60', counter: 632 }),
  bootloader: Object.freeze({ name: 'BL8', counter: 11, address: 0x77000, bytes: 28672,
    sha256: 'add1f8f0422dc9da6c4e2ce90899e3fc7b5d0498993030c0bd5110cdc5b66130',
    paramsAddress: 0x7e000, settingsAddress: 0x7f000, settingsVersion: 2 }),
  bootloaderZ13: Object.freeze({ name: 'Z13', counter: 13,
    sha256: '97b2751f1b041de8bcba131d875be725fe91294bfc72e4a7f7a3dc5526e88002' }),
  softDevice: Object.freeze({ variant: 112, version: 7003000, fwid: 0x126 }),
  hardware: Object.freeze({ chip: 0x52832, variant: 0x41414530, flash: 524288, ram: 65536, page: 4096 })
});

