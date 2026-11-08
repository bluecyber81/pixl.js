export default {
  figureUsage: {
    catalogueVersion: 'Catalogue version: {version}'
  },
  lang: {
    auto: 'Automatic (browser language)',
    choose: 'Language',
    zhcn: '简体中文',
    zhtw: '繁體中文(臺灣)',
    en: 'English',
    es: 'Español',
    ru: 'Русский',
    de: 'Deutsch',
    sv: 'Svenska',
    ja: '日本語',
    changeok: 'Language changed'
  },
  btn: {
    ok: 'OK',
    cancel: 'Cancel',
    cont: 'Continue'
  },
  menu: {
    upload: 'Upload',
    newfolder: 'New folder',
    del: 'Delete',
    up: 'Parent folder',
    refresh: 'Refresh',
    dfu: 'DFU',
    dfupage: 'Open DFU page',
    enterdfu: 'Put device in DFU mode',
  },
  status: {
    connected: 'Connected · firmware ',
    version: 'Version:',
    mac: 'MAC address:',
    loading: 'Loading…',
  },
  conn: {
    connect: 'Connect',
    connecting: 'Connecting…',
    disconnect: 'Disconnect',
    consuccess: 'Connected to Pixl.js.',
    disconnected: 'Disconnected from Pixl.js.',
    connfailed: 'Could not connect to Pixl.js.'
  },
  labels: {
    name: 'Name',
    size: 'Size',
    type: 'Type',
    remark: 'Note'
  },
  contxmenu: {
    del: 'Delete…',
    rename: 'Rename…',
    prop: 'Properties…',
    format: 'Format…'
  },
  properties: {
    invalidmeta: 'Damaged or unknown metadata – editing disabled',
    notelimit: 'Notes may contain at most {max} UTF-8 bytes (currently: {actual}).',
    noteinvalid: 'The note contains a NUL or incomplete Unicode character. Please remove or retype it.',
    notebytes: '{actual} of {max} bytes. Accented letters and emojis use multiple bytes.',
    title: 'Properties',
    remark: 'Note',
    entermsg: 'Enter a note',
    attrib: 'Attributes',
    hide: 'Hidden',
    readonly: 'Read-only',
    errupdate: 'Could not save the properties.',
    remarktoolong: 'The note exceeds the 90-byte limit (current size: ',
    remarktoolongend: ' UTF-8 bytes).'
  },
  upload: {
    fileSizeLimit: 'Uploads are limited to 2 MiB per file.',
    title: 'Upload',
    drag: 'Drag files here or ',
    click: 'click to upload.',
    maxsize: 'The path after the drive letter can use up to 63 UTF-8 bytes.',
    maxname: 'File names can use up to 47 UTF-8 bytes.',
    closetitle: 'Cancel uploads and close?',
    closemessage: 'Closing this window cancels the remaining uploads and clears the upload list.',
    errupload: 'Upload failed: '
  },
  format: {
    title: 'Format drive',
    messrow1a: 'Format ',
    messrow1b: '?',
    messrow2: 'Formatting erases all data on this drive.',
    messrow3: 'Formatting may take about 10 seconds.',
    formatok: 'Drive formatted.',
    formaterr: 'Could not format the drive: '
  },
  del: {
    title: 'Delete',
    message: 'Delete ',
    messageend: '?',
    error: 'Could not delete this entry: ',
    deleteok: 'Deleted.'
  },
  dfumode: {
    title: 'Firmware update (DFU)',
    startconfirm: 'Enter DFU mode?',
    commandaccepted: 'The device accepted the DFU command. Check whether DFU mode is ready on the separately opened DFU page. No firmware has been transferred yet.',
    updateconfirm: 'The device accepted the DFU request. Open the firmware update page?',
    updatetitle: 'DFU request accepted'
  },
  oldfirm: {
    title: 'Firmware update required',
    message: 'This device firmware does not support uploads. Install a compatible firmware version to upload files.'
  },
  newfolder: {
    title: 'New folder',
    message: 'Enter a folder name',
    newfoldererr: 'Could not create the folder: '
  },
  rename: {
    title: 'Rename',
    message: 'Enter a new name',
    errrename: 'Could not rename this entry: ',
    nametoolong: 'The path after the drive letter can use up to 63 UTF-8 bytes.',
    pathtoolong: 'File names can use up to 47 UTF-8 bytes.'
  },
  drive: {
    free: '{free} free of {total}',
    message: 'Drive unavailable (error ',
    messageend: ')'
  },
  transfer: {
    busy: 'File transfer is running. Close the upload dialog to cancel.',
    unsupported: 'This browser does not support Web Bluetooth. Please use Chrome or Edge.',
    deviceerror: 'Device error',
    cancelled: 'Transfer cancelled'
  }
}
