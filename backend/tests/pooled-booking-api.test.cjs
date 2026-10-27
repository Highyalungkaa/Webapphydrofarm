const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {randomUUID}=require('node:crypto');
function setup(error=null){
 const routes=new Map(),calls=[],actor=randomUUID(),auth=()=>{},limiter=()=>{};
 const router={};for(const method of ['get','post'])router[method]=(route,...handlers)=>routes.set(method+' '+route,handlers);
 const file=path.resolve(__dirname,'../src/routes/orders.ts');
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:{},console,require(name){
   if(name==='express')return{Router:()=>router};if(name.endsWith('/auth.js'))return{requireAuth:auth};if(name.endsWith('/rateLimiter.js'))return{orderCreationLimiter:limiter};
   if(name.endsWith('/supabase.js'))return{supabaseAdmin:{rpc:async(name,args)=>{calls.push({name,args});return{data:{order_id:randomUUID()},error};}}};return require(name);
 }});
 return {calls,actor,auth,limiter,handlers:routes.get('post /pooled'),async post(body){const res={statusCode:200,status(c){this.statusCode=c;return this;},json(value){this.body=value;}};await routes.get('post /pooled').at(-1)({body,user:{id:actor}},res);return res;}};
}
const valid=()=>({request_id:randomUUID(),items:[{crop_id:randomUUID(),qty_kg:2.5}],fulfillment_method:'pickup',contact_phone:'0812345678',accepted_substitution_terms:true});
test('pooled checkout is authenticated and rate limited; customer comes only from session',async()=>{
 const app=setup(),body={...valid(),customer_id:randomUUID()};assert.equal(app.handlers[0],app.auth);assert.equal(app.handlers[1],app.limiter);
 assert.equal((await app.post(body)).statusCode,201);assert.equal(app.calls[0].name,'create_pooled_order');assert.equal(app.calls[0].args.p_customer_id,app.actor);assert.equal(app.calls[0].args.p_payload.customer_id,undefined);assert.equal(app.calls[0].args.p_request_id,body.request_id);
});
test('invalid crop quantities and missing consent cannot reach pooled RPC',async()=>{
 for(const change of [{items:[]},{items:[{crop_id:randomUUID(),qty_kg:0.4}]},{items:[{crop_id:randomUUID(),qty_kg:1.001}]},{request_id:'invalid'},{accepted_substitution_terms:false}]){
  const app=setup();assert.equal((await app.post({...valid(),...change})).statusCode,400);assert.equal(app.calls.length,0);
 }
});
test('stock race rejection remains a visible failure and never returns an order success',async()=>{
 const res=await setup({message:'สต๊อกผักไม่เพียงพอ'}).post(valid());assert.equal(res.statusCode,400);assert.match(res.body.error,/สต๊อก/);assert.equal(res.body.data,undefined);
});
