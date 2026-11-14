// Browsers reuse a BluetoothDevice object when a user selects the same device.
// Delayed work from one client must leave a later owner's connection alone.
const owners = new WeakMap();

export function claimGatt(device, owner) {
  owners.set(device, owner);
}

export function ownsGatt(device, owner) {
  return owner != null && owners.get(device) === owner;
}

export function releaseGatt(device, owner) {
  if (ownsGatt(device, owner)) owners.delete(device);
}
