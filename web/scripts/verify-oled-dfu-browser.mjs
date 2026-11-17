// Exercise the published OLED ZIP with the production DFU parser and transport.
// The Nordic GATT endpoint and zero-delay yield scheduler are test doubles.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const [dist,base,report] = process.argv.slice(2);
assert.ok(dist && report && ['/', '/pixl.js/'].includes(base));
const root = path.resolve(dist);
const mime = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css'};
const server = createServer(async(req,res) => {
    try {
        const pathname = new URL(req.url,'http://127.0.0.1').pathname;
        assert.ok(pathname.startsWith(base));
        const file = path.resolve(root,pathname.slice(base.length)||'index.html');
        assert.ok(file.startsWith(root+path.sep));
        const content = await readFile(file);
        res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});
        res.end(content);
    } catch { res.writeHead(404);res.end(); }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin = 'http://127.0.0.1:'+server.address().port;
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE});
const packageId = 'de3.84-oled-t4-app';
const zip = 'Allmiibo_OLED_DE3_84_Test4_APP.zip';
const sha = '2ae048eab497e1e0dda54192b054fd2afd2628367a886b73cb8e09a9711e83a6';
const checks = [], errors = [];

function installNordicMock() {
    class Events {
        constructor() {this.listeners=new Map();}
        addEventListener(name,fn) {
            if(!this.listeners.has(name))this.listeners.set(name,new Set());
            this.listeners.get(name).add(fn);
        }
        removeEventListener(name,fn) {this.listeners.get(name)?.delete(fn);}
        emit(name,event={}) {for(const fn of this.listeners.get(name)||[])fn(event);}
    }
    const deferred = new Map();
    const channel = new MessageChannel();
    const originalTimeout = window.setTimeout.bind(window);
    const originalClear = window.clearTimeout.bind(window);
    let nextTask = -1;
    channel.port1.onmessage = ({data}) => {
        const task=deferred.get(data);
        deferred.delete(data);
        if(task)task();
    };
    window.setTimeout = (fn,delay,...args) => {
        if(delay!==0)return originalTimeout(fn,delay,...args);
        const id=nextTask--;
        deferred.set(id,()=>fn(...args));
        channel.port2.postMessage(id);
        return id;
    };
    window.clearTimeout = id => id<0 ? deferred.delete(id) : originalClear(id);
    const init = {bytes:[],crc:0xffffffff};
    const data = {bytes:[],crc:0xffffffff};
    const state = window.oledDfuProbe = {
        requests:0,connections:0,failOnce:false,failed:false,failAt:4140,
        writes:0,starts:[],creates:[],selected:1,executeAck:false,
        gattRequests:[],activeUserGesture:[],disconnects:0
    };
    const device=new Events(), control=new Events(), packet=new Events();
    device.name='pixl dfu';
    control.uuid='8ec90001-f315-4f60-9fb8-838830daea50';
    packet.uuid='8ec90002-f315-4f60-9fb8-838830daea50';
    control.properties={notify:true,write:true};
    packet.properties={writeWithoutResponse:true};
    control.startNotifications=async()=>control;
    const current=()=>state.selected===1?init:data;
    const checksum=store=>(store.crc^0xffffffff)>>>0;
    function append(store,value) {
        for(const byte of value) {
            store.bytes.push(byte);
            store.crc^=byte;
            for(let i=0;i<8;i++)store.crc=(store.crc>>>1)^((store.crc&1)?0xedb88320:0);
        }
    }
    function reply(op,values=new Uint8Array()) {
        control.value=new DataView(Uint8Array.from([0x60,op,1,...values]).buffer);
        control.emit('characteristicvaluechanged',{target:control});
    }
    function receipt() {
        const store=current(), out=new Uint8Array(8), view=new DataView(out.buffer);
        view.setUint32(0,store.bytes.length,true);
        view.setUint32(4,checksum(store),true);
        reply(3,out);
    }
    control.writeValueWithResponse = async value => {
        const bytes=new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
        const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
        const op=bytes[0];
        if(op===2) {state.prn=view.getUint16(1,true);reply(op);return;}
        if(op===6) {
            state.selected=bytes[1];
            const store=current(), out=new Uint8Array(12), v=new DataView(out.buffer);
            v.setUint32(0,4096,true);v.setUint32(4,store.bytes.length,true);v.setUint32(8,checksum(store),true);
            if(state.selected===2)state.starts.push(store.bytes.length);
            reply(op,out);return;
        }
        if(op===1) {
            state.selected=bytes[1];
            state.creates.push({type:state.selected,size:view.getUint32(2,true),offset:current().bytes.length});
            if(state.selected===1) {init.bytes=[];init.crc=0xffffffff;}
            reply(op);return;
        }
        if(op===3) {receipt();return;}
        if(op===4) {
            const complete=state.selected===2 && data.bytes.length===359456;
            reply(op);
            if(complete) {state.executeAck=true;device.gatt.disconnect();}
            return;
        }
        throw new Error('Unexpected DFU command '+op);
    };
    packet.writeValueWithoutResponse=async value => {
        state.writes++;
        if(state.prn!==1)throw new Error('Expected receipt for every packet');
        if(value.byteLength>20)throw new Error('Packet exceeds default ATT payload');
        append(current(),value);
        if(state.selected===2 && state.failOnce && !state.failed && data.bytes.length>=state.failAt) {
            state.failed=true;
            device.gatt.disconnect();
            throw new Error('Synthetic interrupted OLED transfer');
        }
        receipt();
    };
    device.gatt={
        connected:false,
        async connect() {
            state.connections++;this.connected=true;
            return {getPrimaryService:async uuid=>{
                if(uuid!==0xfe59)throw new Error('Unexpected service');
                return {getCharacteristics:async()=>[control,packet]};
            }};
        },
        disconnect() {
            if(!this.connected)return;
            this.connected=false;state.disconnects++;
            device.emit('gattserverdisconnected');
        }
    };
    Object.defineProperty(navigator,'bluetooth',{configurable:true,value:{
        requestDevice:async options=>{
            state.requests++;state.gattRequests.push(options);
            state.activeUserGesture.push(navigator.userActivation.isActive);
            return device;
        }
    }});
    state.result=async()=>({
        bytes:data.bytes.length,initBytes:init.bytes.length,
        sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(data.bytes)))].map(n=>n.toString(16).padStart(2,'0')).join(''),
        starts:state.starts,creates:state.creates,writes:state.writes,requests:state.requests,
        activeUserGesture:state.activeUserGesture,executeAck:state.executeAck,failed:state.failed,
        gattRequests:state.gattRequests
    });
}

