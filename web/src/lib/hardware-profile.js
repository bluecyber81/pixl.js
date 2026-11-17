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
const lcdDisplayBuilds = ['2.22.0-DE3.77', '2.22.0-DE3.78', '2.22.0-DE3.79', '2.22.0-DE3.80', '2.22.0-DE3.81'];
export function firmwareBoard(version) {
  if (version === '2.22.0-DE3.81-OLEDt1') return 'OLED';
  if (version === UPDATE_TARGET.application.version || lcdDisplayBuilds.includes(version) ||
      Object.hasOwn(UPDATE_TARGET.localApplications, version)) return 'LCD';
  return null;
}

export function displayBuildReference(version) {
  if (firmwareBoard(version) === 'OLED') return {source:'oled-firmware-configuration', controllerDriver:'SH1106', width:128, height:64};
  if (!lcdDisplayBuilds.includes(version)) return null;
  return {source:'lcd-firmware-configuration', controllerDriver:'ST7567', width:128, height:64};
}
