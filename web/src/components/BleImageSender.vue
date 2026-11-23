<template>
  <section class="image-sender" :aria-busy="loading || exporting">
    <div class="stream-heading"><div><p class="stream-eyebrow">LCD · 128 × 64</p><h2>{{ text.title }}</h2></div><span class="stream-tag">DE3.100 / App673+</span></div>
    <p class="stream-intro">{{ text.intro }}</p>
    <ol class="stream-steps"><li>{{ text.step1 }}</li><li>{{ text.step2 }}</li><li>{{ text.step3 }}</li></ol>
    <p v-if="blocked" class="stream-notice" role="status">{{ text.blocked }}</p>
    <p v-if="unavailable" class="stream-notice" role="status">{{ text.errors[unavailable] }}</p>
    <div class="stream-connection">
      <button v-if="!active" type="button" class="stream-primary" @click="connectStream" :disabled="blocked || !!unavailable || exporting">{{ text.connect }}</button>
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
        <video ref="video" v-show="sourceKind === 'video'" class="stream-video" :controls="!exporting" muted playsinline preload="auto" :loop="loopVideo" :aria-label="text.videoOriginal" @play="onVideoPlay" @pause="onVideoPause" @seeked="refreshPreview" @loadeddata="refreshPreview" @ended="onVideoEnded" @error="onMediaError"></video>
        <p v-if="sourceKind === 'video'" class="stream-hint">{{ text.videoHint }}</p>
      </div>
      <div class="stream-controls">
        <div class="stream-dropzone" :class="{'stream-dragging': dragging}" @dragover.prevent="dragging = !selectionLocked" @dragleave.prevent="dragging = false" @drop.prevent="dropFile">
          <label class="stream-file-label">{{ text.choose }}<input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp,image/bmp,image/gif,image/avif,video/*,.png,.jpg,.jpeg,.webp,.bmp,.gif,.avif,.mp4,.webm,.mov,.m4v,.ogv" @change="chooseFile" :disabled="selectionLocked" /></label>
          <p class="stream-hint">{{ text.dropHint }}</p>
        </div>
        <div class="stream-source-actions"><button type="button" @click="selectDemo" :disabled="selectionLocked">{{ text.demo }}</button><button type="button" @click="resetSender" :disabled="selectionLocked">{{ text.reset }}</button></div>
        <p class="stream-hint">{{ text.local }}</p>
        <p v-if="sessionNotice" class="stream-hint" role="status">{{ text.sessionNotices[sessionNotice] }}</p>
        <p v-if="loading" role="status">{{ text.loading }}</p>
        <fieldset class="stream-options" :disabled="loading || exporting"><legend>{{ text.imageSettings }}</legend>
          <label>{{ text.fit }}<select v-model="fit" @change="refreshPreview"><option value="fit">{{ text.fitOptions.fit }}</option><option value="crop">{{ text.fitOptions.crop }}</option><option value="stretch">{{ text.fitOptions.stretch }}</option></select></label>
          <label>{{ text.rotation }}<select v-model.number="rotation" @change="refreshPreview"><option :value="0">0°</option><option :value="90">90°</option><option :value="180">180°</option><option :value="270">270°</option></select></label>
          <label>{{ text.conversion }}<select v-model="dither" @change="refreshPreview"><option value="threshold">{{ text.thresholdMode }}</option><option value="bayer">{{ text.bayerMode }}</option></select></label>
          <label>{{ text.threshold }} <output>{{ threshold }}</output><input v-model.number="threshold" type="range" min="0" max="255" step="1" @input="refreshPreview" /></label>
          <label class="stream-check"><input v-model="invert" type="checkbox" @change="refreshPreview" />{{ text.invert }}</label>
          <p v-if="dither === 'bayer'" class="stream-hint">{{ text.bayerHint }}</p>
        </fieldset>
        <fieldset v-if="sourceKind !== 'image'" class="stream-options" :disabled="exporting"><legend>{{ text.playSettings }}</legend>
          <label>{{ text.fps }}<select v-model.number="fps" :disabled="sending"><option :value="1">1</option><option :value="2">2</option><option :value="5">5</option><option :value="10">10</option><option :value="15">15</option></select></label>
          <label v-if="sourceKind === 'video'" class="stream-check"><input v-model="loopVideo" type="checkbox" />{{ text.loop }}</label>
          <p class="stream-hint">{{ text.fpsHint }}</p>
        </fieldset>
        <p class="stream-hint">{{ optionsStored ? text.optionsSaved : text.optionsSession }}</p>
        <div class="stream-send-actions"><button type="button" class="stream-primary" @click="startSending" :disabled="!canSend">{{ sourceKind === 'image' ? text.sendImage : sourceKind === 'demo' ? text.startDemo : text.startVideo }}</button><button v-if="sending" type="button" @click="stopStream('stopped')">{{ text.stop }}</button></div>
        <p v-if="notice" class="stream-receipt" role="status" aria-live="polite">{{ text.notices[notice] }}</p>
        <p v-if="sentFrames" class="stream-stats">{{ text.sent }}: <strong>{{ sentFrames }}</strong><template v-if="sentFrames > 1"> · {{ text.actualFps }}: {{ measuredFps }}</template></p>
      </div>
    </div>
    <details class="stream-export"><summary>{{ text.exportTitle }}</summary>
      <p>{{ text.exportIntro }}</p>
      <fieldset class="stream-options" :disabled="loading || exporting || sending"><legend>{{ text.exportClip }}</legend>
        <template v-if="sourceKind === 'video'"><label>{{ text.clipStart }}<input v-model.number="clipStart" type="number" min="0" :max="mediaDuration || undefined" step="0.1" /></label><label>{{ text.clipEnd }}<input v-model.number="clipEnd" type="number" min="0" :max="mediaDuration || undefined" step="0.1" /></label><p v-if="mediaDuration" class="stream-hint">{{ text.videoDuration }}: {{ mediaDuration.toFixed(1) }} s</p></template>
        <label v-else-if="sourceKind === 'demo'">{{ text.demoDuration }}<input v-model.number="clipEnd" type="number" min="0.1" step="0.1" /></label>
        <p v-else class="stream-hint">{{ text.stillExport }}</p>
        <p v-if="exportValidation.plan" class="stream-export-size">{{ exportValidation.plan.frames }} {{ text.frames }} · {{ formatBytes(exportValidation.plan.bytes) }} · {{ exportValidation.plan.fps }} {{ text.fpsUnit }}</p>
        <p v-else class="stream-hint" role="status">{{ text.errors[exportValidation.error] }}</p>
        <p class="stream-hint">{{ text.exportLimit }}</p>
      </fieldset>
      <div class="stream-send-actions"><button type="button" @click="startExport" :disabled="!canExport">{{ text.exportStart }}</button><button v-if="exporting" type="button" @click="cancelExport('cancelled')">{{ text.exportCancel }}</button></div>
      <div v-if="exporting" class="stream-export-progress" role="status"><progress :value="exportCompleted" :max="exportTotal || 1" :aria-label="text.exportProgress"></progress><span>{{ exportCompleted }} / {{ exportTotal }} {{ text.frames }}</span></div>
      <p v-if="exportError" class="stream-notice" role="alert">{{ text.errors[exportError] || text.errors.EXPORT_FAILED }}</p>
      <p v-if="exportNotice" class="stream-receipt" role="status">{{ text.exportNotices[exportNotice] }}</p>
      <p v-if="exportUrl" class="stream-export-download"><a :href="exportUrl" :download="exportFileName">{{ text.exportSave }} · {{ exportFileName }}</a><span>{{ formatBytes(exportBytes) }}</span></p>
      <p class="stream-hint">{{ text.exportDestination }}</p>
    </details>
    <details class="stream-help"><summary>{{ text.helpTitle }}</summary><p>{{ text.help }}</p><p>{{ text.hideHint }}</p><p>{{ text.imageHint }}</p></details>
  </section>
</template>
<script>
import { BleImageStream, rgbaToFrame, frameToRgba } from '../lib/ble-image-stream.js';
import { createFramePump, demoRgba, drawMediaFrame, loadLocalMedia } from '../lib/stream-media.js';
import { readStreamOptions, saveStreamOptions, resetStreamOptions } from '../lib/stream-options.js';
import { streamSession, STREAM_SESSION_MAX_FILE_BYTES } from '../lib/stream-session.js';
import { planPlayerExport, createPlayerExport, playerExportName, seekVideoFrame } from '../lib/stream-player-export.js';

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
Object.assign(TEXT.de_DE, {
  dropHint:'Am Computer kannst du eine Datei auch hier ablegen.', reset:'Zurücksetzen', rotation:'Drehen', conversion:'Schwarz-Weiß-Umrechnung', thresholdMode:'Klare Flächen', bayerMode:'Punktraster für Fotos',
  bayerHint:'Das feste Raster kann Helligkeitsabstufungen besser zeigen. Feinere Muster brauchen eventuell mehr Übertragungszeit.',
  optionsSaved:'Bildoptionen werden auf diesem Gerät gemerkt. Zurücksetzen stellt die Ausgangswerte wieder her.', optionsSession:'Bildoptionen gelten für diese Sitzung; der Browser erlaubt hier keine dauerhafte Speicherung.',
  sessionNotices:{remembered:'Diese eine Datei bleibt für höchstens 30 Minuten in dieser geöffneten Seite verfügbar. Sie wird nicht dauerhaft gespeichert.',restored:'Deine lokale Datei wurde wiederhergestellt. Die Bluetooth-Verbindung und das Senden bleiben ausgeschaltet.',tooLarge:'Dateien über 128 MiB werden beim Bereichswechsel nicht gemerkt. Du kannst diese Datei trotzdem verwenden.'},
  exportTitle:'Für den Animationsplayer speichern', exportIntro:'Erstelle eine Player-Datei aus der eingestellten Vorschau. Das funktioniert lokal und benötigt keine Bluetooth-Verbindung.', exportClip:'Player-Datei vorbereiten', clipStart:'Anfang (Sekunden)', clipEnd:'Ende (Sekunden)', demoDuration:'Dauer (Sekunden)', videoDuration:'Videolänge', stillExport:'Ein einzelnes Bild wird als Player-Datei mit einem Bild gespeichert.', frames:'Bilder', fpsUnit:'Bilder/s', exportLimit:'Höchstens 1 MiB pro Export. Kürze den Ausschnitt oder reduziere die Bildrate, wenn die Datei zu groß wird.', exportStart:'Player-Datei erstellen', exportCancel:'Export abbrechen', exportProgress:'Fortschritt der Player-Datei', exportSave:'Datei speichern', exportDestination:'Speichere die fertige BIN-Datei und übertrage sie anschließend im Dateibereich nach E:/player/. Die normale Speicherplatzprüfung bleibt dabei erhalten. Es wird nichts automatisch auf das Gerät geschrieben.',
  exportNotices:{ready:'Player-Datei fertig. Mit „Datei speichern“ herunterladen.',cancelled:'Export abgebrochen. Es wurde keine unvollständige Datei bereitgestellt.',hidden:'Export abgebrochen, weil die Seite ausgeblendet wurde. Er startet nicht automatisch neu.'},
});
Object.assign(TEXT.en, {
  dropHint:'On a computer you can also drop one file here.', reset:'Reset', rotation:'Rotation', conversion:'Monochrome conversion', thresholdMode:'Clear shapes', bayerMode:'Photo dot pattern',
  bayerHint:'The fixed pattern can preserve tonal detail. Finer patterns may take longer to transfer.',
  optionsSaved:'Image options are remembered on this device. Reset restores the defaults.', optionsSession:'Image options apply to this session; the browser does not allow persistent storage here.',
  sessionNotices:{remembered:'This one file remains available in this open page for up to 30 minutes. It is not saved permanently.',restored:'Your local file was restored. Bluetooth and transmission remain off.',tooLarge:'Files over 128 MiB are not remembered when changing workspace. You can still use this file.'},
  exportTitle:'Save for the animation player', exportIntro:'Create a player file from the adjusted preview. This runs locally and needs no Bluetooth connection.', exportClip:'Prepare player file', clipStart:'Start (seconds)', clipEnd:'End (seconds)', demoDuration:'Duration (seconds)', videoDuration:'Video duration', stillExport:'A still image is saved as a single-frame player file.', frames:'frames', fpsUnit:'frames/s', exportLimit:'At most 1 MiB per export. Shorten the clip or reduce its frame rate if the file is too large.', exportStart:'Create player file', exportCancel:'Cancel export', exportProgress:'Player file progress', exportSave:'Save file', exportDestination:'Save the completed BIN file, then transfer it to E:/player/ in the Files workspace. The usual free-space check still applies. Nothing is written to the device automatically.',
  exportNotices:{ready:'Player file ready. Use “Save file” to download it.',cancelled:'Export cancelled. No incomplete file was made available.',hidden:'Export cancelled because the page was hidden. It will not restart automatically.'},
});
Object.assign(TEXT.de_DE.errors, {MEDIA_MULTIPLE:'Bitte genau eine Bild- oder Videodatei ablegen.',MEDIA_ROTATION:'Diese Bilddrehung wird nicht unterstützt.',EXPORT_RANGE:'Wähle einen gültigen Anfang und ein späteres Ende innerhalb des Videos.',EXPORT_TOO_LARGE:'Der Ausschnitt ist größer als 1 MiB. Kürze ihn oder wähle weniger Bilder pro Sekunde.',EXPORT_FRAME:'Ein Bild konnte nicht für die Player-Datei aufbereitet werden.',EXPORT_SEEK_TIMEOUT:'Das Video konnte die nächste Bildposition nicht rechtzeitig laden. Versuche einen kürzeren Ausschnitt oder eine andere Datei.',EXPORT_FAILED:'Die Player-Datei konnte nicht erstellt werden. Wähle die Datei erneut und versuche es noch einmal.'});
Object.assign(TEXT.en.errors, {MEDIA_MULTIPLE:'Please drop exactly one image or video file.',MEDIA_ROTATION:'This image rotation is not supported.',EXPORT_RANGE:'Choose a valid start and a later end within the video.',EXPORT_TOO_LARGE:'This clip exceeds 1 MiB. Shorten it or choose fewer frames per second.',EXPORT_FRAME:'A frame could not be prepared for the player file.',EXPORT_SEEK_TIMEOUT:'The video did not load the next frame position in time. Try a shorter clip or a different file.',EXPORT_FAILED:'The player file could not be created. Select the file again and retry.'});
export default {
  props:{locale:{type:String,default:'de_DE'},blocked:Boolean},emits:['active','sending','exporting'],
  data(){return {...readStreamOptions(),phase:'idle',deviceName:'',error:'',notice:'',sourceKind:'demo',fileName:'',ready:true,loading:false,sending:false,sentFrames:0,measuredFps:'0.0',dragging:false,optionsStored:true,sessionNotice:'',mediaDuration:0,clipStart:0,clipEnd:10,exporting:false,exportCompleted:0,exportTotal:0,exportError:'',exportNotice:'',exportUrl:'',exportBytes:0,exportFileName:'',unavailable:globalThis.isSecureContext === false ? 'STREAM_INSECURE' : !globalThis.navigator?.bluetooth?.requestDevice ? 'STREAM_UNAVAILABLE' : ''};},
  computed:{
    text(){return TEXT[this.locale] || TEXT.en;},
    active(){return this.phase === 'connecting' || this.phase === 'connected';},
    connected(){return this.phase === 'connected';},
    selectionLocked(){return this.sending || this.exporting || this.phase === 'connecting';},
    canSend(){return this.connected && !this.blocked && !this.sending && !this.exporting && !this.loading && this.ready;},
    preferenceOptions(){return {fit:this.fit,rotation:this.rotation,dither:this.dither,threshold:this.threshold,invert:this.invert,fps:this.fps,loopVideo:this.loopVideo};},
    exportValidation(){try{return {plan:planPlayerExport({kind:this.sourceKind,start:this.sourceKind==='demo'?0:this.clipStart,end:this.clipEnd,fps:this.fps,duration:this.mediaDuration})};}catch(error){return {error:error.code || 'EXPORT_RANGE'};}},
    canExport(){return this.ready && !this.loading && !this.selectionLocked && !!this.exportValidation.plan;},
  },
  created(){
    this._streamMounted = true; this._selection = 0; this._operation = 0; this._demoFrame = 0; this._exportSerial = 0;
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
    else {
      const restored = streamSession.get();
      if(restored) void this.selectFile(restored.file,{restored:true,clip:restored.clip});
      else this.refreshPreview();
    }
    this.optionsStored=saveStreamOptions(this.preferenceOptions);
    document.addEventListener('visibilitychange',this.visibilityChanged);
    globalThis.addEventListener?.('pagehide',this.pageHidden);
  },
  beforeUnmount(){
    this._streamMounted=false; ++this._selection; ++this._operation;
    document.removeEventListener('visibilitychange',this.visibilityChanged);
    globalThis.removeEventListener?.('pagehide',this.pageHidden);
    this.cancelExport(); this.clearExport();
    this.haltPlayback(); this._media?.dispose(); this._media=null; this._source=null; this._client.disconnect();
    this._demoCanvas=this._demoContext=null;
    this.$emit('active',false); this.$emit('sending',false); this.$emit('exporting',false);
  },
  watch:{
    blocked(value){if(value && this.active)this.stopStream();},
    preferenceOptions:{deep:true,handler(value){this.optionsStored=saveStreamOptions(value);if(this.exporting)this.cancelExport('cancelled');this.clearExport();}},
    clipStart(){this.clipChanged();},clipEnd(){this.clipChanged();},
  },
  methods:{
    async connectStream(){
      if(this.blocked || this.active || this.exporting || this.unavailable || document.hidden)return;
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
    pageHidden(){if(this.exporting)this.cancelExport('hidden');if(this.active || this.sending)this.stopStream('hidden');else{this.cancelPreview();this.$refs.video?.pause();}},
    prepareSourceChange(){
      // No write can be pending: both selectors reject connecting/sending.
      // Keep an acknowledged receiver connected while the user prepares media.
      ++this._operation;this.haltPlayback();this.error='';this.notice='';
    },
    async chooseFile(event){
      const file=event.target?.files?.[0]; if(!file || this.selectionLocked)return;
      // Reset the picker value so the same file can be retried after a decode
      // error or timeout; selecting it again must produce another change.
      if(event.target)event.target.value='';
      return this.selectFile(file);
    },
    dropFile(event){
      this.dragging=false;if(this.selectionLocked)return;
      const files=Array.from(event.dataTransfer?.files || []);
      if(files.length!==1){this.error='MEDIA_MULTIPLE';return;}
      void this.selectFile(files[0]);
    },
    async selectFile(file,{restored=false,clip={}}={}){
      if(!file || this.selectionLocked)return;
      const selection=++this._selection;
      // A restored File must survive another workspace change while its new
      // decoder is still loading. Reopening also must not extend its lifetime.
      if(!restored)streamSession.clear();this.sessionNotice='';this.clearExport();this.exportError='';this.exportNotice='';
      this.prepareSourceChange(); this._media?.dispose(); this._media=null; this._source=null;
      this.ready=false;this.loading=true;this.fileName=file.name;this.sentFrames=0;this.mediaDuration=0;
      try{
        const media=loadLocalMedia(file,{video:this.$refs.video});this._media=media;this.sourceKind=media.kind;
        const loaded=await media.ready;
        if(!this._streamMounted || selection!==this._selection)return;
        this._source=loaded.source;this.ready=true;
        this.mediaDuration=media.kind==='video' && Number.isFinite(loaded.source.duration) && loaded.source.duration>0?loaded.source.duration:0;
        const maximum=media.kind==='video'?this.mediaDuration:0;
        this.clipStart=maximum>0 && Number.isFinite(clip.start) && clip.start>=0 && clip.start<maximum?clip.start:0;
        this.clipEnd=maximum>0?(Number.isFinite(clip.end) && clip.end>this.clipStart && clip.end<=maximum?clip.end:Math.min(maximum,this.clipStart+10)):10;
        const remembered=restored?streamSession.get()?.file===file:streamSession.remember(file,{start:this.clipStart,end:this.clipEnd});
        if(remembered)streamSession.updateClip({start:this.clipStart,end:this.clipEnd});
        this.sessionNotice=remembered?(restored?'restored':'remembered'):file.size>STREAM_SESSION_MAX_FILE_BYTES?'tooLarge':'';
        this.refreshPreview();
      }catch(error){if(this._streamMounted && selection===this._selection){if(restored)streamSession.clear();this.error=error?.code || 'MEDIA_DECODE';this._media?.dispose();this._media=null;}}
      finally{if(this._streamMounted && selection===this._selection)this.loading=false;}
    },
    selectDemo(){
      if(this.selectionLocked)return;
      streamSession.clear();this.sessionNotice='';this.clearExport();this.exportError='';this.exportNotice='';
      ++this._selection;this.prepareSourceChange();this._media?.dispose();this._media=null;this._source=null;
      this.sourceKind='demo';this.fileName='';this.ready=!!this._previewContext;this.loading=false;this.sentFrames=0;this._demoFrame=0;this.mediaDuration=0;this.clipStart=0;this.clipEnd=10;
      if(this.$refs.fileInput)this.$refs.fileInput.value='';this.refreshPreview();
    },
    resetSender(){
      if(this.selectionLocked)return;
      this.stopStream();Object.assign(this,resetStreamOptions());this.selectDemo();
    },
    captureFrame(advance=false,demoIndex=this._demoFrame){
      if(!this.ready || !this._previewContext)throw Object.assign(Error('preview'),{code:'MEDIA_PREVIEW'});
      let rgba;
      if(this.sourceKind==='demo'){
        rgba=demoRgba(demoIndex);
        if(this.rotation){
          if(!this._demoCanvas){this._demoCanvas=document.createElement('canvas');this._demoCanvas.width=128;this._demoCanvas.height=64;this._demoContext=this._demoCanvas.getContext('2d');}
          if(!this._demoContext)throw Object.assign(Error('canvas'),{code:'MEDIA_UNSUPPORTED'});
          const image=this._demoContext.createImageData(128,64);image.data.set(rgba);this._demoContext.putImageData(image,0,0);
          rgba=drawMediaFrame(this._context,this._demoCanvas,this.fit,this.rotation);
        }
      }else rgba=drawMediaFrame(this._context,this._source,this.fit,this.rotation);
      const frame=rgbaToFrame(rgba,{threshold:this.threshold,invert:this.invert,dither:this.dither});
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
      if(this.exporting){this.$refs.video?.pause();return;}
      if(this.sending || !this.ready || document.hidden)return;
      const tick=()=>{this._previewRaf=null;if(!this._streamMounted || this.sending || document.hidden || this.$refs.video?.paused)return;this.refreshPreview();this._previewRaf=globalThis.requestAnimationFrame?.(tick);};
      this.cancelPreview();this._previewRaf=globalThis.requestAnimationFrame?.(tick);
    },
    onVideoPause(){this.cancelPreview();if(this.sending && this.sourceKind==='video')this.stopStream(this.$refs.video?.ended?'ended':'paused');else this.refreshPreview();},
    onVideoEnded(){if(this.sending)this.stopStream('ended');},
    onMediaError(){if(this._streamMounted && this.sourceKind==='video' && this.ready){if(this.exporting)this.cancelExport();this.ready=false;this.sendFailed({code:'MEDIA_DECODE'});}},
    clipChanged(){
      streamSession.updateClip({start:this.clipStart,end:this.clipEnd});
      if(this.exporting)this.cancelExport('cancelled');
      this.clearExport();
    },
    formatBytes(bytes){return Number(bytes).toLocaleString(this.locale==='de_DE'?'de-DE':'en-US')+' B';},
    setExporting(value){this.exporting=value;if(this._streamMounted)this.$emit('exporting',value);},
    clearExport(){
      if(this.exportUrl)globalThis.URL?.revokeObjectURL?.(this.exportUrl);
      this.exportUrl='';this.exportBytes=0;this.exportFileName='';
      if(this.exportNotice==='ready')this.exportNotice='';
    },
    cancelExport(notice=''){
      ++this._exportSerial;this._exportController?.abort();this._exportController=null;this.setExporting(false);
      if(notice){this.exportNotice=notice;this.exportError='';}
    },
    async startExport(){
      if(!this.canExport || document.hidden)return;
      const plan=this.exportValidation.plan, serial=++this._exportSerial;
      this.clearExport();this.exportError='';this.exportNotice='';this.exportCompleted=0;this.exportTotal=plan.frames;
      this.haltPlayback();
      const controller=new AbortController();this._exportController=controller;this.setExporting(true);
      const source=this._source, kind=this.sourceKind, name=playerExportName(this.fileName || 'demo');
      try{
        const bytes=await createPlayerExport(plan,{
          signal:controller.signal,
          capture:async(index,seconds)=>{
            if(kind==='video')await seekVideoFrame(source,seconds,{signal:controller.signal});
            if(!this._streamMounted || serial!==this._exportSerial || controller.signal.aborted)throw Object.assign(Error('cancel'),{code:'EXPORT_CANCELLED'});
            return this.captureFrame(false,index);
          },
          onProgress:progress=>{if(this._streamMounted && serial===this._exportSerial)this.exportCompleted=progress.completed;},
        });
        if(!this._streamMounted || serial!==this._exportSerial || controller.signal.aborted)return;
        const url=globalThis.URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));
        this.exportUrl=url;this.exportBytes=bytes.length;this.exportFileName=name;this.exportNotice='ready';
      }catch(error){
        if(this._streamMounted && serial===this._exportSerial){
          if(error?.code==='EXPORT_CANCELLED')this.exportNotice='cancelled';
          else this.exportError=error?.code || 'EXPORT_FAILED';
        }
      }finally{
        if(serial===this._exportSerial){this._exportController=null;this.setExporting(false);}
      }
    },
  }
};
</script>
<style scoped>
.image-sender{color:#24434b;max-width:1050px;padding:clamp(14px,2.5vw,26px);background:#f6fafb;border:1px solid #c9dddf;border-radius:16px;overflow-wrap:anywhere;}
.stream-heading,.stream-connection,.stream-preview-heading,.stream-send-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}.stream-heading{justify-content:space-between;}.stream-eyebrow{font-size:.74rem;letter-spacing:.1em;font-weight:700;margin:0 0 6px;color:#526e74;}.image-sender h2{font-size:clamp(1.35rem,3vw,1.8rem);line-height:1.25;margin:0;}.stream-tag{font-size:.75rem;padding:6px 9px;border-radius:6px;background:#e4eef1;color:#49666e;}.stream-intro{max-width:75ch;line-height:1.65;}.stream-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding-left:24px;font-size:.86rem;line-height:1.55;margin:20px 0;}.stream-steps li{padding:6px 10px 6px 2px;}.stream-connection{padding:14px 0;margin-bottom:12px;}.stream-state{font-size:.87rem;}.stream-online{font-weight:700;color:#236351;}.stream-layout{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(260px,1fr);gap:24px;align-items:start;}.stream-preview-card{background:#e6eff0;padding:16px;border:1px solid #c4d8da;border-radius:12px;}.stream-preview-heading{justify-content:space-between;margin-bottom:12px;}.stream-preview-heading h3{font-size:1rem;margin:0;}.stream-preview-heading span{font-size:.77rem;color:#4e686e;}.stream-preview{display:block;width:100%;height:auto;aspect-ratio:2/1;image-rendering:pixelated;background:#000;border-radius:3px;box-sizing:border-box;border:6px solid #29434a;}.stream-source-name{font-size:.9rem;font-weight:600;margin:12px 0 5px;}.stream-hint{font-size:.78rem;line-height:1.55;color:#4d666e;margin:8px 0 0;}.stream-video{display:block;max-width:100%;width:100%;max-height:230px;margin-top:16px;border-radius:6px;background:#000;}.stream-controls{display:flex;flex-direction:column;gap:12px;}.stream-file-label{display:flex;flex-direction:column;gap:7px;font-size:.88rem;font-weight:600;}.stream-file-label input{max-width:100%;min-height:44px;padding:8px 0;box-sizing:border-box;font:inherit;font-weight:400;font-size:.82rem;}.image-sender button,.image-sender select{min-height:44px;padding:9px 12px;border:1px solid #8aafb7;border-radius:8px;background:#fff;color:#24434b;font:inherit;font-size:.88rem;}.image-sender button{cursor:pointer;}.image-sender button:disabled{opacity:.5;cursor:default;}.image-sender .stream-primary{background:#236d7c;border-color:#236d7c;color:#fff;font-weight:600;}.image-sender button:focus-visible,.image-sender input:focus-visible,.image-sender select:focus-visible,.stream-help summary:focus-visible{outline:3px solid #388294;outline-offset:3px;}.stream-options{margin:4px 0 0;padding:10px 12px 12px;border:1px solid #c9dddf;border-radius:8px;min-width:0;}.stream-options legend{font-size:.8rem;font-weight:600;padding:0 5px;}.stream-options label{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;font-size:.84rem;min-height:42px;}.stream-options label+label{margin-top:8px;}.stream-options select{max-width:100%;}.stream-options input[type=range]{width:100%;accent-color:#236d7c;min-height:24px;}.stream-options .stream-check{justify-content:flex-start;}.stream-check input{width:20px;height:20px;accent-color:#236d7c;margin:0;flex-shrink:0;}.stream-options output{font-variant-numeric:tabular-nums;}.stream-send-actions{margin-top:4px;}.stream-send-actions button:first-child{flex:1;}.stream-notice{padding:12px 14px;border:1px solid #d4b987;border-radius:8px;background:#fff8e9;color:#614a20;font-size:.87rem;line-height:1.6;}.stream-receipt,.stream-stats{font-size:.85rem;line-height:1.6;margin:0;}.stream-stats{font-variant-numeric:tabular-nums;}.stream-help{margin-top:22px;padding-top:12px;border-top:1px solid #c9dddf;font-size:.85rem;line-height:1.65;}.stream-help summary{cursor:pointer;min-height:44px;align-content:center;font-weight:600;}.stream-help p{margin:6px 0 12px;}
@media(max-width:760px){.stream-layout{grid-template-columns:1fr;gap:18px;}.stream-steps{grid-template-columns:1fr;gap:0;}.stream-preview-card{max-width:560px;width:100%;box-sizing:border-box;}.stream-options select{flex:1;}.stream-connection>button{width:100%;}}
.stream-dropzone{border:1px dashed #8aafb7;border-radius:9px;padding:10px 12px;background:#fff;}.stream-dragging{background:#dceded;border-color:#236d7c;}.stream-source-actions{display:flex;gap:10px;flex-wrap:wrap;}.stream-source-actions>button{flex:1;}.stream-export{margin-top:24px;padding:14px 16px;border:1px solid #c4d8da;border-radius:12px;background:#fff;line-height:1.6;}.stream-export>summary{font-weight:650;cursor:pointer;min-height:44px;align-content:center;}.stream-export p{font-size:.85rem;}.stream-export .stream-options{max-width:620px;}.stream-export input[type=number]{width:140px;max-width:100%;min-height:44px;padding:8px;border:1px solid #8aafb7;border-radius:7px;box-sizing:border-box;font:inherit;color:inherit;background:#fff;}.stream-export-size{font-variant-numeric:tabular-nums;font-weight:600;}.stream-export-progress{display:flex;align-items:center;gap:12px;margin-top:14px;font-size:.86rem;}.stream-export-progress progress{flex:1;min-width:0;accent-color:#236d7c;}.stream-export-download{display:flex;gap:12px;align-items:center;flex-wrap:wrap;}.stream-export-download a{color:#155a6a;font-weight:600;overflow-wrap:anywhere;padding:10px 0;}.stream-export>summary:focus-visible,.stream-export-download a:focus-visible{outline:3px solid #388294;outline-offset:3px;}
@media(max-width:480px){.stream-export{padding:10px 12px;}.stream-export input[type=number]{width:100%;}.stream-export-progress{align-items:flex-start;flex-direction:column;}.stream-export-progress progress{width:100%;flex:auto;}}
</style>
