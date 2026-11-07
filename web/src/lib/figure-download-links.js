import { figureId } from './figure-info.js';
import { FIGURE_DOWNLOAD_LIMITS, FigureTransferError, figureSourceUrl } from './figure-transfer.js';

export const FIGURE_DOWNLOAD_LINK_CHANGED = 'allmiibo-figure-download-link-changed';

export function figureDownloadLinkKey(id) {
  const canonicalId = figureId(id);
  return canonicalId ? 'allmiibo.figure-download.' + canonicalId : null;
}

function normalizedUrl(value) {
  const url = figureSourceUrl(value).href;
  // Escaping non-ASCII path characters can lengthen the stored address.
  if (url.length > FIGURE_DOWNLOAD_LIMITS.maxUrlLength) {
    throw new FigureTransferError('FIGURE_URL', 'The figure download address is too long.');
  }
  return url;
}

export function readFigureDownloadLink(id) {
  const key = figureDownloadLinkKey(id);
  if (!key) return '';
  try {
    const value = window.localStorage.getItem(key);
    return value ? normalizedUrl(value) : '';
  } catch {
    return '';
  }
}

export function writeFigureDownloadLink(id, value) {
  const key = figureDownloadLinkKey(id);
  if (!key) throw new FigureTransferError('FIGURE_ID', 'Select a valid figure ID.');
  const url = value === '' ? '' : normalizedUrl(value);
  try {
    if (url) window.localStorage.setItem(key, url);
    else window.localStorage.removeItem(key);
  } catch {
    throw new FigureTransferError('FIGURE_STORAGE', 'The browser could not save the download link change.');
  }
  // Native storage events only reach other tabs. Broadcast the ID, not the URL.
  window.dispatchEvent?.(new CustomEvent(FIGURE_DOWNLOAD_LINK_CHANGED, { detail: figureId(id) }));
  return url;
}

export function observeFigureDownloadLink(selectedId, refresh) {
  const target = globalThis.window;
  function onChange(event) {
    const selectedKey = figureDownloadLinkKey(selectedId());
    if (!selectedKey) return;
    if (event.type === 'storage') {
      if (event.key === null || event.key === selectedKey) refresh();
    } else if (figureDownloadLinkKey(event.detail) === selectedKey) {
      refresh();
    }
  }
  target?.addEventListener?.('storage', onChange);
  target?.addEventListener?.(FIGURE_DOWNLOAD_LINK_CHANGED, onChange);
  return () => {
    target?.removeEventListener?.('storage', onChange);
    target?.removeEventListener?.(FIGURE_DOWNLOAD_LINK_CHANGED, onChange);
  };
}
