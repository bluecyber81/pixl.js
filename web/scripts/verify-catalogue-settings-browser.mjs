// Serve an existing build only inside an isolated Playwright context. Pass the dist directory.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const target = new URL('http://127.0.0.1/');
const dist = path.resolve(process.argv[2]);
await fs.access(path.join(dist, 'index.html'));
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ headless:true, executablePath:process.env.CHROME_EXECUTABLE });
const id = '0000000000000002', source = 'https://files.example.com/Figur.bin?access=a%2Fb';
const bundle = links => JSON.stringify({format:'allmiibo.figure-links',version:1,count:links.length,links});
async function press(control) { await control.focus(); await control.press('Enter'); }
async function selectLanguage(page, en) {
  if ((await page.locator('.workspace-nav [aria-controls="catalogue-workspace"] strong').innerText()) === (en ? 'Figure catalogue' : 'Figurenkatalog')) return;
  await page.locator('.header-language button').click();
  await page.getByRole('menuitem', { name: en ? 'English' : 'Deutsch', exact: true }).click();
}
async function openCatalogue(page) {
  await press(page.locator('.workspace-nav [aria-controls="catalogue-workspace"]'));
  const toggle = page.locator('.catalogue-toggle');
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await press(toggle);
  await page.locator('.catalogue').waitFor();
}
try {
  for (const en of [false,true]) {
    const ctx = await browser.newContext({ viewport:{width:320,height:760}, locale:en ? 'en-GB' : 'de-DE', serviceWorkers:'block' });
    const page = await ctx.newPage(); page.setDefaultTimeout(6000);
    const remote = [];
    await page.route('**/*', r => {
      const url = new URL(r.request().url());
      if (url.origin === target.origin) {
        const file = path.resolve(dist, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
        assert.ok(file.startsWith(dist + path.sep));
        return r.fulfill({path:file}).catch(() => r.fulfill({status:404,body:''}));
      }
      remote.push(r.request().url()); return r.abort();
    });
    await page.addInitScript(() => {
      window.testDeviceRequests=0;
      Object.defineProperty(navigator,'bluetooth',{configurable:true,value:{requestDevice(){window.testDeviceRequests++;throw Error('Unexpected requestDevice');}}});
    });
    await page.goto(target.href);
    await selectLanguage(page,en);
    await openCatalogue(page);
    const cat=page.locator('.catalogue'), search=cat.locator('.search-field input');
    const favorite=cat.locator('button.web-favorite').first(), prefs=cat.locator('.saved-filters');
    const favOnly=prefs.locator('input[type=checkbox]');
    await search.fill(id); await press(favorite);
    await page.waitForFunction(() => document.querySelector('.web-favorite')?.getAttribute('aria-pressed')==='true');
    await press(prefs.locator('summary')); await favOnly.focus(); await favOnly.press('Space');
    await prefs.locator('input[type=text]').fill('Mario 01'); await press(prefs.locator('button[type=submit]'));
    await prefs.locator('select option[value="Mario 01"]').waitFor({state:'attached'});
    await press(cat.locator('.reset-filters'));
    await prefs.locator('select').selectOption('Mario 01');
    await press(prefs.getByRole('button',{name:en?'Apply filter':'Filter anwenden',exact:true}));
    assert.equal(await search.inputValue(),id); assert.ok(await favOnly.isChecked());
    assert.equal(await cat.locator('.entries > li').count(),1);
    assert.equal(await cat.locator('.entries > li').first().getAttribute('data-presence'),'unknown');
    const linkPanel=cat.locator('.link-settings');
    await press(linkPanel.locator(':scope > summary'));
    const pick = links => linkPanel.locator('input[type=file]').setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(bundle(links))});
    await pick([{id,url:source},{id,url:source+'x'}]);
    await linkPanel.locator('.link-preview > p[role=status]').waitFor();
    assert.equal(await linkPanel.getByRole('button',{name:/Links übernehmen|Apply links/}).count(),0);
    await pick([{id,url:source}]);
    await press(linkPanel.locator('.link-preview > details > summary'));
    assert.ok((await linkPanel.locator('li').first().innerText()).includes(source));
    await press(linkPanel.getByRole('button',{name:/Links übernehmen|Apply links/}));
    await cat.locator('.figure-name').waitFor();
    assert.equal(await page.evaluate(()=>window.testDeviceRequests),0);
    const exp=page.waitForEvent('download');
    await press(linkPanel.getByRole('button',{name:en?'Save links as JSON':'Links als JSON speichern'}));
    assert.deepEqual(JSON.parse(await fs.readFile(await (await exp).path(),'utf8')).links,[{id,url:source}]);
    await selectLanguage(page,!en);
    assert.equal(await search.inputValue(),id); assert.ok(await favOnly.isChecked());
    await page.reload(); await openCatalogue(page);
    await press(prefs.locator('summary')); await prefs.locator('select').selectOption('Mario 01');
    await press(prefs.getByRole('button',{name:/^Filter anwenden$|^Apply filter$/}));
    assert.equal(await search.inputValue(),id); assert.equal(await favorite.getAttribute('aria-pressed'),'true');
    await press(linkPanel.locator(':scope > summary')); await pick([{id,url:source+'b'}]);
    await press(linkPanel.locator('.link-preview > details > summary'));
    const geometry=await page.evaluate(()=>{
      const sizes=[...document.querySelectorAll('body *')].map(el=>[el,parseFloat(getComputedStyle(el).fontSize)]);
      for(const [el,size] of sizes) if(size>0) el.style.setProperty('font-size',size*2+'px','important');
      return {viewport:innerWidth,document:document.documentElement.scrollWidth,panels:[...document.querySelectorAll('.saved-filters,.link-settings,.link-preview')].map(el=>[el.clientWidth,el.scrollWidth])};
    });
    assert.ok(geometry.document<=geometry.viewport+1,JSON.stringify(geometry));
    assert.ok(geometry.panels.every(([client,scroll])=>scroll<=client+1),JSON.stringify(geometry));
    assert.deepEqual(remote,[]);
    console.log(JSON.stringify({language:en?'en':'de',viewport:320,textScale:2,keyboard:true,linkRoundTrip:true,favorites:true,filterRestore:true,externalRequests:remote.length,geometry}));
    await ctx.close();
  }
} finally { await browser.close(); }
