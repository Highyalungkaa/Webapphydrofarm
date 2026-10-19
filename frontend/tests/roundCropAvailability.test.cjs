const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadSource(relative) {
  const filename = path.resolve(__dirname, relative);
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, {
    exports,
    require(name) {
      return loadSource(path.relative(__dirname, path.resolve(path.dirname(filename), name.replace(/\.js$/, '.ts'))));
    },
  });
  return exports;
}
const { getRoundCropAvailability } = loadSource('../src/lib/roundCropAvailability.ts');
const crop = { id: 'a', name: 'Green Oak', is_active: true };
const plot = { id: 'p', name: 'Plot 1', crop_ids: ['a'], is_active: true };

test('disabled crop with an assigned plot directs the user to the crop catalog', () => {
  const result = getRoundCropAvailability([{ ...crop, is_active: false }], [plot]);
  assert.equal(result.readyCrops.length, 0);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].kind, 'disabled-crops');
  assert.equal(result.issues[0].href, '/admin/crops');
  assert.ok(result.issues[0].message.includes('Green Oak'));
});

test('active crop without a designated plot directs the user to plot assignment', () => {
  const result = getRoundCropAvailability([crop], [{ ...plot, crop_ids: [] }]);
  assert.equal(result.issues[0].kind, 'unassigned-crops');
  assert.equal(result.issues[0].href, '/admin/plots');
  assert.equal(result.issues[0].action, 'กำหนดผักให้แปลงปลูก');
});

test('active crop with only disabled plots recommends enabling plots', () => {
  const result = getRoundCropAvailability([crop], [{ ...plot, is_active: false }]);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].kind, 'inactive-plots');
  assert.equal(result.issues[0].action, 'เปิดใช้งานแปลงปลูก');
});

test('empty catalog recommends adding crops before plot setup', () => {
  const result = getRoundCropAvailability([], [plot]);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].kind, 'no-crops');
  assert.equal(result.issues[0].href, '/admin/crops');
});

test('missing plots recommends creating a plot rather than enabling the crop', () => {
  const result = getRoundCropAvailability([crop], []);
  assert.equal(result.issues[0].kind, 'unassigned-crops');
  assert.equal(result.issues[0].action, 'สร้างแปลงปลูก');
});

test('mixed issues retain ready crops and give each blocked group the right destination', () => {
  const result = getRoundCropAvailability([
    crop, { id: 'b', name: 'Kale', is_active: false }, { id: 'c', name: 'Rocket', is_active: true },
  ], [{ ...plot, crop_ids: ['a', 'b'] }]);
  assert.equal(result.remainingCrops[0].id, 'a');
  assert.equal(result.issues.find((issue) => issue.kind === 'disabled-crops').href, '/admin/crops');
  assert.equal(result.issues.find((issue) => issue.kind === 'unassigned-crops').href, '/admin/plots');
});

test('all ready crops already selected is a normal completed selection', () => {
  const result = getRoundCropAvailability([crop], [plot], ['a']);
  assert.equal(result.allAdded, true);
  assert.equal(result.remainingCrops.length, 0);
  assert.equal(result.issues.length, 0);
});

test('an active plot is sufficient even when other assigned plots are disabled', () => {
  const result = getRoundCropAvailability([crop], [plot, { ...plot, id: 'p2', is_active: false }]);
  assert.equal(result.remainingCrops.length, 1);
  assert.equal(result.issues.length, 0);
});
