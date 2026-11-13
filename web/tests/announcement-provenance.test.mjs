import { test } from 'node:test';
import assert from 'node:assert/strict';
import { announcementGroups } from '../src/data/announced-figures.js';

test('regional announcements retain their original date precision and do not assert an NFC identity', () => {
  const formats = { day: /^\d{4}-\d{2}-\d{2}$/, season: /^spring-\d{4}$/, year: /^\d{4}$/ };
  const figures = announcementGroups.flatMap(g => g.figures);
  const released = announcementGroups.filter(group => group.released);
  assert.deepEqual(released.map(group => [group.series, group.region, group.date]), [['Kirby Air Riders', 'US', '2026-11-12']]);
  assert.deepEqual(released.flatMap(group => group.figures.map(figure => figure.en)),
    ['Sword Kirby & Dragoon', 'Noir Dedede & Hydra']);
  assert.equal(figures.length, 9);
  assert.equal(figures.filter(f => f.proposedId).length, 2);
  assert.ok(figures.every(f => !Object.hasOwn(f, 'id')));
  for (const group of announcementGroups) {
    assert.match(group.date, formats[group.datePrecision]);
    assert.match(group.sourceCheckedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(['US', 'CA'].includes(group.region));
    assert.ok(group.figures.every(f => new URL(f.source).hostname === 'www.nintendo.com'));
  }
});
