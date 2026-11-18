// One optional capture after an acknowledged navigation action; never polls.
export function createAutoDisplayPhoto({capture, canCapture, now = () => performance.now(),
  schedule = setTimeout, unschedule = clearTimeout, settleMs = 200, intervalMs = 1000}) {
  let timer = null, pending = false, running = false, disposed = false;
  let settledAt = 0, lastStarted = -Infinity;
  function clearTimer() {
    if (timer !== null) { unschedule(timer); timer = null; }
  }
  function arm() {
    clearTimer();
    if (disposed || !pending || running) return;
    timer = schedule(async () => {
      timer = null;
      if (disposed || !pending) return;
      pending = false;
      if (!canCapture()) return;
      running = true;
      lastStarted = now();
      try { await capture(); }
      catch { /* The photo view owns feedback. Do not retry a failed capture. */ }
      finally { running = false; arm(); }
    }, Math.max(0, settledAt - now(), lastStarted + intervalMs - now()));
  }
  return Object.freeze({
    request() {
      if (disposed || !canCapture()) return;
      pending = true;
      settledAt = now() + settleMs;
      arm();
    },
    cancel() { pending = false; clearTimer(); },
    dispose() { disposed = true; pending = false; clearTimer(); }
  });
}
