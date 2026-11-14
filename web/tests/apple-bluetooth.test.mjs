import assert from 'node:assert/strict';
import test from 'node:test';
import { bluetoothAccessIssue } from '../public/dfu/bluetooth-access.mjs';

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)';
const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)';
const cases = [
    ['Safari on iPhone', {userAgent:iphone + ' Version/18.0 Mobile Safari/604.1'}, 'appleBluetooth'],
    ['Chrome on iPhone', {userAgent:iphone + ' CriOS/142.0 Mobile Safari/604.1'}, 'appleBluetooth'],
    ['iPad desktop mode', {userAgent:mac, platform:'MacIntel', maxTouchPoints:5}, 'appleBluetooth'],
    ['Mac desktop', {userAgent:mac, platform:'MacIntel', maxTouchPoints:0}, 'browserUnavailable'],
    ['Windows touch device', {userAgent:'Windows NT 10.0', platform:'Win32', maxTouchPoints:5}, 'browserUnavailable'],
    ['incomplete Bluetooth object', {userAgent:iphone, bluetooth:{requestDevice:true}}, 'appleBluetooth'],
    ['Bluefy-style API', {userAgent:iphone, bluetooth:{requestDevice(){throw Error('unexpected Bluetooth request');}}}, ''],
    ['API without a known platform', {bluetooth:{requestDevice(){}}}, '']
];
for (const [name, navigator, expected] of cases) {
    test(name, () => assert.equal(bluetoothAccessIssue({navigator, isSecureContext:true}), expected));
}
test('insecure context takes precedence over platform or injected API', () => {
    assert.equal(bluetoothAccessIssue({navigator:{userAgent:iphone, bluetooth:{requestDevice(){}}}, isSecureContext:false}), 'insecure');
});
