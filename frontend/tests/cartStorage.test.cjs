const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('../../backend/node_modules/typescript');
const exportsObject={};const storage={getItem(){throw Error('Storage disabled');},setItem(){throw Error('Storage full');},removeItem(){throw Error('Storage disabled');}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../src/lib/cartStorage.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsObject,window:{sessionStorage:storage,localStorage:storage}});
const {restoreVegetableCart,restoreEquipmentCart,readCartValue,persistCartValue}=exportsObject;
test('malformed, null and structurally corrupted stored carts recover without crashing the whole app',()=>{
 for(const text of ['null','{}','false','bad','[null,{},1]']){assert.equal(restoreVegetableCart(text).length,0);assert.equal(restoreEquipmentCart(text).length,0);}
 const valid={round_item_id:'oak',crop_name:'Oak',price_per_kg:50,qty_kg:0.5};assert.equal(restoreVegetableCart(JSON.stringify([valid,{...valid,qty_kg:-1},{...valid,price_tiers:[null]}])).length,1);
 assert.equal(restoreEquipmentCart(JSON.stringify([{product:{id:'p',name:'Pot',price:50,stock_quantity:3},quantity:1},{product:null,quantity:1}])).length,1);
});
test('disabled or full browser storage does not stop in-memory cart operations',()=>{
 assert.equal(readCartValue('sessionStorage','cart'),null);assert.doesNotThrow(()=>persistCartValue('localStorage','cart','[]'));assert.doesNotThrow(()=>persistCartValue('sessionStorage','cart',null));
});
