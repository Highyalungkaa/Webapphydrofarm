import {FormPopup} from '../common/FormPopup.js';
import React,{useEffect,useId,useState} from 'react';
import {Link} from 'react-router-dom';
import {AlertTriangle,X} from 'lucide-react';
import {api} from '../../lib/api.js';
import {formatDateDMY,toBangkokDateString} from '../../lib/dateFormat.js';
import {isValidLossDate} from '../../lib/plantLossWizard.js';
import {unsoldDispositions,validateUnsoldAmounts,validateUnsoldInput,withSharedUnsoldHandling,type UnsoldInput,type UnsoldDisposition} from '../../lib/unsoldRound.js';
import type {PlantingRound} from '../../types/index.js';

interface Item { id:string;crop_name:string;remaining_plant_count:number;plants_per_kg:number;farm_yield_kg:number;yield_is_actual:boolean;delivered_own_kg:number;available_kg:number }
interface HistoryItem {id:string;crop_name:string;unsold_plant_count:number;unsold_estimated_kg:number|null;unsold_actual_kg?:number|null;disposition:UnsoldDisposition|null;note:string|null}
interface Preview {round:PlantingRound;items:Item[];blocking_orders:{id:string;status:string}[];closure:{closed_date:string;recorded_by_email:string;note:string|null}|null;history:HistoryItem[]}
const num=(value:number)=>Number(value).toLocaleString('th-TH',{maximumFractionDigits:2});
const field='mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-100';

