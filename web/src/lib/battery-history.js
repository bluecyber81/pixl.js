export const BATTERY_HISTORY_INTERVAL = 10_000;
export const BATTERY_HISTORY_LIMIT = 120;

// Summarize only valid cached voltage readings with valid browser receipt times.
// The span includes gaps; it is neither active sampling time nor battery life.
// A backwards wall clock invalidates the duration, but not the voltage values.
export function batteryHistorySummary(rows) {
  const summary = { count: 0, min: null, max: null, range: null, latest: null,
    firstAt: null, lastAt: null, elapsedMilliseconds: null,
    gapCount: 0, pauseCount: 0, resumeCount: 0, invalidCount: 0, clockAdjusted: false };
  if (!Array.isArray(rows)) return summary;
  let previousAt = null;
  for (const row of rows) {
    if (!row || !Number.isSafeInteger(row.at) || Math.abs(row.at) > 8640000000000000 ||
        (row.mv !== null && (!Number.isInteger(row.mv) || row.mv < 1 || row.mv > 65535))) continue;
    if (previousAt !== null && row.at < previousAt) summary.clockAdjusted = true;
    previousAt = row.at;
    if (row.mv === null) {
      if (row.reason === 'resume') { ++summary.resumeCount; continue; }
      ++summary.gapCount;
      if (row.reason === 'pause') ++summary.pauseCount;
      if (row.reason === 'invalid') ++summary.invalidCount;
      continue;
    }
    if (summary.count === 0) summary.firstAt = row.at;
    ++summary.count;
    summary.lastAt = row.at;
    summary.latest = row.mv;
    summary.min = summary.min === null ? row.mv : Math.min(summary.min, row.mv);
    summary.max = summary.max === null ? row.mv : Math.max(summary.max, row.mv);
  }
  if (summary.count) {
    summary.range = summary.max - summary.min;
    const span = summary.lastAt - summary.firstAt;
    if (!summary.clockAdjusted && Number.isSafeInteger(span)) summary.elapsedMilliseconds = span;
  }
  return summary;
}

export function batteryHistoryCsv(rows) {
  const header = 'time_utc;battery_mV;charging_active;entry;pause_reason';
  const reasons = ['hidden', 'busy', 'transport-busy', 'manual', 'unsupported', 'failed', 'view'];
  const lines = rows.map(row => [new Date(row.at).toISOString(), row.mv ?? '',
    row.charging ?? '', row.reason ?? 'reading',
    ['pause', 'resume'].includes(row.reason) && reasons.includes(row.pauseReason) ? row.pauseReason : ''].join(';'));
  return [header, ...lines, ''].join('\r\n');
}

// X is elapsed receipt time, Y is the observed voltage range. Never bridge a
// missing reading, a long suspension, or a wall-clock adjustment.
export function batteryHistoryChart(rows) {
  const valid = rows.filter(row => row.mv !== null);
  if (!valid.length) return { points: [], lines: [], min: null, max: null, startAt: null, endAt: null };
  const min = Math.min(...valid.map(row => row.mv)), max = Math.max(...valid.map(row => row.mv));
  const first = Math.min(...rows.map(row => row.at)), last = Math.max(...rows.map(row => row.at));
  const points = [], lines = [];
  let line, previous;
  for (const row of rows) {
    if (row.mv === null) { previous = undefined; continue; }
    const x = last === first ? 160 : 3 + 314 * (row.at - first) / (last - first);
    const y = max === min ? 38 : 72 - 68 * (row.mv - min) / (max - min);
    if (!previous || row.at < previous.at || row.at - previous.at > 2 * BATTERY_HISTORY_INTERVAL) {
      line = [];
      lines.push(line);
    }
    points.push({x, y});
    line.push(`${x},${y}`);
    previous = row;
  }
  return {points, lines: lines.filter(group => group.length > 1).map(group => group.join(' ')), min, max,
    startAt: first, endAt: last};
}
