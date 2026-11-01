const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
  const requests=[],events=[];let notifications=0,token='user-a';
  const exports={};const source=fs.readFileSync(path.resolve(__dirname,'../../frontend/src/lib/api.ts'),'utf8').replace('import.meta.env.VITE_API_URL','undefined');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
    exports,Event:class{constructor(type){this.type=type;}},window:{dispatchEvent:event=>events.push(event.type)},
    fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,finish:(data,ok=true,status=ok?200:500)=>resolve({ok,status,json:async()=>data})})),
    require:name=>name==='./supabase.js'?{supabase:{auth:{getSession:async()=>({data:{session:{access_token:token}}})}}}:name==='./sessionLifetime.js'?{sessionExpiredEvent:'hydrofarm:session-expired'}:{notifyDataChange:()=>{notifications++;}},
  });
  return{api:exports.api,requests,events,get notifications(){return notifications;},set token(value){token=value;}};
}

test('overlapping reads share one request, but the next refresh fetches fresh data without browser cache',async()=>{
  const app=setup(),first=app.api.get('/rounds/catalog'),second=app.api.get('/rounds/catalog');await flush();
  assert.equal(app.requests.length,1);assert.equal(app.requests[0].options.cache,'no-store');app.requests[0].finish({remaining:50});
  assert.equal((await first).remaining,50);assert.equal((await second).remaining,50);
  const next=app.api.get('/rounds/catalog');await flush();assert.equal(app.requests.length,2);app.requests[1].finish({remaining:45});assert.equal((await next).remaining,45);
});

test('expired session API response tells the web to clear its authenticated state',async()=>{
 const app=setup(),read=app.api.get('/profile');await flush();app.requests[0].finish({code:'SESSION_EXPIRED',error:'Login again'},false,401);
 await assert.rejects(read,/Login again/);assert.ok(app.events.includes('hydrofarm:session-expired'));assert.equal(app.notifications,0);
});

test('reads for different signed-in users never share an in-flight response',async()=>{
  const app=setup(),first=app.api.get('/orders/mine');await flush();app.token='user-b';const second=app.api.get('/orders/mine');await flush();
  assert.equal(app.requests.length,2);app.requests[0].finish({owner:'a'});app.requests[1].finish({owner:'b'});
  assert.equal((await first).owner,'a');assert.equal((await second).owner,'b');
});

test('only successful mutations notify other live views; failed reads remain retryable',async()=>{
  const app=setup();const failed=app.api.post('/admin/orders/one',{});await flush();app.requests[0].finish({error:'conflict'},false);await assert.rejects(failed,/conflict/);assert.equal(app.notifications,0);
  const saved=app.api.post('/admin/orders/one',{});await flush();app.requests[1].finish({ok:true});await saved;assert.equal(app.notifications,1);assert.ok(app.events.includes('hydrofarm:orders-changed'));
  const read=app.api.get('/rounds/catalog');await flush();app.requests[2].finish({error:'offline'},false);await assert.rejects(read,/offline/);
  const retry=app.api.get('/rounds/catalog');await flush();assert.equal(app.requests.length,4);app.requests[3].finish({remaining:10});assert.equal((await retry).remaining,10);
});
