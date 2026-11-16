import test from 'node:test';
import assert from 'node:assert/strict';
import { batteryHistoryCsv } from '../src/lib/battery-history.js';

test('battery CSV retains the first four columns and adds an explicit optional pause reason', () => {
  const rows = [
    { at: 0, mv: 4200, charging: false },
    { at: 1000, mv: null, charging: null, reason: 'pause', pauseReason: 'hidden' },
    { at: 1197, mv: null, charging: null, reason: 'resume', pauseReason: 'hidden' },
    { at: 1197, mv: 4199, charging: false },
    { at: 11197, mv: null, charging: null, reason: 'invalid' },
  ];
  assert.equal(batteryHistoryCsv(rows), [
    'time_utc;battery_mV;charging_active;entry;pause_reason',
    '1970-01-01T00:00:00.000Z;4200;false;reading;',
    '1970-01-01T00:00:01.000Z;;;pause;hidden',
    '1970-01-01T00:00:01.197Z;;;resume;hidden',
    '1970-01-01T00:00:01.197Z;4199;false;reading;',
    '1970-01-01T00:00:11.197Z;;;invalid;',
    '',
  ].join('\r\n'));
});

test('pause reasons use a fixed vocabulary and cannot inject extra CSV columns', () => {
  const reasons = ['hidden', 'busy', 'transport-busy', 'manual', 'unsupported', 'failed', 'view'];
  for (const pauseReason of reasons) {
    const csv = batteryHistoryCsv([{ at: 0, mv: null, reason: 'pause', pauseReason }]);
    assert.equal(csv.split('\r\n')[1].split(';')[4], pauseReason);
  }
  for (const pauseReason of [null, undefined, 0, {}, 'unknown', 'busy;extra', 'hidden\nextra']) {
    const csv = batteryHistoryCsv([{ at: 0, mv: null, reason: 'pause', pauseReason }]);
    const row = csv.split('\r\n')[1].split(';');
    assert.equal(row.length, 5);
    assert.equal(row[4], '');
  }
  for (const reason of ['reading', 'invalid']) {
    const csv = batteryHistoryCsv([{ at: 0, mv: null, reason, pauseReason: 'manual' }]);
    assert.equal(csv.split('\r\n')[1].split(';')[4], '');
  }
});
