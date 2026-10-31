const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {randomUUID}=require('node:crypto');
const actor=randomUUID();
function load(relative,deps){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,relative),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,console:{error(){},warn(){}},Buffer,require:deps});return exports;}
function setup(file,{errorTable,existing,adminEmail='admin@example.com',email='admin@example.com',results={},isAdmin=true,rpcError=null,pendingCount=0}={}){
 const routes=new Map(),middleware=[],mutations=[],filters=[],audit=[],calls=[];
 const auth=()=>{},admin=()=>{};const router={use:(...h)=>middleware.push(h)};
 for(const method of ['get','post','put','patch','delete'])router[method]=(route,...handlers)=>routes.set(`${method} ${route}`,handlers.at(-1));
 const db={auth:{getUser:async()=>({data:{user:{id:actor,email}},error:null})},from(table){let payload,selected='',pattern;const q={
  select(fields='*',options){selected=fields;if(options)calls.push({select:fields,options});return q;},order(){return q;},limit(){return q;},in(){return q;},eq(key,value){filters.push({table,key,value});return q;},
  ilike(key,value){pattern=value;filters.push({table,key,value});return q;},
  insert(value){mutations.push({table,method:'insert',value});payload=value;return q;},update(value){mutations.push({table,method:'update',value});payload=value;return q;},
  async single(){return result(true);},async maybeSingle(){return result(true);},then(resolve,reject){return Promise.resolve(result(false)).then(resolve,reject);},
 };function result(single){if(errorTable===table||table==='plots'&&selected.split(',').some(c=>c.trim()==='status'))return{data:null,error:{message:'Column or source unavailable'}};
  if(table==='admin_users'){const match=pattern?new RegExp('^'+pattern.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/(?<!\\)%/g,'.*').replace(/(?<!\\)_/g,'.').replace(/\\\\([_%])/g,'$1')+'$','i').test(adminEmail):false;return{data:match?{email:adminEmail}:null,error:null};}
  if(table==='app_settings')return{data:single?{value:1000}:[{key:'farm_total_slots',value:1000}],error:null};
  if(table==='plots'&&!payload)return{data:single?existing:[{id:randomUUID(),slot_capacity:100,is_active:true,zone_name:'A'}],error:null};
  return{data:payload?{id:randomUUID(),...payload}:Object.hasOwn(results,table)?results[table]:existing||[],error:null,count:pendingCount};}
  return q;},rpc:async(name,args)=>{calls.push({name,args});return{data:null,error:rpcError};}};
 const exports=load(file,name=>{if(name==='express')return{Router:()=>router};if(name.endsWith('/supabase.js'))return{supabaseAdmin:db,getSupabaseClient:()=>db};if(name.endsWith('/auth.js'))return{requireAuth:auth,requireAdmin:admin};if(name.endsWith('/audit.js'))return{recordAuditLog:async value=>audit.push(value)};if(name.endsWith('/roundOrders.js'))return require('./load-service.cjs')('roundOrders');if(name.endsWith('/pooledCatalog.js'))return require('./load-service.cjs')('pooledCatalog');if(name.endsWith('/rateLimiter.js'))return{orderCreationLimiter(){}};return require(name);});
 return{exports,mutations,filters,audit,middleware,db,calls,async request(method,route,body){const res={statusCode:200,setHeader(){},status(code){this.statusCode=code;return this;},json(value){this.body=value;}};await routes.get(`${method} ${route}`)({body,params:{id:actor},query:{},headers:{authorization:'Bearer test'},user:{id:actor,email,isAdmin}},res);return res;}};
}
test('website cannot remove administrators and performs no database writes',async()=>{
 const app=setup('../src/routes/admin/admins.ts');
 const res=await app.request('delete','/:id');assert.equal(res.statusCode,410);
 assert.match(res.body.error,/Supabase/);assert.equal(app.mutations.length,0);
});

