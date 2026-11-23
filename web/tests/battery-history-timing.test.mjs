import test from 'node:test';
import assert from 'node:assert/strict';
import { batteryHistoryTiming } from '../src/lib/battery-history.js';

// Synthetic logger-state traces only. No user recording or device identity.
const reading = (at, id = 1) => ({ at, id, mv: 4100, charging: false });
const marker = (at, reason, pauseReason = 'busy', id = 1) =>
  ({ at, id, mv: null, charging: null, reason, pauseReason });

const durations = result => ({
  elapsed: result.elapsedMilliseconds,
  active: result.activeMilliseconds,
  paused: result.pausedMilliseconds,
});
function assertKnown(result, expected) {
  assert.deepEqual(durations(result), expected);
  assert.equal(result.activeMilliseconds + result.pausedMilliseconds, result.elapsedMilliseconds);
  assert.equal(result.clockAdjusted, false);
  assert.equal(result.invalidEntries, false);
}
function assertUnknown(result) {
  assert.deepEqual(durations(result), { elapsed: null, active: null, paused: null });
}

test('empty recording has no observed interval; a single reading has a zero observed interval', () => {
  assert.deepEqual(batteryHistoryTiming([]), {
    firstAt: null, lastAt: null, elapsedMilliseconds: null,
    activeMilliseconds: null, pausedMilliseconds: null,
    clockAdjusted: false, truncated: false, invalidEntries: false,
  });
  const result = batteryHistoryTiming([reading(2000)]);
  assert.equal(result.firstAt, 2000);
  assert.equal(result.lastAt, 2000);
  assert.equal(result.truncated, false);
  assertKnown(result, { elapsed: 0, active: 0, paused: 0 });
});

test('uninterrupted readings measure elapsed logger time, independent of their voltage values', () => {
  const rows = [reading(1000, 1), reading(11500, 2), reading(22000, 3)];
  rows[1].mv = 3999;
  rows[2].mv = 4201;
  const result = batteryHistoryTiming(rows);
  assert.equal(result.firstAt, 1000);
  assert.equal(result.lastAt, 22000);
  assertKnown(result, { elapsed: 21000, active: 21000, paused: 0 });
});

test('busy to hidden changes keep one paused interval and same-time resume/reading adds no time', () => {
  const rows = [reading(0, 1), marker(4000, 'pause', 'busy', 2),
    marker(6500, 'pause', 'hidden', 3), marker(11000, 'resume', 'hidden', 4),
    reading(11000, 5), reading(21000, 6), marker(25000, 'pause', 'manual', 7)];
  assertKnown(batteryHistoryTiming(rows), { elapsed: 25000, active: 18000, paused: 7000 });
});

test('terminal manual stop closes the observed window without extrapolating the later pause', t => {
  t.mock.method(Date, 'now', () => { throw new Error('Recorded durations must not read the current clock'); });
  const result = batteryHistoryTiming([reading(0, 1), reading(10000, 2), marker(14000, 'pause', 'manual', 3)]);
  assert.equal(result.lastAt, 14000);
  assertKnown(result, { elapsed: 14000, active: 14000, paused: 0 });
});

test('completed manual pause and later restart contribute time only inside recorded markers', () => {
  const result = batteryHistoryTiming([reading(0, 1), marker(5000, 'pause', 'manual', 2),
    marker(17000, 'resume', 'manual', 3), reading(17000, 4), reading(20000, 5)]);
  assertKnown(result, { elapsed: 20000, active: 8000, paused: 12000 });
});

test('an invalid voltage reading is an active query outcome, not a fabricated pause', () => {
  const result = batteryHistoryTiming([reading(0, 1), marker(3000, 'invalid', undefined, 2),
    reading(7000, 3), marker(9000, 'pause', 'hidden', 4), marker(12000, 'resume', 'hidden', 5)]);
  assertKnown(result, { elapsed: 12000, active: 9000, paused: 3000 });
});

test('truncated history begins in pause state without inventing an earlier session start', () => {
  const result = batteryHistoryTiming([marker(100000, 'pause', 'hidden', 41),
    marker(105000, 'resume', 'hidden', 42), reading(105000, 43), reading(109000, 44)]);
  assert.equal(result.truncated, true);
  assert.equal(result.firstAt, 100000);
  assert.equal(result.lastAt, 109000);
  assertKnown(result, { elapsed: 9000, active: 4000, paused: 5000 });
});

test('a rolling 120-entry reading window measures only its retained time range', () => {
  const rows = Array.from({ length: 120 }, (_, index) => reading(900000 + index * 10000, index + 31));
  const result = batteryHistoryTiming(rows);
  assert.equal(result.truncated, true);
  assert.equal(result.firstAt, 900000);
  assert.equal(result.lastAt, 2090000);
  assertKnown(result, { elapsed: 1190000, active: 1190000, paused: 0 });
});

test('a retained resume or invalid observation starts an active visible interval', () => {
  for (const reason of ['resume', 'invalid']) {
    const result = batteryHistoryTiming([marker(5000, reason, 'busy', 10), reading(11000, 11)]);
    assert.equal(result.truncated, true);
    assertKnown(result, { elapsed: 6000, active: 6000, paused: 0 });
  }
});

test('backwards browser clock makes duration unavailable instead of negative or apparently healthy zero', () => {
  const result = batteryHistoryTiming([reading(10000, 1), marker(9000, 'pause', 'busy', 2),
    marker(12000, 'resume', 'busy', 3), reading(13000, 4)]);
  assert.equal(result.clockAdjusted, true);
  assertUnknown(result);
});

test('invalid timestamps invalidate the timing result rather than silently bridging bad entries', () => {
  for (const at of [NaN, Infinity, -Infinity, 1000.5, Number.MAX_SAFE_INTEGER + 1, 8640000000000001, '1000', null]) {
    const result = batteryHistoryTiming([reading(0, 1), { ...reading(1000, 2), at }, reading(2000, 3)]);
    assert.equal(result.invalidEntries, true, String(at));
    assertUnknown(result);
  }
});

test('unknown or malformed state entries do not turn missing state into active or paused time', () => {
  for (const invalid of [null, {}, marker(1000, 'unexpected'), { at: 1000, id: 2, mv: null }]) {
    const result = batteryHistoryTiming([reading(0, 1), invalid, reading(2000, 3)]);
    assert.equal(result.invalidEntries, true);
    assertUnknown(result);
  }
});

test('timing leaves supplied records intact', () => {
  const rows = [reading(0, 1), marker(3000, 'pause', 'busy', 2),
    marker(7000, 'resume', 'busy', 3), reading(9000, 4)];
  const original = structuredClone(rows);
  for (const row of rows) Object.freeze(row);
  Object.freeze(rows);
  assertKnown(batteryHistoryTiming(rows), { elapsed: 9000, active: 5000, paused: 4000 });
  assert.deepEqual(rows, original);
});
