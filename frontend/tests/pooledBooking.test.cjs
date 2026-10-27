const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../../backend/node_modules/typescript');
function load(name){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../src/lib',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>n==='./dateFormat.js'?load('dateFormat'):require(n)});return exports;}
const {cartLineTotal,priceLabel,harvestRange,scopeOrderToRound,customerCropLines}=load('pooledBooking');
test('pooled cart totals use FIFO prices, including fractional source splits',()=>{
 const item={qty_kg:15,price_per_kg:50,price_tiers:[{available_qty_kg:10,price_per_kg:50},{available_qty_kg:10,price_per_kg:60}]};
 assert.equal(cartLineTotal(item),800);assert.equal(priceLabel(50,item.price_tiers),'฿50–60');
 assert.equal(cartLineTotal({...item,qty_kg:0.5,price_tiers:[{available_qty_kg:0.2,price_per_kg:50},{available_qty_kg:10,price_per_kg:60}]}),28);
 assert.equal(cartLineTotal({qty_kg:2,price_per_kg:50}),100);
});
test('harvest labels collapse same dates and advance when an older round is removed',()=>{
 assert.equal(harvestRange('2026-11-01','2026-11-08'),'01/11/2026 – 08/11/2026');
 assert.equal(harvestRange('2026-11-08','2026-11-08'),'08/11/2026');
});
test('reports scope a cross-round order while customer lines remain one crop',()=>{
 const order={round_id:'r1',order_items:[{id:'a',qty_kg:10,price_per_kg:50,discount_amount:5,round_items:{round_id:'r1',crops:{id:'oak',name:'Oak'}}},{id:'b',qty_kg:5,price_per_kg:60,round_items:{round_id:'r2',crops:{id:'oak',name:'Oak'}}}]};
 const customer=customerCropLines(order);assert.equal(customer.length,1);assert.equal(customer[0].qty,15);assert.equal(customer[0].gross,800);assert.equal(customer[0].discount,5);
 assert.equal(scopeOrderToRound(order,'r2').total_amount,300);assert.equal(scopeOrderToRound(order,'r3'),null);
});
