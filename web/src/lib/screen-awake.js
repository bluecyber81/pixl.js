// Screen Wake Lock is best-effort browser assistance, never a transfer gate.
// No BLE calls, timers, storage or background retry loop. A manual screen lock
// and a hidden/frozen page are outside its guarantee.
export function createScreenAwake({ wakeLock = globalThis.navigator?.wakeLock, document = globalThis.document, onChange = () => {} } = {}) {
  let active = false, disposed = false, generation = 0, held = null, pending = null, status = 'idle';
  const available = typeof wakeLock?.request === 'function' && typeof document?.addEventListener === 'function';
  const visible = () => document?.visibilityState === 'visible';
  const snapshot = () => Object.freeze({ active, held: !!held && !held.released, status, available });
  function publish(next) { status = next; if (!disposed) { try { onChange(snapshot()); } catch { /* observer only */ } } }
  function release(sentinel) { try { Promise.resolve(sentinel?.release?.()).catch(() => {}); } catch { /* release is best effort */ } }
  function drop() { const previous = held; held = null; release(previous); }
  async function acquire() {
    if (disposed || !active || pending || held) return;
    if (!available) { publish('unsupported'); return; }
    if (!visible()) { publish('hidden'); return; }
    const token = generation;
    publish('requesting');
    const request = Promise.resolve().then(() => {
      // An operation can finish or unmount before this microtask executes.
      // In that case do not ask the browser for an already obsolete lock.
      if (disposed || !active || token !== generation || !visible()) return null;
      return wakeLock.request('screen');
    });
    pending = request;
    try {
      const sentinel = await request;
      if (disposed || !active || token !== generation || !visible()) { release(sentinel); return; }
      if (typeof sentinel?.release !== 'function' || typeof sentinel?.addEventListener !== 'function' || sentinel.released) {
        release(sentinel); publish('released'); return;
      }
      held = sentinel;
      sentinel.addEventListener('release', () => {
        if (held !== sentinel || disposed) return;
        held = null;
        publish(active ? (visible() ? 'released' : 'hidden') : 'idle');
        // OS policy may release us while visible. Do not fight it in a loop.
      }, { once: true });
      publish('active');
    } catch {
      if (!disposed && active && token === generation) publish(visible() ? 'unavailable' : 'hidden');
    } finally {
      if (pending === request) pending = null;
      // Only a newer operation/visibility event may request another lock.
      if (!disposed && active && token !== generation && visible()) void acquire();
    }
  }
  function visibilityChanged() {
    if (disposed || !active) return;
    ++generation;
    if (!visible()) { drop(); publish('hidden'); }
    else void acquire();
  }
  if (available) document.addEventListener('visibilitychange', visibilityChanged);
  return Object.freeze({
    setActive(value) {
      if (disposed || active === !!value) return;
      active = !!value; ++generation;
      if (active) void acquire();
      else { drop(); publish('idle'); }
    },
    retry() { if (!disposed && active) void acquire(); },
    getState: snapshot,
    dispose() {
      if (disposed) return;
      active = false; disposed = true; ++generation;
      if (available) document.removeEventListener('visibilitychange', visibilityChanged);
      drop(); status = 'idle';
    },
  });
}
