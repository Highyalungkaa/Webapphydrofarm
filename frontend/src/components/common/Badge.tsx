import React from 'react';
import { OrderStatus, RoundStatus, PaymentStatus, FulfillmentMethod } from '../../types/index.js';

interface BadgeProps {
  status?: OrderStatus | RoundStatus | PaymentStatus | FulfillmentMethod | string;
  type?: 'order' | 'round' | 'payment' | 'fulfillment' | 'custom';
  label?: string;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ status, type = 'custom', label, className = '' }) => {
  let text = label || status || '';
  let colorClasses = 'bg-slate-100 text-slate-700 border-slate-200';

  if (type === 'order' || (!label && ['pending_confirmation', 'confirmed', 'ready', 'completed', 'cancelled', 'no_show'].includes(status as string))) {
    switch (status) {
      case 'pending_confirmation':
        text = 'รอยืนยัน (ออเดอร์ใหญ่)';
        colorClasses = 'bg-amber-50 text-amber-700 border-amber-200';
        break;
      case 'confirmed':
        text = 'ยืนยันแล้ว';
        colorClasses = 'bg-blue-50 text-blue-700 border-blue-200';
        break;
      case 'ready':
        text = 'พร้อมรับ/ส่ง';
        colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        break;
      case 'completed':
        text = 'สำเร็จแล้ว';
        colorClasses = 'bg-green-100 text-green-800 border-green-300';
        break;
      case 'cancelled':
        text = 'ยกเลิกแล้ว';
        colorClasses = 'bg-rose-50 text-rose-700 border-rose-200';
        break;
      case 'no_show':
        text = 'ไม่มารับของ';
        colorClasses = 'bg-red-100 text-red-800 border-red-300';
        break;
    }
  } else if (type === 'round' || ['draft', 'growing', 'booking_open', 'booking_closed', 'harvested', 'completed', 'cancelled'].includes(status as string)) {
    switch (status) {
      case 'draft':
        text = 'ร่าง';
        colorClasses = 'bg-slate-100 text-slate-700 border-slate-200';
        break;
      case 'growing':
        text = 'กำลังปลูก';
        colorClasses = 'bg-sky-50 text-sky-700 border-sky-200';
        break;
      case 'booking_open':
        text = 'เปิดให้จอง';
        colorClasses = 'bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold';
        break;
      case 'booking_closed':
        text = 'ปิดรับจองแล้ว';
        colorClasses = 'bg-amber-50 text-amber-700 border-amber-200';
        break;
      case 'harvested':
        text = 'เก็บเกี่ยวแล้ว';
        colorClasses = 'bg-teal-50 text-teal-700 border-teal-200';
        break;
      case 'completed':
        text = 'ส่งมอบครบถ้วน';
        colorClasses = 'bg-slate-100 text-slate-700 border-slate-200';
        break;
      case 'cancelled':
        text = 'ยกเลิกรอบ';
        colorClasses = 'bg-rose-50 text-rose-700 border-rose-200';
        break;
    }
  } else if (type === 'payment' || ['unpaid', 'paid'].includes(status as string)) {
    switch (status) {
      case 'unpaid':
        text = 'รอชำระเงิน';
        colorClasses = 'bg-orange-50 text-orange-700 border-orange-200';
        break;
      case 'paid':
        text = 'ชำระเงินแล้ว';
        colorClasses = 'bg-emerald-100 text-emerald-800 border-emerald-300 font-medium';
        break;
    }
  } else if (type === 'fulfillment' || ['pickup', 'delivery'].includes(status as string)) {
    switch (status) {
      case 'pickup':
        text = 'รับเองที่ฟาร์ม';
        colorClasses = 'bg-indigo-50 text-indigo-700 border-indigo-200';
        break;
      case 'delivery':
        text = 'จัดส่งปกติ';
        colorClasses = 'bg-purple-50 text-purple-700 border-purple-200';
        break;
    }
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs border font-medium whitespace-nowrap ${colorClasses} ${className}`}
    >
      {text}
    </span>
  );
};
