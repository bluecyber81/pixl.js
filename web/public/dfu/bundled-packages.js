/* Local reviewed firmware catalogue and bounded loader. MIT; see LICENSE.txt. */
(function(root,factory){
    if(typeof module==='object'&&module.exports)module.exports=factory(require('./validation-error.js'));
    else root.AllmiiboBundledPackages=factory(root.DfuValidationError);
}(typeof globalThis!=='undefined'?globalThis:this,function(DfuValidationError){
    'use strict';
    const MAX_BYTES=2*1024*1024;
    const MAX_PACKAGES=35;
    const keys=['id','version','counter','file','bytes','sha256','board','storage','bootloader','softDevice','applicationOnly','migrationRequired'];
    const need=(ok,de,en)=>{if(!ok)throw new DfuValidationError(de,en);};
    function validateCatalog(input){
        need(input&&Object.keys(input).sort().join(',')==='packages,schema'&&input.schema===1&&Array.isArray(input.packages)&&input.packages.length<=MAX_PACKAGES,'Ungültiger lokaler Firmware-Katalog.', 'Invalid local firmware catalogue.');
        const seen=new Set();
        const packages=input.packages.map(item=>{
            const fields = item?.channel === 'prerelease' ? [...keys, 'channel'] : keys;
            need(item&&Object.keys(item).sort().join(',')===[...fields].sort().join(','),'Unvollständiger Firmware-Eintrag.', 'Incomplete firmware entry.');
            const de41 = item.version === '2.22.0-DE4.1';
            if (de41) need(item.id === 'de4.1-lcd-app' && item.board === 'LCD' && item.counter === 678 &&
                item.file === 'Allmiibo_LCD_DE4_1_678_NUR_APP.zip' && !item.channel && item.bootloader === 'Z21',
                'Unpassendes LCD-App678-Profil.', 'Incorrect LCD App678 profile.');
            const transfers = {
                '2.22.0-DE4.3-b3': {counter:684, id:'de4.3-b3-lcd-app-test', file:'Allmiibo_LCD_DE4_3_b3_App684_NUR_APP_TEST.zip', bytes:265216, sha256:'30978b023a7f55f8f36a3885a00e761edc003ff8a0d444274c8aac924166654b'},
                '2.22.0-DE4.3-b2': {counter:683, id:'de4.3-b2-lcd-app-test', file:'Allmiibo_LCD_DE4_3_b2_App683_NUR_APP_TEST.zip', bytes:255217, sha256:'6ca4c5c7184ebe303812185026969f69b704b88171e320fb2ac08c19f6e6a36b'},
                '2.22.0-DE4.2-b1': {counter:679, id:'de4.2-b1-lcd-app-test', file:'Allmiibo_LCD_DE4_2_b1_App679_NUR_APP_TEST.zip', bytes:257000, sha256:'1e508061e86d75addb1345d5d8c9b0eac94ebf02081c519517461e952a7f5f17'},
                '2.22.0-DE4.2-b2': {counter:680, id:'de4.2-lcd-app', file:'Allmiibo_LCD_DE4_2_App680_NUR_APP.zip', bytes:257040, sha256:'4348e1757224b076064039feda58b86329b4db0d84681f15fcb22918f148f7ca'},
            };
            const transfer = Object.hasOwn(transfers, item.version) && transfers[item.version];
            if (transfer) {
                need(!seen.has(item.id) && Object.entries(transfer).every(([key,value]) => item[key] === value) &&
                    item.board === 'LCD' && item.storage === 'PFS1' && item.bootloader === 'Z21' && item.softDevice === 'S112 7.3.0' &&
                    (transfer.counter === 680 ? !item.channel : item.channel === 'prerelease') && item.applicationOnly === true && item.migrationRequired === false,
                    `Das Paket passt nicht zum signierten LCD-App${transfer.counter}.`, `The package does not match the signed LCD App${transfer.counter} release.`);
                seen.add(item.id);
                return Object.freeze({...item});
            }
            const oled = item.board === 'OLED';
            const version = oled
                ? /^2\.22\.0-DE3\.([1-9][0-9]{0,3})-OLEDt([1-9][0-9]{0,2})$/.exec(item.version)
                : /^2\.22\.0-DE(?:3|4)\.([1-9][0-9]{0,3}(?:t[1-9][0-9]{0,2})?)$/.exec(item.version);
            need(typeof item.version === 'string' && (oled || item.version.startsWith('2.22.0-DE3.') || de41), 'Unbekannte LCD-Firmware.', 'Unknown LCD firmware.');
            const previewCounters = {84:657,85:658,86:659,87:660,88:661};
            const lcdPreview = !oled && version && Object.hasOwn(previewCounters,version[1]) &&
                item.channel === 'prerelease' && item.counter === previewCounters[version[1]] && item.bootloader === 'Z21';
            const measurementCounters = {96:669,97:670};
            const lcdMeasurementTest = !oled && version && Object.hasOwn(measurementCounters,version[1]) && item.channel === 'prerelease' &&
                item.counter === measurementCounters[version[1]] && item.bootloader === 'Z21';
            if (!oled && version?.[1] === '97') need(lcdMeasurementTest, 'Unpassendes LCD-App670-TEST1-Profil.', 'Incorrect LCD App670 TEST1 profile.');
            const publicTestCounters = {103:676, 104:677};
            const publicLcdTest = !oled && version && Object.hasOwn(publicTestCounters, version[1]);
            if (publicLcdTest) need(item.channel === 'prerelease' && item.counter === publicTestCounters[version[1]] && item.bootloader === 'Z21' &&
                item.file === 'Allmiibo_LCD_DE3_' + version[1] + '_' + item.counter + '_NUR_APP.zip', 'Unpassendes LCD-Testprofil.', 'Incorrect LCD test profile.');
            const expectedId = de41 ? 'de4.1-lcd-app' : oled ? version && `de3.${version[1]}-oled-t${version[2]}-app`
                : publicLcdTest || lcdMeasurementTest ? `de3.${version[1]}-lcd-app-test1`
                : lcdPreview ? `de3.${version[1]}-lcd-test1-app` : version && `de3.${version[1]}-lcd-app`;
            need(version&&item.id===expectedId&&!seen.has(item.id)&&Number.isSafeInteger(item.counter)&&item.counter>0&&item.counter<=0xffffffff,'Ungültige Firmware-Version.', 'Invalid firmware version.');
            if (!oled && version[1] === '89') need(!item.channel && item.counter === 662 && item.bootloader === 'Z21' && item.file === 'Allmiibo_LCD_DE3_89_662_NUR_APP.zip', 'Unpassendes LCD-App662-Profil.', 'Incorrect LCD App662 profile.');
            const testBuild = version[1].includes('t');
            const names = de41 ? ['Allmiibo_LCD_DE4_1_678_NUR_APP.zip'] : oled ? [`Allmiibo_OLED_DE3_${version[1]}_Test${version[2]}_APP.zip`] : testBuild
                ? [`Allmiibo_DE3_${version[1]}_App${item.counter}_NUR_APP_SIGNIERT.zip`]
                : [`Allmiibo_LCD_DE3_${version[1]}_${item.counter}.zip`,`Allmiibo_LCD_DE3_${version[1]}_${item.counter}_TESTSTAND.zip`,`Allmiibo_LCD_DE3_${version[1]}_${item.counter}_NUR_APP.zip`];
            if (!oled && item.channel === 'prerelease' && !testBuild) names.push(`Allmiibo_LCD_DE3_${version[1]}_App${item.counter}_TEST_DFU.zip`);
            if (lcdMeasurementTest) names.splice(0, names.length, `Allmiibo_LCD_DE3_${version[1]}_${item.counter}_TEST1_NUR_APP.zip`);
            need(names.includes(item.file) && (!testBuild || item.channel === 'prerelease'),'Ungültiger Firmware-Dateiname.', 'Invalid firmware filename.');
            need(Number.isInteger(item.bytes)&&item.bytes>0&&item.bytes<=MAX_BYTES&&typeof item.sha256==='string'&&/^[a-f0-9]{64}$/.test(item.sha256)&&!/^0{64}$/.test(item.sha256),'Paketgröße oder SHA-256 fehlt.', 'The package size or SHA-256 is missing or invalid.');
            const profile = oled
                ? item.storage === 'SPIFFS/LittleFS' && item.bootloader === 'OLED Secure DFU' && item.softDevice === 'S112 7.2.0' && item.channel === 'prerelease'
                : item.board === 'LCD' && item.storage === 'PFS1' && ['BL8','BL8/Z13','BL8/Z13/Z15','BL8/Z13/Z15/Z17','BL8/Z13/Z15/Z17/Z19','Z19','Z19/Z20','Z19/Z20/Z21','Z21'].includes(item.bootloader) && item.softDevice === 'S112 7.3.0';
            need(profile && item.applicationOnly === true && item.migrationRequired === false,
                'Dieses Paket gehört nicht zum lokalen Display-/Speicherprofil.', 'This package does not match a local display/storage profile.');
            seen.add(item.id);return Object.freeze({...item});
        });
        return Object.freeze({schema:1,packages:Object.freeze(packages)});
    }
    function validatePackage(candidate, board, catalog, preview) {
        need(board === 'LCD' || board === 'OLED', 'Wähle das Display deines Geräts.', 'Choose your device display.');
        const references = Array.isArray(preview) ? preview : [preview];
        const reference = references.find(item => item && typeof item.otaSha256 === 'string' && candidate.archiveSha256 === item.otaSha256 && candidate.archiveBytes === item.otaBytes);
        const entry = reference ? {board: reference.board, counter: reference.applicationCounter, version: reference.firmwareVersion,
            privatePreview: reference.artifactStatus !== 'stable-signed-application'}
            : catalog.packages.find(item => item.sha256 === candidate.archiveSha256 && item.bytes === candidate.archiveBytes);
        const targetCounter = candidate.image?.target?.counter;
        if (board === 'LCD' && [679,680,683,684].includes(targetCounter)) {
            const required = {679:'2.22.0-DE4.2-b1',680:'2.22.0-DE4.2-b2',683:'2.22.0-DE4.3-b2',684:'2.22.0-DE4.3-b3'}[targetCounter];
            need(entry?.version === required && candidate.image.target.softDevices.length === 1,
                `Wähle für App${targetCounter} die passende signierte LCD-ZIP.`, `For App${targetCounter}, select the matching signed LCD ZIP.`);
        }
        need(!entry || entry.board === board, 'Diese ZIP gehört zum anderen Display. Wähle das passende Gerät und Paket.',
            'This ZIP targets the other display. Select the matching device and package.');
        need(board !== 'OLED' || entry, 'Für OLED bitte die veröffentlichte OLED-App-ZIP wählen.',
            'For OLED, choose the published OLED application ZIP.');
        if (entry) {
            const target = candidate.image?.target;
            const fwid = entry.board === 'OLED' ? 0x0103 : 0x0126;
            need(target?.counter === entry.counter && target.hardware === 52 && target.softDevices.includes(fwid) &&
                (entry.board !== 'OLED' || target.softDevices.length === 1),
                'Startpaket und Katalogprofil widersprechen sich.', 'The init packet conflicts with its catalogue profile.');
        }
        return entry;
    }
    function packageUrl(entry,pageUrl){
        const page=new URL(pageUrl);
        need(['https:','http:'].includes(page.protocol)&&!page.username&&!page.password,'Kein gültiger lokaler Seitenursprung.', 'Invalid local page origin.');
        const url=new URL('../firmware/'+entry.file,page);
        need(url.origin===page.origin&&!url.search&&!url.hash,'Paket muss vom selben Seitenursprung stammen.', 'The package must come from the same origin as this page.');
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
            this.invalidate();this.onStatus('Paketauswahl abgebrochen. Bitte erneut wählen.', 'Package selection cancelled. Choose a package again.');return true;
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
            this.timer=setTimeout(()=>{if(current()){this.invalidate();this.onStatus('Paketladen hat zu lange gedauert. Bitte erneut versuchen.', 'Package download timed out. Please try again.');}},this.timeoutMs);
            try{
                const entry=this.catalog.packages.find(item=>item.id===id);
                need(entry,'Kein mitgeliefertes Paket ausgewählt.', 'No bundled package selected.');
                need(typeof this.cryptoImpl?.subtle?.digest==='function','SHA-256 ist in diesem Browser nicht verfügbar. Paket wurde nicht geladen.', 'SHA-256 is unavailable in this browser.');
                const url=packageUrl(entry,this.pageUrl);
                this.onStatus('Mitgeliefertes Paket wird geladen und mit SHA-256 geprüft …', 'Downloading and checking the bundled package with SHA-256 …');
                const response=await this.fetchImpl(url,{signal:controller.signal,redirect:'error',credentials:'same-origin',cache:'no-store'});
                if(!current())return false;
                need(response.ok&&!response.redirected&&response.url===url,'Paket konnte nicht vom vorgesehenen lokalen Pfad geladen werden.', 'The package could not be loaded from the expected local address.');
                const announced=response.headers?.get('content-length');
                need(announced===null||announced===undefined||/^\d+$/.test(announced)&&Number(announced)===entry.bytes,'Angekündigte Paketgröße stimmt nicht.', 'The reported package size does not match.');
                need(typeof response.body?.getReader==='function','Begrenztes Paketladen ist hier nicht verfügbar.', 'This browser cannot download the package with a size limit.');
                reader=response.body.getReader();const bytes=new Uint8Array(entry.bytes);let used=0;
                while(true){
                    const {done,value}=await reader.read();if(!current())return false;
                    if(done)break;
                    need(value instanceof Uint8Array&&used+value.byteLength<=entry.bytes,'Paket überschreitet seine freigegebene Größe.', 'The package exceeds its published size.');
                    bytes.set(value,used);used+=value.byteLength;
                }
                need(used===entry.bytes,'Paket ist unvollständig.', 'The package is incomplete.');
                const digest=await this.cryptoImpl.subtle.digest('SHA-256',bytes);if(!current())return false;
                const actual=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
                need(actual===entry.sha256,'SHA-256 stimmt nicht. Dieses Paket wird nicht übertragen.', 'The package SHA-256 does not match. Transfer was blocked.');
                const file={name:entry.file,size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer.slice(0)};
                const ready=await this.updater.setPackage(file);if(!current())return false;
                need(ready,'Die vorhandene ZIP-Prüfung hat das Paket abgewiesen.', 'The ZIP failed validation.');
                this.onStatus(`${entry.version}: Paketidentität per SHA-256 bestätigt. Gerätekompatibilität nicht automatisch geprüft. Zum Übertragen unten das DFU-Gerät auswählen.`,
                    `${entry.version}: Package SHA-256 verified. Check device compatibility before selecting a DFU device below to transfer it.`);
                return true;
            }catch(error){
                if(current()){this.updater.setPackage(null);this.onStatus('Paket nicht geladen: '+error.message, 'Package not loaded: '+(error.english ?? error.message));}
                return false;
            }finally{
                if(reader){try{await reader.cancel();}catch{}try{reader.releaseLock();}catch{}}
                if(sequence===this.sequence){clearTimeout(this.timer);this.timer=null;this.controller=null;this.loading=false;this.onState({loading:false});}
            }
        }
    }
    return Object.freeze({validateCatalog,validatePackage,packageUrl,Loader,MAX_BYTES,MAX_PACKAGES});
}));
