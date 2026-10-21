import React,{useState} from 'react';
import {api} from '../../lib/api.js';
import {OrderLimitSettings} from './OrderLimitSettings.js';
import {PurchaseLimitBadge} from '../common/PurchaseLimitBadge.js';
import type {PlantingRound} from '../../types/index.js';
export const PurchaseLimitPanel:React.FC<{round:PlantingRound;onChanged:()=>Promise<void>}>=({round,onChanged})=>{
  const[open,setOpen]=useState(false),[enabled,setEnabled]=useState(!!round.purchase_limit_enabled),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const[limits,setLimits]=useState<Record<string,string>>(()=>Object.fromEntries((round.round_items||[]).map(i=>[i.id,i.max_qty_per_order_kg==null?'':String(i.max_qty_per_order_kg)])));
  const closed=['completed','cancelled'].includes(round.status)||!!round.closure_reason;
  const save=async(e:React.FormEvent)=>{e.preventDefault();if(saving)return;setSaving(true);setError('');
    try{await api.patch(`/admin/rounds/${round.id}/purchase-limits`,{enabled,items:enabled?(round.round_items||[]).map(i=>({id:i.id,max_qty_per_order_kg:Number(limits[i.id])})):[]});await onChanged();setOpen(false);}
    catch(e:any){setError(e.message);}finally{setSaving(false);}
  };
  const valid=!enabled||(!!round.round_items?.length&&round.round_items.every(i=>{const n=Number(limits[i.id]);return n>=0.5&&n<=99999999&&Math.abs(n*100-Math.round(n*100))<0.00001;}));
  return <section id="purchase-limits" className="space-y-3 rounded-2xl border border-orange-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-extrabold text-slate-900">จำกัดจำนวนการซื้อในรอบนี้</h2>{round.purchase_limit_enabled&&<PurchaseLimitBadge/>}</div><p className="mt-1 text-sm text-slate-500">{round.purchase_limit_enabled?'จำกัดกิโลกรัมสูงสุดของผักแต่ละชนิดต่อออเดอร์':'ยังไม่จำกัดจำนวนกิโลกรัมต่อออเดอร์'}</p></div>{!closed&&<button type="button" disabled={saving} onClick={()=>{setEnabled(!!round.purchase_limit_enabled);setOpen(!open);setError('');}} className="rounded-xl border border-orange-300 bg-orange-50 px-4 py-2.5 text-sm font-bold text-orange-900">{open?'ปิดการตั้งค่า':round.purchase_limit_enabled?'แก้ไข / ยกเลิกการจำกัด':'จำกัดจำนวนการซื้อ'}</button>}</div>
    {round.purchase_limit_enabled&&!open&&<div className="flex flex-wrap gap-2">{round.round_items?.map(i=><span key={i.id} className="rounded-lg bg-orange-50 px-3 py-1.5 text-xs text-orange-900">{i.crop_name||i.crops?.name} สูงสุด {Number(i.max_qty_per_order_kg).toLocaleString()} กก./ออเดอร์</span>)}</div>}
    {open&&<form onSubmit={save} className="space-y-4 border-t border-orange-100 pt-4"><fieldset disabled={saving} className="space-y-4"><label className="flex items-start gap-3 text-sm font-bold text-slate-800"><input type="checkbox" className="mt-1 h-4 w-4 accent-orange-700" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>เปิดใช้การจำกัดจำนวนการซื้อ</label>
      {enabled&&<div className="grid gap-3 sm:grid-cols-2">{round.round_items?.map(i=><label key={i.id} className="rounded-xl bg-orange-50 p-3 text-sm font-semibold text-orange-950">{i.crop_name||i.crops?.name}<span className="mt-1 block text-xs font-normal">จำนวนสูงสุดต่อออเดอร์ (กก.)</span><input required type="number" min="0.5" max="99999999" step="0.01" placeholder="เช่น 2.5" value={limits[i.id]??''} onChange={e=>setLimits(p=>({...p,[i.id]:e.target.value}))} className="mt-2 w-full rounded-lg border border-orange-200 bg-white px-3 py-2.5"/></label>)}</div>}
      <p className="text-xs text-slate-500">มีผลกับคำสั่งจองใหม่ของรอบนี้เท่านั้น ออเดอร์เดิมยังคงจำนวนที่ลูกค้าจองไว้ ปิดการจำกัดได้เมื่อฟาร์มพร้อมรับออเดอร์จำนวนมากอีกครั้ง</p>
      {error&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}<button disabled={saving||!valid} className="rounded-xl bg-orange-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">{saving?'กำลังบันทึก...':'บันทึกการจำกัดจำนวน'}</button>
    </fieldset></form>}
    <OrderLimitSettings round={round} onChanged={onChanged}/>
  </section>;
};
