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

// These LCD configurations are bound to inspected firmware sources. No controller ID is read over BLE.
export function displayBuildReference(version) {
  if (!['2.22.0-DE3.77', '2.22.0-DE3.78', '2.22.0-DE3.79'].includes(version)) return null;
  return {source:'lcd-firmware-configuration', controllerDriver:'ST7567', width:128, height:64};
}
