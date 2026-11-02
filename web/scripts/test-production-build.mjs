import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readdirSync } from 'node:fs'

// npm cannot set environment variables portably on Windows and Unix.
// Keep the two supported output locations explicit, not caller-supplied paths.
const mode = process.argv[2]
if (!['root', 'pages'].includes(mode) || process.argv.length !== 3) throw new Error('Expected root or pages')
const cwd = fileURLToPath(new URL('../', import.meta.url))
const files = readdirSync(new URL('../tests/dist/', import.meta.url)).filter(file => file.endsWith('.test.mjs'))
  .sort().map(file => `tests/dist/${file}`)
const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd, stdio: 'inherit', windowsHide: true,
  env: { ...process.env, ALLMIIBO_DIST_DIR: fileURLToPath(new URL(mode === 'pages' ? '../dist-pages/' : '../dist/', import.meta.url)),
    ALLMIIBO_TEST_BASE_PATH: mode === 'pages' ? '/pixl.js/' : '/' }
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
