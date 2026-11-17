import { cleanLcdObservations, summarizeLcdObservations } from './guided-lcd-checks.js';
import { normalizeDiagnosticSnapshot } from './diagnostic-snapshot.js';
import { diagnosticBuildIdentity } from './firmware-build-reference.js';

export const GUIDED_MAX_BYTES = 1024 * 1024;
export const GUIDED_MAX_SNAPSHOT_BYTES = 256 * 1024;
export const GUIDED_MAX_OBSERVATIONS = 128;
export const GUIDED_MAX_NOTE_LENGTH = 1000;
export const origins = Object.freeze(['file-emulator', 'amiibo-database']);
export const routes = Object.freeze({
  'return-to-list': Object.freeze({
    action: 'short-center-then-back-to-list', expected: 'source-list-same-figure',
    outcomes: Object.freeze(['source-list-same-figure', 'source-list-different-figure', 'main-menu', 'other-screen', 'no-response']),
  }),
  'sleep-and-wake': Object.freeze({
    action: 'active-figure-auto-sleep-then-short-center', expected: 'same-active-figure',
    outcomes: Object.freeze(['same-active-figure', 'different-active-figure', 'main-menu', 'other-screen', 'no-response']),
  }),
});

const languageValues = ['de', 'en'];
const settingValues = ['on', 'off'];
const sources = ['manual-user-report', 'imported-manual-report'];
const invalid = () => Object.assign(new Error('The check report contains invalid or inconsistent data.'), {code:'GUIDED_IMPORT_INVALID'});
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const validVersion = value => typeof value === 'string' && value.length > 0 && value.length <= 64 && /^[A-Za-z0-9.+-]+$/.test(value);
const firmwareVersion = value => value === null || (typeof value === 'string' && /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]{1,48})?$/.test(value));
const normalizedOption = (value, allowed) => allowed.includes(value) ? value : null;
const importedOption = (value, allowed, legacy = false) => {
  if (value === null || (legacy && value === undefined)) return null;
  if (!allowed.includes(value)) throw invalid();
  return value;
};
const byteLength = value => new TextEncoder().encode(value).byteLength;
function sameKnownValue(clean, raw) {
  if (Array.isArray(clean)) return Array.isArray(raw) && clean.length === raw.length && clean.every((item,index) => sameKnownValue(item,raw[index]));
  if (plain(clean)) return plain(raw) && Object.entries(clean).every(([key,item]) => Object.hasOwn(raw,key) && sameKnownValue(item,raw[key]));
  return clean === raw;
}
function boundedJson(value, maximum = GUIDED_MAX_BYTES) {
  let text;
  try { text = JSON.stringify(value); } catch { throw invalid(); }
  if (typeof text !== 'string' || byteLength(text) > maximum) throw invalid();
  return text;
}

// Parsing is local and bounded. Untrusted keys never enter a reactive object.
function readJson(text) {
  if (typeof text !== 'string') throw invalid();
  if (text.length > GUIDED_MAX_BYTES || byteLength(text) > GUIDED_MAX_BYTES) {
    throw Object.assign(new Error('The check report exceeds 1 MiB.'), {code:'GUIDED_IMPORT_SIZE'});
  }
  let value;
  try {
    value = JSON.parse(text, (key, item) => {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw invalid();
      return item;
    });
  } catch (error) {
    if (error?.code === 'GUIDED_IMPORT_INVALID') throw error;
    throw Object.assign(new Error('The check report is not valid JSON.'), {code:'GUIDED_IMPORT_JSON'});
  }
  if (!plain(value)) throw invalid();
  return value;
}

export function expectedReturn(route, resumeSetting) {
  if (typeof route !== 'string' || !Object.hasOwn(routes, route)) return null;
  if (route === 'return-to-list' || resumeSetting === 'on') return routes[route].expected;
  return resumeSetting === 'off' ? 'main-menu' : null;
}

export function observationKey({origin, route, deviceLanguage, resumeSetting, animationSetting} = {}) {
  if (!origins.includes(origin) || typeof route !== 'string' || !Object.hasOwn(routes, route)) return null;
  return [origin, route, normalizedOption(deviceLanguage, languageValues) || 'unknown',
    normalizedOption(resumeSetting, settingValues) || 'unknown', normalizedOption(animationSetting, settingValues) || 'unknown'].join('/');
}

