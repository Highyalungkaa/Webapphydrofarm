const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { StaticRouter } = require('react-router-dom/server');

function loadSource(filename) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require(name) {
      // Icons do not affect the timeline content under test.
      if (name === 'lucide-react') return new Proxy({}, { get: () => () => React.createElement('svg', { 'aria-hidden': true }) });
      if (!name.startsWith('.')) return require(name);
      const target = path.resolve(path.dirname(filename), name.replace(/\.js$/, ''));
      return loadSource(fs.existsSync(`${target}.tsx`) ? `${target}.tsx` : `${target}.ts`);
    },
  });
  return exports;
}
const { PlotRoundTimeline } = loadSource(path.resolve(__dirname, '../src/components/admin/PlotRoundTimeline.tsx'));
const render = (rounds) => renderToStaticMarkup(React.createElement(StaticRouter, null, React.createElement(PlotRoundTimeline, { rounds })));

test('one round card groups multiple crops and renders all five dates', () => {
  const round = {
    id: 'round-1', name: 'October round', status: 'growing', current_step: 5,
    seed_date: '2026-10-01', fertilizing_date: '2026-10-07', planting_start_date: '2026-10-12', transplant_date: '2026-10-19',
  };
  const html = render([
    { ...round, crop_name: 'Lettuce', used_slots: 40, growing_days: 30, calculated_harvest_date: '2026-11-18' },
    { ...round, crop_name: 'Kale', used_slots: 20, growing_days: 45, calculated_harvest_date: '2026-12-03' },
  ]);
  assert.equal((html.match(/October round/g) || []).length, 1);
  assert.match(html, /60 ต้น/);
  for (const date of ['01/10/2026', '07/10/2026', '12/10/2026', '19/10/2026', '18/11/2026', '03/12/2026']) assert.ok(html.includes(date));
  assert.match(html, /วันเก็บเกี่ยว \(ระบบคำนวณ\)/);
  assert.match(html, /href="\/admin\/rounds\/round-1"/);
});

test('missing milestone dates and empty plots have clear messages', () => {
  const html = render([{ id: 'round-2', name: 'New round', crop_name: 'Rocket', used_slots: 20 }]);
  assert.equal((html.match(/ยังไม่บันทึก/g) || []).length, 4);
  assert.match(html, /รอบันทึกวันปลูกจริง/);
  assert.match(render([]), /ยังไม่มีรอบปลูกใช้แปลงนี้/);
});
