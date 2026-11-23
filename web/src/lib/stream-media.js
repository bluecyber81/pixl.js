export const STREAM_WIDTH = 128;
export const STREAM_HEIGHT = 64;

function mediaError(code) { return Object.assign(new Error(code), {code}); }

export function sourceKind(file) {
  const type = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '').toLowerCase();
  const generic = !type || type === 'application/octet-stream' || type === 'binary/octet-stream';
  if (type.startsWith('image/svg+xml') || /\.svgz?$/.test(name)) throw mediaError('MEDIA_TYPE');
  if (type.startsWith('image/') || (generic && /\.(png|jpe?g|webp|bmp|gif|avif)$/.test(name))) return 'image';
  if (type.startsWith('video/') || (generic && /\.(mp4|webm|mov|m4v|ogv|ogg)$/.test(name))) return 'video';
  throw mediaError('MEDIA_TYPE');
}

export function sourceRectangle(width, height, mode = 'fit') {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width * height > 40000000) throw mediaError('MEDIA_DIMENSIONS');
  if (!['fit', 'crop', 'stretch'].includes(mode)) throw mediaError('MEDIA_DIMENSIONS');
  let sx = 0, sy = 0, sw = width, sh = height, dx = 0, dy = 0, dw = 128, dh = 64;
  if (mode === 'fit') {
    const scale = Math.min(128 / width, 64 / height);
    dw = width * scale; dh = height * scale; dx = (128 - dw) / 2; dy = (64 - dh) / 2;
  } else if (mode === 'crop') {
    if (width / height > 2) { sw = height * 2; sx = (width - sw) / 2; }
    else { sh = width / 2; sy = (height - sh) / 2; }
  }
  return {sx, sy, sw, sh, dx, dy, dw, dh};
}

export function rotatedSourceRectangle(width, height, mode = 'fit', rotation = 0) {
  if (![0, 90, 180, 270].includes(rotation)) throw mediaError('MEDIA_ROTATION');
  const sideways = rotation === 90 || rotation === 270;
  const rectangle = sourceRectangle(sideways ? height : width, sideways ? width : height, mode);
  const {sx, sy, sw, sh} = rectangle;
  let original;
  if (rotation === 90) original = {sx: sy, sy: height - sx - sw, sw: sh, sh: sw};
  else if (rotation === 180) original = {sx: width - sx - sw, sy: height - sy - sh, sw, sh};
  else if (rotation === 270) original = {sx: width - sy - sh, sy: sx, sw: sh, sh: sw};
  else original = {sx, sy, sw, sh};
  return {rectangle, original, sideways};
}

export function drawMediaFrame(context, source, mode = 'fit', rotation = 0) {
  const width = source.videoWidth || source.naturalWidth || source.width;
  const height = source.videoHeight || source.naturalHeight || source.height;
  const {rectangle: r, original: o, sideways} = rotatedSourceRectangle(width, height, mode, rotation);
  context.fillStyle = '#000';
  context.fillRect(0, 0, 128, 64);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  if (rotation === 0) context.drawImage(source, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh);
  else {
    context.save();
    try {
      context.translate(r.dx + r.dw / 2, r.dy + r.dh / 2);
      context.rotate(rotation * Math.PI / 180);
      const dw = sideways ? r.dh : r.dw, dh = sideways ? r.dw : r.dh;
      context.drawImage(source, o.sx, o.sy, o.sw, o.sh, -dw / 2, -dh / 2, dw, dh);
    } finally { context.restore(); }
  }
  return context.getImageData(0, 0, 128, 64).data;
}

export function demoRgba(frameIndex = 0) {
  const pixels = new Uint8ClampedArray(128 * 64 * 4);
  const cx = 64 + Math.trunc(38 * Math.sin(frameIndex * 0.12));
  const cy = 32 + Math.trunc(16 * Math.cos(frameIndex * 0.17));
  for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
    const circle = (x - cx) ** 2 + (y - cy) ** 2 <= 256;
    const wave = y > 32 + Math.trunc(12 * Math.sin((x + frameIndex * 4) * 0.08));
    const value = circle !== wave ? 255 : 0;
    const offset = (y * 128 + x) * 4;
    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = value;
    pixels[offset + 3] = 255;
  }
  return pixels;
}

// A file URL is owned by one selection, including selections cancelled while decoding.
export function loadLocalMedia(file, {video, urlApi = globalThis.URL, ImageClass = globalThis.Image, schedule = setTimeout, cancel = clearTimeout} = {}) {
  const kind = sourceKind(file);
  const source = kind === 'video' ? video : new ImageClass();
  if (!source) throw mediaError('MEDIA_UNSUPPORTED');
  const url = urlApi.createObjectURL(file);
  let disposed = false, settled = false, resolve, reject;
  const ready = new Promise((a, b) => {resolve = a; reject = b;});
  const event = kind === 'video' ? 'loadeddata' : 'load';
  let timer;
  const cleanListeners = () => {source.removeEventListener(event, loaded); source.removeEventListener('error', failed); if (timer !== undefined) cancel(timer);};
  const fail = code => {if (settled) return; settled = true; cleanListeners(); reject(mediaError(code));};
  const failed = () => fail('MEDIA_DECODE');
  const loaded = () => {
    if (settled || disposed) return;
    try {sourceRectangle(source.videoWidth || source.naturalWidth, source.videoHeight || source.naturalHeight);}
    catch (error) {fail(error.code); return;}
    settled = true; cleanListeners(); resolve({kind, source});
  };
  source.addEventListener(event, loaded);
  source.addEventListener('error', failed);
  timer = schedule(() => fail('MEDIA_TIMEOUT'), 30000);
  try {
    if (kind === 'video') {source.muted = true; source.playsInline = true; source.preload = 'auto';}
    else source.decoding = 'async';
    source.src = url;
    if (kind === 'video') source.load();
  } catch (_) {fail('MEDIA_DECODE');}
  return {
    kind, source, ready,
    dispose() {
      if (disposed) return;
      disposed = true; fail('MEDIA_CANCELLED'); cleanListeners();
      if (kind === 'video') source.pause();
      source.removeAttribute('src');
      if (kind === 'video') source.load();
      urlApi.revokeObjectURL(url);
    }
  };
}

// One capture follows one completed send. Slow BLE drops time, never queues video frames.
export function createFramePump({capture, send, onFrame = () => {}, onError = () => {}, now = () => performance.now(), schedule = setTimeout, cancel = clearTimeout}) {
  let generation = 0, running = false, timer, wake;
  const stop = () => {
    running = false; generation++;
    if (timer !== undefined) {cancel(timer); timer = undefined;}
    if (wake) {const done = wake; wake = undefined; done();}
  };
  return {
    get running() {return running;}, stop,
    start({fps = 5} = {}) {
      if (running) return false;
      if (!Number.isFinite(fps) || fps < 1 || fps > 15) throw mediaError('MEDIA_FPS');
      running = true; const run = ++generation;
      void (async () => {
        try {
          while (running && run === generation) {
            const began = now();
            const frame = capture();
            if (!running || run !== generation) break;
            const receipt = await send(frame);
            if (!running || run !== generation) break;
            onFrame(receipt);
            if (!running || run !== generation) break;
            const delay = Math.max(0, 1000 / fps - (now() - began));
            await new Promise(resolve => {wake = resolve; timer = schedule(() => {timer = undefined; wake = undefined; resolve();}, delay);});
          }
        } catch (error) {
          if (running && run === generation) {stop(); onError(error);}
        }
      })();
      return true;
    }
  };
}
