import React from 'react';
import type {Order} from '../../types/index.js';
import {formatDateTimeDMY} from '../../lib/dateFormat.js';

export const OrderDeadlineNotice:React.FC<{order:Order}>=({order})=>{
  if(order.confirmation_expired_at)return <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">ยกเลิกอัตโนมัติเนื่องจากหมดเวลารอยืนยัน {formatDateTimeDMY(order.confirmation_expired_at)}</p>;
  if(order.status!=='pending_confirmation'||!order.confirmation_expires_at)return null;
  const past=new Date(order.confirmation_expires_at).getTime()<=Date.now();
  const protectedOrder=order.payment_status==='paid'||order.order_items?.some(i=>i.own_qty_kg!=null||Number(i.fulfilled_qty_kg)>0);
  return <p className={`rounded-lg px-3 py-2 text-xs leading-5 ${past?'bg-rose-50 font-bold text-rose-800':'bg-amber-50 text-amber-900'}`}>{past&&protectedOrder?'เกินเวลารอยืนยัน กรุณาตรวจสอบออเดอร์ที่รับเงินหรือเริ่มจัดผักแล้ว':'กำหนดยืนยันออเดอร์: '+formatDateTimeDMY(order.confirmation_expires_at)}</p>;
};