try {
    for(const [locale,de] of [['de-DE',true],['en-GB',false]]) {
        const context=await browser.newContext({locale,viewport:{width:390,height:840}});
        await context.addInitScript(installNordicMock);
        const page=await context.newPage();
        page.on('pageerror',error=>errors.push(error.message));
        await page.goto(origin+base);
        await page.locator('.version-context').waitFor();
        await page.evaluate(()=>document.querySelector('#app')._vnode.component.proxy.show_workspace('update'));
        const picker=page.locator('.firmware-board-choice');
        await picker.getByRole('button',{name:'OLED',exact:true}).click();
        const link=picker.locator('.oled-trial .dfu-page-link');
        await link.waitFor();
        const href=await link.getAttribute('href');
        assert.equal(href,base+'dfu/web.html?package='+packageId+'#board=OLED');
        assert.match(await link.innerText(),de?/OLED im Browser flashen/:/Flash OLED in browser/);
        for(const width of [390,1280]) {
            await page.setViewportSize({width,height:840});
            assert.ok(await link.isVisible());
            assert.ok(await picker.evaluate(element=>element.scrollWidth<=element.clientWidth));
        }
        await page.evaluate(async()=>{
            const app=document.querySelector('#app')._vnode.component.proxy;
            Object.assign(app,{connected:true,firmwareVersion:'2.22.0-DE3.81-OLEDt3',bootInfo:{
                settingsCrcValid:true,softDeviceValid:true,applicationCounter:83,bootloaderCounter:1,
                softDeviceFwid:0x0103,softDeviceVersion:7002000,softDeviceVariant:112
            }});
            await app.$nextTick();
        });
        const connectedLink=new URL(await link.getAttribute('href'),origin);
        const reference=new URLSearchParams(connectedLink.hash.slice(1));
        assert.equal(reference.get('board'),'OLED');
        assert.equal(reference.get('app'),'83');
        assert.equal(reference.get('sd'),'259');
        assert.ok(Number(reference.get('read'))<=Date.now());
        assert.ok(await picker.locator('.oled-trial button').isEnabled());
        await page.evaluate(async()=>{
            const app=document.querySelector('#app')._vnode.component.proxy;
            Object.assign(app,{connected:false,firmwareVersion:'',bootInfo:null});
            await app.$nextTick();
        });
        assert.equal(await picker.getByRole('button',{name:'OLED',exact:true}).getAttribute('aria-pressed'),'true');
        assert.equal(await link.getAttribute('href'),href);
        assert.ok(await picker.locator('.oled-trial button').isDisabled());
        checks.push({locale,feature:'OLED selection survives the application disconnect and carries only valid boot-reference fields'});
        await page.goto(origin+href);
        await page.locator('#board-profile').waitFor();
        assert.equal(await page.locator('#board-profile').inputValue(),'OLED');
        await page.locator('#bundled').selectOption(packageId);
        await page.locator('#load-bundled').click();
        await page.waitForFunction(()=>!document.querySelector('#button').disabled);
        assert.match(await page.locator('#package-target').innerText(),/84/);
        assert.match(await page.locator('#package-target').innerText(),/0x0103/);
        assert.equal(await page.evaluate(()=>oledDfuProbe.requests),0);
        assert.deepEqual(await page.locator('#bundled option').evaluateAll(options=>options.map(option=>option.value).filter(Boolean)),[packageId]);
        await page.evaluate(()=>{oledDfuProbe.failOnce=true;});
        await page.locator('#button').click();
        await page.waitForFunction(()=>oledDfuProbe.failed && !document.querySelector('#button').disabled);
        assert.match(await page.locator('#status').innerText(),de?/nicht bestätigt/:/not confirmed/);
        const partial=await page.evaluate(()=>oledDfuProbe.result());
        assert.equal(partial.executeAck,false);
        assert.ok(partial.bytes>=4140 && partial.bytes<359456);
        await page.locator('#button').click();
        await page.waitForFunction(()=>oledDfuProbe.executeAck && !document.querySelector('#button').disabled,null,{timeout:120000});
        assert.match(await page.locator('#status').innerText(),de?/Übertragung bestätigt/:/Transfer confirmed/);
        const result=await page.evaluate(()=>oledDfuProbe.result());
        assert.equal(result.bytes,359456);
        assert.equal(result.sha256,sha);
        assert.deepEqual(result.starts,[0,partial.bytes]);
        assert.deepEqual(result.activeUserGesture,[true,true]);
        assert.ok(result.initBytes>0);
        assert.equal(result.requests,2);
        assert.ok(result.gattRequests.every(options=>options.filters[0].services[0]===0xfe59));
        checks.push({locale,feature:'Home OLED route, trusted package preflight, interrupted real protocol and resume',partialBytes:partial.bytes,...result});
        await page.screenshot({path:report.replace(/\.json$/,'-'+locale+'.png'),fullPage:true});

        await page.locator('#board-profile').selectOption('LCD');
        assert.ok(await page.locator('#button').isDisabled());
        assert.equal(await page.locator('#bundled option[value="'+packageId+'"]').count(),0);
        assert.equal(await page.evaluate(()=>oledDfuProbe.requests),2);
        assert.ok(await page.locator('#file').isDisabled());
        await page.goto(origin+base+'dfu/web.html#board=LCD');
        await page.locator('#board-profile').waitFor();
        await page.locator('#file').setInputFiles(path.join(root,'firmware',zip));
        await page.waitForFunction(()=>document.querySelector('#status').textContent.match(/abgewiesen|rejected/i));
        assert.ok(await page.locator('#button').isDisabled());
        assert.equal(await page.evaluate(()=>oledDfuProbe.requests),0);
        checks.push({locale,feature:'Switching board clears readiness and rejects OLED ZIP under LCD'});
        for(const [app,sd] of [[83,294],[85,259]]) {
            await page.goto(origin+base+'dfu/web.html?package='+packageId+'#board=OLED&read='+Date.now()+'&app='+app+'&bl=1&sd='+sd);
            await page.locator('#board-profile').waitFor();
            assert.ok(await page.locator('#load-bundled').isDisabled());
            assert.ok(await page.locator('#button').isDisabled());
            assert.equal(await page.evaluate(()=>oledDfuProbe.requests),0);
        }
        checks.push({locale,feature:'Current SoftDevice mismatch and older OLED counter blocked before radio'});
        await context.close();
    }
    assert.deepEqual(errors,[]);
    await writeFile(report,JSON.stringify({base,chrome:browser.version(),scope:'Browser/parser/transport with synthetic Nordic GATT and async test scheduler; no physical radio or device',checks,errors},null,2));
    console.log(checks.length,'OLED browser checks passed');
} finally {
    await browser.close();
    await new Promise(resolve=>server.close(resolve));
}
