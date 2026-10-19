const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const code = ts.transpileModule(
  fs.readFileSync(path.resolve(__dirname, '../src/lib/dateFormat.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
const dateFormat = {};
vm.runInNewContext(code, { exports: dateFormat });

test('opening on October 19 Bangkok is 19 days after September 30, including UTC previous day', () => {
  assert.equal(dateFormat.toBangkokDateString('2026-10-18T17:00:00Z'), '2026-10-19');
  assert.equal(dateFormat.differenceInBangkokCalendarDays('2026-10-18T17:00:00Z', '2026-09-30'), -19);
  assert.equal(dateFormat.differenceInBangkokCalendarDays('2026-10-19T08:00:00+07:00', '2026-09-30'), -19);
});

test('booking comparison uses calendar days for same-day and advance bookings', () => {
  assert.equal(dateFormat.differenceInBangkokCalendarDays('2026-10-18T18:00:00Z', '2026-10-19'), 0);
  assert.equal(dateFormat.differenceInBangkokCalendarDays('2026-10-19T23:59:00+07:00', '2026-10-30'), 11);
  assert.equal(dateFormat.differenceInBangkokCalendarDays(null, '2026-10-19'), null);
  assert.equal(dateFormat.differenceInBangkokCalendarDays('invalid', '2026-10-19'), null);
});
