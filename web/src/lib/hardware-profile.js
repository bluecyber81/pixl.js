import { UPDATE_TARGET } from './update-target.js';

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
export const LCD_PREVIEW_COUNTERS = Object.freeze({
  '2.22.0-DE3.82': 655,
  '2.22.0-DE3.83': 656,
  '2.22.0-DE3.84': 657,
  '2.22.0-DE3.85': 658,
  '2.22.0-DE3.86': 659,
});
const lcdDisplayBuilds = ['2.22.0-DE3.77', '2.22.0-DE3.78', '2.22.0-DE3.79', '2.22.0-DE3.80', '2.22.0-DE3.81', ...Object.keys(LCD_PREVIEW_COUNTERS)];
export const OLED_PARITY_VERSION = '2.22.0-DE3.84-OLEDt4';
export function hasOledSystemDiagnostics(version) {
  return version === '2.22.0-DE3.81-OLEDt3' || version === OLED_PARITY_VERSION;
}
export function lacksOledSystemDiagnostics(version) {
  return version === '2.22.0-DE3.81-OLEDt1' || version === '2.22.0-DE3.81-OLEDt2';
}
export function firmwareBoard(version) {
  if (typeof version === 'string' && /^\d+\.\d+\.\d+-DE3\.\d+-OLEDt[1-9]\d*$/.test(version)) return 'OLED';
  if (version === UPDATE_TARGET.application.version || lcdDisplayBuilds.includes(version) ||
      Object.hasOwn(UPDATE_TARGET.localApplications, version)) return 'LCD';
  return null;
}

export function displayBuildReference(version) {
  if (lacksOledSystemDiagnostics(version) || hasOledSystemDiagnostics(version)) return {source:'oled-firmware-configuration', controllerDriver:'SH1106', width:128, height:64};
  if (!lcdDisplayBuilds.includes(version)) return null;
  return {source:'lcd-firmware-configuration', controllerDriver:'ST7567', width:128, height:64};
}