export const UnsoldRoundClose:React.FC<{round:PlantingRound;onChanged:()=>Promise<void>}>=({round,onChanged})=>{
  const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false);
  const popupTitleId=useId();
  const [data,setData]=useState<Preview|null>(null),[error,setError]=useState('');
  const [entries,setEntries]=useState<Record<string,UnsoldInput>>({});
  const [disposition,setDisposition]=useState(''),[handlingNote,setHandlingNote]=useState('');
  const [date,setDate]=useState(toBangkokDateString(new Date().toISOString())||'');
  const [note,setNote]=useState(''),[confirmed,setConfirmed]=useState(false),[requestId,setRequestId]=useState(()=>crypto.randomUUID());
  const isHistory=round.closure_reason==='unsold';
  const today=toBangkokDateString(new Date().toISOString())||'';
  const currentRound=data?.round||round;
  const isReady=!!currentRound.harvest_sale_date && currentRound.harvest_sale_date<=today && Number(currentRound.current_step)>=7
    && !currentRound.sold_out_date && !currentRound.completed_date && ['booking_open','booking_closed','harvested'].includes(currentRound.status);
  const readinessMessage=!currentRound.harvest_sale_date || Number(currentRound.current_step)<7
    ? 'กรุณายืนยันวันที่พร้อมเก็บและขายในสถานะ 6 ด้านบนก่อน จึงจะบันทึกผักขายไม่ออกและสิ้นสุดรอบได้'
    : currentRound.harvest_sale_date>today ? `ยังไม่ถึงวันที่พร้อมเก็บและขาย (${formatDateDMY(currentRound.harvest_sale_date)}) หากวันเก็บจริงเปลี่ยน กรุณาแก้ไขวันที่ในสถานะ 6 ให้ตรงก่อน`
    : 'รอบนี้ยังไม่สามารถปิดพร้อมบันทึกผักขายไม่ออกได้ กรุณาตรวจสอบสถานะรอบ';
  const load=async()=>{
    setLoading(true);setError('');
    try{
      const result=await api.get<Preview>(`/admin/rounds/${round.id}/unsold`);setData(result);
      setEntries(Object.fromEntries(result.items.map(item=>[item.id,{count:'0',unsoldKg:'',disposition:'',note:''}])));
      setRequestId(crypto.randomUUID());setConfirmed(false);setDisposition('');setHandlingNote('');
    }catch(err:any){setError(err.message||'โหลดข้อมูลไม่สำเร็จ');}finally{setLoading(false);}
  };
  useEffect(()=>{
    if(isHistory&&open){void load();}
  },[round.id,isHistory]);
  const toggle=()=>{if(!open){setOpen(true);if(isHistory||isReady)void load();}else setOpen(false);};
  const update=(id:string,key:keyof UnsoldInput,value:string)=>{setEntries(prev=>({...prev,[id]:{...prev[id],[key]:value}}));setConfirmed(false);};
  const total=data?.items.reduce((sum,item)=>sum+Number(entries[item.id]?.count||0),0)||0;
  const valid=isReady && !!data && !data.blocking_orders.length && total>0 && data.items.every(item=>entries[item.id]&&!validateUnsoldInput(withSharedUnsoldHandling(entries[item.id],disposition,handlingNote),item))
    && isValidLossDate(date,round.harvest_sale_date||'',today) && confirmed;
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();if(!valid||!data||saving)return;setSaving(true);setError('');
    try{
      await api.post(`/admin/rounds/${round.id}/close-unsold`,{request_id:requestId,closed_date:date,note,
        items:data.items.map(item=>({round_item_id:item.id,unsold_plant_count:Number(entries[item.id].count),
          other_sales_kg:0,unsold_qty_kg:Number(entries[item.id].unsoldKg||0),disposition:Number(entries[item.id].count)>0?disposition:null,note:withSharedUnsoldHandling(entries[item.id],disposition,handlingNote).note}))});
      await onChanged();
    }catch(err:any){setError(err.message||'สิ้นสุดรอบไม่สำเร็จ');}finally{setSaving(false);}
  };
  return <section className="space-y-3">
    <button type="button" onClick={toggle} disabled={saving} aria-haspopup="dialog" className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"><AlertTriangle className="h-4 w-4"/>{isHistory?'สิ้นสุดรอบ — มีผักขายไม่ออก (ดูบันทึก)':'บันทึกผักขายไม่ออกและสิ้นสุดรอบ'}</button>
    <FormPopup open={open} onClose={()=>setOpen(false)} closeDisabled={saving} labelledBy={popupTitleId}>
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2"><h3 id={popupTitleId} className="font-extrabold text-slate-900">{isHistory?'ประวัติผักขายไม่ออก':'ตรวจสอบผักคงเหลือก่อนสิ้นสุดรอบ'}</h3><button type="button" disabled={saving} onClick={()=>setOpen(false)} aria-label="ปิดแบบฟอร์ม" className="rounded-lg p-2 hover:bg-slate-100"><X className="h-4 w-4"/></button></div>
      {loading&&<p className="text-sm text-slate-500">กำลังตรวจสอบผลผลิตและออเดอร์...</p>}
      {!isHistory&&!isReady&&<p role="status" className="rounded-xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">{readinessMessage}</p>}
      {error&&<div role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}<button type="button" disabled={saving} onClick={load} className="ml-3 font-bold underline">ตรวจสอบข้อมูลอีกครั้ง</button></div>}
      {data?.closure?<><p className="text-sm text-slate-600">สิ้นสุดเมื่อ {formatDateDMY(data.closure.closed_date)} · บันทึกโดย {data.closure.recorded_by_email}</p>{data.history.map(item=><div key={item.id} className="space-y-1 rounded-xl bg-amber-50 p-4 text-sm"><strong>{item.crop_name}</strong><p>ขายไม่ออก {num(item.unsold_plant_count)} ต้น{item.unsold_actual_kg!=null?` · ชั่งจริง ${num(item.unsold_actual_kg)} กก.`:''}</p>{item.disposition&&<p>การจัดการ: {unsoldDispositions[item.disposition]}</p>}{item.note&&<p className="break-words">หมายเหตุ: {item.note}</p>}</div>)}{data.closure.note&&<p className="break-words text-sm">หมายเหตุรอบ: {data.closure.note}</p>}</>:data&&!loading&&isReady&&<form onSubmit={submit} className="space-y-4">
        {!!data.blocking_orders.length&&<div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">ยังมีออเดอร์ค้างส่งมอบหรือค้างชำระ {data.blocking_orders.length} รายการ ต้องจัดการก่อนสิ้นสุดรอบ <Link to="/admin/orders" className="font-bold underline">ไปจัดการออเดอร์</Link></div>}
        <p className="text-sm leading-relaxed text-slate-600">กรอกจำนวนต้นที่ขายไม่ออกจริง โดยแยกจากผักเสียหายระหว่างปลูก</p>
        <fieldset disabled={saving} className="space-y-4">{data.items.map(item=>{
          const input=entries[item.id];if(!input)return null;const issue=validateUnsoldAmounts(input,item);
          return <div key={item.id} className="space-y-3 rounded-2xl border border-slate-200 p-4"><h4 className="font-bold text-slate-900">{item.crop_name}</h4>
            <label className="block text-sm font-semibold">ขายไม่ออก (ต้น)<input type="number" required min={0} max={item.remaining_plant_count} step={1} value={input.count} onChange={e=>update(item.id,'count',e.target.value)} className={field}/></label>
            <label className="block text-sm font-semibold">น้ำหนักผักขายไม่ออกที่ชั่งจริง (กก. ถ้ามี)<input type="number" min="0" step="0.01" value={input.unsoldKg||''} onChange={e=>update(item.id,'unsoldKg',e.target.value)} className={field}/></label>
            {issue&&<p className="text-xs text-rose-700">{issue}</p>}
          </div>;
        })}
          <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/50 p-4" aria-labelledby="unsold-handling-title">
            <h4 id="unsold-handling-title" className="font-bold text-slate-900">การจัดการผักที่ขายไม่ออก</h4>
            <p className="text-xs text-slate-600">เลือกครั้งเดียว ใช้กับผักทุกชนิดที่กรอกจำนวนขายไม่ออกในรอบนี้</p>
            <label className="block text-sm font-semibold">วิธีจัดการ <span className="text-rose-600">*</span><select required value={disposition} onChange={e=>{setDisposition(e.target.value);setConfirmed(false);}} className={field}><option value="">เลือกวิธีจัดการ</option>{Object.entries(unsoldDispositions).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
            <label className="block text-sm font-semibold">รายละเอียด / หมายเหตุ{disposition==='other'?' (จำเป็น)':' (ถ้ามี)'}<textarea required={disposition==='other'} maxLength={1000} value={handlingNote} onChange={e=>{setHandlingNote(e.target.value);setConfirmed(false);}} rows={2} className={field}/></label>
          </section>
          <label className="block text-sm font-semibold">วันที่บันทึกและสิ้นสุดรอบ<input type="date" required min={round.harvest_sale_date||undefined} max={today} value={date} onChange={e=>{setDate(e.target.value);setConfirmed(false);}} className={field}/></label><label className="block text-sm font-semibold">หมายเหตุรอบ (ถ้ามี)<textarea maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} rows={2} className={field}/></label>
          <p className="text-xs leading-relaxed text-slate-500">บันทึกจำนวนต้นและน้ำหนักที่ตรวจนับหรือชั่งได้จริงเท่านั้น</p>
          <label className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-950"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1 accent-amber-700"/><span>ตรวจนับและจัดการผักคงเหลือออกจากแปลงแล้ว ยืนยันปิดรับจองและสิ้นสุดรอบ ระบบจะคืนพื้นที่แปลงสำหรับรอบถัดไป และเก็บประวัตินี้ไว้</span></label>
        </fieldset>
        {!total&&<p className="text-xs text-slate-500">หากไม่มีผักขายไม่ออก ให้ใช้การสิ้นสุดรอบตามปกติ</p>}
        <button disabled={saving||!valid} className="rounded-xl bg-amber-700 px-5 py-3 text-sm font-bold text-white hover:bg-amber-800 disabled:opacity-50">{saving?'กำลังบันทึกและสิ้นสุดรอบ...':'ยืนยันบันทึกผักขายไม่ออกและสิ้นสุดรอบ'}</button>
      </form>}
    </div>
    </FormPopup>
  </section>;
};
