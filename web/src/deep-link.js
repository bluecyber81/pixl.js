import { publicFigureLink } from './lib/figure-info.js'
import { deploymentBase } from './lib/deployment-path.js'

export function amiiboDeepLink(pathname, { search = '', hash = '', basePath } = {}) {
  const base = deploymentBase(basePath)
  if (typeof pathname !== 'string' || typeof search !== 'string' || typeof hash !== 'string') return null
  const home = pathname === base || pathname === base + 'index.html'
  const relative = pathname.startsWith(base) ? pathname.slice(base.length) : ''
  const match = /^a\/([0-9a-f]{8})-([0-9a-f]{8})\/?$/i.exec(relative)
  const candidates = match ? [match[1] + match[2]] : []
  // Pages serves these links at the existing index, without a server rewrite.
  const query = new URLSearchParams(search)
  if (query.has('amiibo')) {
    if (!home || query.getAll('amiibo').length !== 1 || !/^[0-9a-f]{16}$/i.test(query.get('amiibo'))) return null
    candidates.push(query.get('amiibo'))
  }
  if (hash.startsWith('#/a/')) {
    const fragment = /^#\/a\/([0-9a-f]{8})-([0-9a-f]{8})\/?$/i.exec(hash)
    if (!home || !fragment) return null
    candidates.push(fragment[1] + fragment[2])
  }
  // Ambiguous links do not redirect. Only validated figure IDs reach the resolver.
  return candidates.length === 1 ? publicFigureLink(candidates[0]) : null
}

