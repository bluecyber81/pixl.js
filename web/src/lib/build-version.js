// Keep the product version intact; optional build labels identify local review
// packages only in the UI. Vite supplies the value at build time.
export function formatBuildVersion(version, label = import.meta.env?.VITE_BUILD_LABEL) {
  const suffix = typeof label === 'string' ? label.trim().replace(/\s+/gu, ' ').slice(0, 80).trimEnd() : ''
  return suffix ? `${version} · ${suffix}` : version
}
