const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(relative){const exports={};const file=path.resolve(__dirname,relative);vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require(name){return load(path.relative(__dirname,path.resolve(path.dirname(file),name.replace(/\.js$/,'.ts'))));}});return exports;}
const {validateUnsoldInput}=load('../src/lib/unsoldRound.ts');
const item={remaining_plant_count:450,plants_per_kg:5,available_kg:90};
const input={count:'400',disposition:'discard',note:''};
test('manual unsold records accept counted plants without calculating any yield',()=>assert.equal(validateUnsoldInput(input,item),null));
test('reject invalid counted plants, manual precision and missing disposition details',()=>{
  for(const override of [{count:''},{count:'451'},{count:'1.5'},{unsoldKg:'1.001'},{disposition:''},{disposition:'other'}])assert.ok(validateUnsoldInput({...input,...override},item));
  assert.equal(validateUnsoldInput({...input,disposition:'other',note:'บริจาคและแปรรูป',unsoldKg:'125.75'},item),null);
});
