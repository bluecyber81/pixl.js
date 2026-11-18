import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '@vue/compiler-sfc';

const {descriptor} = parse(readFileSync(new URL('../src/components/DisplayPhoto.vue', import.meta.url), 'utf8'));
const script = descriptor.script.content.replace(/^import .*$/gm, '').replace('export default', 'return');

function mount() {
  const component = Function('renderDisplayPhoto', 'document', script)(
    (pixels, _canvas, rotated) => {
      if (pixels === 'invalid') throw Error('Canvas failure');
      return pixels + (rotated ? '-rotated' : '');
    }, {createElement() { return {}; }}
  );
  const events = [];
  const vm = Object.assign(component.data(), component.methods, {
    connected: true, supported: true, remote: true, firmwareVersion: '2.22.0-DE3.85',
    $emit: (...args) => events.push(args)
  });
  return {vm, component, events};
}

test('a refresh retains the last successful frame, time and orientation across busy, unsupported and render errors', async () => {
  const {vm} = mount();
  vm.readPhoto = async () => 'first';
  await vm.capture();
  vm.rotate();
  assert.equal(vm.photo, 'first-rotated');
  const capturedAt = vm.capturedAt;
  assert.ok(capturedAt);
  for (const [read, status] of [
    [() => { throw Object.assign(Error(), {code:'REMOTE_BUSY'}); }, 'remoteBusy'],
    [() => null, 'unsupported'],
    [() => 'invalid', 'renderFailed']
  ]) {
    vm.readPhoto = read;
    await vm.capture();
    assert.equal(vm.status, status);
    assert.equal(vm.photo, 'first-rotated');
    assert.equal(vm.pixels, 'first');
    assert.equal(vm.capturedAt, capturedAt);
    assert.equal(vm.capturedFirmware, '2.22.0-DE3.85');
  }
  vm.rotate();
  assert.equal(vm.status, 'renderFailed');
  vm.rotate();
  vm.readPhoto = async () => 'second';
  await vm.capture();
  assert.equal(vm.photo, 'second-rotated');
  assert.equal(vm.status, '');
});

test('clearing a session resets time, rotation and frame, and a late automatic capture cannot restore them', async () => {
  const {vm, component, events} = mount();
  vm.readPhoto = async () => 'old';
  await vm.capture();
  vm.rotate();
  let finish;
  vm.readPhoto = () => new Promise(resolve => { finish = resolve; });
  const refresh = vm.capture();
  assert.equal(vm.photo, 'old-rotated');
  for (const prop of ['connected', 'generation', 'firmwareVersion', 'supported']) {
    assert.equal(component.watch[prop], 'clear');
  }
  vm.clear();
  finish('late');
  await refresh;
  assert.equal(vm.photo, '');
  assert.equal(vm.pixels, null);
  assert.equal(vm.capturedAt, '');
  assert.equal(vm.capturedFirmware, '');
  assert.equal(vm.rotated, false);
  assert.deepEqual(events.map(([,busy]) => busy), [true, false, true, false]);
});