export function recordDeviceObservation({origin, route, outcome, deviceLanguage, resumeSetting, animationSetting, note = ''} = {}, recordedAt = new Date().toISOString()) {
  if (!origins.includes(origin) || typeof route !== 'string' || !Object.hasOwn(routes, route) || !routes[route].outcomes.includes(outcome) ||
      !timestamp(recordedAt) || typeof note !== 'string' || note.length > GUIDED_MAX_NOTE_LENGTH || /\u0000/.test(note)) return null;
  const language = normalizedOption(deviceLanguage, languageValues);
  const resume = normalizedOption(resumeSetting, settingValues);
  const animation = normalizedOption(animationSetting, settingValues);
  const expected = expectedReturn(route, resume);
  return {origin, route, action:routes[route].action, deviceLanguage:language, resumeSetting:resume,
    animationSetting:animation, note, observationSource:'manual-user-report', expected,
    observed:outcome, matchesExpectation:expected === null ? null : outcome === expected, recordedAt};
}

export function captureDeviceEvidence(snapshot, version) {
  const data = normalizeDiagnosticSnapshot(snapshot);
  if (!data || data.completedAt < data.startedAt) return null;
  return {snapshot:data, buildIdentity:diagnosticBuildIdentity({firmwareVersion:version, boot:data.sections.boot.data, build:data.sections.build?.data})};
}

export function canAttachAfter(before, candidate, lastObservationAt) {
  return !!(candidate && timestamp(lastObservationAt) && candidate.snapshot.startedAt >= lastObservationAt &&
    (!before || (candidate.snapshot.startedAt >= before.snapshot.completedAt && candidate.snapshot.completedAt > before.snapshot.completedAt)));
}

export function normalizeSourcePrefix(input) {
  return typeof input === 'string' && input.length === 12 && /^[0-9a-fA-F]{12}$/.test(input) ? input.toLowerCase() : null;
}

export function compareManualSourcePrefix(input, before, after) {
  const prefix = normalizeSourcePrefix(input);
  if (!prefix) return null;
  const identity = (after ?? before)?.buildIdentity;
  const reference = identity?.packageReference;
  const qualified = identity?.referenceRelation === 'version-and-counter' &&
    reference?.firmwareVersion === identity.observed?.firmwareVersion &&
    reference?.applicationCounter === identity.observed?.applicationCounter && /^[0-9a-f]{64}$/.test(reference?.sourceId);
  const expected = qualified ? reference.sourceId.slice(0,12) : null;
  return {origin:'manually-transcribed-settings-version', prefix, referenceRead:after ? 'after' : before ? 'before' : null,
    expectedPrefix:expected, comparison:expected === null ? 'unknown' : expected === prefix ? 'prefix-match' : 'different-prefix',
    fullSourceIdVerified:false, applicationHashVerified:false};
}

function cleanEvidence(value) {
  if (value === undefined || value === null) return null;
  if (!plain(value) || !plain(value.snapshot) || !plain(value.buildIdentity) || !plain(value.buildIdentity.observed)) throw invalid();
  boundedJson(value, GUIDED_MAX_SNAPSHOT_BYTES);
  const version = value.buildIdentity.observed.firmwareVersion;
  if (!firmwareVersion(version)) throw invalid();
  const result = captureDeviceEvidence(value.snapshot, version);
  if (!result || !sameKnownValue(result.snapshot,value.snapshot)) throw invalid();
  // Section receipt times must belong to this read; no future/older read is spliced in.
  for (const section of Object.values(result.snapshot.sections)) {
    if (section.observedAt !== null && (section.observedAt < result.snapshot.startedAt || section.observedAt > result.snapshot.completedAt)) throw invalid();
  }
  return result;
}

