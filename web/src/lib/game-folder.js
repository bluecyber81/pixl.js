// These are device-database group IDs, including game-specific subdivisions.
// Web-only guide associations have no firmware source line or device group.
import {assertPortableEntryName, joinDevicePath, portableNameKey} from './portable-names.js';
import {checkedDirectory, copyMetadata, targetEntry} from './safe-upload.js';

export function deviceGames(usage, catalogue) {
  const names = new Map((catalogue?.entries || []).map(entry => [entry.id, entry.name]));
  const groups = new Map(usage.groups.filter(group => Number.isInteger(group.id) && group.id > 0 && group.id < 255 &&
    group.sourceLine > 0).map(group => [group.id, {id:group.id, label:group.labelPath.join(' › '), figures:new Map()}]));
  for (const figure of usage.figures) {
    if (!/^[0-9a-f]{16}$/.test(figure.id)) continue;
    for (const link of figure.associations) {
      if (link.sourceLine > 0) groups.get(link.groupId)?.figures.set(figure.id, names.get(figure.id) || figure.id);
    }
  }
  return [...groups.values()].filter(group => group.figures.size).sort((a,b) => a.label.localeCompare(b.label));
}

function fail(code) { throw Object.assign(new Error(code), {code}); }

export function deviceFolderSpec(group, folder, ids) {
  try { assertPortableEntryName(folder); } catch { fail('FAV_FOLDER_NAME'); }
  if (new TextEncoder().encode(folder).length > 25) fail('FAV_FOLDER_NAME');
  if (!group || !Number.isInteger(group.id) || group.id < 1 || group.id > 254 || !ids.length) fail('FAV_SELECTION');
  const path = joinDevicePath('E:/amiibo/fav', folder);
  const rows = [...new Set(ids)].map(id => {
    if (!/^[0-9a-f]{16}$/.test(id) || !group.figures.has(id)) fail('FAV_SELECTION');
    const name = group.id + '_' + id.slice(0,8).toUpperCase() + '_' + id.slice(8).toUpperCase() + '.fav';
    return {id, name, path:joinDevicePath(path, name)};
  });
  return {folder, path, groupId:group.id, rows};
}

async function contents(session, path) {
  session.assertSession();
  const entries = checkedDirectory(await session.readDirectory(path));
  session.assertSession();
  return entries;
}

async function inspectFolder(session, spec, create = false) {
  let path = 'E:/';
  for (const name of ['amiibo', 'fav', spec.folder]) {
    const parent = path;
    let entry = targetEntry(await contents(session, parent), name);
    path = joinDevicePath(parent, name);
    if (!entry) {
      if (!create) return {exists:false, entries:[]};
      await session.createDirectory(path);
      session.assertSession();
      // Re-read the actual parent entry including its metadata.
      entry = targetEntry(await contents(session, parent), name);
      if (!entry) fail('FAV_FOLDER_BLOCKED');
    }
    if (entry.type !== 1 || copyMetadata(entry.meta).flags.readonly) fail('FAV_FOLDER_BLOCKED');
  }
  return {exists:true, entries:await contents(session, path)};
}

function markerState(entries, groupId, row) {
  // Firmware also accepts leading zeros for the group and lowercase hex.
  const matches = entries.filter(entry => {
    const m = /^(\d{1,3})_([0-9a-fA-F]{8})_([0-9a-fA-F]{8})\.fav$/.exec(entry.name);
    return (m && Number(m[1]) === groupId && (m[2] + m[3]).toLowerCase() === row.id) ||
      portableNameKey(entry.name) === portableNameKey(row.name);
  });
  if (!matches.length) return 'new';
  if (matches.some(entry => entry.type !== 0 || !entry.name.endsWith('.fav'))) return 'conflict';
  return 'present';
}

export async function previewDeviceFolder(session, spec) {
  const {exists, entries} = await inspectFolder(session, spec);
  return {...spec, exists, rows:spec.rows.map(row => ({...row, state:markerState(entries,spec.groupId,row)}))};
}

export async function applyDeviceFolder(session, plan, onProgress = () => {}) {
  const added = [], skipped = [];
  const pending = plan.rows.filter(row => row.state === 'new');
  if (!pending.length) return {added, skipped};
  try {
    const local = await inspectFolder(session, plan, true);
    if (!local.exists) fail('FAV_FOLDER_BLOCKED');
    let entries = local.entries;
    // Verify small batches by directory read-back. A lost CLOSE acknowledgement
    // leaves an uncertain batch; a new preview reconciles it after reconnect.
    for (let i = 0; i < pending.length; i += 8) {
      const batch = pending.slice(i,i+8);
      const attempted = [];
      for (const row of batch) {
        const state = markerState(entries, plan.groupId, row);
        if (state === 'conflict') fail('FAV_CONFLICT');
        if (state === 'present') { skipped.push(row.id); continue; }
        session.assertSession();
        await session.touchFile(row.path);
        session.assertSession();
        attempted.push(row);
      }
      entries = await contents(session, plan.path);
      for (const row of attempted) {
        const marker = entries.find(entry => entry.name === row.name);
        if (!marker || marker.type !== 0 || marker.size !== 0) fail('FAV_VERIFY');
        added.push(row.id);
      }
      onProgress(added.length, skipped.length);
    }
    return {added, skipped};
  } catch (error) {
    error.confirmed = added.length;
    throw error;
  }
}
