const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const orderId='11111111-1111-4111-8111-111111111111';
const customerId='22222222-2222-4222-8222-222222222222';

function setup(file,{databaseError=null,missing=false,viewerId=customerId,isAdmin=false}={}){
 const routes=new Map(),queries=[];
 const router={};
 for(const method of ['use','get','post','patch'])router[method]=(route,...handlers)=>routes.set(method+' '+route,handlers.at(-1));
 const order={id:orderId,customer_id:customerId,planting_rounds:{id:'round',name:'Source round'},order_items:[]};
 const db={from(){
  let select='';
  const result=single=>{
   const error=databaseError||(!select.includes('planting_rounds!orders_round_id_fkey')?{code:'PGRST201',message:'Ambiguous relationship'}:null);
   return {error,data:error?null:single?(missing?null:order):(missing?[]:[order])};
  };
  const q={select(value){select=value;queries.push(value);return q;},eq(){return q;},order(){return q;},range(){return q;},or(){return q;},
   maybeSingle:async()=>result(true),then:(resolve,reject)=>Promise.resolve(result(false)).then(resolve,reject)};
  return q;
 }};
 const filename=path.resolve(__dirname,file);
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports:{},console:{error(){}},require(name){
   if(name==='express')return{Router:()=>router};
   if(name.endsWith('/supabase.js'))return{supabaseAdmin:db};
   if(name.endsWith('/auth.js'))return{requireAuth(){},requireAdmin(){}};
   if(name.endsWith('/rateLimiter.js'))return{orderCreationLimiter(){}};
   if(name.endsWith('/audit.js'))return{};
   if(name.endsWith('/roundOrders.js'))return require('./load-service.cjs')('roundOrders');
   return require(name);
  }
 });
 return{queries,async get(route){
  const res={statusCode:200,status(code){this.statusCode=code;return this;},json(value){this.body=value;}};
  await routes.get('get '+route)({params:{id:orderId},query:{},user:{id:viewerId,isAdmin}},res);
  return res;
 }};
}

for(const [file,route,list] of [
 ['../src/routes/orders.ts','/mine',true],['../src/routes/orders.ts','/:id',false],
 ['../src/routes/admin/orders.ts','/',true],['../src/routes/admin/orders.ts','/:id',false]
])test(`${file} ${route} reads the anchor round despite extra pooled relationships`,async()=>{
 const app=setup(file),res=await app.get(route);
 assert.equal(res.statusCode,200);const order=list?res.body[0]:res.body;
 assert.equal(order.id,orderId);assert.equal(order.planting_rounds.name,'Source round');
 assert.match(app.queries[0],/planting_rounds:planting_rounds!orders_round_id_fkey/);
});

for(const file of ['../src/routes/orders.ts','../src/routes/admin/orders.ts']){
 test(`${file} distinguishes a database read failure from an absent order`,async()=>{
  const failed=await setup(file,{databaseError:{code:'PGRST201',message:'Ambiguous relationship'}}).get('/:id');
  assert.equal(failed.statusCode,500);assert.match(failed.body.error,/ไม่สามารถโหลด/);
  const absent=await setup(file,{missing:true}).get('/:id');assert.equal(absent.statusCode,404);
 });
}
test('a successful order read still rejects another customer and permits an admin',async()=>{
 const viewerId='33333333-3333-4333-8333-333333333333';
 assert.equal((await setup('../src/routes/orders.ts',{viewerId}).get('/:id')).statusCode,403);
 assert.equal((await setup('../src/routes/orders.ts',{viewerId,isAdmin:true}).get('/:id')).statusCode,200);
});
