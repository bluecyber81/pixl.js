// A local release target, not an online 'latest version' lookup. A matching
// observation is not permission to flash another device or proof of its wiring.
const z13Hash = '97b2751f1b041de8bcba131d875be725fe91294bfc72e4a7f7a3dc5526e88002';
export const UPDATE_TARGET = Object.freeze({
  profileSchema: 1, profileRevision: '2026-11-21-de398-z21',
  id: 'allmiibo-lcd-de3.98-z21-s112-7.3.0',
  application: Object.freeze({ version: '2.22.0-DE3.98', counter: 671 }),
  localApplications: Object.freeze({ '2.22.0-DE3.64': 636, '2.22.0-DE3.65': 637, '2.22.0-DE3.66': 638, '2.22.0-DE3.67': 639, '2.22.0-DE3.68': 640, '2.22.0-DE3.69': 641, '2.22.0-DE3.70': 642, '2.22.0-DE3.71': 643, '2.22.0-DE3.71t1': 644, '2.22.0-DE3.72': 645, '2.22.0-DE3.73': 646, '2.22.0-DE3.74': 647, '2.22.0-DE3.75': 648, '2.22.0-DE3.76': 649, '2.22.0-DE3.77': 650, '2.22.0-DE3.79': 652, '2.22.0-DE3.80': 653, '2.22.0-DE3.81': 654 }),
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
  bootloaderZ19: Object.freeze({ name: 'Z19', counter: 19,
    sha256: '51f47a2fae5739d4a59114f7d84e9da10a3ca140f1a558c44685fbe0d97811fd' }),
  bootloaderZ20: Object.freeze({ name: 'Z20', counter: 20,
    sha256: '4340d5080aca4205b576c31e7d7b96d5061a4fd3e52a2467e9eb1dabe0c064db' }),
  bootloaderZ21: Object.freeze({ name: 'Z21', counter: 21,
    sha256: 'd3f9da7c477ce56a38d4458585222bffca793fddf614f54937012e4819d717fb' }),
  softDevice: Object.freeze({ variant: 112, version: 7003000, fwid: 0x126 }),
  hardware: Object.freeze({ chip: 0x52832, variant: 0x41414530, flash: 524288, ram: 65536, page: 4096 })
});

