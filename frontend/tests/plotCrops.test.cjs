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

for(const [name,allocator] of [['frontend',helpers],['backend',(()=>{const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../backend/src/services/plantAllocation.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});return exports;})()]]){
 test(`${name}: increasing oak moves additional plants to plot 2 and preserves constrained crops`,()=>{
  const plots=[{id:'p1',slot_capacity:500},{id:'p2',slot_capacity:420}];
  const items=[{crop_id:'oak',plant_count:100,selected_plot_ids:['p1','p2']},{crop_id:'cos',plant_count:100,selected_plot_ids:['p1']},{crop_id:'butter',plant_count:100,selected_plot_ids:['p1']},{crop_id:'finley',plant_count:200,selected_plot_ids:['p1']}];
  const before=allocator.allocatePlotSlots(plots,items,{},{});
  const after=allocator.allocatePlotSlots(plots,items.map(i=>({...i,plant_count:i.crop_id==='oak'?200:i.plant_count})),{},{});
  assert.equal(after.allocatedByItem[0].p1,100);assert.equal(after.allocatedByItem[0].p2,100);
  for(const index of [1,2,3])assert.equal(JSON.stringify(after.allocatedByItem[index]),JSON.stringify(before.allocatedByItem[index]));
  assert.equal(after.unallocatedByItem.reduce((a,b)=>a+b,0),0);assert.equal(after.used.p1,500);assert.equal(after.used.p2,100);
 });
 test(`${name}: overlapping plot choices can reroute earlier allocations without overbooking`,()=>{
  const plots=['a','b','c'].map(id=>({id,slot_capacity:100}));
  const items=[{crop_id:'one',plant_count:100,selected_plot_ids:['a','b']},{crop_id:'two',plant_count:100,selected_plot_ids:['a','b']},{crop_id:'three',plant_count:100,selected_plot_ids:['a','c']}];
  const result=allocator.allocatePlotSlots(plots,items,{},{});
  assert.equal(result.unallocatedByItem.reduce((a,b)=>a+b,0),0);
  assert.equal(result.used.a,100);assert.equal(result.used.b,100);assert.equal(result.used.c,100);
  const excess=allocator.allocatePlotSlots(plots,[...items,{crop_id:'extra',plant_count:1,selected_plot_ids:['a']}],{},{});
  assert.equal(excess.unallocatedByItem.reduce((a,b)=>a+b,0),1);
 });
}
