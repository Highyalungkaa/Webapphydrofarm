const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const helpers = {};
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync(path.resolve(__dirname, '../src/lib/plotCrops.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText, { exports: helpers });

test('all assigned crops are selectable, with legacy and explicit empty-list support', () => {
  assert.equal(helpers.plotSupportsCrop({ crop_ids: ['a', 'b', 'c'], crop_id: 'a' }, 'c'), true);
  assert.equal(helpers.plotSupportsCrop({ crop_ids: ['a', 'b'] }, 'd'), false);
  assert.equal(helpers.plotSupportsCrop({ crop_id: 'a' }, 'a'), true);
  assert.equal(helpers.plotSupportsCrop({ crop_ids: [], crop_id: 'a' }, 'a'), false);
});

test('different crops share a plot without counting its capacity twice', () => {
  const result = helpers.allocatePlotSlots(
    [{ id: 'p', slot_capacity: 100 }],
    [
      { crop_id: 'a', selected_plot_ids: ['p'], bookable_qty_kg: 10 },
      { crop_id: 'b', selected_plot_ids: ['p'], bookable_qty_kg: 20 },
    ],
    { a: 4, b: 2 }, { p: 20 },
  );
  assert.equal(result.beforeItem[0].p, 20);
  assert.equal(result.beforeItem[1].p, 60);
  assert.equal(result.allocatedByItem[0].p, 40);
  assert.equal(result.allocatedByItem[1].p, 40);
  assert.equal(result.used.p, 100);
});

test('plant counts reserve actual space even when calculated kilograms round down', () => {
  const result = helpers.allocatePlotSlots(
    [{ id: 'p', slot_capacity: 120 }],
    [
      { crop_id: 'a', selected_plot_ids: ['p'], plant_count: 100 },
      { crop_id: 'b', selected_plot_ids: ['p'], plant_count: 20 },
    ],
    { a: 4.5, b: 4.5 }, {},
  );
  assert.equal(result.beforeItem[1].p, 100);
  assert.equal(result.allocatedByItem[0].p, 100);
  assert.equal(result.allocatedByItem[1].p, 20);
  assert.equal(result.used.p, 120);
});

test('one crop is split across plots without showing the same plants twice', () => {
  const result = helpers.allocatePlotSlots(
    [{ id: 'a', slot_capacity: 100 }, { id: 'b', slot_capacity: 100 }],
    [{ crop_id: 'lettuce', selected_plot_ids: ['a', 'b'], plant_count: 130 }],
    {}, { a: 20 },
  );
  assert.equal(result.allocatedByItem[0].a, 80);
  assert.equal(result.allocatedByItem[0].b, 50);
});
