import { normalizeDiagnosticSnapshot } from './diagnostic-snapshot.js';
import { diagnosticBuildIdentity } from './firmware-build-reference.js';

export const origins = ['file-emulator', 'amiibo-database'];
export const routes = {
  'return-to-list': {
    action: 'short-center-then-back-to-list',
    expected: 'source-list-same-figure',
    outcomes: ['source-list-same-figure', 'source-list-different-figure', 'main-menu', 'other-screen', 'no-response'],
  },
  'sleep-and-wake': {
    action: 'active-figure-auto-sleep-then-short-center',
    expected: 'same-active-figure',
    outcomes: ['same-active-figure', 'different-active-figure', 'main-menu', 'other-screen', 'no-response'],
  },
};

export function expectedReturn(route, resumeSetting) {
  if (route === 'return-to-list' || resumeSetting === 'on') return routes[route].expected;
  return resumeSetting === 'off' ? 'main-menu' : null;
}

export function recordDeviceObservation({ origin, route, outcome, deviceLanguage, resumeSetting }, recordedAt = new Date().toISOString()) {
  if (!origins.includes(origin) || !Object.hasOwn(routes, route) || !routes[route].outcomes.includes(outcome)) return null;
  const language = ['de','en'].includes(deviceLanguage) ? deviceLanguage : null;
  const resume = ['on','off'].includes(resumeSetting) ? resumeSetting : null;
  // Waking to the main menu is intended when resume is disabled. An unknown setting cannot establish an expected route.
  const expected = expectedReturn(route, resume);
  return {
    origin, route, action: routes[route].action, deviceLanguage: language, resumeSetting: resume,
    expected, observed: outcome, matchesExpectation: expected === null ? null : outcome === expected, recordedAt,
  };
}

export function captureDeviceEvidence(snapshot, firmwareVersion) {
  const data = normalizeDiagnosticSnapshot(snapshot);
  if (!data || data.completedAt < data.startedAt) return null;
  return { snapshot: data, buildIdentity: diagnosticBuildIdentity({firmwareVersion, boot: data.sections.boot.data}) };
}

export function canAttachAfter(before, candidate, lastObservationAt) {
  return !!(candidate && lastObservationAt && candidate.snapshot.startedAt >= lastObservationAt &&
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
  return { origin:'manually-transcribed-settings-version', prefix, referenceRead:after ? 'after' : before ? 'before' : null,
    expectedPrefix:expected, comparison:expected === null ? 'unknown' : expected === prefix ? 'prefix-match' : 'different-prefix',
    fullSourceIdVerified:false, applicationHashVerified:false };
}

export function createGuidedReport({ webVersion, locale, observations, before, after, sourcePrefix }) {
  return {
    schemaVersion: 1, reportType: 'guided-device-check', exportedAt: new Date().toISOString(),
    fileManagerVersion: webVersion, reportLanguage: locale.startsWith('de') ? 'de' : 'en',
    manualObservations: origins.flatMap(origin => Object.keys(routes).map(route =>
      observations[origin + '/' + route] || {origin, route, action:routes[route].action, observed:null, recordedAt:null})),
    manualSourceId: compareManualSourcePrefix(sourcePrefix, before, after),
    diagnosticReads: {before: before ?? null, after: after ?? null}, samePhysicalDeviceVerified: false,
    limitations: [
      'Manual observations describe the selected physical tests. A missing observation means untested.',
      'Diagnostic timestamps describe sequential browser reads of firmware counters and cached values.',
      'Package hashes describe reference files. The device does not report a measured application hash.',
    ],
  };
}
