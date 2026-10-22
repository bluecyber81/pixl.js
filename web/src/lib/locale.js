export function detectLanguage(language, locales) {
    const requested = (language || '').toLowerCase().replace(/_/g, '-');
    const normalize = locale => locale.toLowerCase().replace(/_/g, '-');
    const exact = locales.find(locale => normalize(locale) === requested);
    if (exact) return exact;
    const base = requested.split('-')[0];
    const related = locales.find(locale => normalize(locale).split('-')[0] === base);
    return related || 'en';
}

export function read_saved_language(storage, locales, fallback = 'de_DE') {
    try { const saved = storage && storage.getItem('allmiibo.language'); if (locales.includes(saved)) return saved; }
    catch (_) { /* Blocked storage must not prevent startup. */ }
    return locales.includes(fallback) ? fallback : 'en';
}
export function save_language(storage, language) {
    try { if (storage) storage.setItem('allmiibo.language', language); }
    catch (_) { /* Apply language for this session even if persistence is blocked. */ }
}
