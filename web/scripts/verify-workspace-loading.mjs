import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { preview } from 'vite';

const [dist, output, mode] = process.argv.slice(2);
assert.ok(dist && output && ['baseline', 'candidate'].includes(mode), 'Supply dist, JSON output and baseline or candidate');
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const server = await preview({base:'/pixl.js/', build:{outDir:path.resolve(dist)}, preview:{host:'127.0.0.1',port:0},logLevel:'error'});
const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE});
const checks = [
  ['backup-workspace','.migration-panel','MigrationAssistant'],
  ['remote-workspace','.remote-control','RemoteControl'],
  ['update-workspace','.update-check','UpdateCheck'],
  ['device-overview','.diagnostic-overview','DiagnosticOverview'],
  ['catalogue-workspace','.collection-assistant','CollectionAssistant']
];
const runs=[];
try {
  for (let i=0;i<3;i++) {
    const context=await browser.newContext({viewport:{width:390,height:844},locale:'de-DE',serviceWorkers:'block'});
    try {
      const page=await context.newPage();
      const cdp=await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
      await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:1250000,uploadThroughput:625000});
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
      await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/pixl.js/');
      await page.locator('.workspace-nav').waitFor();
      await page.waitForLoadState('networkidle');
      const measurements=await page.evaluate(()=>({
        js:performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname.endsWith('.js')).map(e=>new URL(e.name).pathname.slice('/pixl.js/'.length)).sort(),
        firstContentfulPaintMs:performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
        lastStartupScriptMs:Math.max(...performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname.endsWith('.js')).map(e=>e.responseEnd))
      }));
      measurements.rawJsBytes=0; measurements.gzipJsBytes=0;
      for(const name of measurements.js) {
        const bytes=await fs.readFile(path.join(dist,name));
        measurements.rawJsBytes+=bytes.length;
        measurements.gzipJsBytes+=gzipSync(bytes,{level:9}).length;
      }
      if(mode==='candidate') for(const [, ,chunk] of checks) assert.ok(!measurements.js.some(name=>path.basename(name).startsWith(chunk+'-')),chunk);
      const migration = page.locator('.migration-panel');
      for(const [id,selector] of checks) {
        await page.locator('.workspace-nav [aria-controls="'+id+'"]').click();
        await page.locator('#'+id+' '+selector).first().waitFor();
        if(id==='backup-workspace') await migration.locator('summary').first().click();
      }
      await page.locator('.workspace-nav [aria-controls="backup-workspace"]').click();
      assert.ok(await migration.evaluate(el=>el.open),'Preserve the open migration panel when returning');
      runs.push(measurements);
    } finally { await context.close(); }
  }
  await fs.writeFile(output,JSON.stringify({mode,environment:'Chrome; 390x844; 4x CPU; 40 ms; 10 Mbit/s; cold browser context; local build',runs},null,2));
  console.log(runs.map(({js,...rest})=>({scripts:js.length,...rest})));
} finally {await browser.close();await server.close();}
