// One File reference per tab, never serialized, uploaded, or retained with its
// decoder/canvas. The component owns and releases its temporary media URLs.
export const STREAM_SESSION_MAX_FILE_BYTES = 128 * 1024 * 1024;
export const STREAM_SESSION_TTL_MS = 30 * 60 * 1000;

export function createStreamSession({now = Date.now, schedule = setTimeout, cancel = clearTimeout} = {}) {
  let selected = null, timer;
  const clear = () => {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
    selected = null;
  };
  const arm = () => {
    if (timer !== undefined) cancel(timer);
    timer = schedule(clear, STREAM_SESSION_TTL_MS);
    timer?.unref?.();
  };
  const get = () => {
    if (selected && now() - selected.at >= STREAM_SESSION_TTL_MS) clear();
    return selected ? {file: selected.file, clip: {...selected.clip}} : null;
  };
  return {
    clear, get,
    remember(file, clip = {}) {
      clear();
      if (!file || typeof file.name !== 'string' || !Number.isSafeInteger(file.size) ||
          file.size < 0 || file.size > STREAM_SESSION_MAX_FILE_BYTES) return false;
      selected = {file, at: now(), clip: {}};
      this.updateClip(clip);
      arm();
      return true;
    },
    updateClip(clip) {
      if (!get()) return;
      for (const key of ['start', 'end']) {
        if (Number.isFinite(clip?.[key]) && clip[key] >= 0) selected.clip[key] = clip[key];
      }
    },
  };
}

export const streamSession = createStreamSession();
