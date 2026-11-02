// Notes are stored as a 90-byte C string. Never silently shorten at NUL or
// let TextEncoder replace broken UTF-16 before the user saves their text.
export function metadataNoteInfo(value) {
  const maxBytes = 89;
  if (typeof value !== 'string') return { valid: false, bytes: null, maxBytes, reason: 'invalid' };
  for (let i = 0; i < value.length; ++i) {
    const code = value.charCodeAt(i);
    if (code === 0) return { valid: false, bytes: null, maxBytes, reason: 'invalid' };
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return { valid: false, bytes: null, maxBytes, reason: 'invalid' };
    } else if (code >= 0xdc00 && code <= 0xdfff) return { valid: false, bytes: null, maxBytes, reason: 'invalid' };
  }
  const bytes = new TextEncoder().encode(value).length;
  return { valid: bytes <= maxBytes, bytes, maxBytes, reason: bytes <= maxBytes ? null : 'length' };
}
