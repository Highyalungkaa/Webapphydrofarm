const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const helpers = {};
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync(path.resolve(__dirname, '../src/services/plotRoundTimeline.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText, { exports: helpers });

test('each crop uses its round-specific growing days and the actual transplant date', () => {
  const round = {
    status: 'growing', current_step: 5, transplant_date: '2026-10-19', growing_days: 45,
    seed_date: '2026-10-01', fertilizing_date: '2026-10-07', planting_start_date: '2026-10-12',
    notes: JSON.stringify({ cropGrowingDays: { lettuce: 30, kale: 45 } }),
  };
  const lettuce = helpers.getPlotRoundTimeline(round, { crop_id: 'lettuce', crops: { growing_days: 60 } });
  const kale = helpers.getPlotRoundTimeline(round, { crop_id: 'kale' });
  assert.equal(lettuce.calculated_harvest_date, '2026-11-18');
  assert.equal(kale.calculated_harvest_date, '2026-12-03');
  for (const key of ['seed_date', 'fertilizing_date', 'planting_start_date', 'transplant_date']) {
    assert.equal(lettuce[key], round[key]);
  }
});

test('draft placeholders never appear as confirmed transplant or harvest dates', () => {
  const result = helpers.getPlotRoundTimeline({ status: 'draft', current_step: 3, planted_at: '2026-10-01' }, { crop_id: 'lettuce' });
  assert.equal(result.transplant_date, null);
  assert.equal(result.calculated_harvest_date, null);
  assert.equal(result.planting_start_date, null);
});

test('legacy planting dates and plain-text notes retain harvest calculation', () => {
  const result = helpers.getPlotRoundTimeline({ status: 'growing', planted_at: '2026-12-20', notes: 'Legacy note' }, { crop_id: 'lettuce', crops: { growing_days: 20 } });
  assert.equal(result.calculated_harvest_date, '2027-01-09');
});