function cleanRows(value = [], {legacy = false, importSource = false, strict = false} = {}) {
  const entries = Array.isArray(value) ? value : plain(value) ? Object.values(value) : null;
  if (!entries || entries.length > GUIDED_MAX_OBSERVATIONS) throw invalid();
  const rows = [];
  const keys = new Set();
  for (const raw of entries) {
    if (!plain(raw) || !origins.includes(raw.origin) || typeof raw.route !== 'string' || !Object.hasOwn(routes, raw.route)) throw invalid();
    if (legacy && raw.observed === null && raw.recordedAt === null) continue;
    const options = strict ? {
      deviceLanguage:importedOption(raw.deviceLanguage, languageValues, legacy),
      resumeSetting:importedOption(raw.resumeSetting, settingValues, legacy),
      animationSetting:importedOption(raw.animationSetting, settingValues, legacy),
    } : raw;
    const row = recordDeviceObservation({origin:raw.origin, route:raw.route, outcome:raw.observed,
      deviceLanguage:options.deviceLanguage, resumeSetting:options.resumeSetting,
      animationSetting:options.animationSetting, note:raw.note === undefined ? '' : raw.note}, raw.recordedAt);
    if (!row) throw invalid();
    if (strict && raw.observationSource !== undefined && !sources.includes(raw.observationSource)) throw invalid();
    row.observationSource = importSource || raw.observationSource === 'imported-manual-report' ? 'imported-manual-report' : 'manual-user-report';
    const key = observationKey(row);
    if (keys.has(key)) throw invalid();
    keys.add(key); rows.push(row);
  }
  return rows.sort((a,b) => observationKey(a).localeCompare(observationKey(b)));
}

function checkReadOrder(rows, before, after) {
  const times = rows.map(row => row.recordedAt).sort();
  if (before && times.length && before.snapshot.completedAt > times[0]) throw invalid();
  if (after && !canAttachAfter(before, after, times.at(-1))) throw invalid();
}

function checkDocumentTime(state, documentTime) {
  if ([...Object.values(state.observations), ...Object.values(state.lcdObservations)].some(row => row.recordedAt > documentTime) ||
      [state.before, state.after].some(read => read && read.snapshot.completedAt > documentTime)) throw invalid();
}

function coverage(rows) {
  const baseCases = origins.flatMap(origin => Object.keys(routes).map(route => ({origin, route})));
  const untestedBaseCases = baseCases.filter(item => !rows.some(row => row.origin === item.origin && row.route === item.route));
  const configurations = rows.filter(row => row.deviceLanguage && row.resumeSetting && row.animationSetting).length;
  return {
    observationsRecorded:rows.length, baseCasesTotal:4, baseCasesObserved:4-untestedBaseCases.length, untestedBaseCases,
    configurationCasesTotal:32, configurationCasesObserved:configurations, configurationCasesUntested:32-configurations,
    matchingExpectations:rows.filter(row => row.matchesExpectation === true).length,
    differentExpectations:rows.filter(row => row.matchesExpectation === false).length,
    unknownExpectations:rows.filter(row => row.matchesExpectation === null).length,
  };
}

// The UI can summarize its observations without rebuilding evidence or reading the clock.
export function summarizeGuidedObservations(observations) {
  return coverage(cleanRows(observations));
}

function sourcePrefix(value) {
  if (value === undefined || value === null || value === '') return '';
  const result = normalizeSourcePrefix(value);
  if (!result) throw invalid();
  return result;
}

function unfinishedPrefix(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > 64 || /\u0000/.test(value)) throw invalid();
  return value;
}

function cleanImportedReport(value) {
  if (value === undefined || value === null) return null;
  if (!plain(value) || ![1,2,3].includes(value.schemaVersion) || !timestamp(value.exportedAt) || !validVersion(value.fileManagerVersion)) throw invalid();
  return {schemaVersion:value.schemaVersion, exportedAt:value.exportedAt, fileManagerVersion:value.fileManagerVersion};
}

function cleanState(value = {}, options = {}) {
  if (!plain(value)) throw invalid();
  const rows = cleanRows(value.observations, options);
  const before = cleanEvidence(value.before), after = cleanEvidence(value.after);
  let lcdObservations;
  try { lcdObservations = cleanLcdObservations(value.lcdObservations, {imported:options.importSource}); }
  catch { throw invalid(); }
  checkReadOrder([...rows,...Object.values(lcdObservations)], before, after);
  const observations = Object.fromEntries(rows.map(row => [observationKey(row), row]));
  const option = (item, allowed) => {
    if (item === undefined || item === null || item === '') return '';
    if (!allowed.includes(item)) throw invalid();
    return item;
  };
  return {observations, lcdObservations, before, after, sourcePrefix:options.draft ? unfinishedPrefix(value.sourcePrefix) : sourcePrefix(value.sourcePrefix),
    origin:option(value.origin, origins) || 'file-emulator', deviceLanguage:option(value.deviceLanguage, languageValues),
    resumeSetting:option(value.resumeSetting, settingValues), animationSetting:option(value.animationSetting, settingValues),
    importedReport:cleanImportedReport(value.importedReport)};
}

