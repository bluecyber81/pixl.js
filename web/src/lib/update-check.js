import { normalizeBootDiagnostics } from './boot-diagnostics.js';

import { UPDATE_TARGET } from './update-target.js';
export { UPDATE_TARGET } from './update-target.js';

const versionPattern = /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]{1,48})?$/;
const aggregate = checks => checks.some(c => c.status === 'different') ? 'different'
  : checks.every(c => c.status === 'match') ? 'match' : 'unknown';
const compare = (key, actual, expected) => ({ key, actual: actual ?? null, expected,
  status: actual == null ? 'unknown' : actual === expected ? 'match' : 'different' });
const flag = (key, valid) => ({ key, actual: valid === true ? true : null, expected: true,
  status: valid === true ? 'match' : 'unknown' });

/** Uses only the current session and the existing validated read-only schema.
 * Never requests a connection, reads memory, downloads an update, or flashes.
 * Callers must clear boot data on device/session changes, as App.vue already does.
 */
export function evaluateUpdateCheck({ session = {}, boot = null } = {}) {
  const active = session?.connected === true;
  const diagnostic = active ? normalizeBootDiagnostics(boot) : null;
  const firmware = active && typeof session?.firmwareVersion === 'string' &&
    versionPattern.test(session.firmwareVersion) ? session.firmwareVersion : null;
  const target = UPDATE_TARGET;
  const bootReason = !active ? 'disconnected' : diagnostic ? null : boot != null ? 'invalid'
    : session?.bootState === 'failed' ? 'failed' : session?.bootState === 'unavailable' ? 'unavailable' : 'notRead';
  const rows = [];
  function row(id, checks, reasons = []) {
    rows.push({ id, status: aggregate(checks), checks,
      reasons: [...new Set([...reasons, ...(bootReason ? [bootReason] : [])])] });
  }
  row('hardware', [
    compare('chip', diagnostic?.chipPart, target.hardware.chip),
    compare('variant', diagnostic?.chipVariantRaw, target.hardware.variant),
    compare('flash', diagnostic?.flashBytes, target.hardware.flash),
    compare('ram', diagnostic?.ramBytes, target.hardware.ram),
    compare('page', diagnostic?.pageBytes, target.hardware.page),
    flag('geometry', diagnostic?.geometryValid)
  ]);
  const applicationChecks = [compare('version', firmware, target.application.version),
    compare('applicationCounter', diagnostic?.settingsCrcValid ? diagnostic.applicationCounter : null, target.application.counter)];
  const deVersion = value => value?.match(/^(\d+)\.(\d+)\.(\d+)-DE3\.(\d+)(-PREP)?$/);
  const previousDe = deVersion(firmware), targetDe = deVersion(target.application.version);
  const relation = previousDe && targetDe ? [1,2,3,4].map(i=>Number(previousDe[i])-Number(targetDe[i])).find(n=>n!==0)||0 : 0;
  row('application', applicationChecks, ['applicationScope',
    ...(previousDe?.[5] ? ['preparationApplication'] : []),
    ...(relation < 0 ? ['olderApplication'] : relation > 0 ? ['newerApplication'] : [])]);
  row('bootloader', [
    compare('bootHash', diagnostic?.bootHashValid ? diagnostic.bootRegionSha256 : null, target.bootloader.sha256),
    compare('bootCounter', diagnostic?.settingsCrcValid ? diagnostic.bootloaderCounter : null, target.bootloader.counter),
    compare('bootAddress', diagnostic?.bootAddressValid ? diagnostic.bootAddress : null, target.bootloader.address),
    compare('bootBytes', diagnostic?.bootHashValid ? diagnostic.bootRegionBytes : null, target.bootloader.bytes),
    compare('paramsAddress', diagnostic?.paramsLayoutKnown ? diagnostic.effectiveParamsAddress : null, target.bootloader.paramsAddress),
    compare('settingsAddress', diagnostic?.geometryValid ? diagnostic.settingsAddress : null, target.bootloader.settingsAddress),
    compare('settingsVersion', diagnostic?.settingsLayoutSupported ? diagnostic.settingsVersion : null, target.bootloader.settingsVersion),
    flag('bootVectors', diagnostic?.bootVectorsValid),
    flag('settingsCrc', diagnostic?.settingsCrcValid),
    compare('addressConflict', diagnostic ? diagnostic.addressConflict : null, false)
  ], ['bootScope']);
  row('softDevice', [
    compare('sdVariant', diagnostic?.softDeviceValid ? diagnostic.softDeviceVariant : null, target.softDevice.variant),
    compare('sdVersion', diagnostic?.softDeviceValid ? diagnostic.softDeviceVersion : null, target.softDevice.version),
    compare('sdFwid', diagnostic?.softDeviceValid ? diagnostic.softDeviceFwid : null, target.softDevice.fwid)
  ], ['softDeviceScope']);
  return { targetId: target.id, status: aggregate(rows), active, rows };
}

