const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../src/lib/plantLossWizard.ts'),'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: exportsObject });
const { getLossPlotChoices, getLossItemsForPlot, isValidLossDate } = exportsObject;
const plotA = { id:'a',name:'แปลง A' }, plotB = { id:'b',name:'แปลง B' };
const items = [
  { id:'oak',crop_name:'Green Oak',remaining_plant_count:450,plots:[plotA,plotB] },
  { id:'cos',crop_name:'Cos',remaining_plant_count:200,plots:[plotB] },
  { id:'dead',crop_name:'Dead crop',remaining_plant_count:0,plots:[{id:'empty',name:'Empty plot'}] },
  { id:'legacy',crop_name:'Legacy crop',remaining_plant_count:10,plots:[] },
];
test('plot-first selection deduplicates shared plots and excludes plots with no surviving plants',()=>{
  const ids=Array.from(getLossPlotChoices(items),p=>p.id);
  assert.deepEqual(ids,['a','b']);
});
test('only surviving crops planted in the selected plot are offered',()=>{
  assert.deepEqual(Array.from(getLossItemsForPlot(items,'a'),i=>i.id),['oak']);
  assert.deepEqual(Array.from(getLossItemsForPlot(items,'b'),i=>i.id),['oak','cos']);
  assert.equal(getLossItemsForPlot(items,'').length,0);
  assert.equal(getLossItemsForPlot(items,'unknown').length,0);
  assert.equal(getLossItemsForPlot(items,'empty').length,0);
});
test('legacy unassigned crops cannot appear in an unrelated plot',()=>{
  assert.equal(getLossItemsForPlot(items,'__unassigned__').length,0);
  assert.equal(getLossPlotChoices([items[3]]).length,0);
});
test('final step permits historical discovery dates without a planting-start boundary',()=>{
  assert.equal(isValidLossDate('2026-10-21','','2026-10-21'),true);
  assert.equal(isValidLossDate('2026-10-01','','2026-10-21'),true);
  assert.equal(isValidLossDate('2026-09-30','','2026-10-21'),true);
  for(const date of ['','2026-10-22','2026-02-30','2026-2-03']) {
    assert.equal(isValidLossDate(date,'','2026-10-21'),false);
  }
});
