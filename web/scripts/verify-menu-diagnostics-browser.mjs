// Run from web/ with the dist directory from vite build and a private evidence directory.
// PLAYWRIGHT_MODULE and CHROME_EXECUTABLE may point to an installed browser runtime.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {preview} from 'vite';
import {diagnosticSnapshot} from '../tests/fixtures/diagnostic-overview-data.mjs';

const [dist, evidence] = process.argv.slice(2);
assert.ok(dist && evidence, 'Usage: node scripts/verify-menu-diagnostics-browser.mjs <dist> <evidence-directory>');
await fs.access(path.join(dist, 'index.html'));
await fs.mkdir(evidence, {recursive: true});
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const server = await preview({base:'/', build:{outDir:path.resolve(dist)}, preview:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});
const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
let browser;
try {
  browser = await chromium.launch({headless:true, ...(process.env.CHROME_EXECUTABLE ? {executablePath:process.env.CHROME_EXECUTABLE} : {})});
  const snapshot = diagnosticSnapshot();
  snapshot.sections.menu = {state:'available',observedAt:snapshot.completedAt,errorCode:null,data:{
    schemaVersion:1,scope:'first-main-menu-since-restart',menuEntered:true,selectionAttempted:true,launcherReturned:true,
    targetActive:true,leftBeforeSelection:false,countsSaturated:false,targetAppId:2,launchCallMilliseconds:137,
    centerCounts:{press:1,release:1,short:1},
  }};
  const results=[];
  for (const width of [320,390,1280]) {
    for (const locale of ['de_DE','en']) {
      const de=locale==='de_DE', context=await browser.newContext({viewport:{width,height:840},serviceWorkers:'block'});
      try {
        const page=await context.newPage(), errors=[];
        page.on('pageerror', error=>errors.push(error.message));
        await page.route('**/*',route=>route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
        await page.addInitScript(()=>{
          Object.defineProperty(navigator,'bluetooth',{value:{requestDevice(){throw new Error('Hardware unavailable in fixture');}}});
          Object.defineProperty(navigator,'clipboard',{value:{async writeText(value){window.__fixtureClipboard=value;}}});
        });
        await page.goto(origin);
        await page.locator('.version-context').waitFor();
        await page.evaluate(({snapshot,locale})=>{
          const app=document.querySelector('#app')._vnode.component.proxy;
          Object.assign(app,{connected:true,firmwareVersion:'2.22.0-DE3.70',fullDiagnosticSnapshot:snapshot,language:locale});
          app.$i18n.locale=locale; app.show_workspace('device');
        },{snapshot,locale});
        const menu=page.locator('[data-section="menu"]'); await menu.waitFor();
        const message=await menu.innerText();
        assert.ok(message.includes(de?'Amiibo-Emulator':'Amiibo Emulator') && message.includes('137 ms') && message.includes('1 / 1 / 1'));
        assert.equal(await page.locator('.diagnostic-overview article').count(),9);
        const fits=await menu.evaluate(el=>el.scrollWidth<=el.clientWidth+1 &&
          el.getBoundingClientRect().right<=window.innerWidth+1 && el.getBoundingClientRect().left>=-1 &&
          document.documentElement.scrollWidth<=document.documentElement.clientWidth+1);
        assert.ok(fits, 'Page or first-menu card overflows at '+width+'px in '+locale);
        await menu.screenshot({path:path.join(evidence,'menu-'+locale+'-'+width+'.png')});
        await page.getByRole('button',{name:de?'Gesamtdiagnose speichern':'Save combined diagnostics',exact:true}).click();
        const body=await page.locator('#diagnostic-json').inputValue();
        assert.deepEqual(JSON.parse(body).diagnosticSnapshot.sections.menu.data,snapshot.sections.menu.data);
        await page.getByRole('button',{name:de?'JSON kopieren':'Copy JSON',exact:true}).click();
        await page.waitForFunction(content=>window.__fixtureClipboard===content,body);
        const pending=page.waitForEvent('download');
        await page.getByRole('button',{name:de?'Browser-Download versuchen':'Try browser download',exact:true}).click();
        const download=await pending;
        assert.match(download.suggestedFilename(),de ? /^Allmiibo-Diagnose-.*\.json$/ : /^Allmiibo-Diagnostics-.*\.json$/);
        assert.equal(await fs.readFile(await download.path(),'utf8'),body);
        assert.deepEqual(errors,[]);
        results.push({width,locale,cards:9,noHorizontalOverflow:true,clipboardStubAndDownloadedFileMatch:true});
      } finally { await context.close(); }
    }
  }
  const report={hardware:'synthetic fixture',browser:browser.version(),results};
  await fs.writeFile(path.join(evidence,'menu-browser.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  await new Promise(resolve=>server.httpServer.close(resolve));
}