export function updateCheckText(locale = 'de_DE') {
  const german = String(locale).startsWith('de'), copy = german ? COPY.de : COPY.en;
  const version = UPDATE_TARGET.application.version, short = version.split('-').at(-1);
  return { ...copy, target: `${german ? 'Lokaler Vergleichsstand' : 'Local comparison profile'}: ${short} · ${UPDATE_TARGET.bootloader.name} · S112 7.3.0`,
    targets: { ...copy.targets, application: `${version} · ${german ? 'Zähler' : 'counter'} ${UPDATE_TARGET.application.counter}`,
      bootloader: `${UPDATE_TARGET.bootloader.name} · ${german ? 'Bereichs-Hash und Zähler' : 'region hash and counter'} ${UPDATE_TARGET.bootloader.counter}` },
    reasons: { ...copy.reasons, olderApplication: german ? `Die gelesene DE3-Version ist älter als das lokale Ziel ${short}.` : `The read DE3 version is older than the local ${short} target.` } };
}

// Only allowlisted values from evaluateUpdateCheck reach the overview. No device
// identifiers, arbitrary notes, filenames, keys, or exception strings are shown.
export function formatUpdateValue(key, value, locale = 'de_DE') {
  const text = updateCheckText(locale);
  if (value == null) return text.unknownValue;
  if (typeof value === 'boolean') return value ? text.yes : text.no;
  if (['flash', 'ram', 'page', 'bootBytes'].includes(key)) return `${value / 1024} KiB`;
  if (['chip', 'variant', 'bootAddress', 'paramsAddress', 'settingsAddress', 'sdFwid'].includes(key)) {
    return `0x${value.toString(16).toUpperCase()}`;
  }
  if (key === 'sdVersion') return `${Math.floor(value / 1000000)}.${Math.floor(value / 1000) % 1000}.${value % 1000}`;
  if (key === 'sdVariant') return `S${value}`;
  return String(value);
}

