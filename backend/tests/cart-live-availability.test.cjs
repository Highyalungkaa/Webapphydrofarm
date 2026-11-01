const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const exportsObject={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../frontend/src/lib/cartAvailability.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsObject});
test('new stock and prices update cart metadata without reducing customer-entered quantities',()=>{
  const original=[{round_item_id:'oak',crop_name:'Oak',qty_kg:10,price_per_kg:100,available_qty_kg:20},{round_item_id:'removed',qty_kg:2,price_per_kg:80}];
  const next=exportsObject.syncVegetableAvailability(original,{items:[{id:'oak',price_per_kg:120,available_qty_kg:5,price_tiers:[{price_per_kg:120,available_qty_kg:5}]}]});
  assert.equal(next[0].qty_kg,10);assert.equal(next[0].available_qty_kg,5);assert.equal(next[0].price_per_kg,120);
  assert.equal(next[1].qty_kg,2);assert.equal(next[1].available_qty_kg,0);
  assert.equal(original[0].price_per_kg,100);
});
