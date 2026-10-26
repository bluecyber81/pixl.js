import test from 'node:test'
import assert from 'node:assert/strict'
import { createTransferMeter } from '../src/lib/transfer-meter.js'

function clock(options = {}) {
  let time = 0
  const meter = createTransferMeter({ now: () => time, ...options })
  const sample = (done, extra = {}) => meter.update({ phase: 'download', path: 'E:/file.bin', done, total: 2000, ...extra })
  return { meter, sample, at(value) { time = value } }
}

function noEstimate(value) {
  assert.equal(value.bytesPerSecond, null)
  assert.equal(value.etaSeconds, null)
}

test('empty/reset state has no estimate and reset does not call the clock', () => {
  let calls = 0
  const meter = createTransferMeter({ now: () => { calls++; return 0 } })
  const expected = { phase: '', path: '', done: 0, total: null, bytesPerSecond: null,
    etaSeconds: null, percent: null, complete: false, stalled: false }
  assert.deepEqual(meter.reset(), expected); assert.equal(calls, 0)
  assert.deepEqual(meter.snapshot(), expected)
})

test('initial progress and samples below the minimum do not invent a rate', () => {
  const f = clock()
  noEstimate(f.sample(200))
  f.at(100); noEstimate(f.sample(300))
  f.at(499); noEstimate(f.sample(499))
  f.at(500)
  const value = f.sample(700)
  assert.equal(value.bytesPerSecond, 1000); assert.equal(value.etaSeconds, 1.3)
  assert.equal(value.percent, 35); assert.equal(value.complete, false)
})

test('rate follows the recent interval and uses cumulative counters', () => {
  const f = clock()
  f.sample(0); f.at(500); assert.equal(f.sample(500).bytesPerSecond, 1000)
  f.at(1000); assert.equal(f.sample(1500).bytesPerSecond, 2000)
  f.at(1250); assert.equal(f.sample(1750).bytesPerSecond, 1250 / 0.75)
})

test('same timestamp and zero byte deltas cannot divide by zero', () => {
  const f = clock()
  f.sample(0); noEstimate(f.sample(100)); noEstimate(f.sample(100))
  f.at(500); assert.equal(f.sample(500).bytesPerSecond, 1000)
  assert.equal(f.sample(500).bytesPerSecond, 1000)
  assert.equal(f.sample(600).bytesPerSecond, 1200)
})

test('quiet estimates decay and expire without further progress callbacks', () => {
  const f = clock()
  f.sample(0); f.at(500); f.sample(500)
  f.at(1000); assert.equal(f.meter.snapshot().bytesPerSecond, 500)
  f.at(3499); assert.equal(f.meter.snapshot().stalled, false)
  f.at(3500)
  const value = f.meter.snapshot()
  noEstimate(value); assert.equal(value.stalled, true)
  f.at(9000); noEstimate(f.meter.snapshot())
})

test('duplicate callbacks do not refresh the time of the last byte', () => {
  const f = clock()
  f.sample(0); f.at(500); f.sample(500)
  f.at(3000); assert.equal(f.sample(500).stalled, false)
  f.at(3500); const value = f.sample(500)
  noEstimate(value); assert.equal(value.stalled, true)
})

test('resume after a long pause starts a fresh measurement, with or without snapshots', () => {
  for (const poll of [false, true]) {
    const f = clock()
    f.sample(0); f.at(500); f.sample(500)
    f.at(5000); if (poll) f.meter.snapshot()
    noEstimate(f.sample(700))
    f.at(5500); const value = f.sample(900)
    assert.equal(value.bytesPerSecond, 400); assert.equal(value.stalled, false)
  }
})

test('counter decrease resets the estimator without a negative rate', () => {
  const f = clock()
  f.sample(0); f.at(500); f.sample(500)
  f.at(1000); noEstimate(f.sample(10))
  f.at(1500); assert.equal(f.sample(110).bytesPerSecond, 200)
})

test('file and phase changes reset the estimator even if counters increase', () => {
  for (const extra of [{ path: 'E:/other.bin' }, { phase: 'verifying' }]) {
    const f = clock()
    f.sample(0); f.at(500); f.sample(500)
    f.at(1000); noEstimate(f.sample(700, extra))
    f.at(1500); assert.equal(f.sample(800, extra).bytesPerSecond, 200)
  }
})

test('total changes reset the rate; null is unknown, not a zero-byte file', () => {
  const f = clock()
  f.sample(0); f.at(500); f.sample(500)
  f.at(1000); noEstimate(f.sample(600, { total: null }))
  f.at(1500); const value = f.sample(700, { total: null })
  assert.equal(value.bytesPerSecond, 200); assert.equal(value.percent, null); assert.equal(value.etaSeconds, null)
  f.at(2000); noEstimate(f.sample(800, { total: 2000 }))
})

test('known empty file stays at zero until explicit successful completion', () => {
  const f = clock()
  const active = f.sample(0, { total: 0 })
  assert.equal(active.percent, 0); assert.equal(active.complete, false); noEstimate(active)
  const complete = f.sample(0, { total: 0, complete: true })
  assert.equal(complete.percent, 100); assert.equal(complete.complete, true)
  assert.equal(complete.etaSeconds, 0); assert.equal(complete.bytesPerSecond, null)
})

