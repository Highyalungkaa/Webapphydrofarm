import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, CheckCircle2, History, MapPin, Search, Truck, X } from 'lucide-react';
import { EquipmentPaymentBadge, EquipmentPaymentSlip } from '../../components/common/EquipmentPaymentSlip.js';
import { api } from '../../lib/api.js';
import { isEquipmentOrderInHistory } from '../../lib/equipmentOrderHistory.js';
import type { EquipmentOrder } from '../../types/index.js';

const money = (amount: number) => `฿${Number(amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const bangkokDate = (value: string) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(value));

export const AdminEquipmentOrderHistoryPage: React.FC = () => {
  const [orders, setOrders] = useState<EquipmentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    api.get<EquipmentOrder[]>('/equipment/admin/orders')
      .then((allOrders) => setOrders(allOrders.filter(isEquipmentOrderInHistory)))
      .catch((err: any) => setError(err.message || 'โหลดประวัติการสั่งซื้อไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => orders.filter((order) => {
    const orderedDate = bangkokDate(order.created_at);
    const searchable = `${order.id} ${order.profiles?.full_name || ''} ${order.profiles?.email || ''} ${order.contact_phone}`.toLowerCase();
    return (!dateFrom || orderedDate >= dateFrom)
      && (!dateTo || orderedDate <= dateTo)
      && searchable.includes(query.trim().toLowerCase());
  }), [orders, query, dateFrom, dateTo]);
  const selectedOrder = orders.find((order) => order.id === selectedId);

  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-black uppercase tracking-[.18em] text-emerald-700">HydroFarm Supply</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-black text-slate-950"><History className="h-6 w-6 text-emerald-700" />ประวัติการสั่งซื้ออุปกรณ์</h1>
        <p className="mt-1 text-sm text-slate-500">คำสั่งซื้อที่ชำระเงินแล้วและดำเนินการสำเร็จ</p>
      </div>
      <span className="rounded-2xl bg-emerald-100 px-4 py-3 text-sm font-extrabold text-emerald-900">ทั้งหมด {orders.length} ออเดอร์</span>
    </header>

    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}

    {selectedOrder ? <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 p-5">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setSelectedId(null)} aria-label="กลับไปหน้าประวัติ" className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100"><ArrowLeft className="h-4 w-4" /></button>
          <div><p className="text-xs text-slate-500">ออเดอร์ #{selectedOrder.id.slice(0, 8)} · {new Date(selectedOrder.created_at).toLocaleString('th-TH')}</p><h2 className="font-black text-slate-900">{selectedOrder.profiles?.full_name || selectedOrder.profiles?.email || 'ลูกค้า'}</h2></div>
        </div>
        <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">สำเร็จ</span><EquipmentPaymentBadge order={selectedOrder} /></div>
      </div>
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.1fr_.9fr]">
        <div className="space-y-5">
          <section><h3 className="mb-3 font-black text-slate-900">รายการสินค้า</h3><div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 px-4">{(selectedOrder.equipment_order_items || []).map((item) => <div key={item.id} className="flex justify-between gap-3 py-3 text-sm"><div><p className="font-extrabold text-slate-900">{item.product_name}</p><p className="text-xs text-slate-500">{item.sku} · {money(item.unit_price)} × {item.quantity}</p></div><strong>{money(item.unit_price * item.quantity)}</strong></div>)}</div><div className="mt-3 space-y-1 text-sm"><div className="flex justify-between"><span>ค่าจัดส่ง</span><span>{money(Number(selectedOrder.shipping_fee || 0))}</span></div><div className="flex justify-between border-t border-slate-200 pt-2 font-black"><span>ยอดรวมสุทธิ</span><span>{money(selectedOrder.total_amount)}</span></div></div></section>
          <EquipmentPaymentSlip order={selectedOrder} admin />
        </div>
        <section className="h-fit space-y-2 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700"><h3 className="font-black text-slate-900">ข้อมูลจัดส่ง</h3><p><MapPin className="mr-1 inline h-4 w-4 text-emerald-700" />{selectedOrder.shipping_address}</p><p><Truck className="mr-1 inline h-4 w-4 text-emerald-700" />{selectedOrder.contact_phone}</p><p>ชำระ: {selectedOrder.payment_method === 'transfer' ? 'โอนเงิน' : 'เก็บเงินปลายทาง'}</p>{selectedOrder.tracking_number && <p className="font-bold text-sky-900">เลขพัสดุ: {selectedOrder.tracking_number}</p>}{selectedOrder.note && <p>หมายเหตุ: {selectedOrder.note}</p>}{selectedOrder.delivery_update_message && <p className="whitespace-pre-wrap">แจ้งลูกค้า: {selectedOrder.delivery_update_message}</p>}{selectedOrder.delivery_update_image_url && <img src={selectedOrder.delivery_update_image_url} alt="ภาพอัปเดตการจัดส่ง" className="max-h-72 w-full rounded-xl object-contain" />}</section>
      </div>
    </article> : <>
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"><label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาเลขออเดอร์ ชื่อลูกค้า เบอร์โทร" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm" /></label><div className="flex flex-wrap items-end gap-2"><span className="flex items-center gap-1 text-xs font-bold text-slate-600"><CalendarDays className="h-4 w-4" />วันที่สั่งซื้อ</span><label className="text-xs text-slate-600">ตั้งแต่<input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} className="ml-2 rounded-lg border border-slate-200 p-2" /></label><label className="text-xs text-slate-600">ถึง<input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} className="ml-2 rounded-lg border border-slate-200 p-2" /></label>{(dateFrom || dateTo) && <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); }} className="flex items-center gap-1 text-xs font-bold text-slate-500"><X className="h-3.5 w-3.5" />ล้างวันที่</button>}</div><p className="text-xs text-slate-400">แสดง {filtered.length} จาก {orders.length} ออเดอร์ · วันที่อิงเขตเวลาไทย</p></div>
      {loading ? <p className="rounded-2xl bg-white p-12 text-center text-slate-500">กำลังโหลดประวัติ...</p> : filtered.length === 0 ? <p className="rounded-2xl bg-white p-12 text-center text-slate-500">{orders.length ? 'ไม่พบประวัติที่ตรงกับตัวกรอง' : 'ยังไม่มีคำสั่งซื้อที่ชำระเงินและสำเร็จแล้ว'}</p> : <div className="space-y-3">{filtered.map((order) => <article key={order.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div><div className="flex flex-wrap items-center gap-2"><strong className="text-slate-900">#{order.id.slice(0, 8)}</strong><span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" />สำเร็จ</span><EquipmentPaymentBadge order={order} /></div><p className="mt-1 text-sm font-bold text-slate-800">{order.profiles?.full_name || order.profiles?.email || 'ลูกค้า'} · {order.contact_phone}</p><p className="mt-1 text-xs text-slate-500">สั่งเมื่อ {new Date(order.created_at).toLocaleString('th-TH')} · {(order.equipment_order_items || []).reduce((sum, item) => sum + item.quantity, 0)} ชิ้น</p></div><div className="flex items-center gap-3"><strong className="text-emerald-800">{money(order.total_amount)}</strong><button type="button" onClick={() => setSelectedId(order.id)} className="rounded-xl bg-emerald-800 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-emerald-900">ดูรายละเอียด</button></div></article>)}</div>}
    </>}
  </div>;
};