const COPY = {
  de: {
    title: 'Geräteübersicht und Versionsabgleich', target: '',
    subtitle: 'Vergleicht die gelesenen Angaben mit diesem Paket. Abweichung bedeutet nicht automatisch Fehler oder Inkompatibilität. Keine automatische Aktualisierung.',
    match: 'Passt zum Ziel', different: 'Abweichung', unknown: 'Noch nicht bestätigt', unknownValue: 'Nicht bestätigt',
    actual: 'Gelesen', expected: 'Erwartet', details: 'Prüfdetails anzeigen', yes: 'Ja', no: 'Nein',
    overall: { match: 'Alle gelesenen Angaben passen zum lokalen Ziel.', different: 'Mindestens eine gelesene Angabe weicht vom Ziel ab.', unknown: 'Für den vollständigen Abgleich fehlen noch bestätigte Angaben.' },
    names: { hardware: 'Hardware', application: 'Anwendung', bootloader: 'Bootloader', softDevice: 'Bluetooth-Stack' },
    targets: { hardware: 'nRF52832 AAE0 · 512 KiB Flash · 64 KiB RAM', application: '', bootloader: '', softDevice: 'S112 7.3.0 · FWID 0x126' },
    fields: { chip: 'Chip', variant: 'Chipvariante (AAE0)', flash: 'Chip-Flash', ram: 'Chip-RAM', page: 'Flash-Seite', geometry: 'Speichergeometrie gültig', version: 'Laufende Version', applicationCounter: 'Anwendungszähler', bootHash: 'SHA-256 des Bootloader-Bereichs', bootCounter: 'Bootloader-Zähler', bootAddress: 'Bootloader-Start', bootBytes: 'Bereichsgröße', paramsAddress: 'MBR-Parameter', settingsAddress: 'Settings-Adresse', settingsVersion: 'Settings-Layout', bootVectors: 'Boot-Vektoren gültig', settingsCrc: 'Settings-CRC gültig', addressConflict: 'Adresskonflikt', sdVariant: 'SoftDevice', sdVersion: 'Version', sdFwid: 'Firmware-ID' },
    reasons: {
      disconnected: 'Nicht verbunden; frühere Werte werden hier nicht als aktuell bestätigt.',
      notRead: 'Bootloader- und SoftDevice-Angaben noch nicht gelesen. Die Leseabfrage unten ausführen.',
      unavailable: 'Diese Verbindung liefert keine passende Bootloader-Diagnose.', failed: 'Die letzte Leseabfrage ist fehlgeschlagen.',
      invalid: 'Die Diagnose ist unvollständig oder ungültig; daraus folgt keine bestätigte Geräteabweichung.',
      applicationScope: 'Versionsmeldung und gespeicherter Zähler; kein Hashnachweis der laufenden Anwendung.',
      olderApplication: '',
      preparationApplication: 'Vorbereitungsfirmware: kein Nachweis einer abgeschlossenen LittleFS-Umstellung. Speicherbackend, vollständige Sicherung und Kapazität sind getrennt zu prüfen.',
      newerApplication: 'Diese Anwendung ist neuer als der mitgelieferte Vergleichsstand. Das allein belegt weder einen Fehler noch Inkompatibilität. Kein Downgrade wird vorgeschlagen.',
      bootScope: 'Der Zähler allein reicht nicht. Der Bereichs-Hash enthält auch Füllbytes; er prüft keine Signatur.',
      softDeviceScope: 'Ausgelesene SoftDevice-Metadaten; keine Funk- oder Funktionstestbestätigung.'
    },
    limits: 'Momentaufnahme dieser Verbindung. Displayverdrahtung, Signaturprüfung und Wiederherstellbarkeit sind damit nicht bestätigt. Dies ist keine Flash-Freigabe und keine Online-Prüfung auf die neueste Version.'
  },
  en: {
    title: 'Device overview and version check', target: '',
    subtitle: 'Compares the read values with this package. A difference does not automatically mean a fault or incompatibility. No automatic update.',
    match: 'Matches target', different: 'Difference', unknown: 'Not yet confirmed', unknownValue: 'Not confirmed',
    actual: 'Read', expected: 'Expected', details: 'Show check details', yes: 'Yes', no: 'No',
    overall: { match: 'All read values match the local target.', different: 'At least one read value differs from the target.', unknown: 'A complete comparison still needs confirmed values.' },
    names: { hardware: 'Hardware', application: 'Application', bootloader: 'Bootloader', softDevice: 'Bluetooth stack' },
    targets: { hardware: 'nRF52832 AAE0 · 512 KiB flash · 64 KiB RAM', application: '', bootloader: '', softDevice: 'S112 7.3.0 · FWID 0x126' },
    fields: { chip: 'Chip', variant: 'Chip variant (AAE0)', flash: 'Chip flash', ram: 'Chip RAM', page: 'Flash page', geometry: 'Valid memory geometry', version: 'Running version', applicationCounter: 'Application counter', bootHash: 'Bootloader region SHA-256', bootCounter: 'Bootloader counter', bootAddress: 'Bootloader start', bootBytes: 'Region size', paramsAddress: 'MBR parameters', settingsAddress: 'Settings address', settingsVersion: 'Settings layout', bootVectors: 'Valid boot vectors', settingsCrc: 'Valid settings CRC', addressConflict: 'Address conflict', sdVariant: 'SoftDevice', sdVersion: 'Version', sdFwid: 'Firmware ID' },
    reasons: {
      disconnected: 'Disconnected; previous values are not confirmed as current here.',
      notRead: 'Bootloader and SoftDevice values have not been read. Use the read action below.',
      unavailable: 'This connection does not provide a matching bootloader diagnostic.', failed: 'The last read request failed.',
      invalid: 'The diagnostic is incomplete or invalid; this does not establish a device mismatch.',
      applicationScope: 'Reported version and stored counter; not a hash verification of the running application.',
      olderApplication: '',
      preparationApplication: 'Preparation firmware: not evidence of a completed LittleFS migration. Check the storage backend, complete backup and physical capacity separately.',
      newerApplication: 'This application is newer than the bundled comparison profile. That alone does not establish a fault or incompatibility. No downgrade is suggested.',
      bootScope: 'The counter alone is insufficient. The region hash includes padding; it does not verify a signature.',
      softDeviceScope: 'Read SoftDevice metadata; not confirmation of radio or functional tests.'
    },
    limits: 'Snapshot of this connection. Display wiring, signature verification and recoverability are not confirmed. This is not flash authorization or an online check for the latest version.'
  }
};
