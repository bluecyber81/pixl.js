// Local progress estimates only: no timers, transport calls or keepalive traffic.
// The UI must call snapshot() on its own render clock to age an idle estimate.
// `done` and `total` must describe the same counter (file or aggregate backup).
// A path/phase change starts a fresh rate sample even for an aggregate counter;
// ETA always estimates the remaining bytes of that supplied total, not other
// verification/close/archive phases. It is not a device throughput benchmark.
export function createTransferMeter({
  now = () => performance.now(), minSampleMs = 500, staleAfterMs = 3000,
} = {}) {
  if (typeof now !== 'function') throw new TypeError('now must be a function')
  if (!Number.isFinite(minSampleMs) || minSampleMs < 1 ||
      !Number.isFinite(staleAfterMs) || staleAfterMs < minSampleMs) {
    throw new RangeError('Invalid measurement intervals')
  }

  let phase = '', path = '', done = 0, total = null, complete = false, active = false
  let lastClock = null, lastGrowthAt = 0, anchorAt = 0, anchorBytes = 0
  let measuredAt = null, measuredBytes = 0

  function restartMeasurement(time) {
    anchorAt = time; anchorBytes = done
    measuredAt = null; measuredBytes = done
  }

  function timeNow() {
    const time = now()
    if (!Number.isFinite(time) || time < 0) throw new RangeError('Invalid monotonic clock value')
    // An injected clock must be monotonic. A backward step invalidates the
    // estimate instead of creating a negative interval or a throughput spike.
    if (lastClock !== null && time < lastClock) {
      restartMeasurement(lastClock)
      return lastClock
    }
    lastClock = time
    return time
  }

  function stale(time) { return active && !complete && time - lastGrowthAt >= staleAfterMs }

  function result(time) {
    const stalled = stale(time)
    if (stalled) restartMeasurement(time)
    let bytesPerSecond = null, etaSeconds = null, percent = null
    if (!complete && !stalled && measuredAt !== null && time - measuredAt >= minSampleMs) {
      // Include the quiet time since the last sample: a paused estimate decays
      // immediately and disappears entirely at the stale threshold.
      const rate = (done - measuredBytes) * 1000 / (time - measuredAt)
      if (Number.isFinite(rate) && rate > 0) bytesPerSecond = rate
    }
    if (total !== null && done <= total) {
      percent = complete ? 100 : total === 0 ? 0 : Math.min(99, done / total * 100)
      if (complete) etaSeconds = 0
      else if (bytesPerSecond !== null && done < total) {
        const seconds = (total - done) / bytesPerSecond
        if (Number.isFinite(seconds) && seconds >= 0) etaSeconds = seconds
      }
    }
    return { phase, path, done, total, bytesPerSecond, etaSeconds, percent, complete, stalled }
  }

  function update({ phase: nextPhase = '', path: nextPath = '', done: nextDone,
    total: nextTotal = null, complete: nextComplete = false }) {
    if (typeof nextPhase !== 'string' || typeof nextPath !== 'string' || typeof nextComplete !== 'boolean') {
      throw new TypeError('Invalid progress identity or completion flag')
    }
    if (!Number.isSafeInteger(nextDone) || nextDone < 0 ||
        (nextTotal !== null && (!Number.isSafeInteger(nextTotal) || nextTotal < 0))) {
      throw new RangeError('Progress counters must be non-negative safe integers')
    }
    const time = timeNow()
    const changed = !active || nextPhase !== phase || nextPath !== path ||
      nextDone < done || nextTotal !== total || (complete && !nextComplete)
    const wasStale = stale(time)
    const grew = nextDone > done
    phase = nextPhase; path = nextPath; total = nextTotal; done = nextDone
    // Reaching the byte count alone does not prove CLOSE, validation or other
    // completion work succeeded. Unknown/overrun totals never produce 100%.
    complete = nextComplete && total !== null && done === total
    active = true
    if (changed || grew) lastGrowthAt = time
    if (changed || wasStale) restartMeasurement(time)
    else if (grew && time - anchorAt >= minSampleMs) {
      measuredAt = anchorAt; measuredBytes = anchorBytes
      anchorAt = time; anchorBytes = done
    }
    return result(time)
  }

  function snapshot() { return result(timeNow()) }

  function reset() {
    phase = ''; path = ''; done = 0; total = null; complete = false; active = false
    lastClock = null; lastGrowthAt = 0; restartMeasurement(0)
    return { phase, path, done, total, bytesPerSecond: null, etaSeconds: null,
      percent: null, complete, stalled: false }
  }

  return { update, snapshot, reset }
}