test('100 percent requires explicit completion and exact known counters', () => {
  const f = clock()
  f.sample(0); f.at(1000)
  const waiting = f.sample(2000)
  assert.equal(waiting.percent, 99); assert.equal(waiting.complete, false); assert.equal(waiting.etaSeconds, null)
  const complete = f.sample(2000, { complete: true })
  assert.equal(complete.percent, 100); assert.equal(complete.complete, true)
  assert.equal(complete.etaSeconds, 0); assert.equal(complete.bytesPerSecond, null)
  f.at(10000); assert.equal(f.meter.snapshot().stalled, false)
})

test('near-complete active transfers cannot round to a false 100', () => {
  const f = clock()
  assert.equal(f.sample(999999, { total: 1000000 }).percent, 99)
})

test('overrun, unknown or incomplete totals never accept a completion flag', () => {
  for (const extra of [{ total: null }, { total: 0 }, { total: 9 }, { total: 11 }]) {
    const f = clock()
    const value = f.sample(10, { ...extra, complete: true })
    assert.equal(value.complete, false)
    assert.notEqual(value.percent, 100)
    assert.equal(value.etaSeconds, null)
    if (extra.total === null || extra.total < 10) assert.equal(value.percent, null)
  }
})

test('restart of a completed transfer needs a new sampling interval', () => {
  const f = clock()
  f.sample(2000, { complete: true }); f.at(500)
  noEstimate(f.sample(2000))
  assert.equal(f.meter.snapshot().complete, false)
})

test('backward clock invalidates the rate until a fresh monotonic interval', () => {
  const f = clock()
  f.sample(0); f.at(500); f.sample(500)
  f.at(200); noEstimate(f.sample(600))
  f.at(300); noEstimate(f.meter.snapshot())
  f.at(500); noEstimate(f.sample(700))
  f.at(1000); const value = f.sample(800)
  assert.equal(value.bytesPerSecond, 400)
  assert.ok(value.etaSeconds >= 0)
})

test('fractional monotonic timestamps work; clock zero is a valid start', () => {
  const f = clock({ minSampleMs: 1, staleAfterMs: 10 })
  f.sample(0); f.at(0.5); noEstimate(f.sample(1))
  f.at(1.5); assert.equal(f.sample(3).bytesPerSecond, 2000)
})

test('reset drops identities, completion and stale history', () => {
  const f = clock()
  f.sample(0); f.at(500); f.sample(500); f.at(4000); f.meter.snapshot()
  f.meter.reset(); f.at(0); noEstimate(f.sample(0))
  f.at(500); assert.equal(f.sample(10).bytesPerSecond, 20)
})

test('returned snapshots cannot mutate internal state', () => {
  const f = clock()
  const value = f.sample(20); value.done = 999; value.total = 999; value.path = 'changed'
  assert.equal(f.meter.snapshot().done, 20)
  assert.equal(f.meter.snapshot().path, 'E:/file.bin')
})

test('invalid counters are rejected without poisoning a previous measurement', () => {
  const f = clock()
  f.sample(0); f.at(500); f.sample(500)
  for (const invalid of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '10', undefined]) {
    assert.throws(() => f.sample(invalid), RangeError)
    if (invalid !== undefined) assert.throws(() => f.sample(500, { total: invalid }), RangeError)
  }
  assert.equal(f.meter.snapshot().done, 500)
  assert.equal(f.meter.snapshot().bytesPerSecond, 1000)
})

test('invalid identity or completion cannot silently start a new measurement', () => {
  const f = clock()
  for (const extra of [{ phase: null }, { path: {} }, { complete: 1 }]) {
    assert.throws(() => f.sample(0, extra), TypeError)
  }
})

test('configuration and invalid clock values fail explicitly', () => {
  assert.throws(() => createTransferMeter({ now: 1 }), TypeError)
  for (const extra of [{ minSampleMs: 0 }, { minSampleMs: NaN }, { staleAfterMs: 499 }, { staleAfterMs: Infinity }]) {
    assert.throws(() => createTransferMeter(extra), RangeError)
  }
  for (const value of [-1, NaN, Infinity, '0']) {
    const meter = createTransferMeter({ now: () => value })
    assert.throws(() => meter.update({ done: 0 }), RangeError)
    assert.throws(() => meter.snapshot(), RangeError)
  }
})

test('large safe counters and long pauses never return Infinity or negatives', () => {
  const f = clock({ minSampleMs: 1 })
  f.sample(0, { total: Number.MAX_SAFE_INTEGER })
  f.at(1); const result = f.sample(Number.MAX_SAFE_INTEGER - 1, { total: Number.MAX_SAFE_INTEGER })
  for (const key of ['bytesPerSecond', 'etaSeconds', 'percent']) {
    assert.equal(Number.isFinite(result[key]), true); assert.ok(result[key] >= 0)
  }
  f.at(1e12); noEstimate(f.meter.snapshot())
})
