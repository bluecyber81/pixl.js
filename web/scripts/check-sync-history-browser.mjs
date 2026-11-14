import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { installReadOnlyPeripheral } from './check-device-search-csv-browser.mjs'

export async function checkSyncHistoryBrowser(browser, url) {
  const tmp = await mkdtemp(path.join(os.tmpdir(),'allmiibo-history-'))
  const folder = path.join(tmp, 'Collection'), filename = path.join(folder, 'Twin.bin')
  const context = await browser.newContext({locale:'de-DE',acceptDownloads:true,serviceWorkers:'block'})
  try {
    await mkdir(folder)
    await writeFile(filename,Buffer.from([1]))
    // The real browser download reads [3] through the actual file protocol. Writes
    // use the in-memory VFS adapter used by safeUpload contract tests.
    await context.addInitScript(installReadOnlyPeripheral,{files:{'E:/A/Twin.bin':[3]},capacity:{total:2097152,free:1000000}})
    await context.route('**/*', route=>new URL(route.request().url()).origin === new URL(url).origin ? route.continue():route.abort())
    const page=await context.newPage()
    const errors=[]
    page.on('pageerror',e=>errors.push(e.message))
    page.setDefaultTimeout(12000)
    await page.goto(url)
    await page.locator('.header-tools').getByRole('button',{name:'Verbinden',exact:true}).click()
    await page.locator('.version-context').getByText('2.22.0-DE3.66',{exact:true}).waitFor()
    await page.evaluate(async()=>{
      const { memoryVfs, metadata } = await import('/fixtures/memory-vfs.mjs')
      const vfs=window.historyFixture=memoryVfs()
      vfs.nodes.set('E:/A',{type:1,meta:metadata()})
      vfs.put('E:/A/Twin.bin',[1])
      const app=document.querySelector('#app')._vnode.component.proxy
      app.transfer_adapters=()=>vfs.api
      app.current_dir='E:/A'
      app.open_sync()
    })
    const dialog=page.getByRole('dialog').filter({has:page.locator('.sync-picker')})
    const selectFolder=()=>dialog.locator('input[webkitdirectory]').setInputFiles(folder)
    const compare=()=>dialog.getByRole('button',{name:'Vergleich nur lesend erstellen',exact:true}).click()
    const save=dialog.getByRole('button',{name:'Vergleichsstand speichern',exact:true})
    await selectFolder(); await compare()
    const [download]=await Promise.all([page.waitForEvent('download'),save.click()])
    const receipt=path.join(tmp,download.suggestedFilename())
    await download.saveAs(receipt)
    const initial=JSON.parse(await readFile(receipt,'utf8'))
    assert.deepEqual(initial.files.map(row=>row.slice(0,2)),[['Twin.bin',1]])
    await writeFile(filename,Buffer.from([2]))
    await page.evaluate(()=>window.historyFixture.put('E:/A/Twin.bin',[3]))
    await selectFolder()
    const reference=dialog.locator('input[accept=".json"]')
    await reference.setInputFiles(receipt); await compare()
    const row=dialog.locator('.sync-entry').filter({hasText:'Beide Fassungen wurden geändert'})
    const selection=row.getByRole('checkbox')
    await row.waitFor()
    assert.equal(await selection.isChecked(),false)
    await dialog.getByRole('button',{name: /Nur neue/}).click()
    assert.equal(await selection.isChecked(),false)
    const [deviceDownload]=await Promise.all([page.waitForEvent('download'),row.getByRole('button',{name:'Geräteversion speichern'}).click()])
    assert.equal(deviceDownload.suggestedFilename(),'Twin-Allmiibo.bin')
    assert.deepEqual([...await readFile(await deviceDownload.path())],[3])
    assert.deepEqual([...await readFile(filename)],[2])
    await selection.check()
    // Loading a reference must invalidate every checkbox from the previous plan.
    await reference.setInputFiles(receipt)
    await dialog.locator('.sync-plan').waitFor({state:'detached'})
    assert.equal(await save.count(),0)
    await compare(); await row.waitFor()
    assert.equal(await selection.isChecked(),false)
    await selection.check()
    const transfer=dialog.getByRole('button',{name:/1 ausgewählte/})
    const confirm=page.locator('.el-message-box:visible .el-button--primary')
    // Intervening metadata change invalidates the preview without advancing the receipt.
    await page.evaluate(()=>{window.historyFixture.nodes.get('E:/A/Twin.bin').meta.notes='updated'})
    await transfer.click(); await confirm.click()
    await dialog.locator('.sync-plan').waitFor({state:'detached'})
    assert.equal(await save.count(),0)
    assert.deepEqual(await page.evaluate(()=>window.historyFixture.bytes('E:/A/Twin.bin')),[3])
    await compare(); await row.waitFor(); await selection.check()
    await transfer.click(); await confirm.click(); await save.waitFor()
    assert.deepEqual(await page.evaluate(()=>window.historyFixture.bytes('E:/A/Twin.bin')),[2])
    const [updated]=await Promise.all([page.waitForEvent('download'),save.click()])
    const final=JSON.parse(await readFile(await updated.path(),'utf8'))
    assert.equal(final.binding,initial.binding); assert.notEqual(final.files[0][2],initial.files[0][2])
    assert.deepEqual(await page.evaluate(()=>window.testPeripheral.violations),[])
    assert.deepEqual(errors,[])
    return {feature:'folder comparison reference export/import, both copies changed, device download, no automatic selection, metadata race refused, deliberate verified upload',scope:'Chrome, synthetic peripheral and in-memory write adapter'}
  } finally { await context.close(); await rm(tmp,{recursive:true,force:true}) }
}
