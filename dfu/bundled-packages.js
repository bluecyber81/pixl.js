/* Local reviewed firmware catalogue and bounded loader. MIT; see LICENSE.txt. */
(function(root,factory){
    if(typeof module==='object'&&module.exports)module.exports=factory();
    else root.AllmiiboBundledPackages=factory();
}(typeof globalThis!=='undefined'?globalThis:this,function(){
    'use strict';
    const MAX_BYTES=2*1024*1024;
    const keys=['id','version','counter','file','bytes','sha256','board','storage','bootloader','softDevice','applicationOnly','migrationRequired'];
    const need=(ok,message)=>{if(!ok)throw new Error(message);};
    function validateCatalog(input){
        need(input&&Object.keys(input).sort().join(',')==='packages,schema'&&input.schema===1&&Array.isArray(input.packages)&&input.packages.length<=8,'Ungültiger lokaler Firmware-Katalog.');
        const seen=new Set();
        const packages=input.packages.map(item=>{
            need(item&&Object.keys(item).sort().join(',')===[...keys].sort().join(','),'Unvollständiger Firmware-Eintrag.');
            const version=/^2\.22\.0-DE3\.([1-9][0-9]{0,3})$/.exec(item.version);
            need(version&&item.id===`de3.${version[1]}-lcd-app`&&!seen.has(item.id)&&Number.isSafeInteger(item.counter)&&item.counter>0&&item.counter<=0xffffffff,'Ungültige Firmware-Version.');
            need([`Allmiibo_LCD_DE3_${version[1]}_${item.counter}.zip`,`Allmiibo_LCD_DE3_${version[1]}_${item.counter}_TESTSTAND.zip`].includes(item.file),'Ungültiger Firmware-Dateiname.');
            need(Number.isInteger(item.bytes)&&item.bytes>0&&item.bytes<=MAX_BYTES&&typeof item.sha256==='string'&&/^[a-f0-9]{64}$/.test(item.sha256)&&!/^0{64}$/.test(item.sha256),'Paketgröße oder SHA-256 fehlt.');
            need(item.board==='LCD'&&item.storage==='PFS1'&&['BL8','BL8/Z13','BL8/Z13/Z15'].includes(item.bootloader)&&item.softDevice==='S112 7.3.0'&&item.applicationOnly===true&&item.migrationRequired===false,'Dieses Paket gehört nicht zum lokalen LCD/PFS1-Profil.');
            seen.add(item.id);return Object.freeze({...item});
        });
        return Object.freeze({schema:1,packages:Object.freeze(packages)});
    }
    function packageUrl(entry,pageUrl){
        const page=new URL(pageUrl);
        need(['https:','http:'].includes(page.protocol)&&!page.username&&!page.password,'Kein gültiger lokaler Seitenursprung.');
        const url=new URL('../firmware/'+entry.file,page);
        need(url.origin===page.origin&&!url.search&&!url.hash,'Paket muss vom selben Seitenursprung stammen.');
        return url.href;
    }
    class Loader{
        constructor({catalog,updater,pageUrl,fetchImpl=(...args)=>globalThis.fetch(...args),cryptoImpl=globalThis.crypto,onStatus=()=>{},onState=()=>{},timeoutMs=20000}){
            this.catalog=validateCatalog(catalog);Object.assign(this,{updater,pageUrl,fetchImpl,cryptoImpl,onStatus,onState,timeoutMs});
            this.sequence=0;this.loading=false;this.controller=null;this.timer=null;
        }
        invalidate(){
            ++this.sequence;this.controller?.abort();this.controller=null;clearTimeout(this.timer);this.timer=null;
            this.loading=false;this.updater.setPackage(null);this.onState({loading:false});
        }
        cancel(){
            if(this.updater.busy)return false;
            this.invalidate();this.onStatus('Paketauswahl abgebrochen. Bitte erneut wählen.');return true;
        }
        manual(file){
            if(this.updater.busy)return Promise.resolve(false);
            this.invalidate();return this.updater.setPackage(file);
        }
        async load(id){
            if(this.updater.busy)return false;
            this.invalidate();const sequence=this.sequence;
            this.loading=true;this.onState({loading:true});
            const controller=this.controller=new AbortController();
            const current=()=>sequence===this.sequence&&!controller.signal.aborted;
            let reader;
            this.timer=setTimeout(()=>{if(current()){this.invalidate();this.onStatus('Paketladen hat zu lange gedauert. Bitte erneut versuchen.');}},this.timeoutMs);
            try{
                const entry=this.catalog.packages.find(item=>item.id===id);
                need(entry,'Kein mitgeliefertes Paket ausgewählt.');
                need(typeof this.cryptoImpl?.subtle?.digest==='function','SHA-256 ist in diesem Browser nicht verfügbar. Paket wurde nicht geladen.');
                const url=packageUrl(entry,this.pageUrl);
                this.onStatus('Mitgeliefertes Paket wird geladen und mit SHA-256 geprüft …');
                const response=await this.fetchImpl(url,{signal:controller.signal,redirect:'error',credentials:'same-origin',cache:'no-store'});
                if(!current())return false;
                need(response.ok&&!response.redirected&&response.url===url,'Paket konnte nicht vom vorgesehenen lokalen Pfad geladen werden.');
                const announced=response.headers?.get('content-length');
                need(announced===null||announced===undefined||/^\d+$/.test(announced)&&Number(announced)===entry.bytes,'Angekündigte Paketgröße stimmt nicht.');
                need(typeof response.body?.getReader==='function','Begrenztes Paketladen ist hier nicht verfügbar.');
                reader=response.body.getReader();const bytes=new Uint8Array(entry.bytes);let used=0;
                while(true){
                    const {done,value}=await reader.read();if(!current())return false;
                    if(done)break;
                    need(value instanceof Uint8Array&&used+value.byteLength<=entry.bytes,'Paket überschreitet seine freigegebene Größe.');
                    bytes.set(value,used);used+=value.byteLength;
                }
                need(used===entry.bytes,'Paket ist unvollständig.');
                const digest=await this.cryptoImpl.subtle.digest('SHA-256',bytes);if(!current())return false;
                const actual=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
                need(actual===entry.sha256,'SHA-256 stimmt nicht. Dieses Paket wird nicht übertragen.');
                const file={name:entry.file,size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer.slice(0)};
                const ready=await this.updater.setPackage(file);if(!current())return false;
                need(ready,'Die vorhandene ZIP-Prüfung hat das Paket abgewiesen.');
                this.onStatus(`${entry.version}: Paketidentität per SHA-256 bestätigt. Gerätekompatibilität nicht automatisch geprüft. Zum Übertragen unten das DFU-Gerät auswählen.`);
                return true;
            }catch(error){
                if(current()){this.updater.setPackage(null);this.onStatus('Paket nicht geladen: '+error.message);}
                return false;
            }finally{
                if(reader){try{await reader.cancel();}catch{}try{reader.releaseLock();}catch{}}
                if(sequence===this.sequence){clearTimeout(this.timer);this.timer=null;this.controller=null;this.loading=false;this.onState({loading:false});}
            }
        }
    }
    return Object.freeze({validateCatalog,packageUrl,Loader,MAX_BYTES});
}));
