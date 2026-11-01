const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(name){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../frontend/src/lib',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>n==='./orderReport.js'?load('orderReport'):require(n)});return exports;}
const {roundCropSales}=load('roundCropSales');
const line=(id,round_item_id,qty_kg=2,price_per_kg=100,discount_amount=0)=>({id,round_item_id,qty_kg,price_per_kg,discount_amount});
const paid=items=>({status:'completed',payment_status:'paid',order_items:items});

test('sales use booked line prices after discounts, only for completed and paid orders',()=>{
  const items=[{id:'oak'},{id:'cos'},{id:'unsold'}];
  const result=roundCropSales([
    paid([line('a','oak',2,100,20),line('b','cos',1,150)]),
    paid([line('c','oak',0.5,120)]),
    {...paid([line('d','oak')]),status:'confirmed'},
    {...paid([line('e','oak')]),payment_status:'unpaid'},
    {...paid([line('f','oak')]),status:'cancelled'},
    {...paid([line('g','cos')]),status:'no_show'},
  ],items);
  assert.equal(result.get('oak'),240);assert.equal(result.get('cos'),150);assert.equal(result.get('unsold'),0);
});

test('pooled sales exclude other source rounds and sum money to cents',()=>{
  const result=roundCropSales([
    paid([line('a','this-round',0.5,99.99,0.01),line('b','other-round',10,100)]),
    paid([line('c','this-round',0.5,99.99,0.01)]),
  ],[{id:'this-round'}]);
  assert.equal(result.get('this-round'),99.98);
  assert.equal(result.has('other-round'),false);
});
