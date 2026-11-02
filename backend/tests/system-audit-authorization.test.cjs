const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),express=require('express');
test('every registered admin endpoint and private customer endpoint enforces HTTP authentication before business data access',async t=>{
 const app=express();app.use(express.json());const cache=new Map(),routes=[];let unexpected=0;
 const db={auth:{async getUser(token){return token==='customer'?{data:{user:{id:'11111111-1111-4111-8111-111111111111',email:'customer@example.com'}},error:null}:{data:{user:null},error:{message:'Invalid token'}};}},
  from(table){if(table!=='admin_users'){unexpected++;throw Error('Unauthorized business access: '+table);}const q={select(){return q;},ilike(){return q;},limit(){return q;},async maybeSingle(){return{data:null,error:null};}};return q;},
  rpc(){unexpected++;throw Error('Unauthorized RPC');}};
 const load=filename=>{filename=path.resolve(filename);if(cache.has(filename))return cache.get(filename);const exports={};cache.set(filename,exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,console:{error(){},warn(){}},Buffer,process,require(name){
   if(name.endsWith('/config/supabase.js')||name.endsWith('/supabase.js'))return{supabaseAdmin:db,getSupabaseClient:()=>db};
   if(name.startsWith('.'))return load(path.resolve(path.dirname(filename),name.replace(/\.js$/,'.ts')));return require(name);
  }});return exports;};
 for(const file of fs.readdirSync(path.resolve(__dirname,'../src/routes/admin')).filter(f=>f.endsWith('.ts'))){const router=load(path.resolve(__dirname,'../src/routes/admin',file)).default;const base='/admin/'+file.slice(0,-3);app.use(base,router);
  for(const layer of router.stack)if(layer.route)for(const method of Object.keys(layer.route.methods))routes.push({method,path:base+layer.route.path});
 }
 const equipment=load(path.resolve(__dirname,'../src/routes/equipment.ts')).default;app.use('/equipment',equipment);
 for(const layer of equipment.stack)if(layer.route&&layer.route.path.startsWith('/admin/'))for(const method of Object.keys(layer.route.methods))routes.push({method,path:'/equipment'+layer.route.path});
 const privateRoutes=[];
 for(const name of ['orders','profile']){const router=load(path.resolve(__dirname,'../src/routes',name+'.ts')).default;const base='/customer/'+name;app.use(base,router);for(const layer of router.stack)if(layer.route)for(const method of Object.keys(layer.route.methods))privateRoutes.push({method,path:base+layer.route.path});}
 for(const layer of equipment.stack)if(layer.route&&layer.route.path.startsWith('/orders'))for(const method of Object.keys(layer.route.methods))privateRoutes.push({method,path:'/equipment'+layer.route.path});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const origin='http://127.0.0.1:'+server.address().port;
 assert.ok(routes.length>50);
 for(const token of [null,'customer','expired'])for(let start=0;start<routes.length;start+=10)await Promise.all(routes.slice(start,start+10).map(async route=>{
  const headers={'Content-Type':'application/json'};if(token)headers.Authorization='Bearer '+token;
  const response=await fetch(origin+route.path.replace(/:[A-Za-z_]+/g,'11111111-1111-4111-8111-111111111111'),{method:route.method.toUpperCase(),headers,...(!['get','head'].includes(route.method)?{body:'{}'}:{})});
  assert.equal(response.status,token==='customer'?403:401,`${token||'anonymous'} ${route.method} ${route.path}`);await response.arrayBuffer();
 }));
 for(const token of [null,'expired'])for(const route of privateRoutes){const headers={'Content-Type':'application/json'};if(token)headers.Authorization='Bearer '+token;const response=await fetch(origin+route.path.replace(/:[A-Za-z_]+/g,'11111111-1111-4111-8111-111111111111'),{method:route.method.toUpperCase(),headers,...(!['get','head'].includes(route.method)?{body:'{}'}:{})});assert.equal(response.status,401,`${token||'anonymous'} ${route.method} ${route.path}`);await response.arrayBuffer();}
 assert.equal(unexpected,0);t.diagnostic(`Verified ${routes.length} admin routes under 3 authentication states and ${privateRoutes.length} private customer routes under 2 states (${routes.length*3+privateRoutes.length*2} HTTP checks)`);
});
