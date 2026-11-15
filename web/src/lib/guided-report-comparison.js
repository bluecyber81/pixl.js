import {GUIDED_MAX_BYTES, observationKey, parseGuidedReport, summarizeGuidedObservations} from './guided-device-check.js';

export const MAX_COMPARISON_REPORTS = 8;

export async function compareGuidedReportFiles(files) {
  if (files.length < 2 || files.length > MAX_COMPARISON_REPORTS) throw new RangeError('report-count');
  const runs = [];
  for (const file of files) {
    if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > GUIDED_MAX_BYTES) throw new RangeError('report-size');
    const state = parseGuidedReport(await file.text());
    const rows = Object.values(state.observations);
    const known = new Map(rows.filter(row => row.deviceLanguage && row.resumeSetting && row.animationSetting)
      .map(row => [observationKey(row), row.observed]));
    const firmware = [...new Set([state.before, state.after].map(read => read?.buildIdentity.observed.firmwareVersion).filter(Boolean))];
    const coverage = summarizeGuidedObservations(rows);
    runs.push({known, exportedAt:state.importedReport.exportedAt, fileManagerVersion:state.importedReport.fileManagerVersion,
      firmware, baseCases:coverage.baseCasesObserved, configurations:coverage.configurationCasesObserved,
      matched:coverage.matchingExpectations, differed:coverage.differentExpectations, unknown:coverage.unknownExpectations});
  }
  runs.sort((a,b) => a.exportedAt.localeCompare(b.exportedAt));
  const times = new Map();
  for (const {exportedAt} of runs) times.set(exportedAt, (times.get(exportedAt) || 0) + 1);
  const reports = runs.map(({known, ...report}, index) => {
    const previous = runs[index-1];
    let comparison = null;
    if (previous && times.get(previous.exportedAt) === 1 && times.get(report.exportedAt) === 1) {
      const shared = [...known].filter(([key]) => previous.known.has(key));
      const changed = shared.filter(([key, outcome]) => previous.known.get(key) !== outcome)
        .map(([configuration, current]) => ({configuration, previous:previous.known.get(configuration), current}));
      comparison = {previousExportedAt:previous.exportedAt, sharedConfigurations:shared.length, changed};
    }
    return {...report, comparison};
  });
  return {schemaVersion:1, reportType:'guided-device-check-comparison', samePhysicalDeviceVerified:false, reports};
}
