// Caller uses one monotonic clock and resets the sample when the phase changes.
// Unlike byte throughput, a completed read includes the BLE request overhead.
export function readTimeEstimate({ startedAt, updatedAt, completed, total }, now) {
  const elapsedMs = Math.max(0, now - startedAt);
  const sampleMs = updatedAt - startedAt;
  const averageMs = completed > 0 ? sampleMs / completed : 0;
  const idleMs = Math.max(0, now - updatedAt);
  const result = {
    elapsedSeconds: Math.floor(elapsedMs / 1000),
    remainingSeconds: null,
    waiting: idleMs >= Math.max(8000, 3 * averageMs),
  };
  if (result.waiting || total == null || completed < 2 || completed >= total || averageMs <= 0) return result;
  const remainingMs = (total - completed) * averageMs - idleMs;
  if (remainingMs > 0) result.remainingSeconds = Math.ceil(remainingMs / 1000);
  else result.waiting = true;
  return result;
}

export function formatReadDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const tail = String(seconds % 60).padStart(2, '0');
  if (minutes < 60) return `${minutes}:${tail}`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${tail}`;
}
