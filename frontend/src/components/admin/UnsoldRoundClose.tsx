import React,{useState} from 'react';
import {Link} from 'react-router-dom';
import {AlertTriangle,ChevronDown,X} from 'lucide-react';
import {api} from '../../lib/api.js';
import {formatDateDMY,toBangkokDateString} from '../../lib/dateFormat.js';
import {isValidLossDate} from '../../lib/plantLossWizard.js';
import {plantCountToKg} from '../../lib/plantingQuantities.js';
import {unsoldDispositions,validateUnsoldInput,type UnsoldInput,type UnsoldDisposition} from '../../lib/unsoldRound.js';
import type {PlantingRound} from '../../types/index.js';

interface Item { id:string;crop_name:string;remaining_plant_count:number;plants_per_kg:number;farm_yield_kg:number;yield_is_actual:boolean;delivered_own_kg:number;available_kg:number }
interface HistoryItem {id:string;crop_name:string;unsold_plant_count:number;unsold_estimated_kg:number;other_sales_kg:number;disposition:UnsoldDisposition|null;note:string|null}
interface Preview {round:PlantingRound;items:Item[];blocking_orders:{id:string;status:string}[];closure:{closed_date:string;recorded_by_email:string;note:string|null}|null;history:HistoryItem[]}
const num=(value:number)=>Number(value).toLocaleString('th-TH',{maximumFractionDigits:2});
const field='mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-100';

