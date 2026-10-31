const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript');
function setup(){let count=0,cleanup,timer,calls=0;const events=new Map(),docEvents=new Map(),pending=[];
 const document={visibilityState:'visible',addEventListener:(n,h)=>docEvents.set(n,h),removeEventListener:n=>docEvents.delete(n)};
 const window={setInterval:cb=>(timer=cb,1),clearInterval:()=>{timer=null;},addEventListener:(n,h)=>events.set(n,h),removeEventListener:n=>events.delete(n)};
 const react={useState:()=>[count,n=>{count=n;}],useEffect:cb=>{cleanup=cb();}};
 const api={get:()=>{calls++;return new Promise((resolve,reject)=>pending.push({resolve,reject}));}};
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../frontend/src/lib/usePendingOrdersCount.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,document,window,require:n=>n==='react'?react:{api,orderChangesEvent:'changed'}});
 exports.usePendingOrdersCount(true,'/admin');return{pending,events,docEvents,document,get count(){return count;},get calls(){return calls;},poll:()=>timer(),close:()=>cleanup()};}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('pending notification refreshes after confirmation, ignores stale responses and stops in hidden tabs',async()=>{
 const app=setup();app.pending[0].resolve({count:3});await flush();assert.equal(app.count,3);
 const refresh=app.events.get('changed')();app.pending[1].resolve({count:0});await refresh;assert.equal(app.count,0);
 const first=app.poll(),second=app.events.get('changed')();app.pending[3].resolve({count:1});await second;app.pending[2].resolve({count:5});await first;assert.equal(app.count,1);
 app.document.visibilityState='hidden';await app.poll();assert.equal(app.calls,4);
 app.document.visibilityState='visible';const failed=app.poll();app.pending[4].reject(Error('network'));await failed;assert.equal(app.count,1);
 app.close();assert.equal(app.events.size,0);assert.equal(app.docEvents.size,0);
});
