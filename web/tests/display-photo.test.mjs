import test from 'node:test';
import assert from 'node:assert/strict';
import { captureDisplayPhoto, parseDisplayPage, renderDisplayPhoto } from '../src/lib/display-photo.js';

function mockDisplay(value) {
    const pixels = new Uint8Array(1024).fill(value);
    return crypto.subtle.digest('SHA-256', pixels).then(hash => page =>
        parseDisplayPage(Uint8Array.from([80,88,76,67,1,page,128,64,...new Uint8Array(hash),...pixels.subarray(128*page,128*(page+1))]), page));
}

test('frame change retries from page zero and only delivers the complete new image', async () => {
    const a = await mockDisplay(11), b = await mockDisplay(22);
    const requested = [];
    const pixels = await captureDisplayPhoto(async page => {
        requested.push(page);
        return requested.length < 3 ? a(page) : b(page);
    }, () => {});
    assert.deepEqual(requested, [0,1,2,0,1,2,3,4,5,6,7]);
    assert.deepEqual(pixels, new Uint8Array(1024).fill(22));
});

test('continual redraw stops after two attempts and corrupted bytes and stale sessions never become photos', async () => {
    const a = await mockDisplay(0), b = await mockDisplay(255);
    let count = 0;
    await assert.rejects(captureDisplayPhoto(async page => { count++; return page ? a(page) : b(page); }, () => {}), {code:'LCD_CHANGED'});
    assert.equal(count, 4);
    await assert.rejects(captureDisplayPhoto(async page => {
        const part = a(page); if (page === 7) part.pixels[127] ^= 1; return part;
    }, () => {}), /digest/);
    let current = true; count = 0;
    await assert.rejects(captureDisplayPhoto(async page => {count++; current = false; return a(page);},
        () => { if (!current) throw new Error('stale'); }), /stale/);
    assert.equal(count, 1);
});

test('unexpected payloads are rejected and the browser draws the physical LCD pixel orientation', () => {
    const good = new Uint8Array(168); good.set([80,88,76,67,1,7,128,64]);
    for (const index of [0,1,2,3,4,5,6,7]) {
        const copy = good.slice(); copy[index] ^= 1; assert.throws(()=>parseDisplayPage(copy,7));
    }
    assert.throws(()=>parseDisplayPage(good.subarray(0,167),7));
    const pixels = new Uint8Array(1024); pixels[0] = 0x81; pixels[128] = 1; pixels[1023] = 0x80;
    let rendered;
    const canvas = {
        getContext: () => ({createImageData: (w,h) => ({data:new Uint8ClampedArray(w*h*4)}),putImageData: frame => {rendered = frame.data;}}),
        toDataURL: type => type
    };
    assert.equal(renderDisplayPhoto(pixels,canvas),'image/png');
    assert.deepEqual([canvas.width,canvas.height],[128,64]);
    const dark = [];
    for (let i = 0; i < 8192; i++) {
        if (rendered[i*4] === 0) dark.push(i);
        assert.equal(rendered[i*4+3],255);
    }
    assert.deepEqual(dark,[0,7*128,8*128,8191]);
});
