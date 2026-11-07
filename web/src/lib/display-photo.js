const width = 128;
const height = 64;
const pages = height / 8;

export function supportsDisplayPhoto(firmwareVersion) {
    const match = /^2\.22\.0-DE3\.(\d+)$/.exec(firmwareVersion || '');
    return !!match && Number(match[1]) >= 66;
}

export function parseDisplayPage(buffer, page) {
    const bytes = new Uint8Array(buffer);
    if (bytes.length !== 168 || bytes[0] !== 80 || bytes[1] !== 88 || bytes[2] !== 76 ||
        bytes[3] !== 67 || bytes[4] !== 1 || bytes[5] !== page || bytes[6] !== width || bytes[7] !== height) {
        throw new Error('Invalid LCD page');
    }
    return { digest: bytes.slice(8, 40), pixels: bytes.slice(40) };
}

// All eight pages must belong to the same picture. A repaint permits one
// fresh attempt. Never export a mixture or silently poll a changing screen.
export async function captureDisplayPhoto(readPage, checkSession) {
    for (let attempt = 0; attempt < 2; attempt++) {
        let expected;
        const pixels = new Uint8Array(width * pages);
        for (let page = 0; page < pages; page++) {
            checkSession();
            const part = await readPage(page);
            checkSession();
            if (part === null) return null;
            if (page === 0) expected = part.digest;
            if (!expected.every((byte, i) => byte === part.digest[i])) break;
            pixels.set(part.pixels, page * width);
            if (page === pages - 1) {
                const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', pixels));
                checkSession();
                if (!expected.every((byte, i) => byte === digest[i])) throw new Error('Invalid LCD digest');
                return pixels;
            }
        }
    }
    throw Object.assign(new Error('LCD changed during capture'), {code: 'LCD_CHANGED'});
}

// The ST7567 stores eight vertical pixels per byte, least significant bit at the top.
export function renderDisplayPhoto(pixels, canvas) {
    if (pixels.length !== width * pages) throw new Error('Invalid LCD pixel count');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const color = pixels[(y >> 3) * width + x] & (1 << (y % 8)) ? 0 : 255;
            const index = 4 * (y * width + x);
            image.data[index] = image.data[index + 1] = image.data[index + 2] = color;
            image.data[index + 3] = 255;
        }
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png');
}
