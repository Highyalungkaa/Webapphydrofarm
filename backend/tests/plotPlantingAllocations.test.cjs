const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(relative){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,relative),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require(name){return name.endsWith('/plotCrops.js')?load('../src/services/plotCrops.ts'):require(name);}});return exports;}
const {getPlotPlantingAllocations}=load('../src/services/plotPlantingAllocations.ts');
const plots=[{id:'a',slot_capacity:100,crop_ids:['oak']},{id:'b',slot_capacity:100,crop_ids:['oak','cos']},{id:'c',slot_capacity:100,crop_ids:['cos']}];
const item=(id,crop,count)=>({id,crop_id:crop,plant_count:count,estimated_qty_kg:count/5,bookable_qty_kg:count/5,crops:{name:crop,slots_per_kg:5}});
const round=(items,notes)=>({id:'round',name:'R',status:'growing',current_step:5,round_items:items,notes:notes?JSON.stringify({cropPlotIds:notes}):'legacy note'});
test('legacy fallback offers the same occupied plots as plot management, not every compatible plot',()=>{
  const result=getPlotPlantingAllocations(plots,[round([item('i','oak',60)])]);
  assert.deepEqual(Array.from(result.allocations,a=>[a.plot_id,a.plant_count]),[['a',60]]);
});
test('explicitly selected plots with no allocated plants are excluded',()=>{
  const result=getPlotPlantingAllocations(plots,[round([item('i','oak',60)],{oak:['a','b']})]);
  assert.deepEqual(Array.from(result.allocations,a=>a.plot_id),['a']);
});
test('multiple crops share capacity without presenting unused plots as planted',()=>{
  const result=getPlotPlantingAllocations(plots,[round([item('i','oak',150),item('j','cos',80)],{oak:['a','b'],cos:['b','c']})]);
  assert.deepEqual(Array.from(result.allocations,a=>[a.crop_id,a.plot_id,a.plant_count]),[['oak','a',100],['oak','b',50],['cos','b',50],['cos','c',30]]);
});
test('earlier rounds reserve capacity; ended rounds do not reserve plots',()=>{
  const older={...round([item('old','oak',100)]),id:'old'};
  const current=round([item('i','oak',50)]);
  const active=getPlotPlantingAllocations(plots,[older,current]);
  assert.equal(active.allocations.find(a=>a.round_id==='round').plot_id,'b');
  const ended=getPlotPlantingAllocations(plots,[{...older,status:'completed'},current]);
  assert.equal(ended.allocations.find(a=>a.round_id==='round').plot_id,'a');
});
