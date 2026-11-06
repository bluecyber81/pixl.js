// A local release target, not an online 'latest version' lookup. A matching
// observation is not permission to flash another device or proof of its wiring.
const z13Hash = '97b2751f1b041de8bcba131d875be725fe91294bfc72e4a7f7a3dc5526e88002';
export const UPDATE_TARGET = Object.freeze({
  profileSchema: 1, profileRevision: '2026-11-06-de362-bl8-z13-z15-z16-z17-z18',
  id: 'allmiibo-lcd-de3.62-bl8-z13-z15-z16-z17-z18-s112-7.3.0',
  application: Object.freeze({ version: '2.22.0-DE3.62', counter: 634 }),
  bootloader: Object.freeze({ name: 'BL8', counter: 11, address: 0x77000, bytes: 28672,
    sha256: 'add1f8f0422dc9da6c4e2ce90899e3fc7b5d0498993030c0bd5110cdc5b66130',
    paramsAddress: 0x7e000, settingsAddress: 0x7f000, settingsVersion: 2 }),
  bootloaderZ13: Object.freeze({ name: 'Z13', counter: 13, sha256: z13Hash }),
  bootloaderZ15: Object.freeze({ name: 'Z15', counter: 15,
    sha256: 'c3200211a846a2912a57c7e4f194d05185e08735df342bd549a201739286bade' }),
  bootloaderZ16: Object.freeze({ name: 'Z16', counter: 16, sha256: z13Hash }),
  bootloaderZ17: Object.freeze({ name: 'Z17', counter: 17,
    sha256: '5fec8c8495978afcd340e6b42db7fc9ba4fa9f216aad2b2a597cc7282877d584' }),
  // Recovery package: byte-identical Z15 code with a counter accepted after Z17.
  bootloaderZ18: Object.freeze({ name: 'Z18', counter: 18,
    sha256: 'c3200211a846a2912a57c7e4f194d05185e08735df342bd549a201739286bade' }),
  softDevice: Object.freeze({ variant: 112, version: 7003000, fwid: 0x126 }),
  hardware: Object.freeze({ chip: 0x52832, variant: 0x41414530, flash: 524288, ram: 65536, page: 4096 })
});

