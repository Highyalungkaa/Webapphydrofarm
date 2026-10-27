import React,{useEffect,useId,useRef} from 'react';
import {X} from 'lucide-react';
import type {Order} from '../../types/index.js';
import {Badge} from '../common/Badge.js';
import {formatDateTimeDMY} from '../../lib/dateFormat.js';
import {OrderDiscountSummary} from './OrderDiscountSummary.js';

export const OrderHistoryDialog:React.FC<{order:Order;onClose:()=>void}>=({order,onClose})=>{
  const ref=useRef<HTMLDialogElement>(null);
  const titleId=useId();
  const close=()=>{ref.current?.close();onClose();};
  useEffect(()=>{
    const dialog=ref.current;
    if(dialog&&!dialog.open)dialog.showModal();
    return()=>{dialog?.close();};
  },[order.id]);
  return <dialog ref={ref} aria-labelledby={titleId} onCancel={event=>{event.preventDefault();close();}} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-3xl overflow-y-auto rounded-3xl border border-slate-200 bg-slate-50 p-0 shadow-2xl backdrop:bg-slate-900/50">
    <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-5">
      <div><h2 id={titleId} className="text-lg font-extrabold text-slate-900">รายละเอียดออเดอร์ #{order.id.slice(0,8)}</h2><p className="mt-1 text-xs text-slate-500">สั่งเมื่อ {formatDateTimeDMY(order.created_at)}</p></div>
      <button autoFocus type="button" aria-label="ปิดรายละเอียดออเดอร์" onClick={close} className="shrink-0 rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5"/></button>
    </header>
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap gap-2"><Badge status={order.status} type="order"/><Badge status={order.payment_status} type="payment"/>{order.order_source==='facebook_chat'&&<span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">สั่งผ่านแชต</span>}</div>
      <dl className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-slate-500">ลูกค้า</dt><dd className="mt-1 font-bold text-slate-900">{order.customer_name||order.profiles?.full_name||'ไม่ระบุชื่อ'}</dd></div>
        <div><dt className="text-xs text-slate-500">เบอร์โทรศัพท์</dt><dd className="mt-1 text-slate-800">{order.contact_phone||order.profiles?.phone||'-'}</dd></div>
        <div><dt className="text-xs text-slate-500">วิธีรับผัก</dt><dd className="mt-1 text-slate-800">{order.fulfillment_method==='pickup'?'รับที่ฟาร์ม':'จัดส่ง'}{order.fulfillment_method==='delivery'&&order.delivery_address&&<p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-500">{order.delivery_address}</p>}</dd></div>
        <div><dt className="text-xs text-slate-500">วิธีชำระเงิน</dt><dd className="mt-1 text-slate-800">{order.payment_method==='transfer'?'โอนเงิน':order.payment_method==='cash'?'เงินสด':'ยังไม่บันทึก'}</dd></div>
        {order.completed_at&&<div><dt className="text-xs text-slate-500">ส่งสำเร็จเมื่อ</dt><dd className="mt-1 text-slate-800">{formatDateTimeDMY(order.completed_at)}</dd></div>}
        {order.paid_at&&<div><dt className="text-xs text-slate-500">ชำระเมื่อ</dt><dd className="mt-1 text-slate-800">{formatDateTimeDMY(order.paid_at)}</dd></div>}
      </dl>
      <OrderDiscountSummary order={order} expanded/>
      {order.note&&<section className="rounded-xl border border-slate-200 bg-white p-4 text-sm"><h3 className="font-bold text-slate-700">หมายเหตุ</h3><p className="mt-1 whitespace-pre-wrap break-words text-slate-600">{order.note}</p></section>}
      {order.status==='cancelled'&&order.cancel_reason&&<p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">เหตุผลที่ยกเลิก: {order.cancel_reason}</p>}
      <button type="button" onClick={close} className="w-full rounded-xl bg-emerald-800 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-900">กลับไปหน้ารายการ</button>
    </div>
  </dialog>;
};
