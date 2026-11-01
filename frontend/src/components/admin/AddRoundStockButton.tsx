import React, {useEffect, useRef, useState} from 'react';
import {History, Plus, X} from 'lucide-react';
import type {PlantingRound} from '../../types/index.js';
import {api} from '../../lib/api.js';
import {canAddRoundStock as canAdd} from '../../lib/roundStock.js';
import {formatDateTimeDMY, toBangkokDateString} from '../../lib/dateFormat.js';
import {FormPopup} from '../common/FormPopup.js';

type StockItem={id:string;crop_name:string;price_per_kg:number;estimated_qty_kg:number;additional_qty_kg:number;available_qty_kg:number};
type Addition={id:string;round_item_id:string;added_qty_kg:number;note:string;created_at:string};
type Snapshot={round:PlantingRound;items:StockItem[];additions:Addition[]};
const num=(n:number)=>Number(n).toLocaleString('th-TH',{maximumFractionDigits:2});

export const AddRoundStockButton:React.FC<{round:PlantingRound;onChanged:()=>Promise<void>}>=({round,onChanged})=>{
  const [open,setOpen]=useState(false),[snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [itemId,setItemId]=useState(''),[quantity,setQuantity]=useState(''),[note,setNote]=useState('ชั่งผลผลิตได้มากกว่าประมาณการ');
  const [reopen,setReopen]=useState(false),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const request=useRef({key:'',id:''}),saveLock=useRef(false);
  useEffect(()=>{
    if(!open)return;
    let active=true;
    setLoading(true);setError('');setSnapshot(null);setItemId('');setQuantity('');setNote('ชั่งผลผลิตได้มากกว่าประมาณการ');
    request.current={key:'',id:''};
    void api.get<Snapshot>(`/admin/rounds/${round.id}/stock`).then(data=>{
      if(!active)return;
      setSnapshot(data);
      setReopen(data.round.status!=='booking_open'||!!data.round.sold_out_date||!!data.round.booking_closes_at&&new Date(data.round.booking_closes_at)<=new Date()
        ||!!data.round.booking_opens_at&&new Date(data.round.booking_opens_at)>new Date());
    }).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[open,round.id]);
  const current=snapshot?.round||round,editable=canAdd(current);
  const item=snapshot?.items.find(i=>i.id===itemId),qty=Number(quantity);
  const needsReopen=current.status!=='booking_open'||!!current.sold_out_date
    ||!!current.booking_closes_at&&new Date(current.booking_closes_at)<=new Date()
    ||!!current.booking_opens_at&&new Date(current.booking_opens_at)>new Date();
  const readyToReopen=!!current.harvest_sale_date&&current.harvest_sale_date<=toBangkokDateString(new Date().toISOString())!;
  const validQty=quantity.trim()!==''&&Number.isFinite(qty)&&qty>0&&qty<=99999999&&Math.abs(qty*100-Math.round(qty*100))<0.000001;
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(saveLock.current||!item||!validQty||!editable)return;
    if(needsReopen&&(!reopen||!readyToReopen)){setError('กรุณาบันทึกวันพร้อมเก็บและขาย แล้วเลือกเปิดรับจองอีกครั้ง');return;}
    const body={round_item_id:item.id,previous_additional_kg:Number(item.additional_qty_kg||0),added_qty_kg:qty,note:note.trim(),reopen};
    if(!body.note){setError('กรุณาระบุเหตุผลการเพิ่มผลผลิต');return;}
    const key=JSON.stringify(body);
    if(request.current.key!==key)request.current={key,id:crypto.randomUUID()};
    saveLock.current=true;setSaving(true);setError('');
    try{
      await api.post(`/admin/rounds/${round.id}/stock`,{...body,request_id:request.current.id});
      setOpen(false);
      await onChanged();
    }catch(e:any){setError(e.message||'เพิ่มผลผลิตไม่สำเร็จ กรุณาลองใหม่');}
    finally{saveLock.current=false;setSaving(false);}
  };
  if(!canAdd(round)&&!(round.round_items||[]).some(i=>Number(i.additional_qty_kg)>0))return null;
  return <>
    <button type="button" onClick={()=>setOpen(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100">
      {canAdd(round)?<Plus className="h-4 w-4"/>:<History className="h-4 w-4"/>}{canAdd(round)?'เพิ่มผลผลิตสำหรับขาย':'ประวัติเพิ่มผลผลิต'}
    </button>
    <FormPopup open={open} onClose={()=>setOpen(false)} closeDisabled={saving} labelledBy="add-stock-heading">
      <div className="space-y-4">
        <header className="flex items-start justify-between gap-3"><div><h2 id="add-stock-heading" className="text-lg font-extrabold text-slate-900">{editable?'เพิ่มผลผลิตสำหรับขาย':'ประวัติเพิ่มผลผลิต'}</h2><p className="mt-1 text-xs text-slate-500">{round.name}</p></div><button type="button" disabled={saving} onClick={()=>setOpen(false)} aria-label="ปิด" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5"/></button></header>
        {loading&&<p className="py-8 text-center text-sm text-slate-500">กำลังโหลดข้อมูลล่าสุด...</p>}
        {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        {!loading&&snapshot&&editable&&<form onSubmit={submit} className="space-y-4">
          <fieldset disabled={saving} className="space-y-4">
            <p className="rounded-xl bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-900">กรอกเฉพาะผักที่ชั่งได้เพิ่มและยังไม่ได้จัดให้ลูกค้า โดยไม่เปลี่ยนจำนวนต้นหรือผลผลิตประมาณเดิม</p>
            <label className="block text-sm font-bold text-slate-800">ชนิดผัก <span className="text-rose-600">*</span><select required value={itemId} onChange={e=>setItemId(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm"><option value="">เลือกผักในรอบนี้</option>{snapshot.items.map(i=><option key={i.id} value={i.id}>{i.crop_name}</option>)}</select></label>
            {item&&<div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs"><p className="text-slate-500">ราคาขายปัจจุบัน<strong className="mt-1 block text-sm text-slate-800">฿{num(item.price_per_kg)}/กก.</strong></p><p className="text-slate-500">เปิดให้จองได้อีก<strong className="mt-1 block text-sm text-emerald-800">{num(item.available_qty_kg)} กก.</strong></p></div>}
            <label className="block text-sm font-bold text-slate-800">ปริมาณที่เพิ่ม (กก.) <span className="text-rose-600">*</span><input required type="number" min="0.01" max="99999999" step="0.01" value={quantity} onChange={e=>setQuantity(e.target.value)} placeholder="เช่น 5" className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm"/></label>
            {item&&validQty&&<p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">เพิ่ม {num(qty)} กก. → เปิดให้จองได้อีก {num(Math.round((item.available_qty_kg+qty)*100)/100)} กก.</p>}
            <label className="block text-sm font-bold text-slate-800">เหตุผล<textarea required maxLength={1000} value={note} onChange={e=>setNote(e.target.value)} rows={2} className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm font-normal"/></label>
            {needsReopen&&<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={reopen} disabled={!readyToReopen} onChange={e=>setReopen(e.target.checked)}/>เปิดรับจองอีกครั้ง</label><p className="mt-2 text-xs">{readyToReopen?'ลูกค้าจะจองผักเพิ่มได้ทันทีหลังบันทึก':'ต้องบันทึกวันพร้อมเก็บและขายที่มาถึงแล้ว ก่อนเปิดรับจองอีกครั้ง'}</p></div>}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={()=>setOpen(false)} className="rounded-xl px-4 py-2.5 text-sm text-slate-600">ยกเลิก</button><button disabled={!item||!validQty||needsReopen&&(!reopen||!readyToReopen)} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{saving?'กำลังบันทึก...':'ยืนยันเพิ่มผลผลิต'}</button></div>
          </fieldset>
        </form>}
        {!loading&&snapshot&&snapshot.additions.length>0&&<details open={!editable} className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-xs font-bold text-slate-600">ประวัติการเพิ่มผลผลิต · 30 รายการล่าสุด</summary><ul className="mt-3 max-h-60 space-y-2 overflow-y-auto">{snapshot.additions.map(addition=><li key={addition.id} className="rounded-lg bg-slate-50 p-3 text-xs"><div className="flex justify-between gap-3"><strong>{snapshot.items.find(i=>i.id===addition.round_item_id)?.crop_name||'ผัก'}</strong><strong className="text-emerald-800">+{num(addition.added_qty_kg)} กก.</strong></div><p className="mt-1 text-slate-500">{formatDateTimeDMY(addition.created_at)}</p><p className="mt-1 break-words text-slate-600">{addition.note}</p></li>)}</ul></details>}
      </div>
    </FormPopup>
  </>;
};
