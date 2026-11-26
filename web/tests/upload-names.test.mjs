import test from 'node:test'
import assert from 'node:assert/strict'
import {uploadNameTree,reviewUploadNames} from '../src/lib/upload-names.js'
import {createSyncPlan,createSyncJob,executeSyncJob} from '../src/lib/sync-plan.js'
import {safeUpload} from '../src/lib/safe-upload.js'
import {memoryVfs,localFile,metadata} from './helpers/memory-vfs.mjs'

const source = (path, bytes) => ({relativePath:path,file:localFile(path.split('/').at(-1),bytes)})
const options = (vfs,files) => ({...vfs.api,deviceKey:'test',rootPath:'E:/tags',files})
test('directory rename repairs all descendants, places the original files on the chosen paths and skips an entire branch',async()=>{
  const folder='Ä'.repeat(24), inputs=[source(folder+'/Link.bin',[1]),source(folder+'/Zelda.bin',[2]),source('Test/skip.bin',[3])]
  const nodes=uploadNameTree(inputs), review=edits=>reviewUploadNames('E:/tags',nodes,edits,inputs)
  const initial=review({})
  assert.equal(initial.problems,1)
  assert.equal(initial.rows[0].error.code,'NAME_LIMIT')
  assert.equal(initial.rows[0].error.bytes,48)
  assert.deepEqual(initial.files,[])
  const skipId=nodes.find(node=>node.source==='Test').id
  const fixed=review({0:{name:'Zelda'},[skipId]:{skipped:true}})
  assert.equal(fixed.problems,0)
  assert.equal(fixed.included,2)
  assert.deepEqual(fixed.files.map(entry=>entry.relativePath),['Zelda/Link.bin','Zelda/Zelda.bin'])
  assert.equal(fixed.files[0].file,inputs[0].file)
  assert.equal(inputs[0].relativePath,folder+'/Link.bin')
  const vfs=memoryVfs(),opts=options(vfs,fixed.files)
  const plan=await createSyncPlan(opts)
  await executeSyncJob({...opts,plan,job:createSyncJob(plan),uploadFile:args=>safeUpload({...vfs.api,...args})})
  assert.deepEqual(vfs.bytes('E:/tags/Zelda/Link.bin'),[1])
  assert.deepEqual(vfs.bytes('E:/tags/Zelda/Zelda.bin'),[2])
  assert.equal(vfs.nodes.has('E:/tags/Test'),false)
})

test('case aliases and file/folder collisions are resolved per original entry; exact duplicates keep separate identities',()=>{
  const inputs=[source('Fox/a'),source('fox/b'),source('Fox'),source('Fox')],nodes=uploadNameTree(inputs)
  const review=edits=>reviewUploadNames('E:/tags',nodes,edits,inputs)
  const {rows}=review({})
  assert.equal(rows.filter(row=>row.error?.code==='NAME_COLLISION').length,4)
  const edited=review({[rows[2].id]:{name:'Wolf'},[rows[4].id]:{skipped:true},[rows[5].id]:{name:'Falco'}})
  assert.equal(edited.problems,0)
  assert.deepEqual(edited.files.map(entry=>entry.relativePath),['Fox/a','Wolf/b','Falco'])
  assert.equal(edited.files[0],inputs[0])
  assert.equal(edited.files[2].file,inputs[3].file)
})

test('path length, separators and reserved device roots stay subject to the normal rules; undo restores valid inputs',()=>{
  const inputs=[source('Names/file.bin')],nodes=uploadNameTree(inputs)
  const review=(root,edits)=>reviewUploadNames(root,nodes,edits,inputs)
  assert.equal(review('E:/'+ 'ä'.repeat(24),{0:{name:'Example'}}).rows[1].error.code,'PATH_LIMIT')
  assert.equal(review('E:/',{0:{name:'.pixl_txn123'}}).rows[0].error.code,'PATH_RESERVED')
  assert.equal(review('E:/',{1:{name:'../escape.bin'}}).rows[1].error.code,'NAME_INVALID')
  assert.equal(review('E:/',{1:{name:'e\u0301.bin'}}).rows[1].error.code,'NAME_NORMALIZATION')
  const skipped=review('E:/',{0:{name:'.pixl_txn123'},1:{skipped:true}})
  assert.equal(skipped.included,0)
  assert.equal(skipped.problems,0)
  const unchanged=review('E:/',{0:{name:'Names'},1:{skipped:false}})
  assert.equal(unchanged.adjusted,false)
  assert.equal(unchanged.files[0],inputs[0])
})

test('mapped local names still respect remote read-only parents and case aliases',async()=>{
  const inputs=[source('Local/Link.bin')],nodes=uploadNameTree(inputs)
  const vfs=memoryVfs();vfs.nodes.set('E:/tags/Locked',{type:1,meta:metadata(4)})
  for (const name of ['Locked','locked']) {
    const {files}=reviewUploadNames('E:/tags',nodes,{0:{name}},inputs)
    const plan=await createSyncPlan(options(vfs,files))
    assert.equal(plan.entries[0].status,'blocked')
    assert.equal(plan.entries[0].reason,'PARENT_BLOCKED')
  }
  assert.ok(!vfs.log.some(row=>['write','mkdir','rename','remove'].includes(row.op)))
})

test('suggestions keep UTF-8 characters and extensions and reserve selected sibling names', () => {
  const prefix = '😍'.repeat(10)
  const inputs = [source(prefix+'.BIN'), source(prefix+'😍'.repeat(4)+'one.bin'), source(prefix+'😍'.repeat(4)+'two.bin')]
  const nodes = uploadNameTree(inputs)
  const review = edits => reviewUploadNames('E:/collection', nodes, edits, inputs)
  const initial = review({})
  const [,one,two] = initial.rows
  assert.equal(initial.problems,2)
  for (const row of [one,two]) {
    assert.match(row.suggestion,/^(?:😍)+-\d+\.bin$/u)
    assert.ok(new TextEncoder().encode(row.suggestion).length <= 47)
  }
  assert.notEqual(one.suggestion,two.suggestion)
  const applied=review({1:{name:one.suggestion},2:{name:two.suggestion}})
  assert.equal(applied.problems,0)
  assert.deepEqual(applied.files.map(item=>item.relativePath),[inputs[0].relativePath,one.suggestion,two.suggestion])
})

test('a parent suggestion can repair a path too long to preserve the leaf extension', () => {
  const inputs = [source('LongDirectory/Figure.bin')]
  const nodes = uploadNameTree(inputs)
  const root = 'E:/' + 'x'.repeat(44)
  const initial = reviewUploadNames(root,nodes,{},inputs)
  assert.equal(initial.rows[1].error.code,'PATH_LIMIT')
  assert.ok(initial.rows[0].suggestion)
  assert.equal(reviewUploadNames(root,nodes,{0:{name:initial.rows[0].suggestion}},inputs).problems,0)
  assert.equal(initial.rows[1].suggestion,undefined)
  assert.equal(inputs[0].relativePath,'LongDirectory/Figure.bin')
})
