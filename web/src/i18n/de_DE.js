export default {
  lang: {
    choose: 'Sprache/Language',
    zhcn: '简体中文',
    zhtw: '繁體中文(臺灣)',
    en: 'English',
    es: 'Español',
    ru: 'Русский',
    de: 'Deutsch',
    sv: 'Svenska',
    ja: '日本語',
    changeok: 'Sprache erfolgreich geändert'
  },
  btn: {
    ok: 'OK',
    cancel: 'Abbrechen',
    cont: 'Weiter'
  },
  menu: {
    upload: 'Hochladen',
    newfolder: 'Neuer Ordner',
    del: 'Löschen',
    up: 'Übergeordneter Ordner',
    refresh: 'Aktualisieren',
    dfu: 'DFU',
    dfupage: 'DFU-Seite öffnen',
    enterdfu: 'Gerät in DFU versetzen',
  },
  status: {
    connected: 'Verbunden, Version: ',
    version: 'Version:',
    mac: 'MAC Adresse:',
    loading: 'Lade…',
  },
  conn: {
    connect: 'Verbinden',
    connecting: 'Verbinde…',
    disconnect: 'Trennen',
    consuccess: 'Erfolgreich mit Pixl.js verbunden!',
    disconnected: 'Pixl.js wurde getrennt!',
    connfailed: 'Verbindung mit Pixl.js fehlgeschlagen!'
  },
  labels: {
    name: 'Name',
    size: 'Größe',
    type: 'Typ',
    remark: 'Notiz'
  },
  contxmenu: {
    del: 'Löschen…',
    rename: 'Umbenennen…',
    prop: 'Eigenschaften…',
    format: 'Formatieren…'
  },
  properties: {
    title: 'Eigenschaften',
    invalidmeta: 'Metadaten beschädigt oder unbekannt – Bearbeitung gesperrt',
    notelimit: 'Notizen dürfen höchstens {max} UTF-8-Bytes lang sein (aktuell: {actual}).',
    noteinvalid: 'Die Notiz enthält ein Nullzeichen oder unvollständiges Unicode-Zeichen. Bitte entfernen oder neu eingeben.',
    notebytes: '{actual} von {max} Bytes. Umlaute und Emojis benötigen mehrere Bytes.',
    remark: 'Notiz',
    entermsg: 'Bitte Notiz eingeben',
    attrib: 'Attribute',
    hide: 'Ausblenden',
    readonly: 'Nur lesen',
    errupdate: 'Eigenschaften aktualisieren fehlgeschlagen!',
    remarktoolong: 'Notizen können maximal ist 90 Bytes lang sein! Das entspricht 90 Buchstaben or 30 chinesischen Buchstaben (Aktuell: ',
    remarktoolongend: ' Bytes）'
  },
  upload: {
    title: 'Hochladen',
    drag: 'Dateien hier rein ziehen, oder',
    click: 'klicken zum Hochladen.',
    maxsize: 'Die Gesamtlänge des Dateipfads darf 63 Bytes nicht überschreiten.',
    maxname: 'Der Dateiname darf 47 Bytes nicht überschreiten.',
    closetitle: 'Schließen bestätigen?',
    closemessage: 'Das Schließen des Hochladen Dialogs bricht das Hochladen ab und leert die Warteschlange.',
    errupload: 'Hochladen fehlgeschlagen: '
  },
  format: {
    title: 'Formatieren',
    messrow1a: 'Möchten Sie ',
    messrow1b: ' formatieren?',
    messrow2: 'Formatieren löscht alle Daten!',
    messrow3: 'Formatieren dauert ca. 10 Sekunden, bitte warten.',
    formatok: 'Formatieren erfolgreich!',
    formaterr: 'Formatieren fehlgeschlagen!: '
  },
  del: {
    title: 'Löschen',
    message: 'Dateien: ',
    messageend: ' löschen?',
    error: 'Löschen der Datei fehlgeschlagen!: ',
    deleteok: 'Datei erfolgreich gelöscht!'
  },
  dfumode: {
    title: 'DFU Modus',
    startconfirm: 'DFU Modus aktivieren?',
    commandaccepted: 'Das Gerät hat den DFU-Befehl angenommen. Ob der DFU-Modus bereit ist, prüfst du auf der separat geöffneten DFU-Seite. Es wurde noch keine Firmware übertragen.',
    updateconfirm: 'DFU Modus erfolgreich aktiviert. Möchten Sie die DFU Aktualisierungs Seite aufrufen?',
    updatetitle: 'DFU Modus akzeptiert'
  },
  oldfirm: {
    title: 'Aktualisierungs Tips',
    message: 'Die Firmware Version ihres Gerätes ist zu niedrig. Bitte aktualisieren Sie es auf die neueste Firmware, bevor Sie die Hochladen Funktion verwenden.'
  },
  newfolder: {
    title: 'Neuer Ordner',
    message: 'Bitte geben Sie den Ordner Namen ein',
    newfoldererr: 'Ordner erstellen fehlgeschlagen!:'
  },
  rename: {
    title: 'Umbenennen',
    message: 'Bitte geben Sie den neuen Dateinamen ein: ',
    errrename: 'Umbenennen fehlgeschlagen!: ',
    nametoolong: 'Die maximale Dateipfadlänge darf 63 Bytes nicht überschreiten',
    pathtoolong: 'Die maximale Dateinamenlänge darf 47 Bytes nicht überschreiten'
  },
  drive: {
    free: '{free} frei von {total}',
    message: '(Speicher nicht verfügbar [Fehler: ',
    messageend: '])'
  },
  transfer: {
    busy: 'Dateiübertragung läuft. Zum Abbrechen den Upload-Dialog schließen.',
    unsupported: 'Dieser Browser unterstützt kein Web Bluetooth. Bitte Chrome oder Edge verwenden.',
    deviceerror: 'Gerätefehler',
    cancelled: 'Übertragung abgebrochen'
  }
}
