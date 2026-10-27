import {harvestRange} from '../../lib/pooledBooking.js';
import { EquipmentPaymentBadge } from '../../components/common/EquipmentPaymentSlip.js';
import { formatKg } from '../../lib/bookingQuantity.js';
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { formatDateDMY } from '../../lib/dateFormat.js';
import { EquipmentOrder, Order } from '../../types/index.js';
import { Badge } from '../../components/common/Badge.js';
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Clock3, Leaf, Package, ShoppingBag, Truck } from 'lucide-react';

const equipmentStatus: Record<string, string> = { pending_confirmation: 'รอตรวจสอบ', confirmed: 'ยืนยันแล้ว', processing: 'กำลังจัดเตรียม', shipped: 'จัดส่งแล้ว', completed: 'สำเร็จ', cancelled: 'ยกเลิก' };
const equipmentStatusColors: Record<string, string> = { pending_confirmation: 'bg-amber-50 text-amber-700 border-amber-200', confirmed: 'bg-blue-50 text-blue-700 border-blue-200', processing: 'bg-sky-50 text-sky-700 border-sky-200', shipped: 'bg-purple-50 text-purple-700 border-purple-200', completed: 'bg-green-100 text-green-800 border-green-300', cancelled: 'bg-rose-50 text-rose-700 border-rose-200' };
const money = (n: number) => `฿${Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;
type HistoryFilter = 'all' | 'vegetables' | 'equipment';

export const OrdersPage: React.FC = () => {
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [orders, setOrders] = useState<Order[]>([]);
  const [equipmentOrders, setEquipmentOrders] = useState<EquipmentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [params] = useSearchParams();
  const newEquipmentOrder = params.get('order');

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const [vegetableResult, equipmentResult] = await Promise.allSettled([
          api.get<Order[]>('/orders/mine'), api.get<EquipmentOrder[]>('/equipment/orders/mine'),
        ]);
        if (vegetableResult.status === 'fulfilled') setOrders(vegetableResult.value);
        else setError(vegetableResult.reason?.message || 'โหลดประวัติการจองผักไม่สำเร็จ');
        if (equipmentResult.status === 'fulfilled') setEquipmentOrders(equipmentResult.value);
        else setError((current) => current ? `${current} · ${equipmentResult.reason?.message || 'โหลดประวัติอุปกรณ์ไม่สำเร็จ'}` : (equipmentResult.reason?.message || 'โหลดประวัติอุปกรณ์ไม่สำเร็จ'));
      } finally { setLoading(false); }
    };
    void fetchOrders();
  }, []);

  const activeCount = orders.filter((order) => !['completed','cancelled','no_show'].includes(order.status)).length
    + equipmentOrders.filter((order) => !['completed','cancelled'].includes(order.status)).length;

  return <div className="space-y-7 pb-8">
    <header className="relative overflow-hidden rounded-[2rem] bg-[#103e31] p-6 text-white shadow-[0_20px_60px_-30px_rgba(12,69,48,.65)] sm:rounded-[2.5rem] sm:p-9"><div className="pointer-events-none absolute -right-16 -top-28 h-80 w-80 rounded-full border-[45px] border-lime-300/10" /><div className="relative"><span className="inline-flex items-center gap-2 rounded-full border border-lime-300/30 bg-lime-300/10 px-3 py-1.5 text-[11px] font-bold text-lime-200"><Clock3 className="h-3.5 w-3.5" />ติดตามคำสั่งซื้อของคุณ</span><h1 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">ประวัติการจองและซื้อ</h1><p className="mt-3 max-w-xl text-sm leading-7 text-emerald-50/80">ดูสถานะล่าสุด วันส่งมอบ และรายละเอียดของผักหรืออุปกรณ์ที่สั่งไว้ได้ในที่เดียว</p><div className="mt-6 flex flex-wrap gap-3"><div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3"><p className="text-[10px] text-emerald-100/70">คำสั่งซื้อทั้งหมด</p><p className="text-xl font-black">{loading ? '—' : orders.length + equipmentOrders.length}</p></div><div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3"><p className="text-[10px] text-emerald-100/70">กำลังดำเนินการ</p><p className="text-xl font-black text-lime-300">{loading ? '—' : activeCount}</p></div></div></div></header>

    {newEquipmentOrder && <div className="flex gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950"><CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-700" /><div><p className="font-black">ได้รับคำสั่งซื้ออุปกรณ์ของคุณแล้ว</p><p className="mt-0.5 text-sm">เลขที่ #{newEquipmentOrder.slice(0,8)} · ผู้ดูแลจะตรวจสอบและอัปเดตสถานะให้ที่หน้านี้</p></div></div>}
    {error && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</div>}

    <div className="flex flex-wrap gap-2 rounded-2xl border border-emerald-100 bg-white p-2 shadow-sm" aria-label="ตัวกรองประวัติคำสั่งซื้อ">{([
      ['all', 'ทั้งหมด', orders.length + equipmentOrders.length],
      ['vegetables', 'จองผัก', orders.length],
      ['equipment', 'ซื้ออุปกรณ์', equipmentOrders.length],
    ] as const).map(([filter, label, count]) => <button key={filter} type="button" onClick={() => setHistoryFilter(filter)} aria-pressed={historyFilter === filter} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold transition ${historyFilter === filter ? 'bg-emerald-800 text-white shadow-sm' : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-900'}`}>{label}<span className={`rounded-full px-2 py-0.5 text-[11px] ${historyFilter === filter ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{count}</span></button>)}</div>

    {loading ? <div className="space-y-3">{[0,1].map((n) => <div key={n} className="h-44 animate-pulse rounded-3xl bg-slate-200/70" />)}</div> : <>
      {(historyFilter === 'all' || historyFilter === 'vegetables') && <section className="space-y-4"><SectionHeading icon={<Leaf className="h-5 w-5" />} title="การจองผัก" description="รอบปลูกและการส่งมอบจากฟาร์ม" count={orders.length} />{orders.length === 0 ? <Empty text="ยังไม่มีรายการจองผัก" link="/" linkText="ดูรอบเปิดจอง" /> : <div className="space-y-3">{orders.map((order) => {
        const totalKg = (order.order_items || []).reduce((sum, item) => sum + Number(item.qty_kg), 0);
        return <article key={order.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-900/5"><div className="flex"><div className="w-1.5 shrink-0 bg-gradient-to-b from-lime-400 to-emerald-700" /><div className="min-w-0 flex-1 p-5 sm:p-6">
          {order.needs_customer_notice && order.status !== 'cancelled' && <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><AlertTriangle className="h-4 w-4 shrink-0" />รอบนี้มีการปรับเปลี่ยนวันส่งมอบ คุณสามารถกดยกเลิกได้</div>}
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-[11px] font-extrabold uppercase tracking-wide text-emerald-700">จองผัก · #{order.id.slice(0,8)}</p><h3 className="mt-1 text-lg font-black text-slate-950">{order.is_pooled?'คำสั่งจองผัก':order.planting_rounds?.name || 'รอบการปลูก'}</h3><p className="mt-1 text-xs text-slate-500">สั่งจองเมื่อ {formatDateDMY(order.created_at)}</p></div><div className="flex flex-wrap gap-1.5"><Badge status={order.status} type="order" />{(order.status !== 'cancelled' || order.payment_status !== 'unpaid') && <Badge status={order.payment_status} type="payment" />}</div></div>
          <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-3 text-xs sm:grid-cols-2 sm:p-4"><div><p className="flex items-center gap-1.5 font-bold text-slate-500"><CalendarDays className="h-3.5 w-3.5 text-emerald-700" />วันส่งมอบ</p><p className="mt-1 font-extrabold text-slate-900">{order.is_pooled?harvestRange(order.harvest_start_date,order.harvest_end_date):order.planting_rounds?.fulfillment_date ? formatDateDMY(order.planting_rounds.fulfillment_date) : '-'}</p></div><div><p className="font-bold text-slate-500">รายการที่จอง · {formatKg(totalKg)} กก.</p><p className="mt-1 line-clamp-1 font-semibold text-slate-800">{[...new Set((order.order_items || []).map((item) => item.round_items?.crops?.name || 'ผัก'))].join(', ') || '-'}</p></div></div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-[11px] text-slate-500">ยอดรวม</p><p className="text-xl font-black text-emerald-800">{money(order.total_amount)}</p></div><div className="flex items-center gap-2"><Badge status={order.fulfillment_method} type="fulfillment" /><Link to={`/orders/${order.id}`} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-emerald-900">ดูรายละเอียด <ArrowRight className="h-3.5 w-3.5" /></Link></div></div>
        </div></div></article>;
      })}</div>}</section>}

      {(historyFilter === 'all' || historyFilter === 'equipment') && <section className="space-y-4"><SectionHeading icon={<Package className="h-5 w-5" />} title="การซื้ออุปกรณ์" description="ติดตามสินค้า การชำระเงิน และการจัดส่ง" count={equipmentOrders.length} />{equipmentOrders.length === 0 ? <Empty text="ยังไม่มีรายการซื้ออุปกรณ์" link="/equipment" linkText="เลือกซื้ออุปกรณ์" /> : <div className="space-y-3">{equipmentOrders.map((order) => {
        const itemCount = (order.equipment_order_items || []).reduce((sum, item) => sum + item.quantity, 0);
        const productNames = (order.equipment_order_items || []).map((item) => item.product_name).join(', ');
        return <article key={order.id} className={`overflow-hidden rounded-3xl border bg-white shadow-sm transition hover:shadow-lg hover:shadow-emerald-900/5 ${order.id === newEquipmentOrder ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-emerald-300'}`}><div className="flex"><div className="w-1.5 shrink-0 bg-gradient-to-b from-teal-400 to-emerald-900" /><div className="min-w-0 flex-1 p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-[11px] font-extrabold uppercase tracking-wide text-teal-700">ซื้ออุปกรณ์ · #{order.id.slice(0,8)}</p><h3 className="mt-1 line-clamp-2 text-lg font-black text-slate-950">{productNames || 'รายการอุปกรณ์ปลูก'}</h3><p className="mt-1 text-xs text-slate-500">สั่งซื้อเมื่อ {formatDateDMY(order.created_at)}</p></div><div className="flex flex-wrap gap-1.5"><Badge type="custom" label={equipmentStatus[order.status]} className={equipmentStatusColors[order.status]} /><EquipmentPaymentBadge order={order} /></div></div><div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-3 text-xs sm:grid-cols-2 sm:p-4"><div><p className="flex items-center gap-1.5 font-bold text-slate-500"><ShoppingBag className="h-3.5 w-3.5 text-emerald-700" />จำนวนสินค้า</p><p className="mt-1 font-extrabold text-slate-900">{itemCount} ชิ้น</p></div><div><p className="flex items-center gap-1.5 font-bold text-slate-500"><Truck className="h-3.5 w-3.5 text-emerald-700" />วิธีรับสินค้า</p><p className="mt-1 font-extrabold text-slate-900">จัดส่งปกติ · {order.payment_method === 'transfer' ? 'โอนเงิน' : 'เก็บเงินปลายทาง'}</p></div></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-[11px] text-slate-500">ยอดรวม</p><p className="text-xl font-black text-emerald-800">{money(order.total_amount)}</p></div><Link to={`/orders/equipment/${order.id}`} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-emerald-900">ดูรายละเอียด <ArrowRight className="h-3.5 w-3.5" /></Link></div></div></div></article>;
      })}</div>}</section>}
    </>}
  </div>;
};

const SectionHeading: React.FC<{ icon: React.ReactNode; title: string; description: string; count: number }> = ({ icon, title, description, count }) => <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-800">{icon}</span><div className="min-w-0 flex-1"><h2 className="text-xl font-black text-slate-900">{title}</h2><p className="text-xs text-slate-500">{description}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-600">{count} รายการ</span></div>;
const Empty: React.FC<{ text: string; link: string; linkText: string }> = ({ text, link, linkText }) => <div className="rounded-3xl border border-dashed border-emerald-200 bg-white px-5 py-9 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><ShoppingBag className="h-6 w-6" /></span><p className="mt-3 text-sm font-bold text-slate-700">{text}</p><Link to={link} className="mt-3 inline-flex items-center gap-1.5 text-sm font-extrabold text-emerald-700 hover:underline">{linkText} <ArrowRight className="h-4 w-4" /></Link></div>;
