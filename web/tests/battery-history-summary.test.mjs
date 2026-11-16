import test from 'node:test';
import assert from 'node:assert/strict';
import { batteryHistorySummary } from '../src/lib/battery-history.js';

test('empty or absent battery history has no invented voltage or elapsed time', () => {
  for (const rows of [[], null, undefined, {}, 'readings']) {
    const summary = batteryHistorySummary(rows);
    assert.equal(summary.count, 0);
    for (const field of ['min', 'max', 'range', 'latest', 'firstAt', 'lastAt', 'elapsedMilliseconds']) {
      assert.equal(summary[field], null, field);
    }
    assert.equal(summary.gapCount, 0);
    assert.equal(summary.clockAdjusted, false);
  }
});

test('summary describes received samples and separates explicit gaps from measured values', () => {
  const rows = [
    { at: 1000, mv: 4200, charging: false },
    { at: 11000, mv: 4197, charging: false },
    { at: 12000, mv: null, charging: null, reason: 'pause' },
    { at: 12197, mv: 4202, charging: false },
    { at: 22197, mv: null, charging: null, reason: 'invalid' },
    { at: 32197, mv: 4199, charging: false },
  ];
  assert.deepEqual(batteryHistorySummary(rows), {
    count: 4, min: 4197, max: 4202, range: 5, latest: 4199,
    firstAt: 1000, lastAt: 32197, elapsedMilliseconds: 31197,
    gapCount: 2, pauseCount: 1, resumeCount: 0, invalidCount: 1, clockAdjusted: false,
  });
});

test('a single valid sample has a zero receipt span and zero voltage range', () => {
  const summary = batteryHistorySummary([{ at: 0, mv: 1 }, { at: 1000, mv: null, reason: 'pause' }]);
  assert.equal(summary.count, 1);
  assert.equal(summary.elapsedMilliseconds, 0);
  assert.equal(summary.range, 0);
  assert.equal(summary.lastAt, 0);
  assert.equal(summary.latest, 1);
  assert.equal(summary.pauseCount, 1);
});

test('malformed rows never become zero volts, NaN statistics or valid samples', () => {
  const rows = [null, undefined, 4, 'reading', {},
    ...[NaN, Infinity, -Infinity, '1000', null, 1.5, 8640000000000001]
      .map(at => ({ at, mv: 4200 })),
    ...[NaN, Infinity, -Infinity, '4200', undefined, -1, 0, 4200.5, 65536]
      .map(mv => ({ at: 500, mv })),
    { at: 2000, mv: 65535 },
  ];
  const summary = batteryHistorySummary(rows);
  assert.equal(summary.count, 1);
  assert.equal(summary.min, 65535);
  assert.equal(summary.max, 65535);
  assert.equal(summary.elapsedMilliseconds, 0);
  assert.equal(summary.gapCount, 0);
  assert.equal(summary.clockAdjusted, false);
});

test('a backwards receipt clock preserves voltages but cannot claim an elapsed duration', () => {
  for (const middle of [{ at: 900, mv: 4101 }, { at: 900, mv: null, reason: 'pause' }]) {
    const summary = batteryHistorySummary([{ at: 1000, mv: 4100 }, middle, { at: 2000, mv: 4099 }]);
    assert.equal(summary.min, 4099);
    assert.equal(summary.latest, 4099);
    assert.equal(summary.clockAdjusted, true);
    assert.equal(summary.elapsedMilliseconds, null);
  }
});

test('duplicate receipt times are valid and malformed rows do not create clock adjustments', () => {
  const summary = batteryHistorySummary([
    { at: 1000, mv: 4100 }, { at: 0, mv: '4000' }, { at: 1000, mv: 4101 },
    { at: 1200, mv: 4100 },
  ]);
  assert.equal(summary.count, 3);
  assert.equal(summary.elapsedMilliseconds, 200);
  assert.equal(summary.clockAdjusted, false);
});

test('summary never changes or retains caller rows and counts missing readings separately', () => {
  const rows = Object.freeze([
    Object.freeze({ at: 1000, mv: null, reason: 'pause' }),
    Object.freeze({ at: 2000, mv: null, reason: 'invalid' }),
    Object.freeze({ at: 3000, mv: null }),
  ]);
  const before = JSON.stringify(rows);
  const summary = batteryHistorySummary(rows);
  assert.equal(summary.count, 0);
  assert.equal(summary.gapCount, 3);
  assert.equal(summary.pauseCount, 1);
  assert.equal(summary.invalidCount, 1);
  assert.equal(summary.elapsedMilliseconds, null);
  assert.equal(JSON.stringify(rows), before);
  assert.ok(Object.values(summary).every(value => value === null || typeof value !== 'object'));
});

test('resume markers are counted separately and cannot double the number of gaps', () => {
  const summary = batteryHistorySummary([
    { at: 1000, mv: 4200 },
    { at: 2000, mv: null, reason: 'pause', pauseReason: 'hidden' },
    { at: 2197, mv: null, reason: 'resume', pauseReason: 'hidden' },
    { at: 2197, mv: 4199 },
  ]);
  assert.equal(summary.count, 2);
  assert.equal(summary.gapCount, 1);
  assert.equal(summary.pauseCount, 1);
  assert.equal(summary.resumeCount, 1);
  assert.equal(summary.invalidCount, 0);
  assert.equal(summary.elapsedMilliseconds, 1197);
});
