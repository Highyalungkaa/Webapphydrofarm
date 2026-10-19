const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

for (const source of ['../src/lib/plantingQuantities.ts', '../../backend/src/services/plantingQuantities.ts']) {
  const helpers = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname, source), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports: helpers });
  test(`${source}: weight is rounded down to whole kilograms`, () => {
    assert.equal(helpers.plantCountToKg(100, 4.5), 22);
    assert.equal(helpers.plantCountToKg(103, 4), 25);
    assert.equal(helpers.plantCountToKg(2, 4.5), 0);
    assert.equal(helpers.plantCountToKg(33, 1.1), 30);
    assert.equal(helpers.plantCountToKg(0, 4), 0);
  });
}
