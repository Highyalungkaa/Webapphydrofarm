import {useEffect,useRef} from 'react';
import {watchLiveData} from './liveRefresh.js';

export function useLiveRefresh(refresh:()=>Promise<unknown>|unknown,
  {enabled=true,intervalMs=15000,protectDraft=true}:{enabled?:boolean;intervalMs?:number;protectDraft?:boolean}={}) {
  const latest=useRef(refresh),wasEnabled=useRef(false);
  latest.current=refresh;
  useEffect(()=>{
    if(!enabled)return;
    const watcher=watchLiveData(()=>latest.current(),{intervalMs,protectDraft});
    if(wasEnabled.current)watcher.refresh();
    wasEnabled.current=true;
    return watcher.stop;
  },[enabled,intervalMs,protectDraft]);
}
