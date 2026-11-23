import test from 'node:test';
import assert from 'node:assert/strict';
import { firmwareBoard, displayBuildReference, supportsFolderPublication, LCD_Z21_COUNTERS } from '../src/lib/hardware-profile.js';
import { getMigrationCapacityTarget } from '../src/lib/migration-capacity.js';
import { supportsLinkDiagnostics, supportsStorageGcDiagnostics } from '../src/lib/device-extra-diagnostics.js';

const engine = '3ba6db5d72cb6c292beedd36b0b5126d4b63783ff054d07bcbc5c097d19ecd0f';

test('App675 has its own LCD build identity while App672 through App674 remain selectable', () => {
  for (const [profile, version, counter] of [
    ['de399', '2.22.0-DE3.99', 672], ['de3100', '2.22.0-DE3.100', 673], ['de3101', '2.22.0-DE3.101', 674], ['de3102', '2.22.0-DE3.102', 675],
  ]) {
    const target = getMigrationCapacityTarget(profile);
    assert.equal(firmwareBoard(version), 'LCD');
    assert.equal(LCD_Z21_COUNTERS[version], counter);
    assert.deepEqual(displayBuildReference(version), { source: 'lcd-firmware-configuration', controllerDriver: 'ST7567', width: 128, height: 64 });
    assert.equal(target.approved, true);
    assert.deepEqual(target.approvedApplications, [{firmwareVersion:version, applicationCounter:counter}]);
    assert.equal(supportsFolderPublication(version, engine), true);
    assert.equal(supportsLinkDiagnostics(version), true);
    assert.equal(supportsStorageGcDiagnostics(version), true);
    assert.equal(supportsFolderPublication(version, '0'.repeat(64)), false);
    assert(Object.isFrozen(target)); assert(Object.isFrozen(target.layout));
    assert(Object.isFrozen(target.approvedApplications[0]));
  }
});

test('App675 support does not admit a future LCD identity or attach LCD storage approval to OLED', () => {
  for (const version of ['2.22.0-DE3.103', '2.22.0-DE3.101test', '2.22.0-DE3.101-OLEDt7', undefined]) {
    assert.equal(LCD_Z21_COUNTERS[version], undefined);
    assert.equal(supportsFolderPublication(version, engine), false);
    assert.equal(supportsLinkDiagnostics(version), false);
    assert.equal(supportsStorageGcDiagnostics(version), false);
    assert.equal(displayBuildReference(version), null);
  }
  assert.equal(firmwareBoard('2.22.0-DE3.101-OLEDt7'), 'OLED');
  assert.equal(firmwareBoard('2.22.0-DE3.103'), null);
  assert.throws(() => getMigrationCapacityTarget('de3103'), {code:'MIGRATION_CAPACITY'});
});
