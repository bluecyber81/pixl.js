// Leave the archive engines out of the initial workspace. The caller already
// holds the operation lock and passes its AbortSignal across the module load.
export const loadBackupTools = () => import('./backup.js')

export async function loadBackupZip(input, options) {
  return (await import('./zip-import.js')).loadBackupZip(input, options)
}

export async function previewZipImport(options) {
  return (await import('./zip-import.js')).previewZipImport(options)
}

export async function executeZipImport(options) {
  return (await import('./zip-import.js')).executeZipImport(options)
}
