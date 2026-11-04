/* Allmiibo DFU package preflight. MIT license; see LICENSE.txt.
 * Application-only candidate. Authenticity and installed-device compatibility
 * remain enforced by the Nordic bootloader, not by this ZIP preflight. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./vendor/jszip-3.10.2.min.js'), require('./vendor/crc32.js'));
    else root.SecureDfuPackage = factory(root.JSZip, root.CRC32);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (JSZip, CRC32) {
    'use strict';
    const MAX_ZIP = 2 * 1024 * 1024, MAX_CONTENT = 1024 * 1024;
    const MAX_APPLICATION = 372736;
    function requireThat(ok, message) { if (!ok) throw new Error(message); }
    // Nordic dfu-cc.proto uses varints and length-delimited fields here.
    // Decode only the envelope and fields needed by the application updater.
    function readVarint(bytes, pos) {
        let value = 0;
        for (let i = 0; i < 5 && pos.at < bytes.length; i++) {
            const b = bytes[pos.at++];
            value += (b & 127) * 2 ** (7 * i);
            if (b < 128 && value <= 0xffffffff) return value;
        }
        throw new Error('Ungültige Zahl im Nordic-Startpaket.');
    }
    function fields(bytes) {
        const result = new Map(), pos = { at: 0 };
        while (pos.at < bytes.length) {
            const tag = readVarint(bytes, pos), id = Math.floor(tag / 8), wire = tag % 8;
            requireThat(id > 0 && (wire === 0 || wire === 2), 'Unbekanntes Format im Startpaket.');
            let value = readVarint(bytes, pos);
            if (wire === 2) {
                requireThat(value <= bytes.length - pos.at, 'Unvollständiges Startpaket.');
                const end = pos.at + value;
                value = bytes.subarray(pos.at, end);
                pos.at = end;
            }
            if (!result.has(id)) result.set(id, []);
            result.get(id).push(value);
        }
        return result;
    }
    function one(map, id, numeric = false) {
        const list = map.get(id);
        requireThat(list?.length === 1 && (typeof list[0] === 'number') === numeric, 'Feld im Startpaket fehlt oder ist mehrdeutig.');
        return list[0];
    }
    async function requirements(data, image) {
        const packet = fields(new Uint8Array(data));
        requireThat(!packet.has(1), 'Erwartet wird ein signiertes Nordic-Startpaket.');
        const signed = fields(one(packet, 2)), command = fields(one(signed, 1));
        requireThat(one(signed, 2, true) === 0 && one(signed, 3).length === 64 && one(command, 1, true) === 1,
            'Ungültiger Signaturrahmen oder Updatebefehl.');
        const init = fields(one(command, 2));
        requireThat(one(init, 4, true) === 0 && one(init, 7, true) === image.byteLength &&
            [5, 6].every(id => !init.has(id) || one(init, id, true) === 0), 'Startpaket und Anwendungsdatei passen nicht zusammen.');
        const hash = fields(one(init, 8)), expected = one(hash, 2);
        requireThat(one(hash, 1, true) === 3 && expected.length === 32, 'SHA-256-Prüfsumme im Startpaket fehlt.');
        requireThat(globalThis.crypto?.subtle, 'Für die SHA-256-Prüfung die Seite über HTTPS oder localhost öffnen.');
        const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', image));
        requireThat(digest.every((n, i) => n === expected[31 - i]), 'Die Anwendung passt nicht zur SHA-256-Prüfsumme im Startpaket.');
        const softDevices = [];
        for (const field of init.get(3) || []) {
            if (typeof field === 'number') softDevices.push(field);
            else {
                const pos = { at: 0 };
                while (pos.at < field.length) softDevices.push(readVarint(field, pos));
            }
        }
        requireThat(softDevices.length > 0 && softDevices.every(n => n <= 0xffff), 'Ungültige SoftDevice-Anforderung.');
        return Object.freeze({ counter: one(init, 1, true), hardware: one(init, 2, true), softDevices: Object.freeze(softDevices) });
    }
    function text(bytes) {
        let value = ''; for (const byte of bytes) value += String.fromCharCode(byte); return value;
    }
    // Bound all advertised expansion BEFORE JSZip decompresses/checks CRCs.
    function inspect(bytes) {
        requireThat(bytes.length >= 22 && bytes.length <= MAX_ZIP, 'ZIP ist leer oder zu groß.');
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        let end = -1;
        for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); --p) {
            if (view.getUint32(p, true) === 0x06054b50 && p + 22 + view.getUint16(p + 20, true) === bytes.length) { end = p; break; }
        }
        requireThat(end >= 0, 'Kein vollständiges ZIP-Verzeichnis.');
        const count = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true), start = view.getUint32(end + 16, true);
        requireThat(view.getUint16(end + 4, true) === 0 && view.getUint16(end + 6, true) === 0 && view.getUint16(end + 8, true) === count,
            'Mehrteilige ZIP-Dateien werden nicht unterstützt.');
        requireThat(count > 0 && count <= 8 && start + size === end, 'Unzulässige ZIP-Struktur.');
        const entries = new Map(), spans = []; let p = start, expanded = 0;
        for (let i = 0; i < count; ++i) {
            requireThat(p + 46 <= end && view.getUint32(p, true) === 0x02014b50, 'Beschädigter ZIP-Eintrag.');
            const flags = view.getUint16(p + 8, true), method = view.getUint16(p + 10, true);
            const packed = view.getUint32(p + 20, true), unpacked = view.getUint32(p + 24, true);
            const nl = view.getUint16(p + 28, true), extra = view.getUint16(p + 30, true), comment = view.getUint16(p + 32, true);
            const local = view.getUint32(p + 42, true);
            requireThat(p + 46 + nl + extra + comment <= end && nl > 0 && nl <= 128, 'Ungültiger ZIP-Dateiname.');
            const name = text(bytes.subarray(p + 46, p + 46 + nl));
            requireThat(/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(name) && !entries.has(name.toLowerCase()), 'Mehrdeutiger oder unzulässiger ZIP-Dateiname.');
            requireThat((flags & 0x41) === 0 && (method === 0 || method === 8) && view.getUint16(p + 34, true) === 0, 'Nicht unterstütztes ZIP-Format.');
            expanded += unpacked;
            requireThat(packed <= MAX_ZIP && unpacked <= MAX_CONTENT && expanded <= MAX_CONTENT, 'Entpackter Inhalt ist zu groß.');
            requireThat(local + 30 <= start && view.getUint32(local, true) === 0x04034b50, 'Lokaler ZIP-Header fehlt.');
            const lnl = view.getUint16(local + 26, true), lextra = view.getUint16(local + 28, true), payload = local + 30 + lnl + lextra;
            requireThat(payload + packed <= start && lnl === nl && text(bytes.subarray(local + 30, local + 30 + lnl)) === name &&
                view.getUint16(local + 6, true) === flags && view.getUint16(local + 8, true) === method, 'ZIP-Header widersprechen sich.');
            if (!(flags & 8)) requireThat(view.getUint32(local + 14, true) === view.getUint32(p + 16, true) &&
                view.getUint32(local + 18, true) === packed && view.getUint32(local + 22, true) === unpacked, 'ZIP-Größen oder Prüfsummen widersprechen sich.');
            if (method === 0) requireThat(packed === unpacked, 'Ungültige Größe für unkomprimierten Inhalt.');
            spans.push([local, payload + packed]); entries.set(name.toLowerCase(), { name, size: unpacked, crc: view.getUint32(p + 16, true) });
            p += 46 + nl + extra + comment;
        }
        spans.sort((a,b) => a[0] - b[0]);
        requireThat(p === end && spans.every((span,i) => !i || spans[i-1][1] <= span[0]), 'Überlappende ZIP-Einträge.');
        return entries;
    }
    async function asBytes(input) {
        const size = input?.size ?? input?.byteLength;
        requireThat(Number.isInteger(size) && size > 0 && size <= MAX_ZIP, 'Firmware-Paket ist leer oder zu groß.');
        if (typeof input.arrayBuffer === 'function') return new Uint8Array(await input.arrayBuffer());
        if (input instanceof ArrayBuffer) return new Uint8Array(input.slice(0));
        if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
        throw new Error('Nicht unterstützte Firmware-Datei.');
    }
    function readEntry(zip, entry) {
        return new Promise((resolve, reject) => {
            const file = zip.file(entry.name);
            if (!file) { reject(new Error('ZIP-Datei fehlt: ' + entry.name)); return; }
            const stream = file.internalStream('uint8array');
            const chunks = []; let size = 0, crc = 0, settled = false;
            const fail = error => { if (!settled) { settled = true; stream.pause(); chunks.length = 0; reject(error); } };
            stream.on('data', chunk => {
                if (settled) return;
                size += chunk.length;
                if (size > entry.size) { fail(new Error('Entpackter Inhalt überschreitet die angegebene Größe.')); return; }
                crc = CRC32.buf(chunk, crc); chunks.push(chunk);
            });
            stream.on('error', fail);
            stream.on('end', () => {
                if (settled) return;
                if (size !== entry.size || (crc >>> 0) !== entry.crc) { fail(new Error('ZIP-Prüfsumme oder Größe stimmt nicht.')); return; }
                settled = true; const result = new Uint8Array(size); let offset = 0;
                for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
                resolve(result.buffer);
            });
            stream.resume();
        });
    }
    class Package {
        constructor(buffer) { this.buffer = buffer; this.image = null; }
        async load() {
            this.image = null;
            const bytes = await asBytes(this.buffer), entries = inspect(bytes);
            const manifestEntry = entries.get('manifest.json');
            requireThat(manifestEntry?.name === 'manifest.json' && manifestEntry.size > 0 && manifestEntry.size <= 4096, 'manifest.json fehlt oder ist zu groß.');
            // CRCs are checked below while bounded streams are consumed. The
            // eager JSZip check would inflate all entries before our limits.
            const zip = await JSZip.loadAsync(bytes, { checkCRC32: false, createFolders: false });
            const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readEntry(zip, manifestEntry))).manifest;
            requireThat(manifest && typeof manifest === 'object' && !Array.isArray(manifest) &&
                Object.keys(manifest).length === 1 && Object.hasOwn(manifest, 'application'),
                'Hier ist ausschließlich ein Anwendungs-OTA-Paket erlaubt; kein Gesamtarchiv, Bootloader oder SoftDevice.');
            const entry = manifest.application;
            requireThat(entry && typeof entry === 'object' && typeof entry.dat_file === 'string' && typeof entry.bin_file === 'string', 'Unvollständiger Anwendungseintrag.');
            const init = entries.get(entry.dat_file.toLowerCase()), app = entries.get(entry.bin_file.toLowerCase());
            requireThat(init?.name === entry.dat_file && app?.name === entry.bin_file && init.name !== app.name &&
                /\.dat$/i.test(init.name) && /\.bin$/i.test(app.name), 'Anwendungsdateien fehlen oder sind mehrdeutig.');
            requireThat(entries.size === 3 && init.size > 0 && init.size <= 4096 && app.size > 0 && app.size <= MAX_APPLICATION,
                'Paketgröße oder zusätzliche Dateien passen nicht zu diesem LCD-Anwendungs-OTA.');
            const initData = await readEntry(zip, init), imageData = await readEntry(zip, app);
            requireThat(initData.byteLength === init.size && imageData.byteLength === app.size, 'Entpackte Größen stimmen nicht.');
            const target = await requirements(initData, imageData);
            this.image = Object.freeze({ type: 'application', initFile: init.name, imageFile: app.name, initData, imageData, target });
            return this;
        }
        async getAppImage() {
            requireThat(this.image !== null, 'Paket wurde nicht erfolgreich geprüft.');
            return { ...this.image, initData: this.image.initData.slice(0), imageData: this.image.imageData.slice(0) };
        }
        async getBaseImage() { return undefined; }
    }
    return Package;
}));
