import test from 'node:test'
import assert from 'node:assert/strict'
import { deviceNicknameStorageKey, normalizeDeviceNickname } from '../src/lib/device-nickname.js'

test('nickname storage uses only a digest of the exact browser permission identity', async () => {
  const key = await deviceNicknameStorageKey('Exact-Device-ID')
  assert.match(key, /^allmiibo\.device-nickname\.v1\.[0-9a-f]{64}$/)
  assert.equal(key, await deviceNicknameStorageKey('Exact-Device-ID'))
  assert.notEqual(key, await deviceNicknameStorageKey('exact-device-id'))
  assert.equal(await deviceNicknameStorageKey(''), null)
})

test('nicknames preserve international names, normalize Unicode and bound visible names', () => {
  assert.equal(normalizeDeviceNickname('  Andre\u0301 家庭 👩‍🔧  '), 'André 家庭 👩‍🔧')
  assert.equal(normalizeDeviceNickname('🐈'.repeat(40)), '🐈'.repeat(40))
  assert.equal(normalizeDeviceNickname(''), '')
  assert.equal(normalizeDeviceNickname('नमस्ते'), 'नमस्ते')
  for (const name of ['🐈'.repeat(41), 'T\u202eABC', 'A\u0000B', '\ud800', null,
    '\u200d', '\u200c', '\u2060', '\u00ad', '\u0301', '\u200d\ufe0f \u0301']) {
    assert.equal(normalizeDeviceNickname(name), null)
  }
})
