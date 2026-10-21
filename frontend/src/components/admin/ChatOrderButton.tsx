import {OrderLimitNotice} from '../common/OrderLimitNotice.js';
import React, { useEffect, useRef, useState } from 'react';
import { MessageSquarePlus, X } from 'lucide-react';
import { api } from '../../lib/api.js';
import type { CustomerProfile, PlantingRound, RoundItem } from '../../types/index.js';

const field = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100';
const number = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 2 });
const isOpen = (r: PlantingRound) => r.status === 'booking_open' && !r.closure_reason && !r.completed_date
  && (!r.booking_opens_at || Date.parse(r.booking_opens_at) <= Date.now())
  && (!r.booking_closes_at || Date.parse(r.booking_closes_at) > Date.now());

export const ChatOrderButton: React.FC<{ roundId?: string; onCreated: () => Promise<void> }> = ({ roundId, onCreated }) => {
  const [open, setOpen] = useState(false);
  return <><button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800"><MessageSquarePlus className="h-4 w-4"/>เพิ่มออเดอร์จากแชต</button>
    {open && <ChatOrderForm initialRoundId={roundId} onClose={() => setOpen(false)} onCreated={onCreated}/>}</>;
};

const ChatOrderForm: React.FC<{initialRoundId?: string; onClose: () => void; onCreated: () => Promise<void>}> = ({initialRoundId, onClose, onCreated}) => {
  const [rounds, setRounds] = useState<PlantingRound[]>([]), [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [remainingOrders,setRemainingOrders]=useState<number|null>(null);
  const [roundId, setRoundId] = useState(initialRoundId || ''), [items, setItems] = useState<RoundItem[]>([]);
  const [customerId, setCustomerId] = useState(''), [name, setName] = useState(''), [phone, setPhone] = useState('');
  const [method, setMethod] = useState<'pickup'|'delivery'>('pickup'), [address, setAddress] = useState('');
  const [reference, setReference] = useState(''), [note, setNote] = useState(''), [accepted, setAccepted] = useState(false);
  const [quantities, setQuantities] = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(true), [itemsLoading, setItemsLoading] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const request = useRef<{body: string; id: string} | null>(null);
  useEffect(() => { let active = true; Promise.all([api.get<PlantingRound[]>('/admin/rounds'), api.get<CustomerProfile[]>('/admin/customers')])
    .then(([r,c]) => {if(active){setRounds(r.filter(isOpen));setCustomers(c);}})
    .catch(e => {if(active)setError(e.message);}).finally(() => {if(active)setLoading(false);}); return () => {active=false;}; }, []);
  useEffect(() => {
    let active=true; setItems([]);setQuantities({});setAccepted(false);setRemainingOrders(null);
    if(!roundId){setItemsLoading(false);return;}
    setItemsLoading(true);
    api.get<PlantingRound>(`/admin/rounds/${roundId}`).then(r => {if(active){if(!isOpen(r))throw new Error('รอบนี้ยังไม่เปิดหรือปิดรับจองแล้ว');setRemainingOrders(r.order_limit_remaining??null);setItems((r.items || r.round_items || []).map(i=>({...i,max_qty_per_order_kg:r.purchase_limit_enabled?i.max_qty_per_order_kg:null})));}})
      .catch(e => {if(active)setError(e.message);}).finally(() => {if(active)setItemsLoading(false);});
    return () => {active=false;};
  }, [roundId]);
  const selectCustomer = (id:string) => {
    setCustomerId(id); const c=customers.find(c=>c.id===id);
    setName(c?.full_name || '');setPhone(c?.phone || '');setAddress(c?.address_detail || '');
  };
  const selected = items.filter(i => quantities[i.id] !== undefined && quantities[i.id] !== '');
  const totalKg = selected.reduce((s,i)=>s+Number(quantities[i.id] || 0),0);
  const total = selected.reduce((s,i)=>s+Number(quantities[i.id] || 0)*Number(i.price_per_kg),0);
  const invalidQty = selected.some(i => {const q=Number(quantities[i.id]);return !Number.isFinite(q)||q<0.5||(i.max_qty_per_order_kg!=null && q>Number(i.max_qty_per_order_kg))||Math.abs(q*100-Math.round(q*100))>0.00001;});
  const submit = async (event:React.FormEvent) => {
    event.preventDefault(); if(saving || success || remainingOrders===0 || !accepted || invalidQty || !selected.length)return;
    setSaving(true);setError('');
    const body={round_id:roundId,customer_id:customerId||null,customer_name:name.trim(),contact_phone:phone.trim(),fulfillment_method:method,
      delivery_address:method==='delivery'?address.trim():'',source_reference:reference.trim(),note:note.trim(),accepted_substitution_terms:true,
      items:selected.map(i=>({round_item_id:i.id,qty_kg:Number(quantities[i.id])}))};
    const serialized=JSON.stringify(body);
    if(request.current?.body!==serialized)request.current={body:serialized,id:crypto.randomUUID()};
    try{
      const result=await api.post<{order_id:string}>('/admin/orders/from-chat',{...body,request_id:request.current!.id});
      setSuccess(result.order_id);
      try {await onCreated();} catch {setError('บันทึกสำเร็จแล้ว กรุณารีเฟรชหน้ารายการเพื่อดูยอดล่าสุด');}
    }catch(e:any){setError(e.message || 'บันทึกไม่สำเร็จ');}finally{setSaving(false);}
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3" role="dialog" aria-modal="true" aria-labelledby="chat-order-title">
    <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4"><div><h2 id="chat-order-title" className="font-extrabold text-slate-900">เพิ่มออเดอร์จากแชตแฟนเพจ</h2><p className="mt-1 text-xs text-slate-500">บันทึกออเดอร์จากแชตตามเงื่อนไขเดียวกับหน้าเว็บ</p></div><button type="button" disabled={saving} onClick={onClose} aria-label="ปิด" className="rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5"/></button></div>
      {success ? <div className="space-y-4 p-5"><p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-900">บันทึกออเดอร์ #{success.slice(0,8)} สำเร็จ · ยืนยันแล้ว / ยังไม่ชำระเงิน<br/>ระบบรวมออเดอร์นี้ในยอดจองของรอบแล้ว</p>{error&&<p role="alert">{error}</p>}<button type="button" onClick={onClose} className="rounded-xl bg-emerald-700 px-5 py-2.5 font-bold text-white">เสร็จสิ้น</button></div>
      : <form onSubmit={submit} className="space-y-5 p-5">
        {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        {loading?<p className="text-sm text-slate-500">กำลังโหลดข้อมูล...</p>:<fieldset disabled={saving} className="space-y-5">
          <section className="space-y-3"><h3 className="font-bold text-slate-800">1. เลือกรอบและผัก</h3><label className="block text-sm">รอบเปิดจอง<select required className={field} value={roundId} onChange={e=>{setRoundId(e.target.value);setError('');}}><option value="">เลือกรอบที่เปิดรับจอง</option>{rounds.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
            <OrderLimitNotice remaining={remainingOrders}/>{!rounds.length&&<p className="text-sm text-amber-800">ยังไม่มีรอบที่เปิดรับจอง กรุณาเปิดรอบจองในหน้ารอบปลูกก่อน</p>}
            {itemsLoading?<p className="text-sm text-slate-500">กำลังโหลดรายการผัก...</p>:items.map(i=>{const max=i.max_qty_per_order_kg==null?undefined:Number(i.max_qty_per_order_kg);return <div key={i.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><div><strong className="text-sm">{i.crops?.name||i.crop_name||'ผัก'}</strong><p className="mt-1 text-xs text-slate-500">{number(Number(i.price_per_kg))} บาท/กก.</p>{i.max_qty_per_order_kg!=null&&<p className="text-xs text-slate-500">สูงสุด {number(Number(max))} กก./ออเดอร์</p>}</div><label className="w-28 shrink-0 text-xs">จำนวน (กก.)<input aria-label={`จำนวน ${i.crops?.name||i.crop_name||'ผัก'} (กก.)`} type="number" min="0.5" max={max} step="0.01" placeholder="ไม่เลือก" value={quantities[i.id]??''} onChange={e=>setQuantities(q=>({...q,[i.id]:e.target.value}))} className={field}/></label></div>;})}
            {invalidQty&&<p role="alert" className="text-sm text-rose-700">กรอกอย่างน้อย 0.5 กก. ไม่เกินจำนวนสูงสุดต่อออเดอร์เมื่อรอบเปิดจำกัดจำนวน</p>}
          </section>
          <section className="space-y-3"><h3 className="font-bold text-slate-800">2. ข้อมูลลูกค้า</h3><label className="block text-sm">เลือกสมาชิกเดิม (ถ้ามี)<select className={field} value={customerId} onChange={e=>selectCustomer(e.target.value)}><option value="">ลูกค้าจากแชต / ไม่ได้เป็นสมาชิก</option>{customers.map(c=><option key={c.id} value={c.id}>{c.full_name} · {c.phone||c.email}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">ชื่อลูกค้า<input required maxLength={200} value={name} onChange={e=>setName(e.target.value)} className={field}/></label><label className="text-sm">เบอร์โทรศัพท์<input required type="tel" minLength={9} maxLength={30} value={phone} onChange={e=>setPhone(e.target.value)} className={field}/></label></div></section>
          <section className="space-y-3"><h3 className="font-bold text-slate-800">3. วิธีรับผักและข้อมูลจากแชต</h3><label className="block text-sm">วิธีรับผัก<select className={field} value={method} onChange={e=>setMethod(e.target.value as 'pickup'|'delivery')}><option value="pickup">รับเองที่ฟาร์ม</option><option value="delivery">จัดส่ง</option></select></label>{method==='delivery'&&<label className="block text-sm">ที่อยู่จัดส่ง<textarea required maxLength={2000} className={field} value={address} onChange={e=>setAddress(e.target.value)}/></label>}<label className="block text-sm">ชื่อบัญชี Facebook / ลิงก์แชต (ถ้ามี)<input maxLength={1000} className={field} value={reference} onChange={e=>setReference(e.target.value)}/></label><label className="block text-sm">หมายเหตุ (ถ้ามี)<textarea maxLength={2000} className={field} value={note} onChange={e=>setNote(e.target.value)}/></label></section>
          <div className="rounded-xl bg-emerald-50 p-4"><div className="flex justify-between font-bold text-emerald-900"><span>รวม {number(totalKg)} กก.</span><span>{number(total)} บาท</span></div><p className="mt-2 text-xs text-emerald-800">บันทึกแล้วจะยืนยันออเดอร์ทันที สถานะชำระเงินเริ่มต้นเป็น “ยังไม่ชำระเงิน”</p><p className="mt-2 text-xs text-emerald-800">ไม่ต้องบันทึกปริมาณออเดอร์นี้ซ้ำใน “ขายช่องทางอื่น” ตอนสิ้นสุดรอบ</p></div>
          <label className="flex items-start gap-2 text-sm text-slate-700"><input required type="checkbox" className="mt-1" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/>ตรวจสอบรายการกับลูกค้าและแจ้งเงื่อนไขการทดแทนผักหากผลผลิตไม่เพียงพอแล้ว</label>
          <div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-xl border px-4 py-2.5 text-sm">ยกเลิก</button><button type="submit" disabled={saving||itemsLoading||remainingOrders===0||!selected.length||invalidQty||!accepted||!rounds.some(r=>r.id===roundId)} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">{saving?'กำลังบันทึก...':'ยืนยันและเพิ่มออเดอร์'}</button></div>
        </fieldset>}
      </form>}
    </div>
  </div>;
};
