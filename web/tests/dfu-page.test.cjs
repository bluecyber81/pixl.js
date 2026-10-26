const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../public/dfu/web.html'),'utf8');
function harness(supported=true){
    const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],{disabled:m[1]==='button',hidden:false,textContent:'',events:{},addEventListener(n,fn){this.events[n]=fn;}}]));
    const windowEvents={},calls=[];let options,instance;
    class FakeUpdater{constructor(o){options=o;instance=this;this.busy=false;}setPackage(f){calls.push(['package',f]);}selectDevice(){calls.push(['select']);}}
    const context=vm.createContext({document:{getElementById:id=>nodes.get(id)},navigator:{bluetooth:supported?{requestDevice(){}}:undefined},isSecureContext:supported,
        window:{addEventListener:(n,fn)=>windowEvents[n]=fn},AllmiiboDfuUpdater:FakeUpdater,SecureDfuPackage:class{},SecureDfu:class{},CRC32:{buf(){}}});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/dfu/page.js'),'utf8'),context);
    return {nodes,windowEvents,calls,get options(){return options;},get updater(){return instance;}};
}
test('page binds one click to device selection and one file event to package load',()=>{
    const h=harness();h.nodes.get('file').files=['selected'];h.nodes.get('file').events.change();h.nodes.get('button').events.click();
    assert.deepEqual(h.calls,[['package','selected'],['select']]);
});
test('page locks changing package while busy and disables unsupported Bluetooth',()=>{
    for(const supported of [true,false]){const h=harness(supported);h.options.onState({busy:true,ready:false});assert.equal(h.nodes.get('file').disabled,true);
        assert.equal(h.nodes.get('button').disabled,true);h.options.onState({busy:false,ready:true});assert.equal(h.nodes.get('file').disabled,false);
        assert.equal(h.nodes.get('button').disabled,!supported);}
});
test('progress clamps invalid values and unload warning only applies while running',()=>{
    const h=harness();h.options.onProgress({object:'firmware',currentBytes:900,totalBytes:100});assert.equal(h.nodes.get('progress').value,100);
    h.options.onProgress({currentBytes:0,totalBytes:0});assert.equal(h.nodes.get('progress').hidden,true);
    let stopped=0;const e={preventDefault(){stopped++;}};h.windowEvents.beforeunload(e);assert.equal(stopped,0);
    h.updater.busy=true;h.windowEvents.beforeunload(e);assert.equal(stopped,1);
});
test('all scripts/styles are bundled locally and order includes CRC before bounded package loader',()=>{
    const resources=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m=>m[1]);
    for(const resource of resources){assert.ok(!/^(https?:|\/\/)/.test(resource));assert.ok(fs.existsSync(path.join(__dirname,'../public/dfu',resource)),resource);}
    assert.ok(html.indexOf('vendor/crc32.js')<html.indexOf('src="package.js"'));
    assert.ok(html.indexOf('src="secure-dfu.js"')<html.indexOf('src="page.js"'));
});