export function createGuidedReport({webVersion, locale, observations, lcdObservations, before, after, sourcePrefix:prefix, importedReport} = {}) {
  if (!validVersion(webVersion) || typeof locale !== 'string') throw invalid();
  const state = cleanState({observations, lcdObservations, before, after, sourcePrefix:prefix, importedReport});
  const rows = Object.values(state.observations);
  const reportHasLcd = Object.keys(state.lcdObservations).length > 0;
  const report = {
    schemaVersion:reportHasLcd ? 3 : 2, reportType:'guided-device-check', exportedAt:new Date().toISOString(),
    fileManagerVersion:webVersion, reportLanguage:locale.startsWith('de') ? 'de' : 'en',
    manualObservations:rows, ...(Object.keys(state.lcdObservations).length ? {lcdObservations:Object.values(state.lcdObservations), lcdCoverage:summarizeLcdObservations(state.lcdObservations)} : {}), coverage:coverage(rows), importedReport:state.importedReport,
    manualSourceId:compareManualSourcePrefix(state.sourcePrefix, state.before, state.after),
    diagnosticReads:{before:state.before, after:state.after}, samePhysicalDeviceVerified:false,
    limitations:[
      'The 32 resume observations are manual user reports. Imported entries retain their provenance. Missing configurations remain untested.',
      'The 32 known configurations cover two apps, two routes, DE/EN, resume on/off, and animation on/off. Unknown settings do not complete this matrix.',
      ...(reportHasLcd ? ['The 40 additional LCD checks distinguish manual hardware observations, host tests and device readbacks. Imported rows do not count toward fresh local evidence.'] : []),
      'Diagnostic timestamps describe sequential browser reads of firmware counters and cached values. Import does not perform a new device read.',
      'Package hashes describe reference files. The device does not report a measured application hash.',
    ],
  };
  checkDocumentTime(state, report.exportedAt);
  boundedJson(report);
  return report;
}

export function parseGuidedReport(text) {
  const value = readJson(text);
  if (![1,2,3].includes(value.schemaVersion) || value.reportType !== 'guided-device-check' || !timestamp(value.exportedAt) ||
      !validVersion(value.fileManagerVersion) || !['de','en'].includes(value.reportLanguage) || !Array.isArray(value.manualObservations) ||
      !plain(value.diagnosticReads) || !Object.hasOwn(value.diagnosticReads,'before') || !Object.hasOwn(value.diagnosticReads,'after')) throw invalid();
  if (value.manualSourceId !== null && value.manualSourceId !== undefined && !plain(value.manualSourceId)) throw invalid();
  if (value.schemaVersion === 3 && !Array.isArray(value.lcdObservations)) throw invalid();
  const state = cleanState({observations:value.manualObservations, lcdObservations:value.schemaVersion === 3 ? value.lcdObservations : {},
    before:value.diagnosticReads.before, after:value.diagnosticReads.after, sourcePrefix:value.manualSourceId?.prefix,
    importedReport:{schemaVersion:value.schemaVersion, exportedAt:value.exportedAt, fileManagerVersion:value.fileManagerVersion}},
  {legacy:value.schemaVersion === 1, importSource:true, strict:true});
  checkDocumentTime(state, value.exportedAt);
  const latest = Object.values(state.observations).sort((a,b) => a.recordedAt.localeCompare(b.recordedAt)).at(-1);
  if (latest) Object.assign(state, {origin:latest.origin, deviceLanguage:latest.deviceLanguage || '',
    resumeSetting:latest.resumeSetting || '', animationSetting:latest.animationSetting || ''});
  return state;
}

export function serializeGuidedDraft(value = {}, savedAt = new Date().toISOString()) {
  if (!timestamp(savedAt)) throw invalid();
  const state = cleanState(value, {draft:true});
  checkDocumentTime(state, savedAt);
  return boundedJson({schemaVersion:Object.keys(state.lcdObservations).length ? 3 : 2, draftType:'guided-device-check-draft', savedAt, ...state});
}

export function parseGuidedDraft(text) {
  const value = readJson(text);
  if (![2,3].includes(value.schemaVersion) || value.draftType !== 'guided-device-check-draft' || !timestamp(value.savedAt)) throw invalid();
  if (value.schemaVersion === 3 && !plain(value.lcdObservations)) throw invalid();
  const state = cleanState({...value,lcdObservations:value.schemaVersion === 3 ? value.lcdObservations : {}}, {strict:true, draft:true});
  checkDocumentTime(state, value.savedAt);
  return {...state, savedAt:value.savedAt};
}
