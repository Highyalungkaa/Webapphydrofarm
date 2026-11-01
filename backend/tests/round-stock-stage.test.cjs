const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(name){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../frontend/src/lib',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>n==='./managedOrders.js'?load('managedOrders'):require(n)});return exports;}
const {canAddRoundStock}=load('roundStock');
test('surplus action starts at harvest readiness and remains available after sold out until final closure',()=>{
  assert.equal(canAddRoundStock({status:'booking_open',current_step:5}),false);
  for(const current_step of [6,7])assert.equal(canAddRoundStock({status:'booking_open',current_step}),true);
  assert.equal(canAddRoundStock({status:'booking_closed',current_step:8,sold_out_date:'2026-11-02'}),true);
  for(const round of [{status:'completed',current_step:8},{status:'cancelled',current_step:7},{status:'booking_closed',current_step:8,sold_out_date:'2026-11-02',completed_date:'2026-11-02'},{status:'booking_closed',current_step:7,closure_reason:'unsold'}])assert.equal(canAddRoundStock(round),false);
});
