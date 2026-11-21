// Apple platform detection only chooses help text. The API decides availability.
export function bluetoothAccessIssue(environment = globalThis) {
    if (!environment.isSecureContext) return 'insecure';
    const nav = environment.navigator;
    if (typeof nav?.bluetooth?.requestDevice === 'function') return '';
    const appleMobile = /iPhone|iPad|iPod/i.test(nav?.userAgent || '') ||
        (nav?.maxTouchPoints > 1 &&
            (nav.platform === 'MacIntel' || /Macintosh/.test(nav.userAgent || '')));
    return appleMobile ? 'appleBluetooth' : 'browserUnavailable';
}
