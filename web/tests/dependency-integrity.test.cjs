const test = require('node:test');
const path = require('node:path');
const { verifyDependencyIntegrity } = require('./helpers/dependency-integrity.cjs');
const root = process.env.PIXL_DEPENDENCY_ROOT || path.resolve(__dirname, '..');

test('installed library identities and current license notices agree with the pinned lock without metadata exceptions', () => {
  verifyDependencyIntegrity(root);
});
