const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../frontend/src/lib/orderUpdateValidation.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:out});
const items=[{id:'a',qty_kg:2,price_per_kg:50,round_items:{crops:{name:'Oak'}}}];
test('confirmation does not require weighing, but ready status explains the missing crop weight',()=>{
 assert.equal(out.orderUpdateIssues('confirmed','unpaid',items,{a:''},{},{}).length,0);
 assert.match(out.orderUpdateIssues('ready','unpaid',items,{a:''},{},{}).join(),/Oak.*น้ำหนักที่ชั่งจริง/);
 assert.equal(out.orderUpdateIssues('ready','unpaid',items,{a:'2'},{},{}).length,0);
 assert.equal(out.ownWeightForSave('',0,2,'confirmed'),null);
});
test('complete substitution can save zero farm weight without inventing a positive weighed amount',()=>{
 assert.equal(out.orderUpdateIssues('ready','unpaid',items,{a:''},{a:{qtyKg:'2',totalCost:'50'}},{}).length,0);
 assert.equal(out.ownWeightForSave('',2,2,'ready'),0);
 assert.equal(out.ownWeightForSave('',1,2,'ready'),null);
 assert.ok(out.orderUpdateIssues('ready','unpaid',items,{a:''},{a:{qtyKg:'1',totalCost:'25'}},{}).length);
});