test('crop create and edit persist the chosen growing days and reject blank names',async()=>{
 for(const method of ['post','put']){const app=setup('../src/routes/admin/crops.ts',{existing:{id:actor}});const body={name:'Oak',default_price_per_kg:50,slots_per_kg:8,growing_days:32,is_active:true};
 const result=await app.request(method,method==='post'?'/':'/:id',body);assert.ok(result.statusCode<300);assert.equal(app.mutations.at(-1).value.growing_days,32);
 const invalid=await app.request(method,method==='post'?'/':'/:id',{...body,name:'   '});assert.equal(invalid.statusCode,400);}
});
test('farm metrics use existing schema columns and do not turn a failed plots read into zero plots',async()=>{
 const app=setup('../src/routes/admin/farm.ts');const res=await app.request('get','/');assert.equal(res.statusCode,200);assert.equal(res.body.total_plots,1);assert.equal(res.body.total_allocated_slots,100);
 assert.equal(res.body.farm_total_slots,undefined);
 assert.equal((await app.request('put','/',{farm_total_slots:5000})).statusCode,410);
 const failed=setup('../src/routes/admin/farm.ts',{errorTable:'plots'});assert.equal((await failed.request('get','/')).statusCode,500);
});
test('authorization matches literal emails, including underscore, percent and case',async()=>{
 for(const [email,adminEmail,allowed]of [['admin@example.com','ADMIN@example.com',true],['admin_test@example.com','admin.test@example.com',false],['admin%test@example.com','adminXYZtest@example.com',false],['admin_test@example.com','admin_test@example.com',true]]){
  const app=setup('../src/middlewares/auth.ts',{email,adminEmail});let next=false;const res={statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;}};const req={headers:{authorization:'Bearer valid'}};
  await app.exports.requireAuth(req,res,()=>{next=true;});assert.equal(next,true);assert.equal(req.user.isAdmin,allowed,email);
 }
});
test('system settings reject arrays, negative cancellation windows and invalid no-show limits before writes',async()=>{
 for(const body of [[],{cancellation_deadline_hours_before_harvest:-1},{no_show_limit:1.5},{delivery_min_total_kg:-2},{large_order_threshold_kg:0}]){const app=setup('../src/routes/admin/settings.ts');assert.equal((await app.request('put','/',body)).statusCode,400);assert.equal(app.mutations.length,0);}
 const retired=setup('../src/routes/admin/settings.ts');assert.equal((await retired.request('put','/',{farm_total_slots:9999})).statusCode,410);assert.equal(retired.mutations.length,0);
});
test('public rounds hide drafts and report failed stock reads instead of claiming there are no vegetables',async()=>{
 const draft=setup('../src/routes/rounds.ts',{existing:{id:actor,status:'draft'}});assert.equal((await draft.request('get','/:id')).statusCode,404);
 const failed=setup('../src/routes/rounds.ts',{existing:{id:actor,status:'booking_open'},errorTable:'round_items'});assert.equal((await failed.request('get','/:id')).statusCode,500);
});
test('customer order details deny another owner, and cancellation RPC uses the signed-in actor',async()=>{
 const existing={id:actor,customer_id:randomUUID()};const customer=setup('../src/routes/orders.ts',{existing,isAdmin:false});assert.equal((await customer.request('get','/:id')).statusCode,403);
 const admin=setup('../src/routes/orders.ts',{existing});assert.equal((await admin.request('get','/:id')).statusCode,200);
 await customer.request('post','/:id/cancel',{reason:'Changed plans',p_actor_id:randomUUID()});assert.equal(customer.calls[0].args.p_actor_id,actor);
});
test('legacy admin status/payment changes go through one transaction and cannot increment profiles before failure',async()=>{
 const app=setup('../src/routes/admin/orders.ts',{results:{orders:{id:actor,status:'confirmed',payment_status:'unpaid',updated_at:'2026-10-27T00:00:00Z'},order_items:[{id:randomUUID(),qty_kg:1,price_per_kg:50}]},rpcError:{message:'Round is closed'}});
 const res=await app.request('patch','/:id',{status:'no_show'});assert.equal(res.statusCode,400);assert.equal(app.calls[0].name,'save_admin_order_allocation');assert.equal(app.calls[0].args.p_payload.expected_updated_at,'2026-10-27T00:00:00Z');assert.equal(app.mutations.length,0);
});

test('pending badge counts all awaiting-confirmation orders with a protected exact count query',async()=>{
 const app=setup('../src/routes/admin/orders.ts',{pendingCount:2001});const result=await app.request('get','/pending-count');
 assert.equal(result.statusCode,200);assert.equal(result.body.count,2001);assert.equal(app.middleware[0].length,2);
 assert.equal(app.filters[0].key,'status');assert.equal(app.filters[0].value,'pending_confirmation');
 assert.equal(app.calls[0].options.count,'exact');assert.equal(app.calls[0].options.head,true);
 const failed=setup('../src/routes/admin/orders.ts',{errorTable:'orders'});assert.equal((await failed.request('get','/pending-count')).statusCode,500);
});
