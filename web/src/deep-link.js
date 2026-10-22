export function amiiboDeepLink(pathname) {
  const match = /^\/a\/([0-9a-f]{8})-([0-9a-f]{8})\/?$/i.exec(pathname || '')
  return match ? `https://amiibo.life/nfc/${match[1].toUpperCase()}-${match[2].toUpperCase()}` : null
}

