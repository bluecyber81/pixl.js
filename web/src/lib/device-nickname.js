import { sha256Bytes } from './safe-upload.js'

export async function deviceNicknameStorageKey(deviceId) {
  if (typeof deviceId !== 'string' || deviceId.length === 0 || deviceId.length > 256) return null
  const digest = await sha256Bytes(new TextEncoder().encode('allmiibo-device-nickname-v1/' + deviceId))
  return 'allmiibo.device-nickname.v1.' + digest
}

export function normalizeDeviceNickname(value) {
  if (typeof value !== 'string') return null
  const name = value.normalize('NFC').trim()
  // Keep international names and joined emoji. Control characters or direction
  // overrides could hide parts of the device name shown before a DFU switch.
  if ([...name].length > 40 || /[\p{Cc}\p{Cs}\u061c\u200b\u200e\u200f\u2028-\u202e\u2066-\u2069\ufeff]/u.test(name)) return null
  if (name && !/[^\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Mark}]/u.test(name)) return null
  return name
}
