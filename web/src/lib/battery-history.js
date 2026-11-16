export const BATTERY_HISTORY_INTERVAL = 10_000;
export const BATTERY_HISTORY_LIMIT = 120;

export function batteryHistoryCsv(rows) {
  const header = 'time_utc;battery_mV;charging_active;entry';
  const lines = rows.map(row => [new Date(row.at).toISOString(), row.mv ?? '',
    row.charging ?? '', row.reason ?? 'reading'].join(';'));
  return [header, ...lines, ''].join('\r\n');
}

// X is elapsed receipt time, Y is the observed voltage range. Never bridge a
// missing reading, a long suspension, or a wall-clock adjustment.
export function batteryHistoryChart(rows) {
  const valid = rows.filter(row => row.mv !== null);
  if (!valid.length) return { points: [], lines: [], min: null, max: null };
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
  return {points, lines: lines.filter(group => group.length > 1).map(group => group.join(' ')), min, max};
}
