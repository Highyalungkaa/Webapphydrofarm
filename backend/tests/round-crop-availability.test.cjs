const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const exportsObject={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../frontend/src/lib/roundCropAvailability.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsObject});
const {getRoundCropAvailability}=exportsObject;
const crops=[{id:'oak',name:'Oak',is_active:true},{id:'cos',name:'Cos',is_active:true},{id:'off',name:'Disabled',is_active:false}];

test('every active catalog crop is selectable regardless of old plot crop mappings',()=>{
  for(const crop_ids of [[],['oak'],['deleted-crop']]){
    const result=getRoundCropAvailability(crops,[{id:'plot',is_active:true,crop_ids}],['oak']);
    assert.deepEqual(Array.from(result.readyCrops,c=>c.id),['oak','cos']);
    assert.deepEqual(Array.from(result.remainingCrops,c=>c.id),['cos']);
    assert.ok(!result.issues.some(i=>['unassigned-crops','missing-catalog-crops'].includes(i.kind)));
  }
});

test('missing or inactive plots still explain the required setup separately from crop selection',()=>{
  const missing=getRoundCropAvailability(crops,[]);
  assert.ok(missing.issues.some(i=>i.kind==='no-plots'));
  assert.ok(getRoundCropAvailability(crops,[{is_active:false}]).issues.some(i=>i.kind==='inactive-plots'));
  assert.equal(getRoundCropAvailability([],[]).readyCrops.length,0);
});

test('selected catalog crops cannot be added twice and disabled crops stay excluded',()=>{
  const result=getRoundCropAvailability(crops,[{is_active:true}],['oak','cos']);
  assert.equal(result.remainingCrops.length,0);
  assert.equal(result.allAdded,true);
  assert.ok(!result.readyCrops.some(c=>c.id==='off'));
});
