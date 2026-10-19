const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const helpers = {};
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync(path.resolve(__dirname, '../src/lib/bookingQuantity.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText, { exports: helpers });

test('manual entry supports whole kilograms and two decimal places', () => {
  for (const value of ['0.5', '1.25', '2.5', '10', ' 3.75 ']) {
    assert.equal(helpers.parseBookingQuantity(value).qty, Number(value));
  }
});

test('blank, non-finite and below-minimum values cannot be added', () => {
  for (const value of ['', ' ', 'abc', 'NaN', 'Infinity', '-1', '0', '0.49']) {
    assert.ok(helpers.parseBookingQuantity(value).error, value);
  }
});

test('extra decimal places are rejected rather than silently changing the requested weight', () => {
  assert.ok(helpers.parseBookingQuantity('1.235').error);
  assert.equal(helpers.parseBookingQuantity('1.250').qty, 1.25);
});

test('cart and summary formatting retain the entered hundredths of a kilogram', () => {
  assert.equal(helpers.formatKg(1.25), '1.25');
  assert.equal(helpers.formatKg(0.5), '0.5');
  assert.equal(helpers.formatKg(2), '2.0');
  assert.equal(helpers.formatKg(1.25 + 0.5), '1.75');
});
