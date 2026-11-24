import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {STREAM_UUIDS, encodeStreamFrame} from '../src/lib/ble-image-stream.js';

const site = new URL(process.argv[2]);
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_EXECUTABLE});
try {
  for (const [locale, width] of [['de-DE',390], ['en-US',1280]]) {
    const german = locale === 'de-DE';
    const context = await browser.newContext({locale, viewport:{width,height:850}, serviceWorkers:'block'});
    await context.addInitScript(({write,notify})=>{
      const device=new EventTarget(), rx=new EventTarget(), chunks=[];
      window.senderTestChunks=chunks;
      const tx={properties:{writeWithoutResponse:true},async writeValueWithoutResponse(data){
        chunks.push(Array.from(data));
        const reply=new TextEncoder().encode(chunks.length===1?'ACK1\n':'OK\n');
        rx.value=new DataView(reply.buffer);rx.dispatchEvent(new Event('characteristicvaluechanged'));
      }};
      rx.startNotifications=async()=>rx;
      const service={async getCharacteristic(uuid){if(uuid===write)return tx;if(uuid===notify)return rx;throw Error('Unexpected characteristic');}};
      device.name='Pixl.js';
      device.gatt={connected:false,async connect(){this.connected=true;return {getPrimaryService:async()=>service};},disconnect(){this.connected=false;device.dispatchEvent(new Event('gattserverdisconnected'));}};
      Object.defineProperty(navigator,'bluetooth',{value:{requestDevice:async()=>device},configurable:true});
    },STREAM_UUIDS);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', route => new URL(route.request().url()).origin === site.origin ? route.continue() : route.abort());
    try {
      await page.goto(site.href);
      await page.locator('button[aria-controls="stream-workspace"]').click();
      const sender = page.locator('.image-sender');
      await sender.getByRole('button',{name:german?'Lauftext':'Scrolling text',exact:true}).click();
      const input = sender.getByRole('textbox');
      await input.fill('Grüße — Hello, Allmiibo!');
      await context.setOffline(true);
      const preview = sender.locator('canvas');
      const screenshot = () => preview.evaluate(el => el.toDataURL());
      const first = await screenshot();
      await sender.getByRole('button',{name:german?'Vorschau abspielen':'Play preview'}).click();
      await page.waitForFunction(data => document.querySelector('.stream-preview').toDataURL() !== data,first);
      await sender.getByRole('button',{name:german?'Vorschau anhalten':'Pause preview'}).click();
      await sender.locator('.stream-export summary').click();
      const exportButton = sender.getByRole('button',{name:german?'Player-Datei erstellen':'Create player file'});
      await exportButton.click();
      const link = sender.locator('.stream-export-download a');
      await link.waitFor();
      assert.equal(await link.getAttribute('download'),'ticker_lcd.bin');
      const data = await link.evaluate(async a => Array.from(new Uint8Array(await (await fetch(a.href)).arrayBuffer())));
      const bytes = Buffer.from(data), frames = bytes.readUInt16LE(4);
      assert.equal(bytes.readUInt32LE(0),0x50495856);
      assert.equal(bytes.readUInt16LE(8),128);
      assert.equal(bytes.readUInt16LE(10),64);
      assert(frames > 2 && frames <= 1023);
      assert.equal(bytes.length,16+1024*frames);
      const expected = await preview.evaluate(async(_,url)=>{
        const image = new Image();image.src=url;await image.decode();
        const canvas = document.createElement('canvas');canvas.width=128;canvas.height=64;
        const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
        const pixels=ctx.getImageData(0,0,128,64).data, frame=new Uint8Array(1024);
        for(let i=0;i<128*64;++i)if(pixels[4*i]===0)frame[i>>3]|=1<<(i&7);
        return Array.from(frame);
      },first);
      assert.deepEqual(bytes.subarray(16,1040),Buffer.from(expected));
      assert(bytes.subarray(16,1040).some(v=>v!==255));
      assert(!bytes.subarray(16,1040).equals(bytes.subarray(1040,2064)));
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      const connect = sender.getByRole('button',{name:german?'Mit Bildempfang verbinden':'Connect image receiver'});
      await connect.click();
      await sender.getByRole('button',{name:german?'Lauftext senden':'Send scrolling text'}).click();
      await page.waitForFunction(()=>Number(document.querySelector('.stream-stats strong')?.textContent)>=2);
      await sender.getByRole('button',{name:german?'Senden stoppen':'Stop sending'}).click();
      const chunks=await page.evaluate(()=>window.senderTestChunks);
      assert.equal(Buffer.from(chunks[0]).toString(),'PXSTREAM:ACK1\n');
      const packet=encodeStreamFrame(bytes.subarray(16,1040),null,{forceKeyframe:true}).packet;
      assert.deepEqual(Buffer.from(chunks.slice(1).flat()).subarray(0,packet.length),Buffer.from(packet));
      await input.fill('  ');
      assert.equal(await link.count(),0);
      assert(await exportButton.isDisabled());
      assert.deepEqual(errors,[]);
      console.log(locale,width+'px',frames+' frames',bytes.length+' bytes; offline PIXV, preview and simulated Bluetooth first frame match');
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
