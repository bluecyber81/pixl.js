import test from 'node:test';
import assert from 'node:assert/strict';
import { directoryBreadcrumbs, checkedPageSize } from '../src/lib/folder-navigation.js';

test('breadcrumbs retain exact Unicode, spaces, percent signs and every parent', () => {
  assert.deepEqual(directoryBreadcrumbs('E:/Figuren/Ä & %2F/Link.bin'), [
    {path:'',name:null}, {path:'E:/',name:'E:/'}, {path:'E:/Figuren',name:'Figuren'},
    {path:'E:/Figuren/Ä & %2F',name:'Ä & %2F'}, {path:'E:/Figuren/Ä & %2F/Link.bin',name:'Link.bin'}
  ]);
  assert.equal(directoryBreadcrumbs('I:/').length, 2);
  assert.deepEqual(directoryBreadcrumbs(''), [{path:'',name:null}]);
});
test('invalid paths produce no navigable device path and never normalize traversal', () => {
  for (const value of [null, {}, 'E:', 'e:/', 'E:/a//b', 'E:/a/', 'E:/../x', 'E:/./x', 'E:/a\0b', 'E:/a\\b', 'https://example.com']) {
    assert.deepEqual(directoryBreadcrumbs(value), [{path:'',name:null}], String(value));
  }
});
test('page size is bounded to the supported render sizes', () => {
  for (const value of [25,'25',50,'50',100,'100']) assert.equal(checkedPageSize(value), Number(value));
  for (const value of [0,-1,10000,NaN,'all','',null]) assert.equal(checkedPageSize(value),100);
});
