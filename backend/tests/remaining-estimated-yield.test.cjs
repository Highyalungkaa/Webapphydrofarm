const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const exportsObject={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../frontend/src/lib/estimatedYield.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsObject});
const {remainingEstimatedKg}=exportsObject;
test('forecast drops from 25 kg to 10 kg after losing 120 of 200 plants and restores on reversal',()=>{
 const row={plant_count:200,lost_plant_count:0,planting_plants_per_kg:8,estimated_qty_kg:25};
 assert.equal(remainingEstimatedKg(row),25);row.lost_plant_count=120;assert.equal(remainingEstimatedKg(row),10);
 row.lost_plant_count=200;assert.equal(remainingEstimatedKg(row),0);row.lost_plant_count=220;assert.equal(remainingEstimatedKg(row),0);
 row.lost_plant_count=0;assert.equal(remainingEstimatedKg(row),25);assert.equal(row.estimated_qty_kg,25);
});
test('forecast uses the saved planting rate and existing whole-kilogram rounding',()=>{
 assert.equal(remainingEstimatedKg({plant_count:203,lost_plant_count:120,planting_plants_per_kg:8,estimated_qty_kg:25}),10);
 assert.equal(remainingEstimatedKg({plant_count:200,lost_plant_count:120,estimated_qty_kg:25}),null);
});
