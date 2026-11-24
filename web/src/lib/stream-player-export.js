export const PLAYER_EXPORT_HEADER_BYTES = 16;
export const PLAYER_EXPORT_FRAME_BYTES = 1024;
export const PLAYER_EXPORT_MAX_BYTES = 1024 * 1024;
const fail = code => Object.assign(new Error(code), {code});
const cancelled = signal => { if (signal?.aborted) throw fail('EXPORT_CANCELLED'); };

export function planPlayerExport({kind, start = 0, end = 10, fps = 5, duration} = {}) {
  if (!['image', 'video', 'demo', 'ticker'].includes(kind) || !Number.isInteger(fps) || fps < 1 || fps > 60) throw fail('EXPORT_RANGE');
  let frames = 1;
  if (kind === 'image') { start = 0; end = 1 / fps; }
  else {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) throw fail('EXPORT_RANGE');
    if (kind === 'video' && (!Number.isFinite(duration) || duration <= 0 || start >= duration || end > duration + 1e-6)) throw fail('EXPORT_RANGE');
    frames = Math.ceil((end - start) * fps - 1e-9);
  }
  const bytes = PLAYER_EXPORT_HEADER_BYTES + frames * PLAYER_EXPORT_FRAME_BYTES;
  if (!Number.isSafeInteger(frames) || frames < 1 || frames > 65535 || bytes > PLAYER_EXPORT_MAX_BYTES) throw fail('EXPORT_TOO_LARGE');
  return Object.freeze({kind, start, end, fps, frames, bytes, width: 128, height: 64});
}

export function playerExportName(fileName = 'animation') {
  const stem = String(fileName).replace(/\.[^.]*$/, '').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '').slice(0, 20) || 'animation';
  return stem + '_lcd.bin';
}

// One bounded output buffer, one captured frame at a time. No decoded-frame
// list and no unbounded array of Blob parts; cancellation never returns a file.
export async function createPlayerExport(plan, {capture, signal, onProgress = () => {},
  yieldControl = () => new Promise(resolve => setTimeout(resolve, 0))} = {}) {
  const expected = planPlayerExport({...plan, duration: plan.kind === 'video' ? plan.end : undefined});
  if (expected.frames !== plan.frames || expected.bytes !== plan.bytes || typeof capture !== 'function') throw fail('EXPORT_RANGE');
  cancelled(signal);
  const bytes = new Uint8Array(plan.bytes);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, 0x50495856, true);
  header.setUint16(4, plan.frames, true);
  header.setUint16(6, plan.fps, true);
  header.setUint16(8, 128, true);
  header.setUint16(10, 64, true);
  header.setUint32(12, 0, true);
  for (let index = 0; index < plan.frames; index++) {
    cancelled(signal);
    const frame = await capture(index, plan.start + index / plan.fps);
    cancelled(signal);
    if (!(frame instanceof Uint8Array) || frame.length !== PLAYER_EXPORT_FRAME_BYTES) throw fail('EXPORT_FRAME');
    bytes.set(frame, PLAYER_EXPORT_HEADER_BYTES + index * PLAYER_EXPORT_FRAME_BYTES);
    onProgress({completed: index + 1, frames: plan.frames, bytes: plan.bytes});
    cancelled(signal);
    if ((index + 1) % 8 === 0) { await yieldControl(); cancelled(signal); }
  }
  cancelled(signal);
  return bytes;
}

export function seekVideoFrame(video, seconds, {signal, timeoutMs = 10000, schedule = setTimeout, cancel = clearTimeout} = {}) {
  try { cancelled(signal); } catch (error) { return Promise.reject(error); }
  if (!video || !Number.isFinite(seconds) || seconds < 0) return Promise.reject(fail('EXPORT_RANGE'));
  return new Promise((resolve, reject) => {
    let done = false, timer;
    const finish = error => {
      if (done) return;
      done = true;
      if (timer !== undefined) cancel(timer);
      video.removeEventListener('seeked', ready);
      video.removeEventListener('loadeddata', ready);
      video.removeEventListener('error', failed);
      signal?.removeEventListener('abort', aborted);
      error ? reject(error) : resolve();
    };
    const ready = () => {
      if (!video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - seconds) < 0.025) finish();
    };
    const failed = () => finish(fail('MEDIA_DECODE'));
    const aborted = () => finish(fail('EXPORT_CANCELLED'));
    video.addEventListener('seeked', ready);
    video.addEventListener('loadeddata', ready);
    video.addEventListener('error', failed);
    signal?.addEventListener('abort', aborted, {once: true});
    timer = schedule(() => finish(fail('EXPORT_SEEK_TIMEOUT')), timeoutMs);
    try {
      cancelled(signal);
      if (Math.abs(video.currentTime - seconds) < 1e-6) ready();
      if (!done) video.currentTime = seconds;
    } catch (error) { finish(error?.code ? error : fail('MEDIA_DECODE')); }
  });
}
