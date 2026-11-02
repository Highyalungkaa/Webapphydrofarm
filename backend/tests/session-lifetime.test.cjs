const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(file,requireMock,extra={}){
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,require:requireMock,console:{error(){},warn(){}},...extra});return exports;
}
test('deadline expires exactly at 24 hours, including missing or malformed sessions',()=>{
 const {sessionHasExpired}=load('../../frontend/src/lib/sessionLifetime.ts');
 const start=Date.parse('2026-11-02T08:00:00Z'),end=new Date(start+24*3600000).toISOString();
 assert.equal(sessionHasExpired(end,start+24*3600000-1),false);
 assert.equal(sessionHasExpired(end,start+24*3600000),true);
 assert.equal(sessionHasExpired(null,start),true);assert.equal(sessionHasExpired('bad',start),true);
});
test('API rejects old and revoked sessions for customers and admins even when JWT remains valid',async()=>{
 for(const isAdmin of [false,true])for(const lifetime of ['active','expired','revoked','unavailable']){
  let lookups=0,next=0;const db={auth:{getUser:async()=>({data:{user:{id:'user',email:'user@example.com'}},error:null})},rpc:async()=>({data:lifetime==='revoked'?null:new Date(Date.now()+(lifetime==='active'?10000:-10000)).toISOString(),error:lifetime==='unavailable'?{message:'offline'}:null}),from(){lookups++;const q={select:()=>q,ilike:()=>q,limit:()=>q,maybeSingle:async()=>({data:isAdmin?{email:'user@example.com'}:null,error:null})};return q;}};
  const {requireAuth}=load('../src/middlewares/auth.ts',()=>({supabaseAdmin:db,getSupabaseClient:()=>db}));
  const req={headers:{authorization:'Bearer valid-refreshed-jwt'}},res={status(code){this.code=code;return this;},json(body){this.body=body;}};
  await requireAuth(req,res,()=>next++);
  if(lifetime==='active'){assert.equal(next,1);assert.equal(req.user.isAdmin,isAdmin);}else{assert.equal(next,0);assert.equal(lookups,0);assert.equal(res.code,lifetime==='unavailable'?500:401);if(res.code===401)assert.equal(res.body.code,'SESSION_EXPIRED');}
 }
});
test('database deadline belongs to the current session, survives refresh, and cannot read another user',async t=>{
 const {PGlite}=require('@electric-sql/pglite'),db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.sessions(id uuid,user_id uuid,created_at timestamptz);
 create function auth.jwt() returns jsonb language sql as $$select current_setting('test.jwt')::jsonb$$;
 create function auth.uid() returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;
 insert into auth.sessions values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','2026-11-02T08:00:00Z');`);
 await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/058_session_lifetime_24_hours.sql'),'utf8'));
 const jwt={sub:'22222222-2222-4222-8222-222222222222',session_id:'11111111-1111-4111-8111-111111111111',iat:1};
 async function read(){await db.query("select set_config('test.jwt',$1,false)",[JSON.stringify(jwt)]);return(await db.query('select public.get_current_session_deadline() as deadline')).rows[0].deadline;}
 assert.equal(new Date(await read()).toISOString(),'2026-11-03T08:00:00.000Z');
 jwt.iat=999999999;assert.equal(new Date(await read()).toISOString(),'2026-11-03T08:00:00.000Z');
 jwt.sub='33333333-3333-4333-8333-333333333333';assert.equal(await read(),null);
 jwt.sub='22222222-2222-4222-8222-222222222222';await db.exec('delete from auth.sessions');assert.equal(await read(),null);
 const permissions=(await db.query("select has_function_privilege('anon','public.get_current_session_deadline()','execute') as anon,has_function_privilege('authenticated','public.get_current_session_deadline()','execute') as member")).rows[0];assert.equal(permissions.anon,false);assert.equal(permissions.member,true);
});

test('web clears identity at the deadline, after waking, and when API reports expiry',async()=>{
 for(const mode of ['timer','wake','api','already-expired','network']){
  const states=[],timers=new Map(),events=new Map(),effects=[];let callback,now=Date.parse('2026-11-02T08:00:00Z'),id=0,signouts=0;
  const end=now+24*3600000,deadline=new Date(end).toISOString();
  const react={createContext:()=>({Provider:'provider'}),createElement:()=>null,useRef:value=>({current:value}),useState:value=>{const index=states.push(value)-1;return[value,next=>states[index]=next];},useEffect:fn=>effects.push(fn)};
  const surface={addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  class Clock extends Date{static now(){return now;}}
  const lifetime=load('../../frontend/src/lib/sessionLifetime.ts',undefined,{Date:Clock});
  const supabase={auth:{onAuthStateChange:fn=>{callback=fn;return{data:{subscription:{unsubscribe(){}}}};},signOut:async options=>{assert.equal(options.scope,'local');signouts++;callback('SIGNED_OUT',null);}},rpc:async()=>({data:deadline,error:mode==='network'?{message:'offline'}:null})};
  const {AuthProvider}=load('../../frontend/src/context/AuthContext.tsx',name=>name==='react'?react:name.endsWith('/supabase.js')?{supabase}:name.endsWith('/sessionLifetime.js')?lifetime:{api:{get:async()=>({id:'user',is_admin:true})}},
   {Date:Clock,window:surface,document:surface,setTimeout:(fn,delay)=>{const key=++id;timers.set(key,{fn,delay});return key;},clearTimeout:key=>timers.delete(key)});
  AuthProvider({children:null});const cleanup=effects[0]();
  if(mode==='already-expired')now=end;
  callback('INITIAL_SESSION',{user:{id:'user',email:'user@example.com'}});
  async function deferred(){for(const[key,timer]of [...timers])if(timer.delay===0){timers.delete(key);await timer.fn();}}
  await deferred();
  if(mode==='network'){assert.equal(states[0],null);assert.equal(states[3],false);assert.equal(signouts,0);cleanup();continue;}
  if(mode!=='already-expired'){
   assert.equal(states[0].id,'user');assert.equal(states[2],true);
   assert.ok([...timers.values()].some(timer=>timer.delay===24*3600000));
   now=end;
   if(mode==='timer')await [...timers.values()].find(timer=>timer.delay>0).fn();
   if(mode==='wake')events.get('focus')();
   if(mode==='api')events.get(lifetime.sessionExpiredEvent)();
  }
  assert.equal(states[0],null);assert.equal(states[1],null);assert.equal(states[2],false);
  await deferred();assert.equal(signouts,1);cleanup();assert.equal(timers.size,0);
 }
});
