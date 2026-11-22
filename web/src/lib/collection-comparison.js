const identifier = value => typeof value === 'string' && /^[0-9a-f]{16}$/.test(value)
const hash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)

function observation(report, stale) {
  const available = !stale && report?.schema === 1 && report.mode === 'full'
  const ids = new Map(), variants = new Map()
  if (available) {
    for (const row of report.files || []) if (identifier(row.id) && row.status === 'structure-consistent' && hash(row.sha256)) {
      if (!variants.has(row.id)) variants.set(row.id, new Set())
      variants.get(row.id).add(row.size + ':' + row.sha256)
    }
    for (const row of report.present || []) if (identifier(row.id) && row.contentConfirmed === true && variants.has(row.id)) ids.set(row.id, row)
  }
  const complete = available && report.status === 'complete' && report.complete === true && report.scanComplete === true && report.contentComplete === true &&
    !report.cancelled && !report.sessionChanged && !report.errors?.length && !report.limitsReached?.length
  return { ids, variants, available, complete, status: stale ? 'stale' : !report ? 'missing' : report.mode !== 'full' ? 'quick' : complete ? 'complete' : 'partial' }
}

// Positive observations can be useful even after an interrupted scan. Absence
// and one-sided counts require two complete, current content observations.
// Same ID never authorizes replacement: UID, save data and variants may differ.
export function compareCollections(localReport, deviceReport, { deviceStale = false } = {}) {
  const local = observation(localReport, false), device = observation(deviceReport, deviceStale)
  const comparable = local.complete && device.complete
  const bothAvailable = local.available && device.available
  const shared = [], localOnly = [], deviceOnly = []
  for (const [id, row] of local.ids) {
    if (device.ids.has(id)) {
      const left = local.variants.get(id), right = device.variants.get(id)
      const same = left.size === right.size && [...left].every(value => right.has(value))
      shared.push({ id, name: row.name, localPaths: row.paths, devicePaths: device.ids.get(id).paths,
        contentComparison: same ? 'same-byte-variants' : 'different-byte-variants' })
    } else if (comparable) localOnly.push(row)
  }
  if (comparable) for (const [id, row] of device.ids) if (!local.ids.has(id)) deviceOnly.push(row)
  const deviceMissing = new Set((deviceReport?.missing || []).map(row => row.id))
  const missingBoth = comparable ? (localReport.missing || []).filter(row => identifier(row.id) && deviceMissing.has(row.id)) : []
  return {
    comparable, localStatus: local.status, deviceStatus: device.status,
    counts: {
      local: local.available ? local.ids.size : null, device: device.available ? device.ids.size : null,
      shared: bothAvailable ? shared.length : null,
      union: bothAvailable ? new Set([...local.ids.keys(), ...device.ids.keys()]).size : null,
      localOnly: comparable ? localOnly.length : null, deviceOnly: comparable ? deviceOnly.length : null,
      missingBoth: comparable ? missingBoth.length : null,
    },
    shared, localOnly, deviceOnly, missingBoth,
  }
}
