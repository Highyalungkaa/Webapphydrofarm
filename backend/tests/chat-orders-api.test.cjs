const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {randomUUID}=require('node:crypto');
function setup(error=null){
  const middleware=[],calls=[];let handler;
  const router={use:(...args)=>middleware.push(...args),post:(route,fn)=>{assert.equal(route,'/from-chat');handler=fn;}};
  const auth=()=>{},admin=()=>{},actor=randomUUID();
  const db={rpc:async(name,args)=>{calls.push({name,args});return{data:{order_id:randomUUID()},error};}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../src/routes/admin/chatOrders.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
    {exports:{},require(name){if(name==='express')return{Router:()=>router};if(name.endsWith('/supabase.js'))return{supabaseAdmin:db};if(name.endsWith('/auth.js'))return{requireAuth:auth,requireAdmin:admin};return require(name);}});
  return{calls,middleware,auth,admin,actor,async request(body){const res={statusCode:200,status(n){this.statusCode=n;return this;},json(value){this.body=value;}};await handler({body,user:{id:actor}},res);return res;}};
}
const valid=()=>({request_id:randomUUID(),round_id:randomUUID(),customer_name:'Guest',contact_phone:'0812345678',fulfillment_method:'pickup',accepted_substitution_terms:true,items:[{round_item_id:randomUUID(),qty_kg:1.25}]});
test('chat orders require admin middleware and derive actor/source/price only on server',async()=>{
  const app=setup(),body={...valid(),actor_id:randomUUID(),order_source:'website',price_per_kg:1};
  assert.equal(app.middleware[0],app.auth);assert.equal(app.middleware[1],app.admin);
  assert.equal((await app.request(body)).statusCode,201);
  const rpc=app.calls[0];assert.equal(rpc.name,'create_admin_chat_order');assert.equal(rpc.args.p_actor_id,app.actor);
  assert.equal(rpc.args.p_payload.actor_id,undefined);assert.equal(rpc.args.p_payload.price_per_kg,undefined);assert.equal(rpc.args.p_payload.order_source,undefined);
  assert.equal(rpc.args.p_request_id,body.request_id);assert.equal(rpc.args.p_payload.customer_id,null);
});
test('invalid quantities, identity, delivery details and duplicate crops never reach RPC',async()=>{
  for(const change of [{customer_name:''},{contact_phone:'123'},{accepted_substitution_terms:false},{items:[]},{fulfillment_method:'delivery'},
    {items:[{round_item_id:randomUUID(),qty_kg:0.49}]},{items:[{round_item_id:randomUUID(),qty_kg:1.001}]}]){
    const app=setup();assert.equal((await app.request({...valid(),...change})).statusCode,400);assert.equal(app.calls.length,0);
  }
  const app=setup(),body=valid();body.items.push({...body.items[0]});assert.equal((await app.request(body)).statusCode,400);assert.equal(app.calls.length,0);
});
test('missing migration gives setup guidance and stock failures remain visible',async()=>{
  const missing=await setup({code:'PGRST202'}).request(valid());assert.equal(missing.statusCode,503);assert.match(missing.body.error,/033/);
  const stock=await setup({message:'ผักคงเหลือไม่เพียงพอ'}).request(valid());assert.equal(stock.statusCode,400);assert.match(stock.body.error,/คงเหลือ/);
});
