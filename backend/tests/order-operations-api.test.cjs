const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {randomUUID}=require('node:crypto');
function setup(file,error=null){
 const routes=new Map(),calls=[],middleware=[],actor=randomUUID(),auth=()=>{},admin=()=>{};
 const router={use:(...handlers)=>middleware.push(...handlers)};
 for(const method of ['get','post','patch','put'])router[method]=(route,...handlers)=>routes.set(method+' '+route,handlers.at(-1));
 const db={rpc:async(name,args)=>{calls.push({name,args});return{data:{preview:true},error};},from(){return{select(){return Promise.resolve({data:[],error:null});},upsert(){return Promise.resolve({error:null});}};}};
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,console:{error(){}},require(name){
  if(name==='express')return{Router:()=>router};if(name.endsWith('/supabase.js'))return{supabaseAdmin:db};if(name.endsWith('/auth.js'))return{requireAuth:auth,requireAdmin:admin};if(name.endsWith('/audit.js'))return{recordAuditLog:async()=>{}};if(name.endsWith('/roundOrders.js'))return require('./load-service.cjs')('roundOrders');return require(name);
 }});
 return{calls,middleware,actor,auth,admin,exports,async request(method,route,body){const res={statusCode:200,status(code){this.statusCode=code;return this;},json(value){this.body=value;}};await routes.get(method+' '+route)({body,params:{id:randomUUID()},user:{id:actor}},res);return res;}};
}
const amendment=()=>({request_id:randomUUID(),expected_updated_at:new Date().toISOString(),reason:'Customer requested a change',items:[{crop_id:randomUUID(),qty_kg:2}]});
test('amendment preview/save are admin-only and use server-selected actor and preview mode',async()=>{
 const app=setup('../src/routes/admin/orders.ts');assert.equal(app.middleware[0],app.auth);assert.equal(app.middleware[1],app.admin);
 assert.equal((await app.request('post','/:id/items/preview',{...amendment(),actor_id:randomUUID(),p_preview:false})).statusCode,200);
 assert.equal(app.calls[0].args.p_actor_id,app.actor);assert.equal(app.calls[0].args.p_preview,true);assert.equal(app.calls[0].args.p_payload.actor_id,undefined);
 assert.equal((await app.request('post','/:id/items',{...amendment(),preview_token:'a'.repeat(32)})).statusCode,200);assert.equal(app.calls[1].args.p_preview,false);
});
test('missing preview, stale-format dates, duplicate crops and invalid quantities cannot reach the RPC',async()=>{
 const repeated=randomUUID();
 for(const body of [amendment(),{...amendment(),preview_token:'a'.repeat(32),reason:''},{...amendment(),preview_token:'a'.repeat(32),expected_updated_at:'bad'},
  {...amendment(),preview_token:'a'.repeat(32),items:[{crop_id:repeated,qty_kg:1},{crop_id:repeated,qty_kg:2}]},
  {...amendment(),preview_token:'a'.repeat(32),items:[{crop_id:randomUUID(),qty_kg:0.4}]}]){
  const app=setup('../src/routes/admin/orders.ts');assert.equal((await app.request('post','/:id/items',body)).statusCode,400);assert.equal(app.calls.length,0);
 }
});
test('timeout settings validate hours and call the atomic administrator routine',async()=>{
 for(const hours of [0,2,8760]){const app=setup('../src/routes/admin/settings.ts');assert.equal((await app.request('put','/',{pending_confirmation_hours:hours})).statusCode,200);assert.equal(app.calls[0].name,'set_order_confirmation_timeout');assert.equal(app.calls[0].args.p_actor_id,app.actor);assert.equal(app.calls[0].args.p_hours,hours);}
 for(const hours of [-1,0.5,'2',8761,null]){const app=setup('../src/routes/admin/settings.ts');assert.equal((await app.request('put','/',{pending_confirmation_hours:hours})).statusCode,400);assert.equal(app.calls.length,0);}
});
test('expiry reconciliation fails visibly instead of serving an unreconciled booking stock',async()=>{
 const app=setup('../src/middlewares/orderExpiry.ts',{code:'PGRST202',message:'Missing function'});let next=false;
 const res={statusCode:200,status(n){this.statusCode=n;return this;},json(body){this.body=body;}};
 await app.exports.reconcileOrderExpiry({},res,()=>{next=true;});assert.equal(next,false);assert.equal(res.statusCode,503);assert.match(res.body.error,/สต๊อก/);
});
