import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import type { EquipmentOrder } from '../../types/index.js';
import { Badge } from './Badge.js';

export const EquipmentPaymentBadge: React.FC<{ order: EquipmentOrder }> = ({ order }) => (
  order.payment_method === 'transfer' && order.payment_status === 'unpaid' && order.payment_slip_path
    ? <Badge type="custom" label="รอตรวจสอบสลิป" className="bg-amber-50 text-amber-800 border-amber-200" />
    : <Badge status={order.payment_status} type="payment" />
);

export const EquipmentPaymentSlip: React.FC<{ order: EquipmentOrder; admin?: boolean }> = ({ order, admin = false }) => {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setUrl(''); setError('');
    if (order.payment_method === 'transfer' && order.payment_slip_path) {
      api.get<{ url: string }>(`/equipment/${admin ? 'admin/orders' : 'orders/mine'}/${order.id}/payment-slip`)
        .then((result) => { if (active) setUrl(result.url); })
        .catch((err: any) => { if (active) setError(err.message || 'โหลดสลิปไม่สำเร็จ'); });
    }
    return () => { active = false; };
  }, [order.id, order.payment_method, order.payment_slip_path, admin, retry]);

  if (order.payment_method !== 'transfer') return null;
  return (
    <section className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
      <h3 className="text-sm font-extrabold text-slate-900">หลักฐานการโอนเงิน</h3>
      <p className="text-xs text-slate-600">{order.payment_status === 'paid' ? 'ร้านยืนยันการชำระเงินแล้ว' : order.payment_slip_path ? (admin ? 'มีสลิปแนบแล้ว กรุณาตรวจสอบก่อนเปลี่ยนสถานะเป็นชำระแล้ว' : 'ส่งสลิปแล้ว รอร้านตรวจสอบและยืนยันการชำระเงิน') : 'ยังไม่มีสลิปแนบในออเดอร์นี้'}</p>
      {order.payment_slip_path && (error ? <div role="alert" className="text-xs text-rose-700">{error}<button type="button" onClick={() => setRetry((value) => value + 1)} className="ml-2 font-bold underline">ลองอีกครั้ง</button></div> : url ? <a href={url} target="_blank" rel="noopener noreferrer" className="block"><img src={url} alt="สลิปการโอนเงินสำหรับคำสั่งซื้ออุปกรณ์" onError={() => setError('เปิดรูปสลิปไม่สำเร็จ ลิงก์อาจหมดอายุ')} className="max-h-96 w-full rounded-xl border border-slate-200 bg-white object-contain p-2" /><span className="mt-2 block text-center text-xs font-bold text-emerald-800">เปิดดูสลิปขนาดเต็ม ↗</span></a> : <p className="text-xs text-slate-500">กำลังโหลดสลิป...</p>)}
    </section>
  );
};
