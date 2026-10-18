import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, PackageCheck, Truck } from 'lucide-react';
import { api } from '../../lib/api.js';
import { formatDateDMY } from '../../lib/dateFormat.js';
import { EquipmentOrder } from '../../types/index.js';
import { Badge } from '../../components/common/Badge.js';
import { CustomerPageHeader } from '../../components/common/CustomerPageHeader.js';

const money = (amount: number) => `฿${Number(amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const statusNames: Record<string, string> = { pending_confirmation: 'รอตรวจสอบ', confirmed: 'ยืนยันแล้ว', processing: 'กำลังจัดเตรียม', shipped: 'จัดส่งแล้ว', completed: 'สำเร็จ', cancelled: 'ยกเลิก' };

export const EquipmentOrderDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<EquipmentOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    api.get<EquipmentOrder>(`/equipment/orders/mine/${id}`)
      .then(setOrder)
      .catch((err: any) => setError(err.message || 'โหลดรายละเอียดออเดอร์ไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="py-20 text-center text-sm text-slate-500">กำลังโหลดรายละเอียดออเดอร์...</div>;
  if (error || !order) return <div className="mx-auto max-w-xl space-y-4 p-8 text-center"><p className="rounded-xl bg-rose-50 p-4 text-sm font-bold text-rose-700">{error || 'ไม่พบออเดอร์นี้'}</p><Link to="/orders" className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700"><ArrowLeft className="h-4 w-4" />กลับสู่ประวัติการสั่งซื้อ</Link></div>;

  return <div className="mx-auto max-w-3xl space-y-5 font-sans">
    <Link to="/orders" className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700"><ArrowLeft className="h-4 w-4" />กลับสู่ประวัติการสั่งซื้อ</Link>
    <CustomerPageHeader eyebrow={`ออเดอร์อุปกรณ์ #${order.id.slice(0, 8)}`} title="รายละเอียดคำสั่งซื้ออุปกรณ์" description="ดูรายการสินค้า การชำระเงิน และความคืบหน้าการจัดส่ง" icon={<PackageCheck className="h-7 w-7" />}>
      <div className="flex flex-wrap gap-2"><span className={`rounded-full px-3 py-1 text-xs font-extrabold ${order.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : order.status === 'cancelled' ? 'bg-rose-100 text-rose-800' : order.status === 'shipped' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-900'}`}>{statusNames[order.status]}</span><Badge status={order.payment_status} type="payment" /></div>
    </CustomerPageHeader>
    <article className="overflow-hidden rounded-[1.75rem] border border-emerald-100 bg-white shadow-sm">
      <header className="border-b border-emerald-100 bg-emerald-50/60 p-5 sm:p-6"><span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">สรุปคำสั่งซื้อ</span><h2 className="mt-1 text-xl font-black text-slate-950">รายการอุปกรณ์ของคุณ</h2><p className="mt-1 text-xs text-slate-500">สั่งเมื่อ {formatDateDMY(order.created_at)}</p></header>
      <div className="space-y-6 p-5 sm:p-6">
        <section><h2 className="mb-3 text-xs font-black uppercase tracking-wider text-slate-400">รายการสินค้า</h2><div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 px-4">{(order.equipment_order_items || []).map((item) => <div key={item.id} className="flex justify-between gap-3 py-3"><div><h3 className="font-extrabold text-slate-900">{item.product_name}</h3><p className="mt-1 text-xs text-slate-500">{money(Number(item.unit_price))} × {item.quantity}</p></div><strong className="shrink-0 text-sm text-slate-800">{money(Number(item.unit_price) * item.quantity)}</strong></div>)}</div><div className="mt-3 space-y-1 px-1 text-sm"><div className="flex justify-between text-slate-600"><span>ค่าจัดส่ง</span><span>{money(Number(order.shipping_fee || 0))}</span></div><div className="flex justify-between border-t border-slate-100 pt-2 font-black text-slate-950"><span>ยอดรวมสุทธิ</span><span>{money(order.total_amount)}</span></div></div></section>
        <section className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700"><h2 className="mb-2 font-black text-slate-900">ข้อมูลจัดส่ง</h2><p><MapPin className="mr-1 inline h-4 w-4 text-emerald-700" />{order.shipping_address}</p><p className="mt-1"><Truck className="mr-1 inline h-4 w-4 text-emerald-700" />จัดส่งปกติ · {order.contact_phone}</p><p className="mt-1">ชำระ: {order.payment_method === 'transfer' ? 'โอนเงิน (ออเดอร์เดิม)' : 'เก็บเงินปลายทาง'}</p>{order.tracking_number ? <p className="mt-3 flex items-center gap-2 rounded-xl bg-sky-100 px-3 py-2 font-extrabold text-sky-950"><PackageCheck className="h-4 w-4" />เลขพัสดุ: {order.tracking_number}</p> : order.status !== 'cancelled' && <p className="mt-2 text-xs text-slate-500">เลขพัสดุจะแสดงเมื่อร้านจัดส่งสินค้าแล้ว</p>}{order.note && <p className="mt-2 text-xs text-slate-600">หมายเหตุถึงร้าน: {order.note}</p>}</section>
        {(order.delivery_update_message || order.delivery_update_image_url) && <section className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 sm:p-5"><h2 className="font-black text-sky-950">อัปเดตการจัดส่งจากร้าน</h2>{order.delivery_update_message && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{order.delivery_update_message}</p>}{order.delivery_update_image_url && <img src={order.delivery_update_image_url} alt="รูปยืนยันการส่งมอบสินค้าให้ขนส่ง" className="mt-4 max-h-[32rem] w-full rounded-xl border border-sky-100 bg-white object-contain p-2" />}</section>}
      </div>
    </article>
  </div>;
};
