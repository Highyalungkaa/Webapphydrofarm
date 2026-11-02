const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const frontendRequire=require('node:module').createRequire(path.resolve(__dirname,'../../frontend/package.json'));
const React=frontendRequire('react'),{renderToStaticMarkup}=frontendRequire('react-dom/server');
function load(file,requireMock){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,require:requireMock});return exports;}
const helper=load('../../frontend/src/lib/customerOrderHistory.ts');
const base={total_amount:100,created_at:'2026-11-03',order_items:[],equipment_order_items:[],fulfillment_method:'pickup',payment_method:'transfer'};
const fixtures=[['active','confirmed','unpaid'],['paid','completed','paid'],['unpaid','completed','unpaid'],['cancelled','cancelled','paid']];
function render(filter,records){let index=0;const state=[filter,records.vegetables,records.equipment,false,null];
 const {OrdersPage}=load('../../frontend/src/pages/customer/OrdersPage.tsx',name=>{
  if(name==='react')return{...React,useState:()=>[state[index++],()=>{}],useEffect(){}};
  if(name==='react-router-dom')return{Link:({to,children,...props})=>React.createElement('a',{href:to,...props},children),useSearchParams:()=>[new URLSearchParams()]};
  if(name.endsWith('/customerOrderHistory.js'))return helper;
  if(name.endsWith('/useLiveRefresh.js'))return{useLiveRefresh(){}};
  if(name.endsWith('/dateFormat.js'))return{formatDateDMY:value=>value};
  if(name.endsWith('/bookingQuantity.js'))return{formatKg:value=>String(value)};
  if(name.endsWith('/pooledBooking.js'))return{harvestRange:()=>''};
  return new Proxy({},{get:()=>()=>null});
 });return renderToStaticMarkup(React.createElement(OrdersPage));
}
test('customer current and history screens partition both kinds of orders without losing unpaid or cancelled records',()=>{
 const records={vegetables:fixtures.map(([id,status,payment_status])=>({...base,id:'veg-'+id,status,payment_status})),equipment:fixtures.map(([id,status,payment_status])=>({...base,id:'eq-'+id,status,payment_status}))};
 const current=render('all',records),history=render('history',records);
 assert.ok(current.includes('รายการปัจจุบัน'));assert.ok(history.includes('ประวัติการจองและซื้อ'));
 for(const [id]of fixtures)for(const type of ['veg','eq']){
  const href=`href="/orders/${type==='eq'?'equipment/':''}${type}-${id}"`;
  assert.equal(current.includes(href),id!=='paid',href+' current');assert.equal(history.includes(href),id==='paid',href+' history');
 }
 // Reversing payment must return the order to the current list on the next refresh.
 records.vegetables.find(order=>order.id==='veg-paid').payment_status='unpaid';
 assert.ok(render('all',records).includes('href="/orders/veg-paid"'));assert.ok(!render('history',records).includes('href="/orders/veg-paid"'));
});
