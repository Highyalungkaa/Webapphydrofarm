const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const helpers={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../src/lib/orderCustomer.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:helpers});
test('guest reports group repeated contact numbers without combining all null customer IDs',()=>{
  const guest={id:'first',customer_id:null,contact_phone:'081-234-5678'};
  assert.equal(helpers.orderCustomerKey(guest),helpers.orderCustomerKey({...guest,id:'second',contact_phone:'+66 81 234 5678'}));
  assert.notEqual(helpers.orderCustomerKey(guest),helpers.orderCustomerKey({...guest,contact_phone:'0899999999'}));
  assert.notEqual(helpers.orderCustomerKey(guest),helpers.orderCustomerKey({...guest,customer_id:'registered'}));
  assert.notEqual(helpers.orderCustomerKey({...guest,contact_phone:''}),helpers.orderCustomerKey({...guest,id:'second',contact_phone:''}));
});
