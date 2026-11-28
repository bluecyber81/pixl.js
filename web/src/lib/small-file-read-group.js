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

// Collect SHA-256 replies for one revision. A missing hash still needs an
// individual read. Only an explicit capability/budget decline permits fallback.
export async function readSmallFileDigests(files, { revision, readFileDigestsBatch, maxRequestPayload, check, invalidReply, onGroup }) {
  const hashes = new Map();
  const eligible = files.filter(file => file.path.startsWith('E:/') && file.size <= 572);
  for (let index = 0; index < eligible.length;) {
    check();
    const group = smallFileReadGroup(eligible, index, file => file.path, maxRequestPayload);
    const start = index;
    index += Math.max(1, group.length);
    if (group.length < 2) continue;
    onGroup?.(group[0].path, start, eligible.length);
    check();
    const descriptors = group.map(({path, size}) => ({path, size}));
    const reply = await readFileDigestsBatch(descriptors, {revision});
    check();
    if (reply === null) break;
    if (!Array.isArray(reply) || reply.length !== group.length) invalidReply('Incomplete grouped digest response.');
    for (const [i, expected] of group.entries()) {
      const item = reply[i];
      if (item?.path !== expected.path || item.size !== expected.size || typeof item.sha256 !== 'string' ||
          !/^[a-f0-9]{64}$/u.test(item.sha256)) invalidReply('Invalid grouped digest response.');
      hashes.set(expected.path, item.sha256);
    }
  }
  return hashes;
}