export const UnsoldRoundClose:React.FC<{round:PlantingRound;onChanged:()=>Promise<void>}>=({round,onChanged})=>{
  const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false);
  const [data,setData]=useState<Preview|null>(null),[error,setError]=useState('');
  const [entries,setEntries]=useState<Record<string,UnsoldInput>>({});
  const [date,setDate]=useState(toBangkokDateString(new Date().toISOString())||'');
  const [note,setNote]=useState(''),[confirmed,setConfirmed]=useState(false),[requestId,setRequestId]=useState(()=>crypto.randomUUID());
  const isHistory=round.closure_reason==='unsold';
  const today=toBangkokDateString(new Date().toISOString())||'';
  const load=async()=>{
    setLoading(true);setError('');
    try{
      const result=await api.get<Preview>(`/admin/rounds/${round.id}/unsold`);setData(result);
      setEntries(Object.fromEntries(result.items.map(item=>[item.id,{count:'0',otherSales:'0',disposition:'',note:''}])));
      setRequestId(crypto.randomUUID());setConfirmed(false);
    }catch(err:any){setError(err.message||'โหลดข้อมูลไม่สำเร็จ');}finally{setLoading(false);}
  };
  const toggle=()=>{if(!open){setOpen(true);void load();}else setOpen(false);};
  const update=(id:string,key:keyof UnsoldInput,value:string)=>{setEntries(prev=>({...prev,[id]:{...prev[id],[key]:value}}));setConfirmed(false);};
  const total=data?.items.reduce((sum,item)=>sum+Number(entries[item.id]?.count||0),0)||0;
  const valid=!!data && !data.blocking_orders.length && total>0 && data.items.every(item=>entries[item.id]&&!validateUnsoldInput(entries[item.id],item))
    && isValidLossDate(date,round.harvest_sale_date||'',today) && confirmed;
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();if(!valid||!data||saving)return;setSaving(true);setError('');
    try{
      await api.post(`/admin/rounds/${round.id}/close-unsold`,{request_id:requestId,closed_date:date,note,
        items:data.items.map(item=>({round_item_id:item.id,unsold_plant_count:Number(entries[item.id].count),
          other_sales_kg:Number(entries[item.id].otherSales||0),disposition:Number(entries[item.id].count)>0?entries[item.id].disposition:null,note:entries[item.id].note}))});
      await onChanged();
    }catch(err:any){setError(err.message||'สิ้นสุดรอบไม่สำเร็จ');}finally{setSaving(false);}
  };
  return <section className="space-y-3">
    <button type="button" onClick={toggle} disabled={saving} aria-expanded={open} className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"><AlertTriangle className="h-4 w-4"/>{isHistory?'สิ้นสุดรอบ — มีผักขายไม่ออก (ดูบันทึก)':'บันทึกผักขายไม่ออกและสิ้นสุดรอบ'}<ChevronDown className={`h-4 w-4 ${open?'rotate-180':''}`}/></button>
    {open&&<div className="space-y-4 rounded-2xl border border-amber-200 bg-white p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2"><h3 className="font-extrabold text-slate-900">{isHistory?'ประวัติผักขายไม่ออก':'ตรวจสอบผักคงเหลือก่อนสิ้นสุดรอบ'}</h3><button type="button" disabled={saving} onClick={()=>setOpen(false)} aria-label="ปิดแบบฟอร์ม" className="rounded-lg p-2 hover:bg-slate-100"><X className="h-4 w-4"/></button></div>
      {loading&&<p className="text-sm text-slate-500">กำลังตรวจสอบผลผลิตและออเดอร์...</p>}
      {error&&<div role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}<button type="button" disabled={saving} onClick={load} className="ml-3 font-bold underline">ตรวจสอบข้อมูลอีกครั้ง</button></div>}
      {data?.closure?<><p className="text-sm text-slate-600">สิ้นสุดเมื่อ {formatDateDMY(data.closure.closed_date)} · บันทึกโดย {data.closure.recorded_by_email}</p>{data.history.map(item=><div key={item.id} className="space-y-1 rounded-xl bg-amber-50 p-4 text-sm"><strong>{item.crop_name}</strong><p>ขายไม่ออก {num(item.unsold_plant_count)} ต้น ≈ {num(item.unsold_estimated_kg)} กก.</p><p>ขายช่องทางอื่น {num(item.other_sales_kg)} กก.</p>{item.disposition&&<p>การจัดการ: {unsoldDispositions[item.disposition]}</p>}{item.note&&<p className="break-words">หมายเหตุ: {item.note}</p>}</div>)}{data.closure.note&&<p className="break-words text-sm">หมายเหตุรอบ: {data.closure.note}</p>}</>:data&&!loading&&<form onSubmit={submit} className="space-y-4">
        {!!data.blocking_orders.length&&<div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">ยังมีออเดอร์ค้างส่งมอบหรือค้างชำระ {data.blocking_orders.length} รายการ ต้องจัดการก่อนสิ้นสุดรอบ <Link to="/admin/orders" className="font-bold underline">ไปจัดการออเดอร์</Link></div>}
        <p className="text-sm leading-relaxed text-slate-600">กรอกจำนวนที่ขายไม่ออกจริง โดยแยกจากผักเสียหายระหว่างปลูก หากขายหน้าฟาร์มหรือช่องทางอื่น ให้บันทึกปริมาณแยกไว้</p>
        <fieldset disabled={saving} className="space-y-4">{data.items.map(item=>{
          const input=entries[item.id];if(!input)return null;const issue=validateUnsoldInput(input,item);
          return <div key={item.id} className="space-y-3 rounded-2xl border border-slate-200 p-4"><h4 className="font-bold text-slate-900">{item.crop_name}</h4><p className="text-xs leading-relaxed text-slate-500">ต้นคงเหลือหลังหักเสียหาย {num(item.remaining_plant_count)} ต้น · ผลผลิต{item.yield_is_actual?'จริง':'คาดการณ์'} {num(item.farm_yield_kg)} กก. · ส่งมอบผักจากฟาร์มแล้ว {num(item.delivered_own_kg)} กก. · เหลือสำหรับตรวจนับ {num(item.available_kg)} กก.</p>
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">ขายไม่ออก (ต้น)<input type="number" required min={0} max={item.remaining_plant_count} step={1} value={input.count} onChange={e=>update(item.id,'count',e.target.value)} className={field}/></label><label className="text-sm font-semibold">ขายช่องทางอื่นแล้ว (กก.)<input type="number" min={0} max={item.available_kg} step="0.01" value={input.otherSales} onChange={e=>update(item.id,'otherSales',e.target.value)} className={field}/></label></div>
            <p className="text-sm font-bold text-amber-900">น้ำหนักผักขายไม่ออกประมาณ {num(plantCountToKg(Number(input.count),item.plants_per_kg))} กก.</p>
            {Number(input.count)>0&&<><label className="block text-sm font-semibold">การจัดการผักที่ขายไม่ออก <span className="text-rose-600">*</span><select required value={input.disposition} onChange={e=>update(item.id,'disposition',e.target.value)} className={field}><option value="">เลือกวิธีจัดการ</option>{Object.entries(unsoldDispositions).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label className="block text-sm font-semibold">รายละเอียด / หมายเหตุ{input.disposition==='other'?' (จำเป็น)':' (ถ้ามี)'}<textarea required={input.disposition==='other'} maxLength={1000} value={input.note} onChange={e=>update(item.id,'note',e.target.value)} rows={2} className={field}/></label></>}
            {issue&&<p className="text-xs text-rose-700">{issue}</p>}
          </div>;
        })}<label className="block text-sm font-semibold">วันที่บันทึกและสิ้นสุดรอบ<input type="date" required min={round.harvest_sale_date||undefined} max={today} value={date} onChange={e=>{setDate(e.target.value);setConfirmed(false);}} className={field}/></label><label className="block text-sm font-semibold">หมายเหตุรอบ (ถ้ามี)<textarea maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} rows={2} className={field}/></label>
          <p className="text-xs leading-relaxed text-slate-500">น้ำหนักผักขายไม่ออกคำนวณจากอัตราต้น/กก. และปัดลง ปริมาณขายช่องทางอื่นเป็นบันทึกจำนวนเท่านั้น ไม่รวมเพิ่มในรายได้ระบบ หากผลผลิตคาดการณ์ไม่ตรง ควรตรวจสอบผลผลิตจริงก่อนยืนยัน</p>
          <label className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-950"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1 accent-amber-700"/><span>ตรวจนับและจัดการผักคงเหลือออกจากแปลงแล้ว ยืนยันปิดรับจองและสิ้นสุดรอบ ระบบจะคืนพื้นที่แปลงสำหรับรอบถัดไป และเก็บประวัตินี้ไว้</span></label>
        </fieldset>
        {!total&&<p className="text-xs text-slate-500">หากไม่มีผักขายไม่ออก ให้ใช้การสิ้นสุดรอบตามปกติ</p>}
        <button disabled={saving||!valid} className="rounded-xl bg-amber-700 px-5 py-3 text-sm font-bold text-white hover:bg-amber-800 disabled:opacity-50">{saving?'กำลังบันทึกและสิ้นสุดรอบ...':'ยืนยันบันทึกผักขายไม่ออกและสิ้นสุดรอบ'}</button>
      </form>}
    </div>}
  </section>;
};
