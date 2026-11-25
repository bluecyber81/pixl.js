const encoder = new TextEncoder();

// PXBR accepts at most four descriptors, each with a UTF-8 path and two u16s.
// The caller starts at a small eligible file. Intervening large files still
// use their ordinary read and keep their place in the report or archive.
export function smallFileReadGroup(records, start, pathFor, requestLimit) {
  const maximum = Math.min(243, requestLimit ?? 243);
  const group = [];
  let requestBytes = 10;
  for (let index = start; index < records.length && group.length < 4; ++index) {
    const row = records[index];
    const path = pathFor(row);
    if (!path || row.size > 572) continue;
    const bytes = 4 + encoder.encode(path).length;
    if (requestBytes + bytes > maximum) break;
    group.push(row);
    requestBytes += bytes;
  }
  return group;
}
