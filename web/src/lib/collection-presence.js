import { figureId } from './figure-info.js';

const FORMAT_LIMITS = new Set(['classic-without-final-eight-bytes', 'classic-with-unverified-extra-bytes', 'two-kib-layout-not-fully-validated']);
const record = (state, basis = null, reasons = [], files = 0) => Object.freeze({ state, basis, reasons: Object.freeze(reasons), files });
const UNKNOWN = record('unknown'), STALE = record('stale', null, ['stale-report']);

/** Convert one local audit snapshot to an O(1) card lookup. No IO or catalogue
 * mutation. Positive partial observations are useful; absence requires an exact
 * completed full E: scan and an explicit missing row in that scanned catalogue.
 * New catalogue IDs, upcoming IDs, quick scans and stale scans never imply red.
 */
export function buildCollectionPresence(report, { stale = false } = {}) {
  const byId = new Map();
  if (!report || report.schema !== 1 || !['full', 'quick'].includes(report.mode) ||
      !Array.isArray(report.files) || !Array.isArray(report.present) || !Array.isArray(report.missing) ||
      [report.files, report.present, report.missing, report.metadataMismatches || []].some(rows => !Array.isArray(rows) || rows.length > 8192)) {
    return Object.freeze({ byId, status: 'none', canConfirmMissing: false });
  }
  if (stale) return Object.freeze({ byId, status: 'stale', canConfirmMissing: false });
  const full = report.mode === 'full';
  const canConfirmMissing = full && report.rootPath === 'E:/' && report.status === 'complete' &&
    report.complete === true && report.scanComplete === true && report.contentComplete === true &&
    !report.cancelled && !report.sessionChanged && Array.isArray(report.errors) && report.errors.length === 0 &&
    Array.isArray(report.limitsReached) && report.limitsReached.length === 0 &&
    !report.stats?.readErrors && !report.stats?.invalidEntries;
  const evidence = new Map();
  const get = id => {
    id = figureId(id); if (!id) return null;
    if (!evidence.has(id)) evidence.set(id, { content: false, metadata: false, reasons: new Set(), paths: new Set() });
    return evidence.get(id);
  };
  const pathAt = (item, value) => { if (typeof value === 'string' && value.length <= 128) item.paths.add(value); };
  for (const row of report.present) {
    const item = get(row?.id); if (!item) continue;
    if (full && row.contentConfirmed === true) item.content = true;
    if (!full) item.metadata = true;
    if (Array.isArray(row.paths)) row.paths.slice(0, 8192).forEach(path => pathAt(item, path));
  }
  for (const row of report.files) {
    if (!row || typeof row !== 'object') continue;
    const id = figureId(row.id), metadataId = figureId(row.metadataId);
    const content = get(id), metadata = get(metadataId);
    if (content) {
      pathAt(content, row.path);
      if (full && row.status === 'structure-consistent') content.content = true;
      else if (!full && row.status === 'metadata-only') content.metadata = true;
    }
    if (metadata) { pathAt(metadata, row.path); metadata.metadata = true; }
    const items = new Set([content, metadata].filter(Boolean));
    for (const item of items) {
      if (Array.isArray(row.issues) && row.issues.length) item.reasons.add('file-attention');
      if (FORMAT_LIMITS.has(row.formatContext)) item.reasons.add('format-limit');
      if (row.status === 'unsupported-length') item.reasons.add('unsupported-length');
      else if (!['structure-consistent', 'metadata-only'].includes(row.status)) item.reasons.add('content-unconfirmed');
      if (full && !id && metadataId) item.reasons.add('content-unconfirmed');
    }
    if (full && id && metadataId && id !== metadataId) {
      content.reasons.add('metadata-mismatch'); metadata.reasons.add('metadata-mismatch');
    }
  }
  for (const row of report.metadataMismatches || []) {
    for (const [id, basis] of [[row?.contentId, 'content'], [row?.metadataId, 'metadata']]) {
      const item = get(id); if (!item) continue;
      item.reasons.add('metadata-mismatch'); if (basis === 'metadata') item.metadata = true;
      pathAt(item, row.path);
    }
  }
  for (const [id, item] of evidence) {
    const basis = item.content ? 'content' : item.metadata ? 'metadata' : null;
    if (item.reasons.size) byId.set(id, record('attention', basis, [...item.reasons].sort(), item.paths.size));
    else if (item.content || !full && item.metadata) byId.set(id, record('present', basis, [], item.paths.size));
  }
  if (canConfirmMissing) {
    for (const row of report.missing) {
      const id = figureId(row?.id);
      if (id && row.state === 'no-structurally-consistent-file-observed' && !byId.has(id)) {
        byId.set(id, record('missing', 'content', ['no-matching-file-observed']));
      }
    }
  }
  return Object.freeze({ byId, status: full ? canConfirmMissing ? 'full-drive-complete' : 'partial-or-scoped' : 'quick', canConfirmMissing });
}

export function collectionPresenceFor(summary, id) {
  if (summary?.status === 'stale') return STALE;
  return summary?.byId?.get(figureId(id)) || UNKNOWN;
}
