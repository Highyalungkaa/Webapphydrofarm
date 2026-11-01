const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
  let id=0,dirty=false,modal=false,nonce;
  const timers=new Map(),intervals=new Map(),events=new Map(),docEvents=new Map(),exports={};
  const listen=(map,name,fn)=>{const list=map.get(name)||new Set();list.add(fn);map.set(name,list);};
  const remove=(map,name,fn)=>{map.get(name)?.delete(fn);if(!map.get(name)?.size)map.delete(name);};
  const document={visibilityState:'visible',activeElement:null,querySelector:()=>dirty||modal?{}:null,addEventListener:(n,fn)=>listen(docEvents,n,fn),removeEventListener:(n,fn)=>remove(docEvents,n,fn)};
  const navigator={onLine:true};
  const window={setInterval:(fn,ms)=>{const key=++id;intervals.set(key,{fn,ms});return key;},clearInterval:key=>intervals.delete(key),setTimeout:fn=>{const key=++id;timers.set(key,fn);return key;},clearTimeout:key=>timers.delete(key),addEventListener:(n,fn)=>listen(events,n,fn),removeEventListener:(n,fn)=>remove(events,n,fn),dispatchEvent:event=>{for(const fn of events.get(event.type)||[])fn(event);}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../frontend/src/lib/liveRefresh.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,window,document,navigator,Event:class{constructor(type){this.type=type;}},localStorage:{setItem:(key,value)=>{nonce={key,value};}}});
  const fire=(map,name,event={})=>{for(const fn of map.get(name)||[])fn(event);};
  return{...exports,window,document,navigator,events,docEvents,timers,intervals,get nonce(){return nonce;},set dirty(value){dirty=value;},set modal(value){modal=value;},tick:()=>{for(const {fn}of [...intervals.values()])fn();},event:(name,event)=>fire(events,name,event),docEvent:(name,event)=>fire(docEvents,name,event),drain:async()=>{const pending=[...timers.values()];timers.clear();for(const fn of pending)fn();await flush();}};
}

test('a catalog open in another session re-reads changed stock every five seconds without a page reload',async()=>{
  const app=setup();let serverStock=50,displayedStock=50,calls=0;
  const watcher=app.watchLiveData(async()=>{calls++;displayedStock=serverStock;},{intervalMs:5000});
  assert.equal([...app.intervals.values()][0].ms,5000);
  serverStock=45;app.tick();await flush();assert.equal(displayedStock,45);assert.equal(calls,1);
  watcher.stop();assert.equal(app.intervals.size,0);assert.equal(app.events.size,0);assert.equal(app.docEvents.size,0);
});

test('mutations, other tabs and focus coalesce, while hidden and offline pages wait',async()=>{
  const app=setup();let calls=0;const watcher=app.watchLiveData(()=>{calls++;});
  app.event(app.dataChangesEvent);app.event('focus');app.event('storage',{key:app.dataChangesStorageKey});await app.drain();assert.equal(calls,1);
  app.document.visibilityState='hidden';app.tick();await flush();assert.equal(calls,1);
  app.document.visibilityState='visible';app.navigator.onLine=false;app.docEvent('visibilitychange');await app.drain();assert.equal(calls,1);
  app.navigator.onLine=true;app.event('online');await app.drain();assert.equal(calls,2);
  watcher.stop();
});

test('refresh pauses for form edits and dialogs, but stock-only callbacks can preserve drafts while updating',async()=>{
  const app=setup();let calls=0;const watcher=app.watchLiveData(()=>{calls++;});
  app.modal=true;app.tick();await flush();assert.equal(calls,0);app.modal=false;
  app.document.activeElement={matches:()=>true};app.tick();await flush();assert.equal(calls,0);
  app.document.activeElement=null;
  app.docEvent('input',{target:{closest:()=>({setAttribute:()=>{app.dirty=true;}})}});
  app.docEvent('focusout');await app.drain();assert.equal(calls,0);
  const stock=app.watchLiveData(()=>{calls++;},{protectDraft:false});app.tick();await flush();assert.equal(calls,1);
  watcher.stop();stock.stop();
});

test('slow refreshes never overlap, refresh errors recover, and stopping cancels queued work',async()=>{
  const app=setup();let calls=0,finish;
  const watcher=app.watchLiveData(async()=>{calls++;if(calls===1)await new Promise(resolve=>{finish=resolve;});if(calls===2)throw Error('offline');});
  app.tick();app.tick();assert.equal(calls,1);
  app.event(app.dataChangesEvent);await app.drain();assert.equal(calls,1);
  finish();await flush();await app.drain();assert.equal(calls,2);
  app.tick();await flush();assert.equal(calls,3);
  app.event('focus');watcher.stop();await app.drain();assert.equal(calls,3);
});

test('cross-tab notifications contain only a nonce',()=>{
  const app=setup();let calls=0;app.window.addEventListener(app.dataChangesEvent,()=>{calls++;});
  app.notifyDataChange();assert.equal(calls,1);assert.equal(app.nonce.key,app.dataChangesStorageKey);assert.match(app.nonce.value,/^\d+:/);
});
