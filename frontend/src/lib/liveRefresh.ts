export const dataChangesEvent='hydrofarm:data-changed';
export const dataChangesStorageKey='hydrofarm:data-change';
export const hasLiveDraft=()=>!!document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')
  ||!!document.querySelector('dialog[open],[aria-modal="true"],form[data-live-dirty="true"]');

export function notifyDataChange(): void {
  window.dispatchEvent(new Event(dataChangesEvent));
  // Only a notification nonce is shared with other tabs, never account or order data.
  try { localStorage.setItem(dataChangesStorageKey,`${Date.now()}:${Math.random()}`); } catch { /* polling still works */ }
}

export function watchLiveData(refresh:()=>Promise<unknown>|unknown,
  {intervalMs=15000,protectDraft=true}:{intervalMs?:number;protectDraft?:boolean}={}) {
  let stopped=false,running=false,queued=false;
  let pending:ReturnType<typeof setTimeout>|undefined;
  const paused=()=>document.visibilityState==='hidden'||navigator.onLine===false||protectDraft&&hasLiveDraft();
  const run=async()=>{
    if(stopped||paused())return;
    if(running){queued=true;return;}
    running=true;
    try{await refresh();}catch{/* Keep existing data; the next refresh can recover. */}
    finally{running=false;if(queued&&!stopped){queued=false;schedule();}}
  };
  const schedule=()=>{
    if(stopped)return;
    if(pending!==undefined)window.clearTimeout(pending);
    pending=window.setTimeout(()=>{pending=undefined;void run();},300);
  };
  const dirty=(event:Event)=>{
    if(!protectDraft)return;
    (event.target as Element)?.closest?.('form')?.setAttribute('data-live-dirty','true');
  };
  const storage=(event:StorageEvent)=>{if(event.key===dataChangesStorageKey)schedule();};
  const timer=window.setInterval(()=>{if(!running)void run();},intervalMs);
  window.addEventListener(dataChangesEvent,schedule);
  window.addEventListener('storage',storage);
  window.addEventListener('focus',schedule);
  window.addEventListener('online',schedule);
  document.addEventListener('visibilitychange',schedule);
  document.addEventListener('input',dirty,true);
  document.addEventListener('change',dirty,true);
  document.addEventListener('focusout',schedule);
  return {refresh:schedule,stop:()=>{
    stopped=true;window.clearInterval(timer);
    if(pending!==undefined)window.clearTimeout(pending);
    window.removeEventListener(dataChangesEvent,schedule);
    window.removeEventListener('storage',storage);
    window.removeEventListener('focus',schedule);
    window.removeEventListener('online',schedule);
    document.removeEventListener('visibilitychange',schedule);
    document.removeEventListener('input',dirty,true);
    document.removeEventListener('change',dirty,true);
    document.removeEventListener('focusout',schedule);
  }};
}
