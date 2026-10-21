import { formatKg } from '../../lib/bookingQuantity.js';
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarDays, Leaf, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { useCart } from '../../context/CartContext.js';
import { api } from '../../lib/api.js';
import { PlantingRound } from '../../types/index.js';
import { formatDateDMY } from '../../lib/dateFormat.js';
import { CustomerPageHeader } from '../../components/common/CustomerPageHeader.js';

const money = (value: number) => `฿${value.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;

export const BookingReviewPage: React.FC = () => {
  const { items, roundId, totalKg, totalAmount, removeItem, setItemQty } = useCart();
  const navigate = useNavigate();
  const [round, setRound] = useState<PlantingRound | null>(null);
  const [qtyError, setQtyError] = useState('');

  const changeQty = (item: typeof items[number], delta: number) => {
    const current=round?.items?.find(i=>i.id===item.round_item_id);
    setQtyError('');
    const result = setItemQty({
      round_item_id: item.round_item_id,
      crop_name: item.crop_name,
      price_per_kg: item.price_per_kg,
      available_qty_kg: null,
      max_qty_per_order_kg: current?.max_qty_per_order_kg ?? null,
    }, Math.round((item.qty_kg + delta) * 100) / 100);
    if (!result.success) setQtyError(result.message || 'ไม่สามารถเปลี่ยนจำนวนได้');
  };

  useEffect(() => {
    if (!roundId) return;
    api.get<PlantingRound>(`/rounds/${roundId}`).then(setRound).catch(() => setRound(null));
  }, [roundId]);

  if (items.length === 0 || !roundId) {
    return <div className="mx-auto max-w-lg py-16 text-center"><ShoppingBag className="mx-auto h-12 w-12 text-slate-300" /><h1 className="mt-4 text-xl font-black text-slate-900">ยังไม่มีรายการจอง</h1><p className="mt-2 text-sm text-slate-500">เลือกผักที่ต้องการจากรอบเปิดจองก่อน</p><Link to="/" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white"><ArrowLeft className="h-4 w-4" />เลือกรอบจอง</Link></div>;
  }

  const exceedsLimit=!!round?.purchase_limit_enabled && items.some(i=>{const cap=round.items?.find(r=>r.id===i.round_item_id)?.max_qty_per_order_kg;return cap!=null && i.qty_kg>Number(cap);});

  return <div className="mx-auto max-w-3xl space-y-5 pb-24">
    <Link to={`/rounds/${roundId}`} className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-emerald-800"><ArrowLeft className="h-4 w-4" />กลับไปแก้ไขรายการ</Link>
    <CustomerPageHeader eyebrow="ตรวจสอบก่อนยืนยัน" title="รายการจองผักของคุณ" description="ตรวจสอบชนิดผักและจำนวนให้เรียบร้อย ก่อนกรอกข้อมูลเพื่อยืนยันการจอง" icon={<ShoppingBag className="h-7 w-7" />}>
      {round && <div className="flex flex-wrap gap-2 text-xs font-semibold text-white/90"><span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2"><Leaf className="h-3.5 w-3.5" />{round.name}</span><span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2"><CalendarDays className="h-3.5 w-3.5" />เก็บเกี่ยว {formatDateDMY(round.fulfillment_date)}</span></div>}
    </CustomerPageHeader>

    {exceedsLimit&&<p role="alert" className="rounded-xl bg-orange-50 p-4 text-sm text-orange-900">ฟาร์มจำกัดจำนวนการซื้อของรอบนี้แล้ว กรุณากลับไปปรับจำนวนผักให้ไม่เกินเพดานก่อนยืนยัน</p>}
    <section className="overflow-hidden rounded-[1.75rem] border border-emerald-100 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6"><div><h2 className="font-black text-slate-900">ผักที่เลือก</h2><p className="mt-0.5 text-xs text-slate-500">{items.length} ชนิด · รวม {formatKg(totalKg)} กก.</p></div><ShoppingBag className="h-5 w-5 text-emerald-700" /></div>
      <div className="divide-y divide-slate-100">{items.map((item) => <article key={item.round_item_id} className="flex flex-wrap items-center gap-3 px-5 py-4 sm:flex-nowrap sm:px-6"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Leaf className="h-5 w-5" /></div><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-extrabold text-slate-900">{item.crop_name}</h3><p className="mt-1 text-xs text-slate-500">{money(Number(item.price_per_kg))} / กก.</p></div><div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1"><button type="button" onClick={() => changeQty(item, -0.5)} aria-label={`ลด${item.crop_name} 0.5 กิโลกรัม`} className="grid h-8 w-8 place-items-center rounded-lg bg-white text-slate-700 shadow-sm transition hover:bg-slate-100"><Minus className="h-3.5 w-3.5" /></button><span className="min-w-14 text-center text-sm font-extrabold text-slate-900">{formatKg(item.qty_kg)} กก.</span><button type="button" onClick={() => changeQty(item, 0.5)} aria-label={`เพิ่ม${item.crop_name} 0.5 กิโลกรัม`} className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-700 text-white shadow-sm transition hover:bg-emerald-800"><Plus className="h-3.5 w-3.5" /></button></div><div className="w-full text-right sm:w-auto"><p className="font-black text-slate-900">{money(item.qty_kg * Number(item.price_per_kg))}</p></div><button type="button" onClick={() => removeItem(item.round_item_id)} aria-label={`ลบ${item.crop_name}ออกจากรายการ`} title="ลบรายการ" className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></article>)}</div>
      {qtyError && <p role="alert" className="border-t border-rose-100 bg-rose-50 px-5 py-3 text-xs font-semibold text-rose-700 sm:px-6">{qtyError}</p>}
      <div className="space-y-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-6"><div className="flex justify-between text-sm text-slate-600"><span>น้ำหนักรวม</span><span className="font-bold text-slate-900">{formatKg(totalKg)} กก.</span></div><div className="flex justify-between text-base"><span className="font-bold text-slate-700">ยอดรวมโดยประมาณ</span><span className="text-lg font-black text-emerald-800">{money(totalAmount)}</span></div></div>
    </section>

    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><Link to={`/rounds/${roundId}`} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" />แก้ไขจำนวนผัก</Link><button type="button" disabled={items.length===0||exceedsLimit} onClick={() => navigate('/checkout')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 py-3 text-sm font-extrabold text-white shadow-md transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">ไปหน้ายืนยันการสั่งจอง<ArrowRight className="h-4 w-4" /></button></div>
  </div>;
};
