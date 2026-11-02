const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(file,requireMock){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,require:requireMock});return exports;}
test('equipment pending-count is admin protected, exact and uncached and does not mark orders read',async()=>{
 const routes=new Map(),middleware=[],rows=[{status:'pending_confirmation'},{status:'pending_confirmation'},{status:'confirmed'},{status:'cancelled'},{status:'completed'}];let failure=null;
 const router={use:(...args)=>middleware.push(args)};for(const method of ['get','post','put','patch','delete'])router[method]=(url,...handlers)=>routes.set(method+' '+url,handlers.at(-1));
 const auth=()=>{},admin=()=>{},db={from:table=>{assert.equal(table,'equipment_orders');return{select:(columns,options)=>{assert.equal(columns,'id');assert.equal(options.count,'exact');assert.equal(options.head,true);return{eq:async(field,value)=>{assert.equal(field,'status');assert.equal(value,'pending_confirmation');return{count:failure?null:rows.filter(row=>row.status===value).length,error:failure};}};}};}};
 load('../src/routes/equipment.ts',name=>name==='express'?{Router:()=>router}:name.endsWith('/supabase.js')?{supabaseAdmin:db}:name.endsWith('/auth.js')?{requireAuth:auth,requireAdmin:admin}:name.endsWith('/equipmentPayments.js')?{}:require(name));
 const guard=middleware.find(args=>args[0]==='/admin');assert.equal(guard[1],auth);assert.equal(guard[2],admin);
 async function read(){const res={code:200,headers:{},setHeader(name,value){this.headers[name]=value;},status(code){this.code=code;return this;},json(body){this.body=body;}};await routes.get('get /admin/orders/pending-count')({},res);return res;}
 let response=await read();assert.equal(response.body.count,2);assert.equal(response.headers['Cache-Control'],'no-store');assert.equal((await read()).body.count,2);
 rows[0].status='confirmed';assert.equal((await read()).body.count,1);rows[1].status='cancelled';assert.equal((await read()).body.count,0);
 failure={message:'offline'};response=await read();assert.equal(response.code,500);assert.equal(response.body.count,undefined);
});
test('equipment sidebar renders a numbered red badge on desktop and mobile, and hides it at zero',()=>{
 const frontendRequire=require('node:module').createRequire(path.resolve(__dirname,'../../frontend/package.json')),React=frontendRequire('react'),{renderToStaticMarkup}=frontendRequire('react-dom/server');
 for(const count of [0,3]){const calls=[];
  const {EquipmentAdminLayout}=load('../../frontend/src/components/layout/EquipmentAdminLayout.tsx',name=>{
   if(name==='react')return{...React,useState:()=>[true,()=>{}]};
   if(name==='react-router-dom')return{Link:({to,children})=>React.createElement('a',{href:to},children),NavLink:({to,children})=>React.createElement('a',{href:to},children),Outlet:()=>null,useNavigate:()=>()=>{},useLocation:()=>({pathname:'/admin/equipment'})};
   if(name.endsWith('/AuthContext.js'))return{useAuth:()=>({user:{email:'admin@example.com'},isAdmin:true,isLoading:false})};
   if(name.endsWith('/usePendingOrdersCount.js'))return{usePendingOrdersCount:(...args)=>{calls.push(args);return count;}};
   if(name.endsWith('/api.js'))return{equipmentOrderChangesEvent:'equipment-changed'};
   return new Proxy({},{get:()=>()=>null});
  });
  const html=renderToStaticMarkup(React.createElement(EquipmentAdminLayout));assert.equal((html.match(/aria-label="คำสั่งซื้ออุปกรณ์รอยืนยัน 3 ออเดอร์"/g)||[]).length,count?2:0);
  if(count)assert.ok(html.includes('bg-red-600'));assert.equal(calls[0][0],true);assert.equal(calls[0][2],'/equipment/admin/orders/pending-count');assert.equal(calls[0][3],'equipment-changed');
 }
});
