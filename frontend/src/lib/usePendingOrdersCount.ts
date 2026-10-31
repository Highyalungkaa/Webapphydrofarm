import {useEffect,useState} from 'react';
import {api,orderChangesEvent} from './api.js';

export function usePendingOrdersCount(enabled:boolean,path:string) {
  const [count,setCount]=useState(0);
  useEffect(()=>{
    if(!enabled){setCount(0);return;}
    let active=true,sequence=0;
    const refresh=async()=>{
      if(document.visibilityState==='hidden')return;
      const request=++sequence;
      try{
        const data=await api.get<{count:number}>('/admin/orders/pending-count');
        if(active&&request===sequence&&Number.isInteger(data.count)&&data.count>=0)setCount(data.count);
      }catch{ /* Retain the last known count until a successful refresh. */ }
    };
    void refresh();
    const timer=window.setInterval(refresh,20000);
    window.addEventListener(orderChangesEvent,refresh);
    window.addEventListener('focus',refresh);
    document.addEventListener('visibilitychange',refresh);
    return()=>{
      active=false;window.clearInterval(timer);
      window.removeEventListener(orderChangesEvent,refresh);
      window.removeEventListener('focus',refresh);
      document.removeEventListener('visibilitychange',refresh);
    };
  },[enabled,path]);
  return count;
}
