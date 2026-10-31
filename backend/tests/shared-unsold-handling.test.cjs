const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript');
const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../frontend/src/lib/unsoldRound.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:out});
const item={remaining_plant_count:200,plants_per_kg:8,available_kg:25};
test('one handling choice applies to every crop with unsold plants, preserving separate amounts',()=>{
 const rows=[{count:'8',unsoldKg:'1',disposition:'',note:''},{count:'10',unsoldKg:'1',disposition:'',note:''},{count:'0',unsoldKg:'',disposition:'',note:''}];
 const result=rows.map(row=>out.withSharedUnsoldHandling(row,'donate','Donate together'));
 assert.equal(result[0].disposition,'donate');assert.equal(result[1].disposition,'donate');assert.equal(result[0].note,result[1].note);assert.equal(result[0].count,'8');assert.equal(result[1].count,'10');assert.equal(result[2].disposition,'');assert.equal(result[2].note,'');
 result.forEach(row=>assert.equal(out.validateUnsoldInput(row,item),null));
});
test('shared other handling requires details, and crop amounts are still validated separately',()=>{
 const row={count:'8',unsoldKg:'1',disposition:'',note:''};
 assert.equal(out.validateUnsoldAmounts(row,item),null);assert.match(out.validateUnsoldInput(out.withSharedUnsoldHandling(row,'other',''),item),/รายละเอียด/);
 assert.equal(out.validateUnsoldInput(out.withSharedUnsoldHandling(row,'other','Details'),item),null);
 assert.match(out.validateUnsoldAmounts({...row,count:'201'},item),/ไม่เกิน/);
});
