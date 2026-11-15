import test from 'node:test'
import assert from 'node:assert/strict'
import { formatBuildVersion } from '../src/lib/build-version.js'

test('ordinary builds keep the release version and optional review labels do not replace it', () => {
  for (const label of [undefined, null, '', '   ', 42, {}]) assert.equal(formatBuildVersion('3.52.0', label), '3.52.0')
  assert.equal(formatBuildVersion('3.52.0', 'Review 1 · 15.11.2026'), '3.52.0 · Review 1 · 15.11.2026')
  assert.equal(formatBuildVersion('next-version', '  Review\n1  '), 'next-version · Review 1')
  assert.equal(formatBuildVersion('3.52.0', 'x'.repeat(100)), '3.52.0 · ' + 'x'.repeat(80))
})
