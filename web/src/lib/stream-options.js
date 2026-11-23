const KEY = 'allmiibo.stream.options.v1';
export const STREAM_OPTION_DEFAULTS = Object.freeze({
  fit: 'fit', rotation: 0, dither: 'threshold', threshold: 128,
  invert: false, fps: 5, loopVideo: true,
});
const sessionOptions = new WeakMap();
let restrictedOptions = {...STREAM_OPTION_DEFAULTS};
const objectStorage = storage => storage !== null && (typeof storage === 'object' || typeof storage === 'function');
const remembered = storage => ({...(objectStorage(storage) ? sessionOptions.get(storage) : restrictedOptions) || STREAM_OPTION_DEFAULTS});
function remember(value, storage) {
  if (objectStorage(storage)) sessionOptions.set(storage, value);
  else restrictedOptions = value;
}

function storageOrNull() {
  try { return globalThis.localStorage; } catch { return null; }
}

export function normalizeStreamOptions(value) {
  const out = {...STREAM_OPTION_DEFAULTS};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  if (['fit', 'crop', 'stretch'].includes(value.fit)) out.fit = value.fit;
  if ([0, 90, 180, 270].includes(value.rotation)) out.rotation = value.rotation;
  if (['threshold', 'bayer'].includes(value.dither)) out.dither = value.dither;
  if (Number.isInteger(value.threshold) && value.threshold >= 0 && value.threshold <= 255) out.threshold = value.threshold;
  if (typeof value.invert === 'boolean') out.invert = value.invert;
  if ([1, 2, 5, 10, 15].includes(value.fps)) out.fps = value.fps;
  if (typeof value.loopVideo === 'boolean') out.loopVideo = value.loopVideo;
  return out;
}

export function readStreamOptions(storage = storageOrNull()) {
  try {
    const raw = storage?.getItem(KEY);
    if (typeof raw !== 'string' || raw.length > 2048) return remembered(storage);
    const value = JSON.parse(raw);
    const options = value?.schema === 1 ? normalizeStreamOptions(value.options) : remembered(storage);
    remember(options, storage);
    return options;
  } catch { return remembered(storage); }
}

export function saveStreamOptions(value, storage = storageOrNull()) {
  const options = normalizeStreamOptions(value);
  remember(options, storage);
  try {
    if (!storage?.setItem) return false;
    storage.setItem(KEY, JSON.stringify({schema: 1, options}));
    return true;
  } catch { return false; }
}

export function resetStreamOptions(storage = storageOrNull()) {
  remember({...STREAM_OPTION_DEFAULTS}, storage);
  try { storage?.removeItem(KEY); } catch { /* Private/restricted storage is optional. */ }
  return {...STREAM_OPTION_DEFAULTS};
}
