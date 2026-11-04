import test from 'node:test';
import assert from 'node:assert/strict';
import { readTimeEstimate, formatReadDuration } from '../src/lib/read-time-estimate.js';

test('discovery and initial read samples report elapsed time without a speculative ETA', () => {
  const first = { startedAt: 500, updatedAt: 2500, completed: 1, total: 9 };
  assert.deepEqual(readTimeEstimate(first, 3500), { elapsedSeconds: 3, remainingSeconds: null, waiting: false });
  assert.equal(readTimeEstimate({ ...first, completed: 4, total: null }, 3500).remainingSeconds, null);
  assert.equal(readTimeEstimate({ ...first, completed: 0, total: null }, 11000).waiting, true);
});

test('the estimate counts down between real completions, updates its rate, and hides stalled or overdue estimates', () => {
  const phase = { startedAt: 1000, updatedAt: 5000, completed: 2, total: 10 };
  assert.equal(readTimeEstimate(phase, 5000).remainingSeconds, 16);
  assert.equal(readTimeEstimate(phase, 6100).remainingSeconds, 15);
  assert.deepEqual(readTimeEstimate(phase, 13000), { elapsedSeconds: 12, remainingSeconds: null, waiting: true });
  assert.equal(readTimeEstimate({ ...phase, updatedAt: 14000, completed: 3 }, 14000).remainingSeconds, 31);
  assert.deepEqual(readTimeEstimate({ ...phase, total: 3 }, 7000), { elapsedSeconds: 6, remainingSeconds: null, waiting: true });
  assert.equal(readTimeEstimate({ ...phase, total: 2 }, 5000).remainingSeconds, null);
});

test('duration formatting is readable for both short reports and large collections', () => {
  assert.deepEqual([0, 59, 60, 599, 3600, 3605].map(formatReadDuration), ['0:00','0:59','1:00','9:59','1:00:00','1:00:05']);
});
