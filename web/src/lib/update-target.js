// A local release target, not an online 'latest version' lookup. A matching
// observation is not permission to flash another device or proof of its wiring.
export const UPDATE_TARGET = Object.freeze({
  profileSchema: 1, profileRevision: '2026-10-26-de337',
  id: 'allmiibo-lcd-de3.37-bl6-s112-7.3.0',
  application: Object.freeze({ version: '2.22.0-DE3.37', counter: 609 }),
  bootloader: Object.freeze({ name: 'BL6', counter: 7, address: 0x77000, bytes: 28672,
    sha256: '71a8697ed4983a224d984b92dbd76c4ddbe629ccf9650cb5c77acb764eb1b060',
    paramsAddress: 0x7e000, settingsAddress: 0x7f000, settingsVersion: 2 }),
  softDevice: Object.freeze({ variant: 112, version: 7003000, fwid: 0x126 }),
  hardware: Object.freeze({ chip: 0x52832, variant: 0x41414530, flash: 524288, ram: 65536, page: 4096 })
});

