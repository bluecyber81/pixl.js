import { UPDATE_TARGET } from './update-target.js';
import { DE41_MIGRATION_CAPACITY_TARGET, DE3102_MIGRATION_CAPACITY_TARGET, DE3101_MIGRATION_CAPACITY_TARGET, DE3100_MIGRATION_CAPACITY_TARGET, DE399_MIGRATION_CAPACITY_TARGET, DE398_MIGRATION_CAPACITY_TARGET, DE397_MIGRATION_CAPACITY_TARGET, DE396_MIGRATION_CAPACITY_TARGET, DE395_MIGRATION_CAPACITY_TARGET, DE394_MIGRATION_CAPACITY_TARGET, DE393_MIGRATION_CAPACITY_TARGET, DE392_MIGRATION_CAPACITY_TARGET, DE391_MIGRATION_CAPACITY_TARGET, DE389_MIGRATION_CAPACITY_TARGET, MIGRATION_CAPACITY_TARGET } from './migration-capacity.js';

// A profile is opt-in. Only the browser's already hashed, per-device lookup key is used locally.
const profileValue = 'lipo-551520-180mah-v1';
const storageKey = binding => binding + '.battery-label.v1';

export function hasBatteryLabel(storage, binding) {
  return Boolean(binding) && storage.getItem(storageKey(binding)) === profileValue;
}

export function setBatteryLabel(storage, binding, enabled) {
  if (!binding) throw new Error('No device binding');
  if (enabled) storage.setItem(storageKey(binding), profileValue);
  else storage.removeItem(storageKey(binding));
}

export function batteryLabelReport() {
  return {source: 'owner-confirmed-cell-label', marking: '551520', nominalMillivolts: 3800,
    ratedMilliampHours: 180, ratedMilliwattHours: 684};
}

// The application version identifies a published build target. It is not a display-controller read.
export const LCD_Z21_COUNTERS = Object.freeze({
  '2.22.0-DE3.82': 655,
  '2.22.0-DE3.83': 656,
  '2.22.0-DE3.84': 657,
  '2.22.0-DE3.85': 658,
  '2.22.0-DE3.86': 659,
  '2.22.0-DE3.87': 660,
  '2.22.0-DE3.88': 661,
  '2.22.0-DE3.89': 662,
  '2.22.0-DE3.91': 664,
  '2.22.0-DE3.92': 665,
  '2.22.0-DE3.93': 666,
  '2.22.0-DE3.94': 667,
  '2.22.0-DE3.95': 668,
  '2.22.0-DE3.96': 669,
  '2.22.0-DE3.97': 670,
  '2.22.0-DE3.98': 671,
  '2.22.0-DE3.99': 672,
  '2.22.0-DE3.100': 673,
  '2.22.0-DE3.101': 674,
  '2.22.0-DE3.102': 675,
  '2.22.0-DE3.103': 676,
  '2.22.0-DE3.104': 677,
  '2.22.0-DE4.1': 678,
  '2.22.0-DE4.2-b1': 679,
  '2.22.0-DE4.2-b2': 680,
});
const lcdDisplayBuilds = ['2.22.0-DE3.77', '2.22.0-DE3.78', '2.22.0-DE3.79', '2.22.0-DE3.80', '2.22.0-DE3.81', ...Object.keys(LCD_Z21_COUNTERS)];
export function supportsFolderPublication(version, engine) {
  if (firmwareBoard(version) !== 'LCD') return false;
  if (version === '2.22.0-DE4.2-b2') return engine === '15db90c7d572bfc3043664a90ed077125a9645bca46055ae2fe0dafe0cb055c0';
  if (version === '2.22.0-DE4.2-b1') return engine === '4b779ad5f10e12d881e0c96c4495c6db3290cbac3c015b50d11dd73dc8189758';
  // The App676 and App677 test builds use the same PFS engine for directory publication as App675.
  // Storage migration has its own release-specific qualification.
  if (version === '2.22.0-DE3.103' || version === '2.22.0-DE3.104') return engine === DE3102_MIGRATION_CAPACITY_TARGET.layout.engineSha256;
  const profile = [DE41_MIGRATION_CAPACITY_TARGET, DE3102_MIGRATION_CAPACITY_TARGET, DE3101_MIGRATION_CAPACITY_TARGET, DE3100_MIGRATION_CAPACITY_TARGET, DE399_MIGRATION_CAPACITY_TARGET, DE398_MIGRATION_CAPACITY_TARGET, DE397_MIGRATION_CAPACITY_TARGET, DE396_MIGRATION_CAPACITY_TARGET, DE395_MIGRATION_CAPACITY_TARGET, DE394_MIGRATION_CAPACITY_TARGET, DE393_MIGRATION_CAPACITY_TARGET, DE392_MIGRATION_CAPACITY_TARGET, DE391_MIGRATION_CAPACITY_TARGET, DE389_MIGRATION_CAPACITY_TARGET].find(target => target.firmwareVersion === version) ?? MIGRATION_CAPACITY_TARGET;
  return profile.approved === true && profile.layout.engineSha256 === engine;
}
export const OLED_PARITY_VERSION = '2.22.0-DE3.84-OLEDt4';
export const OLED_TEST5_VERSION = '2.22.0-DE3.85-OLEDt5';
export const OLED_TEST6_VERSION = '2.22.0-DE3.87-OLEDt6';
export function hasOledSystemDiagnostics(version) {
  return version === '2.22.0-DE3.81-OLEDt3' || version === OLED_PARITY_VERSION || version === OLED_TEST5_VERSION || version === OLED_TEST6_VERSION;
}
export function lacksOledSystemDiagnostics(version) {
  return version === '2.22.0-DE3.81-OLEDt1' || version === '2.22.0-DE3.81-OLEDt2';
}
export function firmwareBoard(version) {
  if (typeof version === 'string' && /^\d+\.\d+\.\d+-DE[1-9]\d*\.\d+-OLEDt[1-9]\d*$/.test(version)) return 'OLED';
  if (version === UPDATE_TARGET.application.version || lcdDisplayBuilds.includes(version) ||
      Object.hasOwn(UPDATE_TARGET.localApplications, version)) return 'LCD';
  return null;
}

export function displayBuildReference(version) {
  if (lacksOledSystemDiagnostics(version) || hasOledSystemDiagnostics(version)) return {source:'oled-firmware-configuration', controllerDriver:'SH1106', width:128, height:64};
  if (!lcdDisplayBuilds.includes(version)) return null;
  return {source:'lcd-firmware-configuration', controllerDriver:'ST7567', width:128, height:64};
}

// Early DE3 firmware predates the Z21 table. Later series opt in by their
// registered LCD identity; unknown model suffixes must never enable commands.
export function supportsLegacyLcdFeature(version, minimumDe3Minor) {
  const known = version === '2.22.0-DE3.71t1' ? '2.22.0-DE3.71' : version;
  const legacy = /^2\.22\.0-DE3\.(\d+)$/u.exec(known || '');
  return legacy ? Number(legacy[1]) >= minimumDe3Minor : Object.hasOwn(LCD_Z21_COUNTERS, known);
}
