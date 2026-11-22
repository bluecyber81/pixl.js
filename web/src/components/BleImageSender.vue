<template>
  <section class="image-sender" :aria-busy="loading">
    <div class="stream-heading"><div><p class="stream-eyebrow">LCD · 128 × 64</p><h2>{{ text.title }}</h2></div><span class="stream-tag">DE3.100 / App673+</span></div>
    <p class="stream-intro">{{ text.intro }}</p>
    <ol class="stream-steps"><li>{{ text.step1 }}</li><li>{{ text.step2 }}</li><li>{{ text.step3 }}</li></ol>
    <p v-if="blocked" class="stream-notice" role="status">{{ text.blocked }}</p>
    <p v-if="unavailable" class="stream-notice" role="status">{{ text.errors[unavailable] }}</p>
    <div class="stream-connection">
      <button v-if="!active" type="button" class="stream-primary" @click="connectStream" :disabled="blocked || !!unavailable">{{ text.connect }}</button>
      <button v-else type="button" @click="stopStream('stopped')">{{ phase === 'connecting' ? text.cancel : text.disconnect }}</button>
      <span class="stream-state" :class="{'stream-online': connected}" role="status" aria-live="polite">{{ text.states[phase] || text.states.idle }}<template v-if="connected && deviceName"> · {{ deviceName }}</template></span>
    </div>
    <p v-if="error" class="stream-notice" :role="error === 'STREAM_NO_SELECTION' ? 'status' : 'alert'">{{ text.errors[error] || text.errors.STREAM_CONNECT_FAILED }}</p>
    <div class="stream-layout">
      <div class="stream-preview-card">
        <div class="stream-preview-heading"><h3>{{ text.preview }}</h3><span>128 × 64 px</span></div>
        <canvas ref="preview" class="stream-preview" width="128" height="64" role="img" :aria-label="text.previewAlt"></canvas>
        <p class="stream-source-name">{{ sourceKind === 'demo' ? text.demoName : fileName || text.choose }}</p>
        <p class="stream-hint">{{ text.previewHint }}</p>
        <video ref="video" v-show="sourceKind === 'video'" class="stream-video" controls muted playsinline preload="auto" :loop="loopVideo" :aria-label="text.videoOriginal" @play="onVideoPlay" @pause="onVideoPause" @seeked="refreshPreview" @loadeddata="refreshPreview" @ended="onVideoEnded" @error="onMediaError"></video>
        <p v-if="sourceKind === 'video'" class="stream-hint">{{ text.videoHint }}</p>
      </div>
      <div class="stream-controls">
        <label class="stream-file-label">{{ text.choose }}<input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp,image/bmp,image/gif,image/avif,video/*,.png,.jpg,.jpeg,.webp,.bmp,.gif,.avif,.mp4,.webm,.mov,.m4v,.ogv" @change="chooseFile" :disabled="sending || phase === 'connecting'" /></label>
        <button type="button" @click="selectDemo" :disabled="sending || phase === 'connecting'">{{ text.demo }}</button>
        <p class="stream-hint">{{ text.local }}</p>
        <p v-if="loading" role="status">{{ text.loading }}</p>
        <fieldset class="stream-options" :disabled="loading"><legend>{{ text.imageSettings }}</legend>
          <label>{{ text.fit }}<select v-model="fit" @change="refreshPreview"><option value="fit">{{ text.fitOptions.fit }}</option><option value="crop">{{ text.fitOptions.crop }}</option><option value="stretch">{{ text.fitOptions.stretch }}</option></select></label>
          <label>{{ text.threshold }} <output>{{ threshold }}</output><input v-model.number="threshold" type="range" min="0" max="255" step="1" @input="refreshPreview" /></label>
          <label class="stream-check"><input v-model="invert" type="checkbox" @change="refreshPreview" />{{ text.invert }}</label>
        </fieldset>
        <fieldset v-if="sourceKind !== 'image'" class="stream-options"><legend>{{ text.playSettings }}</legend>
          <label>{{ text.fps }}<select v-model.number="fps" :disabled="sending"><option :value="1">1</option><option :value="2">2</option><option :value="5">5</option><option :value="10">10</option><option :value="15">15</option></select></label>
          <label v-if="sourceKind === 'video'" class="stream-check"><input v-model="loopVideo" type="checkbox" />{{ text.loop }}</label>
          <p class="stream-hint">{{ text.fpsHint }}</p>
        </fieldset>
        <div class="stream-send-actions"><button type="button" class="stream-primary" @click="startSending" :disabled="!canSend">{{ sourceKind === 'image' ? text.sendImage : sourceKind === 'demo' ? text.startDemo : text.startVideo }}</button><button v-if="sending" type="button" @click="stopStream('stopped')">{{ text.stop }}</button></div>
        <p v-if="notice" class="stream-receipt" role="status" aria-live="polite">{{ text.notices[notice] }}</p>
        <p v-if="sentFrames" class="stream-stats">{{ text.sent }}: <strong>{{ sentFrames }}</strong><template v-if="sentFrames > 1"> · {{ text.actualFps }}: {{ measuredFps }}</template></p>
      </div>
    </div>
    <details class="stream-help"><summary>{{ text.helpTitle }}</summary><p>{{ text.help }}</p><p>{{ text.hideHint }}</p><p>{{ text.imageHint }}</p></details>
  </section>
</template>
<script>
import { BleImageStream, rgbaToFrame, frameToRgba } from '../lib/ble-image-stream.js';
import { createFramePump, demoRgba, drawMediaFrame, loadLocalMedia } from '../lib/stream-media.js';

const TEXT = {
  de_DE: {
    title:'Bild & Video ans LCD', intro:'Wähle ein Bild oder Video und übertrage die Schwarz-Weiß-Vorschau über Bluetooth auf dein LCD. Zum Ausprobieren ist eine bewegte Demo vorbereitet.',
    step1:'Dateiverbindung und Fernbedienung trennen.', step2:'Am LCD im Hauptmenü „BLE-Bildempfang“ öffnen.', step3:'Hier verbinden, Vorschau prüfen und Senden starten.',
    blocked:'Eine andere Verbindung oder Übertragung ist noch aktiv. Trenne die Dateiverbindung oben auf der Seite beziehungsweise die Fernbedienung in ihrem Bereich. Warte laufende Übertragungen ab; die Vorschau kannst du bereits vorbereiten.',
    connect:'Mit Bildempfang verbinden', cancel:'Verbindung abbrechen', disconnect:'Verbindung trennen',
    states:{idle:'Nicht verbunden',connecting:'Bildempfang wird verbunden …',connected:'Bildempfang bereit',error:'Verbindung beendet'},
    preview:'LCD-Vorschau',previewAlt:'Schwarz-Weiß-Vorschau mit 128 mal 64 Pixeln für das LCD',previewHint:'So wird das Bild umgerechnet. Die Taste rechts am Gerät kann die Anzeige zusätzlich invertieren.',
    choose:'Bild oder Video auswählen',demo:'Demo verwenden',demoName:'Demo · Kreis und Welle',local:'Die Datei bleibt auf diesem Gerät. Es wird nichts hochgeladen.',loading:'Datei wird geladen …',
    imageSettings:'Bild anpassen',fit:'Bildformat',fitOptions:{fit:'Ganzes Bild einpassen',crop:'Bildfüllender Ausschnitt',stretch:'Auf 128 × 64 strecken'},threshold:'Hell-Dunkel-Grenze',invert:'Schwarz und Weiß tauschen',
    playSettings:'Wiedergabe',fps:'Ziel: Bilder pro Sekunde',loop:'Video wiederholen',fpsHint:'Die tatsächliche Bildrate hängt von Bluetooth und dem Bildinhalt ab. Beginne mit 5 Bildern/s.',
    videoOriginal:'Originalvideo zur Vorschau',videoHint:'Das Originalvideo ist stumm. Starte die Übertragung mit „Video senden“. Bei langsamer Verbindung werden Zwischenbilder ausgelassen.',
    sendImage:'Bild senden',startDemo:'Demo senden',startVideo:'Video senden',stop:'Senden stoppen',sent:'Gesendete Bilder',actualFps:'Ø Bilder/s',
    notices:{imageSent:'Bild übertragen. Du kannst die Vorschau ändern und erneut senden.',stopped:'Übertragung gestoppt und Verbindung getrennt.',hidden:'Übertragung gestoppt, weil die Seite verlassen oder ausgeblendet wurde. Zum Fortsetzen erneut verbinden.',ended:'Video beendet; Verbindung getrennt.',paused:'Video pausiert; Übertragung gestoppt und Verbindung getrennt.'},
    helpTitle:'Bedienung am Gerät und weitere Hinweise',help:'Der Bildempfang ist für LCD-Firmware DE3.100/App673 oder neuer vorgesehen. Am Gerät schaltet links die Bildinformationen um, rechts invertiert die Anzeige und Mitte beendet den Bildempfang. Nach dem Trennen im Browser kannst du mit der Mitteltaste zur normalen Bedienung zurückkehren.',
    hideHint:'Beim Wechsel in einen anderen Bereich, beim Ausblenden der Seite oder bei einem Verbindungsfehler wird die Übertragung beendet. Es gibt keine automatische Wiederaufnahme.',imageHint:'Aus einer GIF-Datei wird jeweils ein einzelnes Bild übertragen. Videos müssen von diesem Browser abspielbar sein, zum Beispiel MP4 oder WebM. OLED unterstützt diesen Bildempfang nicht.',
    errors:{STREAM_UNAVAILABLE:'Dieser Browser unterstützt Web Bluetooth nicht. Öffne die Seite in Chrome oder Edge auf einem unterstützten Computer oder Android-Gerät. Auf iPhone und iPad ist dieser Sender hier nicht verfügbar.',STREAM_INSECURE:'Bluetooth benötigt HTTPS oder den lokalen Portable-Dateimanager.',STREAM_NO_SELECTION:'Kein Gerät ausgewählt. Öffne am LCD „BLE-Bildempfang“ und wähle es beim nächsten Verbinden aus.',STREAM_PERMISSION:'Die Bluetooth-Berechtigung wurde nicht erteilt. Erlaube den Zugriff und verbinde erneut.',STREAM_WRONG_DEVICE:'Das gewählte Gerät passt nicht zum LCD-Bildempfang. Öffne „BLE-Bildempfang“ auf deinem Allmiibo und wähle dieses Gerät.',STREAM_BUSY:'Eine Bildübertragung ist bereits aktiv. Warte auf das Bild oder stoppe die Übertragung.',STREAM_CONNECT_FAILED:'Die Verbindung konnte nicht aufgebaut werden. Prüfe den Bildempfang am LCD und verbinde erneut.',STREAM_UNSUPPORTED:'Das Gerät stellt den benötigten Bildempfang nicht bereit. Prüfe LCD-Firmware DE3.100/App673 und öffne „BLE-Bildempfang“.',STREAM_HANDSHAKE_TIMEOUT:'Das Gerät hat den Bildempfang nicht bestätigt. Öffne am LCD „BLE-Bildempfang“ mit DE3.100/App673 oder neuer und verbinde erneut. Es wurden keine Bilddaten gesendet.',STREAM_ACK_TIMEOUT:'Eine Bestätigung des Geräts blieb aus. Die Übertragung wurde beendet. Prüfe Abstand und Bildempfang und verbinde erneut.',STREAM_PROTOCOL:'Die Antwort des Geräts war nicht gültig. Die Übertragung wurde beendet; verbinde den Bildempfang erneut.',STREAM_DISCONNECTED:'Die Bluetooth-Verbindung wurde getrennt. Öffne bei Bedarf den Bildempfang und verbinde erneut.',STREAM_CANCELLED:'Die Verbindung wurde abgebrochen.',STREAM_FRAME_INVALID:'Die Vorschau konnte nicht als 128×64-Bild gesendet werden. Wähle die Datei erneut.',MEDIA_TYPE:'Wähle eine Bild- oder Videodatei, zum Beispiel PNG, JPEG, MP4 oder WebM. SVG-Dateien werden hier nicht verwendet.',MEDIA_DECODE:'Der Browser konnte diese Datei nicht öffnen. Probiere PNG oder JPEG für Bilder beziehungsweise ein hier abspielbares MP4- oder WebM-Video.',MEDIA_DIMENSIONS:'Die Bildgröße wird nicht unterstützt. Verwende ein Bild oder Video mit höchstens 40 Millionen Pixeln pro Bild.',MEDIA_TIMEOUT:'Die Datei konnte nicht rechtzeitig geladen werden. Wähle sie erneut oder probiere eine andere Datei.',MEDIA_UNSUPPORTED:'Die Medienvorschau wird in diesem Browser nicht unterstützt.',MEDIA_PLAY:'Das Video konnte nicht gestartet werden. Prüfe die Vorschau und starte erneut.',MEDIA_PREVIEW:'Die Vorschau konnte nicht gelesen werden. Wähle die Datei erneut.',MEDIA_CANCELLED:'Die Dateiauswahl wurde abgebrochen.'}
  },
  en: {
    title:'Images & video on the LCD',intro:'Choose an image or video and send the monochrome preview to your LCD over Bluetooth. An animated demo is ready to try.',
    step1:'Disconnect file transfer and remote control.',step2:'Open “BLE image stream” in the LCD main menu.',step3:'Connect here, check the preview, then start sending.',blocked:'Another connection or transfer is active. Disconnect file transfer at the top of this page, or remote control in its workspace. Wait for active transfers to finish; you can prepare the preview now.',
    connect:'Connect image receiver',cancel:'Cancel connection',disconnect:'Disconnect',states:{idle:'Disconnected',connecting:'Connecting image receiver …',connected:'Image receiver ready',error:'Connection ended'},
    preview:'LCD preview',previewAlt:'Monochrome 128 by 64 pixel preview for the LCD',previewHint:'This is the converted image. The right device button can also invert its display.',choose:'Choose image or video',demo:'Use demo',demoName:'Demo · circle and wave',local:'The file stays on this device. Nothing is uploaded.',loading:'Loading file …',
    imageSettings:'Adjust image',fit:'Image format',fitOptions:{fit:'Fit whole image',crop:'Crop to fill',stretch:'Stretch to 128 × 64'},threshold:'Light/dark threshold',invert:'Swap black and white',playSettings:'Playback',fps:'Target frames per second',loop:'Loop video',fpsHint:'Actual frame rate depends on Bluetooth and image content. Start with 5 frames/s.',
    videoOriginal:'Original video preview',videoHint:'The original video is muted. Use “Send video” to begin transmission. Slow connections skip intermediate frames.',sendImage:'Send image',startDemo:'Send demo',startVideo:'Send video',stop:'Stop sending',sent:'Frames sent',actualFps:'Average frames/s',
    notices:{imageSent:'Image sent. You can adjust the preview and send it again.',stopped:'Transmission stopped and connection closed.',hidden:'Transmission stopped because the page was left or hidden. Reconnect to continue.',ended:'Video ended; connection closed.',paused:'Video paused; transmission stopped and connection closed.'},
    helpTitle:'Device controls and further information',help:'Image streaming requires LCD firmware DE3.100/App673 or newer. On the device, Left toggles image information, Right inverts the display, and Center exits the receiver. After disconnecting in the browser, use the center button to return to normal operation.',hideHint:'Changing workspace, hiding this page, or a connection failure ends transmission. It never resumes automatically.',imageHint:'A GIF file sends one individual image at a time. The browser must be able to play your video, for example MP4 or WebM. OLED does not support this image receiver.',
    errors:{STREAM_UNAVAILABLE:'This browser does not support Web Bluetooth. Open this page in Chrome or Edge on a supported computer or Android device. This sender is not available here on iPhone or iPad.',STREAM_INSECURE:'Bluetooth requires HTTPS or the local portable file manager.',STREAM_NO_SELECTION:'No device selected. Open “BLE image stream” on the LCD and select it when connecting again.',STREAM_PERMISSION:'Bluetooth permission was not granted. Allow access and reconnect.',STREAM_WRONG_DEVICE:'This device does not match the LCD image receiver. Open “BLE image stream” on your Allmiibo and choose that device.',STREAM_BUSY:'An image transfer is already running. Wait for the image or stop transmission.',STREAM_CONNECT_FAILED:'Could not connect. Check the LCD image receiver and reconnect.',STREAM_UNSUPPORTED:'This device does not provide the required receiver. Check for LCD firmware DE3.100/App673 and open “BLE image stream”.',STREAM_HANDSHAKE_TIMEOUT:'The device did not confirm image reception. Open “BLE image stream” on LCD firmware DE3.100/App673 or newer, then reconnect. No image data was sent.',STREAM_ACK_TIMEOUT:'A device acknowledgement did not arrive. Transmission ended. Check range and the receiver, then reconnect.',STREAM_PROTOCOL:'The device sent an invalid response. Transmission ended; reconnect the image receiver.',STREAM_DISCONNECTED:'Bluetooth disconnected. Open the image receiver if needed and reconnect.',STREAM_CANCELLED:'Connection cancelled.',STREAM_FRAME_INVALID:'The preview could not be sent as a 128×64 image. Select the file again.',MEDIA_TYPE:'Choose an image or video, such as PNG, JPEG, MP4, or WebM. SVG files are not used here.',MEDIA_DECODE:'The browser could not open this file. Try PNG or JPEG images, or a playable MP4 or WebM video.',MEDIA_DIMENSIONS:'Unsupported dimensions. Use an image or video with at most 40 million pixels per frame.',MEDIA_TIMEOUT:'The file did not load in time. Select it again or try another file.',MEDIA_UNSUPPORTED:'This browser cannot display the media preview.',MEDIA_PLAY:'The video could not start. Check the preview and try again.',MEDIA_PREVIEW:'The preview could not be read. Select the file again.',MEDIA_CANCELLED:'File selection cancelled.'}
  }
};
export default {
  props:{locale:{type:String,default:'de_DE'},blocked:Boolean},emits:['active','sending'],
  data(){return {phase:'idle',deviceName:'',error:'',notice:'',sourceKind:'demo',fileName:'',ready:true,loading:false,fit:'fit',threshold:128,invert:false,fps:5,loopVideo:true,sending:false,sentFrames:0,measuredFps:'0.0',unavailable:globalThis.isSecureContext === false ? 'STREAM_INSECURE' : !globalThis.navigator?.bluetooth?.requestDevice ? 'STREAM_UNAVAILABLE' : ''};},
  computed:{text(){return TEXT[this.locale] || TEXT.en;},active(){return this.phase === 'connecting' || this.phase === 'connected';},connected(){return this.phase === 'connected';},canSend(){return this.connected && !this.blocked && !this.sending && !this.loading && this.ready;}},
  created(){
    this._streamMounted = true; this._selection = 0; this._operation = 0; this._demoFrame = 0;
    this._client = new BleImageStream({onState: state => {
      if(!this._streamMounted) return;
      this.phase = state.phase; this.deviceName = state.deviceName || '';
      if(state.error) this.error = state.error;
      if(state.phase !== 'connected' && state.phase !== 'connecting') this.haltPlayback();
      this.$emit('active', this.active);
    }});
    this._pump = createFramePump({capture:()=>this.captureFrame(true),send:frame=>this._client.sendFrame(frame),onFrame:()=>this.recordFrame(),onError:error=>this.sendFailed(error)});
  },
  mounted(){
    this._canvas = document.createElement('canvas'); this._canvas.width = 128; this._canvas.height = 64;
    this._context = this._canvas.getContext('2d', {willReadFrequently:true});
    this._previewContext = this.$refs.preview.getContext('2d');
    if(!this._context || !this._previewContext){this.ready=false;this.error='MEDIA_UNSUPPORTED';}
    else this.refreshPreview();
    document.addEventListener('visibilitychange',this.visibilityChanged);
    globalThis.addEventListener?.('pagehide',this.pageHidden);
  },
  beforeUnmount(){
    this._streamMounted=false; ++this._selection; ++this._operation;
    document.removeEventListener('visibilitychange',this.visibilityChanged);
    globalThis.removeEventListener?.('pagehide',this.pageHidden);
    this.haltPlayback(); this._media?.dispose(); this._media=null; this._client.disconnect();
    this.$emit('active',false); this.$emit('sending',false);
  },
  watch:{blocked(value){if(value && this.active)this.stopStream();}},
  methods:{
    async connectStream(){
      if(this.blocked || this.active || this.unavailable || document.hidden)return;
      const operation=++this._operation; this.error=''; this.notice='';
      try{await this._client.connect();}
      catch(error){if(this._streamMounted && operation === this._operation)this.error=error?.code || 'STREAM_CONNECT_FAILED';}
    },
    haltPlayback(){
      this._pump?.stop(); this.setSending(false); this.cancelPreview(); this.$refs.video?.pause();
    },
    setSending(value){this.sending=value; if(this._streamMounted)this.$emit('sending',value);},
    stopStream(notice=''){
      ++this._operation; this.haltPlayback(); this._client.disconnect();
      this.error=''; this.notice=notice;
    },
    visibilityChanged(){if(document.hidden)this.pageHidden();},
    pageHidden(){if(this.active || this.sending)this.stopStream('hidden');else{this.cancelPreview();this.$refs.video?.pause();}},
    prepareSourceChange(){
      // No write can be pending: both selectors reject connecting/sending.
      // Keep an acknowledged receiver connected while the user prepares media.
      ++this._operation;this.haltPlayback();this.error='';this.notice='';
    },
    async chooseFile(event){
      const file=event.target?.files?.[0]; if(!file || this.sending || this.phase === 'connecting')return;
      const selection=++this._selection;
      this.prepareSourceChange(); this._media?.dispose(); this._media=null; this._source=null;
      this.ready=false;this.loading=true;this.fileName=file.name;this.sentFrames=0;
      try{
        const media=loadLocalMedia(file,{video:this.$refs.video});this._media=media;this.sourceKind=media.kind;
        const loaded=await media.ready;
        if(!this._streamMounted || selection!==this._selection)return;
        this._source=loaded.source;this.ready=true;this.refreshPreview();
      }catch(error){if(this._streamMounted && selection===this._selection){this.error=error?.code || 'MEDIA_DECODE';this._media?.dispose();this._media=null;}}
      finally{if(this._streamMounted && selection===this._selection)this.loading=false;}
    },
    selectDemo(){
      if(this.sending || this.phase==='connecting')return;
      ++this._selection;this.prepareSourceChange();this._media?.dispose();this._media=null;this._source=null;
      this.sourceKind='demo';this.fileName='';this.ready=!!this._previewContext;this.loading=false;this.sentFrames=0;this._demoFrame=0;
      if(this.$refs.fileInput)this.$refs.fileInput.value='';this.refreshPreview();
    },
    captureFrame(advance=false){
      if(!this.ready || !this._previewContext)throw Object.assign(Error('preview'),{code:'MEDIA_PREVIEW'});
      const rgba=this.sourceKind==='demo' ? demoRgba(this._demoFrame) : drawMediaFrame(this._context,this._source,this.fit);
      const frame=rgbaToFrame(rgba,{threshold:this.threshold,invert:this.invert});
      const image=this._previewContext.createImageData(128,64);image.data.set(frameToRgba(frame));
      this._previewContext.putImageData(image,0,0);
      if(advance && this.sourceKind==='demo')this._demoFrame++;
      return frame;
    },
    refreshPreview(){
      if(!this._streamMounted || !this.ready || !this._previewContext || (this.sourceKind!=='demo' && !this._source))return;
      try{this.captureFrame();}catch(_){this.error='MEDIA_PREVIEW';this.ready=false;if(this.active)this._client.disconnect();}
    },
    async startSending(){
      if(!this.canSend || document.hidden)return;
      const operation=++this._operation;
      this.error='';this.notice='';this.sentFrames=0;this.measuredFps='0.0';this._started=performance.now();this.setSending(true);this.cancelPreview();
      try{
        if(this.sourceKind==='image'){
          await this._client.sendFrame(this.captureFrame(),{forceKeyframe:true});
          if(!this._streamMounted || operation!==this._operation)return;
          this.recordFrame();this.setSending(false);this.notice='imageSent';
        }else{
          if(this.sourceKind==='video'){
            if(this._source.ended)this._source.currentTime=0;
            await this._source.play();
            if(!this._streamMounted || operation!==this._operation)return;
          }
          this._pump.start({fps:this.fps});
        }
      }catch(error){if(this._streamMounted && operation===this._operation)this.sendFailed(error);}
    },
    recordFrame(){this.sentFrames++;const seconds=(performance.now()-this._started)/1000;this.measuredFps=seconds>0?(this.sentFrames/seconds).toFixed(1):'0.0';},
    sendFailed(error){
      if(!this._streamMounted)return;
      ++this._operation;this.haltPlayback();this._client.disconnect();this.error=error?.code || 'MEDIA_PLAY';this.notice='';
    },
    cancelPreview(){if(this._previewRaf!=null){globalThis.cancelAnimationFrame?.(this._previewRaf);this._previewRaf=null;}},
    onVideoPlay(){
      if(this.sending || !this.ready || document.hidden)return;
      const tick=()=>{this._previewRaf=null;if(!this._streamMounted || this.sending || document.hidden || this.$refs.video?.paused)return;this.refreshPreview();this._previewRaf=globalThis.requestAnimationFrame?.(tick);};
      this.cancelPreview();this._previewRaf=globalThis.requestAnimationFrame?.(tick);
    },
    onVideoPause(){this.cancelPreview();if(this.sending && this.sourceKind==='video')this.stopStream(this.$refs.video?.ended?'ended':'paused');else this.refreshPreview();},
    onVideoEnded(){if(this.sending)this.stopStream('ended');},
    onMediaError(){if(this._streamMounted && this.sourceKind==='video' && this.ready){this.ready=false;this.sendFailed({code:'MEDIA_DECODE'});}}
  }
};
</script>
<style scoped>
.image-sender{color:#24434b;max-width:1050px;padding:clamp(14px,2.5vw,26px);background:#f6fafb;border:1px solid #c9dddf;border-radius:16px;overflow-wrap:anywhere;}
.stream-heading,.stream-connection,.stream-preview-heading,.stream-send-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}.stream-heading{justify-content:space-between;}.stream-eyebrow{font-size:.74rem;letter-spacing:.1em;font-weight:700;margin:0 0 6px;color:#526e74;}.image-sender h2{font-size:clamp(1.35rem,3vw,1.8rem);line-height:1.25;margin:0;}.stream-tag{font-size:.75rem;padding:6px 9px;border-radius:6px;background:#e4eef1;color:#49666e;}.stream-intro{max-width:75ch;line-height:1.65;}.stream-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding-left:24px;font-size:.86rem;line-height:1.55;margin:20px 0;}.stream-steps li{padding:6px 10px 6px 2px;}.stream-connection{padding:14px 0;margin-bottom:12px;}.stream-state{font-size:.87rem;}.stream-online{font-weight:700;color:#236351;}.stream-layout{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(260px,1fr);gap:24px;align-items:start;}.stream-preview-card{background:#e6eff0;padding:16px;border:1px solid #c4d8da;border-radius:12px;}.stream-preview-heading{justify-content:space-between;margin-bottom:12px;}.stream-preview-heading h3{font-size:1rem;margin:0;}.stream-preview-heading span{font-size:.77rem;color:#4e686e;}.stream-preview{display:block;width:100%;height:auto;aspect-ratio:2/1;image-rendering:pixelated;background:#000;border-radius:3px;box-sizing:border-box;border:6px solid #29434a;}.stream-source-name{font-size:.9rem;font-weight:600;margin:12px 0 5px;}.stream-hint{font-size:.78rem;line-height:1.55;color:#4d666e;margin:8px 0 0;}.stream-video{display:block;max-width:100%;width:100%;max-height:230px;margin-top:16px;border-radius:6px;background:#000;}.stream-controls{display:flex;flex-direction:column;gap:12px;}.stream-file-label{display:flex;flex-direction:column;gap:7px;font-size:.88rem;font-weight:600;}.stream-file-label input{max-width:100%;min-height:44px;padding:8px 0;box-sizing:border-box;font:inherit;font-weight:400;font-size:.82rem;}.image-sender button,.image-sender select{min-height:44px;padding:9px 12px;border:1px solid #8aafb7;border-radius:8px;background:#fff;color:#24434b;font:inherit;font-size:.88rem;}.image-sender button{cursor:pointer;}.image-sender button:disabled{opacity:.5;cursor:default;}.image-sender .stream-primary{background:#236d7c;border-color:#236d7c;color:#fff;font-weight:600;}.image-sender button:focus-visible,.image-sender input:focus-visible,.image-sender select:focus-visible,.stream-help summary:focus-visible{outline:3px solid #388294;outline-offset:3px;}.stream-options{margin:4px 0 0;padding:10px 12px 12px;border:1px solid #c9dddf;border-radius:8px;min-width:0;}.stream-options legend{font-size:.8rem;font-weight:600;padding:0 5px;}.stream-options label{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;font-size:.84rem;min-height:42px;}.stream-options label+label{margin-top:8px;}.stream-options select{max-width:100%;}.stream-options input[type=range]{width:100%;accent-color:#236d7c;min-height:24px;}.stream-options .stream-check{justify-content:flex-start;}.stream-check input{width:20px;height:20px;accent-color:#236d7c;margin:0;flex-shrink:0;}.stream-options output{font-variant-numeric:tabular-nums;}.stream-send-actions{margin-top:4px;}.stream-send-actions button:first-child{flex:1;}.stream-notice{padding:12px 14px;border:1px solid #d4b987;border-radius:8px;background:#fff8e9;color:#614a20;font-size:.87rem;line-height:1.6;}.stream-receipt,.stream-stats{font-size:.85rem;line-height:1.6;margin:0;}.stream-stats{font-variant-numeric:tabular-nums;}.stream-help{margin-top:22px;padding-top:12px;border-top:1px solid #c9dddf;font-size:.85rem;line-height:1.65;}.stream-help summary{cursor:pointer;min-height:44px;align-content:center;font-weight:600;}.stream-help p{margin:6px 0 12px;}
@media(max-width:760px){.stream-layout{grid-template-columns:1fr;gap:18px;}.stream-steps{grid-template-columns:1fr;gap:0;}.stream-preview-card{max-width:560px;width:100%;box-sizing:border-box;}.stream-options select{flex:1;}.stream-connection>button{width:100%;}}
</style>
