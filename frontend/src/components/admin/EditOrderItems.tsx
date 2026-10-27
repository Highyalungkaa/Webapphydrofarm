import React,{useEffect,useRef,useState} from 'react';
import {api} from '../../lib/api.js';
import type {Order,PlantingRound} from '../../types/index.js';
import {formatKg} from '../../lib/bookingQuantity.js';

export function canEditOrderItems(order:Order){
  return ['pending_confirmation','confirmed'].includes(order.status)&&order.payment_status==='unpaid'
    &&!(order.status==='pending_confirmation'&&order.confirmation_expires_at&&new Date(order.confirmation_expires_at).getTime()<=Date.now())
    &&!(order.order_items||[]).some(i=>i.own_qty_kg!=null||Number(i.fulfilled_qty_kg)>0);
}
type Preview={preview_token:string;previous_total_amount:number;total_amount:number;items:{crop_id:string;crop_name:string;qty_kg:number;price_per_kg:number;discount_amount:number}[]};
const money=(n:number)=>'฿'+Number(n).toLocaleString('th-TH',{maximumFractionDigits:2});
export const EditOrderItems:React.FC<{order:Order;onSaved:()=>Promise<void>}>=({order,onSaved})=>{
  const [open,setOpen]=useState(false);
  if(!canEditOrderItems(order))return <p className="text-xs leading-5 text-slate-500">แก้ชนิดผักและจำนวนได้ก่อนเริ่มจัดผักและก่อนรับชำระเงิน เฉพาะออเดอร์รอยืนยันหรือยืนยันแล้ว</p>;
  return <><button type="button" onClick={()=>setOpen(true)} className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-bold text-sky-900 hover:bg-sky-100">แก้ไขรายการผัก / จำนวนจอง</button>{open&&<Editor order={order} onClose={()=>setOpen(false)} onSaved={onSaved}/>}</>;
};
const Editor:React.FC<{order:Order;onClose:()=>void;onSaved:()=>Promise<void>}>=({order,onClose,onSaved})=>{
  const [quantities,setQuantities]=useState<Record<string,string>>(()=>{
    const values:Record<string,number>={};for(const i of order.order_items||[]){const id=i.round_items?.crops?.id;if(id)values[id]=(values[id]||0)+Number(i.qty_kg);}
    return Object.fromEntries(Object.entries(values).map(([id,n])=>[id,String(Math.round(n*100)/100)]));
  });
  const [choices,setChoices]=useState<{id:string;name:string;available:number|null}[]>([]),[reason,setReason]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState<Preview|null>(null),[loading,setLoading]=useState(true);
  const request=useRef(crypto.randomUUID());
  useEffect(()=>{let active=true;api.get<PlantingRound>('/rounds/catalog').then(c=>{
    const map=new Map((c.items||[]).map(i=>[i.crop_id,{id:i.crop_id,name:i.crop_name||i.crops?.name||'ผัก',available:i.available_qty_kg??null}]));
    for(const i of order.order_items||[]){const crop=i.round_items?.crops;if(crop&&!map.has(crop.id))map.set(crop.id,{id:crop.id,name:crop.name,available:null});}
    if(active)setChoices([...map.values()]);
  }).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[order.id]);
  const change=(id:string,value:string)=>{setQuantities(q=>({...q,[id]:value}));setPreview(null);request.current=crypto.randomUUID();};
  const payload=()=>({request_id:request.current,expected_updated_at:order.updated_at,reason:reason.trim(),items:Object.entries(quantities).filter(([,v])=>v.trim()!==''&&Number(v)!==0).map(([crop_id,value])=>({crop_id,qty_kg:Number(value)}))});
  const run=async(save:boolean)=>{
    setError('');const body=payload();
    if(!body.reason){setError('กรุณาระบุเหตุผลการแก้ไข');return;}
    if(!body.items.length||body.items.some(i=>!Number.isFinite(i.qty_kg)||i.qty_kg<0.5||Math.abs(i.qty_kg*100-Math.round(i.qty_kg*100))>0.00001)){setError('เลือกผักอย่างน้อยหนึ่งชนิด ขั้นต่ำชนิดละ 0.5 กก. ทศนิยมไม่เกิน 2 ตำแหน่ง');return;}
    setBusy(true);
    try{const result=await api.post<{data:Preview}>(`/admin/orders/${order.id}/items${save?'':'/preview'}`,save?{...body,preview_token:preview?.preview_token}:body);
      if(save){await onSaved();onClose();}else setPreview(result.data);
    }catch(e:any){setError(e.message||'ไม่สามารถบันทึกรายการได้');}finally{setBusy(false);}
  };
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-3" role="dialog" aria-modal="true" aria-labelledby="amend-order-title"><div className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl bg-white p-5 sm:p-6">
    <div className="flex items-center justify-between gap-3"><h3 id="amend-order-title" className="text-lg font-black text-slate-900">แก้ไขรายการผักและจำนวนจอง</h3><button type="button" disabled={busy} onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-bold text-slate-600">ปิด</button></div>
    <p className="text-xs leading-6 text-slate-600">ใส่ 0 หรือเว้นว่างเพื่อนำผักออก ระบบตัดรอบที่เก็บก่อนและคืนสต๊อกส่วนที่ลด รายการจากแหล่งเดิมคงราคาเดิม แหล่งใหม่ใช้ราคาปัจจุบัน ตรวจยอดก่อนบันทึกทุกครั้ง</p>
    {loading?<p className="text-sm text-slate-500">กำลังโหลดชนิดผัก...</p>:<div className="space-y-2">{choices.map(c=><label key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><div className="min-w-0"><span className="text-sm font-bold text-slate-900">{c.name}</span><p className="mt-1 text-xs text-slate-500">{c.available==null?'ผักในออเดอร์เดิม':`คงเหลือเปิดจอง ${formatKg(c.available)} กก. (ยังไม่รวมยอดเดิมของออเดอร์นี้)`}</p></div><div className="w-28 shrink-0"><input aria-label={`จำนวนจองใหม่ ${c.name}`} disabled={busy} type="number" min="0" step="0.01" value={quantities[c.id]??''} placeholder="0" onChange={e=>change(c.id,e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold"/><span className="mt-1 block text-right text-xs text-slate-500">กก.</span></div></label>)}</div>}
    <label className="block text-sm font-bold text-slate-800">เหตุผลการแก้ไข<textarea disabled={busy} maxLength={1000} value={reason} onChange={e=>{setReason(e.target.value);setPreview(null);request.current=crypto.randomUUID();}} className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm font-normal" placeholder="เช่น ลูกค้าโทรขอลดคอสและเพิ่มกรีนโอ๊ค"/></label>
    {preview&&<div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm"><p className="font-bold text-emerald-950">ตรวจสอบก่อนบันทึก</p>{preview.items.map((i,index)=><p key={index} className="flex justify-between gap-3 text-xs"><span>{i.crop_name} {formatKg(Number(i.qty_kg))} กก.</span><span>{money(Number(i.qty_kg)*Number(i.price_per_kg)-Number(i.discount_amount))}</span></p>)}<p className="border-t border-emerald-200 pt-2">ยอดเดิม {money(preview.previous_total_amount)} → <strong>ยอดใหม่ {money(preview.total_amount)}</strong></p><p className="text-xs text-emerald-900">ระบบจะตรวจสต๊อกอีกครั้งตอนบันทึก หากไม่พอจะไม่เปลี่ยนรายการเดิม</p></div>}
    {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p>}
    <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={busy||loading} onClick={()=>run(false)} className="rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm font-bold text-sky-900 disabled:opacity-50">{busy?'กำลังตรวจสอบ...':'ตรวจสอบสต๊อกและยอดใหม่'}</button><button type="button" disabled={busy||!preview} onClick={()=>run(true)} className="rounded-xl bg-emerald-800 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">บันทึกการแก้ไขรายการ</button></div>
  </div></div>;
};
