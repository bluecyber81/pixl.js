import { assertDeviceEntryName, assertPortableEntryName, assertWritableDevicePath, devicePathSpace, portableNameKey } from './portable-names.js'
import { SYNC_LIMITS } from './sync-plan.js'

// Keep the original directory identity even when two names would be aliases on
// the device. Individual files also get distinct IDs for identical picker names.
export function uploadNameTree(inputs) {
  const nodes = [], directories = new Map()
  inputs.forEach((input, fileIndex) => {
    const file = input.file || input
    const parts = (input.relativePath || file.webkitRelativePath || file.name).split('/')
    if (parts.length > SYNC_LIMITS.maxDepth) throw Object.assign(new Error('Folder depth exceeds limit.'), {code:'SYNC_LIMIT'})
    let parent = -1, source = ''
    parts.forEach((name, index) => {
      assertDeviceEntryName(name)
      source += (source ? '/' : '') + name
      const directory = index !== parts.length - 1
      if (directory && directories.has(source)) {
        parent = directories.get(source)
        return
      }
      if (nodes.length >= SYNC_LIMITS.maxEntries) throw Object.assign(new Error('Folder selection exceeds limit.'), {code:'SYNC_LIMIT'})
      const id = nodes.length
      nodes.push({id, parent, name, source, directory, fileIndex:directory ? null : fileIndex})
      if (directory) directories.set(source, id)
      parent = id
    })
  })
  return nodes
}

const utf8 = new TextEncoder()

function shortenUploadName(row, prefix, maxBytes, occupied, nextSuffix) {
  const name = row.name.normalize('NFC')
  const dot = row.directory ? -1 : name.lastIndexOf('.')
  const extension = dot > 0 ? name.slice(dot) : ''
  const stem = dot > 0 ? name.slice(0, dot) : name
  const fit = (suffix) => {
    let remaining = maxBytes - utf8.encode(suffix + extension).length
    let start = ''
    for (const character of stem) {
      remaining -= utf8.encode(character).length
      if (remaining < 0) break
      start += character
    }
    start = start.trimEnd().replace(/[. ]+$/u, '')
    return start ? start + suffix + extension : null
  }
  const plain = fit('')
  if (!plain) return null
  const base = row.parent + ':' + portableNameKey(plain)
  let sequence = 1
  // Shared counters avoid rechecking every earlier candidate in a large folder.
  while (true) {
    const candidate = sequence === 1 ? plain : fit('-' + sequence)
    if (!candidate) return null
    const key = row.parent + ':' + portableNameKey(candidate)
    if (!occupied.has(key)) {
      try {
        assertPortableEntryName(candidate)
        assertWritableDevicePath(prefix + candidate)
      } catch { return null }
      occupied.add(key)
      if (sequence > 1) nextSuffix.set(base, sequence + 1)
      return candidate
    }
    sequence = sequence === 1 ? (nextSuffix.get(base) || 2) : sequence + 1
  }
}

function addNameSuggestions(rows, rootPrefix) {
  const occupied = new Set(), budgets = new Map(), nextSuffix = new Map()
  for (const row of rows) {
    if (!row.count) continue
    // A manual edit may temporarily contain a slash or an empty string.
    try { occupied.add(row.parent + ':' + portableNameKey(row.name)) } catch { /* Invalid editable name. */ }
    if (row.error?.code === 'PATH_LIMIT') {
      const excess = row.error.bytes - row.error.limit
      for (let parent = rows[row.parent]; parent; parent = rows[parent.parent]) {
        const budget = Math.max(1, utf8.encode(parent.name).length - excess)
        budgets.set(parent.id, Math.min(budget, budgets.get(parent.id) ?? Infinity))
      }
    }
  }
  for (const row of rows) {
    if (!row.count || rows[row.parent]?.invalidPath) continue
    if (!budgets.has(row.id) && !['NAME_LIMIT','PATH_LIMIT','NAME_COLLISION','NAME_NORMALIZATION'].includes(row.error?.code)) continue
    const parentPrefix = row.parent < 0 ? rootPrefix : rows[row.parent].target + '/'
    const space = devicePathSpace(parentPrefix)
    const budget = Math.min(space.nameRemaining, space.pathRemaining, budgets.get(row.id) ?? Infinity)
    const suggestion = shortenUploadName(row, parentPrefix, budget, occupied, nextSuffix)
    if (suggestion) row.suggestion = suggestion
  }
}

export function reviewUploadNames(root, nodes, edits, inputs) {
  const prefix = root.endsWith('/') ? root : root + '/'
  const rows = [], files = []
  let adjusted = false
  for (const node of nodes) {
    const parent = rows[node.parent], edit = edits[node.id]
    const name = edit?.name ?? node.name
    const skipped = edit?.skipped === true, inheritedSkip = Boolean(parent?.skipped || parent?.inheritedSkip)
    const relative = (parent ? parent.relative + '/' : '') + name
    const changed = name !== node.name || skipped
    adjusted ||= changed
    rows.push({...node, name, relative, target:prefix + relative, skipped, inheritedSkip, changed,
      count:node.directory || skipped || inheritedSkip ? 0 : 1, error:null})
  }

  // The planner creates only directories needed by a selected file. A folder
  // containing only skipped files must not cause a phantom collision.
  for (let index = rows.length - 1; index >= 0; --index) {
    const row = rows[index]
    if (row.parent >= 0) rows[row.parent].count += row.count
  }
  const siblingNames = new Map()
  let included = 0
  for (const row of rows) {
    if (!row.count) continue
    if (!row.directory) ++included
    const parent = rows[row.parent]
    try {
      assertPortableEntryName(row.name)
      if (!parent?.invalidPath) assertWritableDevicePath(row.target)
    } catch (err) {
      row.error = {code:err.code, ...err.details}
    }
    row.invalidPath = !!(row.error || parent?.invalidPath)
    if (row.invalidPath) continue
    const key = row.parent + ':' + portableNameKey(row.name)
    const prior = siblingNames.get(key)
    if (prior) {
      prior.error ||= {code:'NAME_COLLISION', other:row.source}
      row.error = {code:'NAME_COLLISION', other:prior.source}
    } else siblingNames.set(key, row)
    if (!row.directory) {
      const input = inputs[row.fileIndex]
      files.push(row.relative === row.source ? input : {file:input.file || input, relativePath:row.relative})
    }
  }
  const problems = rows.filter(row => row.error).length
  if (problems) addNameSuggestions(rows, prefix)
  return {rows, problems, included, adjusted, files:problems ? [] : files}
}
