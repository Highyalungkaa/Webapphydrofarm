const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadTs(relativePath, modules = {}) {
  const filename = path.resolve(__dirname, '../src/lib', relativePath);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => modules[name] });
  return exports;
}

const dates = loadTs('dateFormat.ts');
const steps = loadTs('roundStepDates.ts', { './dateFormat.js': dates });

test('planting milestones are seven days after the preceding recorded status', () => {
  const round = {
    current_step: 4,
    fertilizing_date: '2026-10-07',
    planting_start_date: '2026-10-16',
    planted_at: '2026-10-01', // Initial legacy value is the seed date, not the transplant date.
  };
  assert.equal(steps.plantingStartDate({ ...round, planting_start_date: null }), '2026-10-14');
  assert.equal(steps.transplantDate(round), '2026-10-23');
  assert.equal(steps.transplantDate({ ...round, transplant_date: '2026-10-24' }), '2026-10-24');
});

test('date suggestions cross month boundaries and require the preceding status date', () => {
  assert.equal(steps.transplantDate({ current_step: 4, planting_start_date: '2026-10-28' }), '2026-11-04');
  assert.equal(steps.transplantDate({ current_step: 4, planted_at: '2026-10-01' }), null);
});
