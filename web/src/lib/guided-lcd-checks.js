const pair = (de,en) => Object.freeze([de,en]);
const views = ['r0','r180'];
const swaps = ['normal','swapped'];
const games = ['Tiny Invaders','Tiny Arkanoid','Tiny Tris','Tiny Lander'];
const rows = [];
function add(module,id,labels) { rows.push(Object.freeze({module,id,labels})); }
for (const view of views) for (const swap of swaps) {
  const de = (view === 'r0' ? '0°' : '180°') + (swap === 'normal' ? ' · Tausch aus' : ' · Tausch ein');
  const en = (view === 'r0' ? '0°' : '180°') + (swap === 'normal' ? ' · swap off' : ' · swap on');
  add('controls', 'controls/'+view+'/'+swap, pair(de,en));
  for (const game of games) add('games','game/'+game.split(' ')[1].toLowerCase()+'/'+view+'/'+swap, pair(game+' · '+de,game+' · '+en));
}
for (const [id,de,en] of [
  ['disabled','Dimmen ausgeschaltet','Dimming disabled'],['idle','Dimmen bei Bedienpause','Dimming during inactivity'],
  ['first-input','Erster Tastendruck und Aufhellen','First press and brightness restoration'],
  ['zero','Helligkeit bei 0 %','Brightness at 0%'],['sleep','Einschlafen und Aufwachen','Sleep and wake'],
  ['nfc','Während einer NFC-Sitzung','During an NFC session'],['ble','Während einer Dateiübertragung','During file transfer'],
  ['remote','Bedienung mit der Fernbedienung','Remote input']
]) add('dim','dim/'+id,pair(de,en));
for (const phase of ['system','application']) for (const incident of ['disconnect','power-loss']) {
  const de = (phase === 'system' ? 'Systemphase' : 'App-Phase')+' · '+(incident === 'disconnect' ? 'Verbindungsabbruch' : 'Stromunterbrechung');
  const en = (phase === 'system' ? 'System stage' : 'Application stage')+' · '+(incident === 'disconnect' ? 'disconnect' : 'power loss');
  for (const [key,d,e] of [['reconnect','erneut verbunden','reconnection'],['checkpoint','Offset und CRC','offset and CRC'],['finish','Abschluss','completion']]) {
    add('dfu','dfu/'+phase+'/'+incident+'/'+key,pair(de+' · '+d,en+' · '+e));
  }
}
export const lcdCheckCases = Object.freeze(rows);
export const lcdSources = Object.freeze(['manual-device','host-test','device-readback']);
const ids = new Set(rows.map(row=>row.id));
const validTime = s => typeof s === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s) &&
  Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s;
export const lcdObservationKey = ({caseId,source}) => caseId+'/'+source;
export function cleanLcdObservations(value = {}, {imported=false} = {}) {
  if (!value || typeof value !== 'object') throw new Error('Invalid LCD observations');
  const entries = Object.values(value);
  if (entries.length > rows.length*lcdSources.length) throw new Error('Too many LCD observations');
  const result = {};
  for (const row of entries) {
    if (!row || !ids.has(row.caseId) || !lcdSources.includes(row.source) || !['ok','different','inconclusive'].includes(row.outcome) ||
        !validTime(row.recordedAt) || typeof row.note !== 'string' || row.note.length > 1000 ||
        /\u0000/.test(row.note) || typeof row.imported !== 'boolean') throw new Error('Invalid LCD observation');
    const key = lcdObservationKey(row);
    if (Object.hasOwn(result,key)) throw new Error('Duplicate LCD observation');
    result[key] = {caseId:row.caseId,source:row.source,outcome:row.outcome,note:row.note,
      recordedAt:row.recordedAt,imported:imported || row.imported};
  }
  return result;
}
export function summarizeLcdObservations(observations) {
  const rows = Object.values(observations);
  return {totalCases:lcdCheckCases.length, localDeviceCases:rows.filter(x=>x.source==='manual-device' && !x.imported).length,
    imported:rows.filter(x=>x.imported).length, hostTests:rows.filter(x=>x.source==='host-test' && !x.imported).length,
    readbacks:rows.filter(x=>x.source==='device-readback' && !x.imported).length};
}
