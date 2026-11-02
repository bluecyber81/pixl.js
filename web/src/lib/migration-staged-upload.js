import { asBytes, checkedDirectory } from './safe-upload.js'
import { portableNameKey } from './portable-names.js'
import { rawMetadataBytes } from './raw-metadata.js'

/** Pending, exact-archive migration only. Keeps the published stage/rename
 * mutation sequence, but deliberately leaves all byte/raw verification to the
 * mandatory final comparison. Never used by the ordinary file manager. */
export async function migrationStagedUpload(o, entry, bytes, plan, existing) {
  const parent = entry.sourcePath.slice(0, entry.sourcePath.lastIndexOf('/')) || 'E:/'
  const folder = parent === 'E:' ? 'E:/' : parent
  const leaf = path => path.slice(path.lastIndexOf('/') + 1)
  const fail = (code, message) => { throw Object.assign(new Error(message), { code }) }
  const check = (committing = false) => {
    o.assertSession()
    if (!committing && o.signal?.aborted) throw Object.assign(new Error('Migration cancelled'), { name: 'AbortError', code: 'MIGRATION_CANCELLED' })
  }
  const receipt = { phase: 'preparing', targetPath: entry.sourcePath, stagePath: plan.stage,
    backupPath: existing ? plan.backup : null, committed: false, verified: false, recoveryFiles: [] }
  const progress = (phase, done = 0) => {
    receipt.phase = phase
    try { o.onProgress?.({ phase, path: entry.sourcePath, done, total: entry.size }) } catch { /* observer */ }
  }
  let stageAttempted = false, commitStarted = false
  try {
    check()
    const source = asBytes(bytes)
    if (source.byteLength !== entry.size) fail('MIGRATION_ARCHIVE', 'The archived file length changed.')
    const entries = checkedDirectory(await o.readDirectory(folder)); check()
    const aliases = path => entries.filter(e => portableNameKey(e.name) === portableNameKey(leaf(path)))
    const target = aliases(entry.sourcePath)
    if (target.length !== (existing ? 1 : 0) || target.some(e => e.name !== leaf(entry.sourcePath) || e.type !== 0 || e.size !== existing.size))
      fail('MIGRATION_CONFLICT', 'The pending target differs from the initial namespace.')
    if (aliases(plan.stage).length || aliases(plan.backup).length)
      fail('MIGRATION_COLLISION', 'A reserved archive staging name is occupied.')
    if (o.storageInfo?.backend === 3 && o.storageInfo?.mounted === true && o.storageInfo?.flags === 15) {
      // The advertised Packed writer stages privately and atomically publishes
      // bytes plus exact raw metadata at CLOSE. Retain the final full comparison.
      receipt.stagePath = null; receipt.backupPath = null
      stageAttempted = true; progress('uploading')
      try {
        await o.writeFile(entry.sourcePath, source, {rawMeta128:rawMetadataBytes(entry.rawMeta128Hex), atomicReplace:!!existing,
          onProgress:p=>progress('uploading',p.written_bytes??p.done??0)})
        check(true); receipt.committed = true; receipt.rawCommitted = true
        progress('transferred-unverified',entry.size)
        return {...receipt,cancelledAfterCommit:o.signal?.aborted===true}
      } catch (error) {
        // A missing CLOSE acknowledgement can mean either old or new data.
        // No retry or speculative cleanup of the target is safe here.
        receipt.committed = null
        receipt.recoveryFiles.push({path:entry.sourcePath,role:'target',state:'possible'})
        throw error
      }
    }
    stageAttempted = true; progress('uploading')
    await o.writeFile(plan.stage, source, { onProgress: p => progress('uploading', p.written_bytes ?? p.done ?? 0) })
    check()
    await o.updateMetadata(plan.stage, { valid: true, notes: '', flags: { raw: 0, hide: false, readonly: false }, amiibo: { head: 0, tail: 0 } })
    check()
    progress('committing'); check(); commitStarted = true
    if (existing) { await o.rename(entry.sourcePath, plan.backup); check(true) }
    await o.rename(plan.stage, entry.sourcePath); check(true)
    receipt.committed = true
    if (existing) { await o.remove(plan.backup); check(true) }
    progress('transferred-unverified', entry.size)
    return { ...receipt, cancelledAfterCommit: o.signal?.aborted === true }
  } catch (error) {
    // No automatic retry or cleanup mutation after an uncertain ACK. Exact
    // deterministic stage/backup paths are inspected during the next fresh
    // resume before any cleanup. Never infer verification from a write ACK.
    if (stageAttempted && receipt.stagePath) receipt.recoveryFiles.push({ path: plan.stage, role: 'stage', state: 'possible' })
    if (existing && commitStarted) receipt.recoveryFiles.push({ path: plan.backup, role: 'backup', state: 'possible' })
    receipt.failurePhase = receipt.phase
    if (commitStarted) receipt.committed = null
    error.recoveryFiles = receipt.recoveryFiles
    error.migrationUploadReceipt = receipt
    throw error
  }
}
