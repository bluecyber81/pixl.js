// Display filtering never changes the device's file identities.
export function filterRows(rows, query = '', type = 'all') {
  const fold = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase();
  const needle = fold(query.trim());
  return rows.filter(row => (type === 'all' || row.type === type || row.type === 'DRIVE') &&
    (!needle || fold(row.name).includes(needle) || fold(row.notes).includes(needle)));
}

export function joinDevicePath(directory, name) {
  if (typeof directory !== 'string' || !/^[IE]:\//.test(directory) ||
      typeof name !== 'string' || !name || name === '.' || name === '..' || /[\/\\\x00-\x1f\x7f]/.test(name)) {
    throw new Error('Invalid file name or device path');
  }
  // TextEncoder replaces lone UTF-16 surrogates. Reject them rather than
  // silently sending a different name to the device.
  if ([...directory, ...name].some(char => char.length === 1 && char.charCodeAt(0) >= 0xd800 && char.charCodeAt(0) <= 0xdfff)) {
    throw new Error('Invalid Unicode in file name or device path');
  }
  const path = directory.replace(/\/$/, '') + '/' + name;
  if (new TextEncoder().encode(name).length > 47 || new TextEncoder().encode(path.slice(2)).length > 63) {
    throw new Error('File name or device path exceeds the device limit');
  }
  return path;
}

export async function sha256(data) {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 requires a secure browser context');
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export function saveBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.style.display = 'none';
    document.body.appendChild(link);
    try { link.click(); } finally { link.remove(); }
  } finally { setTimeout(() => window.URL.revokeObjectURL(url), 30000); }
}

// Call directly from the user gesture: no asynchronous work may precede the
// picker. Only cancelling that picker is a user cancellation. A later write or
// close failure must remain visible, even when the browser calls it AbortError.
export async function saveBlobWithPicker(blob, filename, options = {}) {
  if (typeof globalThis.showSaveFilePicker !== 'function') return { status: 'unsupported' };
  let handle;
  try {
    handle = await globalThis.showSaveFilePicker({ suggestedName: filename,
      ...(options.types === undefined ? {} : { types: options.types }) });
  } catch (error) {
    if (error?.name === 'AbortError') return { status: 'cancelled' };
    throw error;
  }
  let writable;
  try {
    writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { status: 'saved' };
  } catch (error) {
    // Best-effort rollback must never replace the actual write/close error.
    try { await writable?.abort(); } catch { /* preserve the original failure */ }
    throw error;
  }
}
