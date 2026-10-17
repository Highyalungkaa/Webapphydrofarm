import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { formatDateDMY } from '../../lib/dateFormat.js';
import { EquipmentOrder, Order } from '../../types/index.js';
import { Badge } from '../../components/common/Badge.js';
import { AlertTriangle, ArrowRight, Calendar, CheckCircle2, Package, ShoppingBag } from 'lucide-react';

const equipmentStatus: Record<string, string> = { pending_confirmation: 'รอตรวจสอบ', confirmed: 'ยืนยันแล้ว', processing: 'กำลังจัดเตรียม', shipped: 'จัดส่งแล้ว', completed: 'สำเร็จ', cancelled: 'ยกเลิก' };
const equipmentStatusColors: Record<string, string> = { pending_confirmation: 'bg-amber-50 text-amber-700 border-amber-200', confirmed: 'bg-blue-50 text-blue-700 border-blue-200', processing: 'bg-sky-50 text-sky-700 border-sky-200', shipped: 'bg-purple-50 text-purple-700 border-purple-200', completed: 'bg-green-100 text-green-800 border-green-300', cancelled: 'bg-rose-50 text-rose-700 border-rose-200' };
const money = (n: number) => `฿${Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;

export const OrdersPage: React.FC = () => {
  const [historyFilter, setHistoryFilter] = useState<'all' | 'vegetables' | 'equipment'>('all');
  const [orders, setOrders] = useState<Order[]>([]);
  const [equipmentOrders, setEquipmentOrders] = useState<EquipmentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [params] = useSearchParams();
  const newEquipmentOrder = params.get('order');
  useEffect(() => { void fetchOrders(); }, []);
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

  if (loading) return <div className="py-20 text-center"><div className="mb-2 inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-farm-600" /><p className="text-sm text-slate-500">กำลังโหลดประวัติคำสั่งซื้อ...</p></div>;

  return <div className="space-y-7">
    <div><h1 className="text-2xl font-black text-slate-950">ประวัติคำสั่งซื้อของฉัน</h1><p className="mt-1 text-sm text-slate-500">ประวัติการจองผักและสั่งซื้ออุปกรณ์ พร้อมติดตามสถานะ</p></div>
    <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" aria-label="ตัวกรองประวัติคำสั่งซื้อ">
      {([
        ['all', `ทั้งหมด (${orders.length + equipmentOrders.length})`],
        ['vegetables', `ประวัติการจองผัก (${orders.length})`],
        ['equipment', `ประวัติการซื้ออุปกรณ์ (${equipmentOrders.length})`],
      ] as const).map(([filter, label]) => <button key={filter} type="button" onClick={() => setHistoryFilter(filter)} aria-pressed={historyFilter === filter} className={`rounded-xl px-4 py-2.5 text-sm font-extrabold transition ${historyFilter === filter ? 'bg-emerald-800 text-white shadow-sm' : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-900'}`}>{label}</button>)}
    </div>
    {newEquipmentOrder && <div className="flex gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950"><CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-700" /><div><p className="font-black">ได้รับคำสั่งซื้ออุปกรณ์ของคุณแล้ว</p><p className="mt-0.5 text-sm">เลขที่ #{newEquipmentOrder.slice(0,8)} · ผู้ดูแลจะตรวจสอบและอัปเดตสถานะให้ที่หน้านี้</p></div></div>}
    {error && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</div>}

    {(historyFilter === 'all' || historyFilter === 'vegetables') && <section className="space-y-4"><div className="flex items-center gap-3"><span className="rounded-xl bg-lime-100 p-2.5 text-lime-800"><ShoppingBag className="h-5 w-5" /></span><div><h2 className="text-xl font-black text-slate-900">ประวัติการจองผัก</h2><p className="text-xs text-slate-500">คำสั่งจองจากรอบปลูก</p></div></div>
      {orders.length === 0 ? <Empty text="ยังไม่มีรายการจองผัก" link="/" linkText="ดูรอบเปิดจอง" /> : orders.map((order) => {
        const totalKg = (order.order_items || []).reduce((sum, item) => sum + Number(item.qty_kg), 0);
        return <article key={order.id} className="space-y-4 rounded-2xl border border-lime-200 bg-white p-5 shadow-sm">
          {order.needs_customer_notice && order.status !== 'cancelled' && <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><AlertTriangle className="h-4 w-4 shrink-0" />รอบนี้มีการปรับเปลี่ยนวันส่งมอบ คุณสามารถกดยกเลิกได้</div>}
          <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center"><div><span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">ออเดอร์ #{order.id.slice(0,8)} · วันที่สั่ง {formatDateDMY(order.created_at)}</span><h3 className="mt-0.5 font-bold text-slate-900">{order.planting_rounds?.name || 'รอบการปลูก'}</h3></div><div className="flex flex-wrap items-center gap-2"><Badge status={order.fulfillment_method} type="fulfillment" /><Badge status={order.status} type="order" /><Badge status={order.payment_status} type="payment" /></div></div>
          <div className="flex flex-col justify-between gap-4 text-sm sm:flex-row sm:items-center"><div className="space-y-1 text-slate-600"><p className="flex items-center gap-1.5 font-medium"><Calendar className="h-4 w-4 text-emerald-600" />วันส่งมอบ: {order.planting_rounds?.fulfillment_date ? formatDateDMY(order.planting_rounds.fulfillment_date) : '-'}</p><p className="text-xs text-slate-500">{(order.order_items || []).map((item) => item.round_items?.crops?.name || 'ผัก').join(', ')} · {totalKg.toFixed(1)} กก.</p></div><div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3 sm:border-0 sm:pt-0"><strong>฿{Number(order.total_amount).toLocaleString()}</strong><Link to={`/orders/${order.id}`} className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-800 hover:bg-slate-200">รายละเอียด <ArrowRight className="h-3.5 w-3.5" /></Link></div></div>
        </article>;
      })}
    </section>}

    {(historyFilter === 'all' || historyFilter === 'equipment') && <section className="space-y-4"><div className="flex items-center gap-3"><span className="rounded-xl bg-emerald-100 p-2.5 text-emerald-800"><Package className="h-5 w-5" /></span><div><h2 className="text-xl font-black text-slate-900">ประวัติการซื้ออุปกรณ์ปลูก</h2><p className="text-xs text-slate-500">แยกจากรายการจองผัก · ดูสถานะและรายละเอียดการจัดส่ง</p></div></div>
      {equipmentOrders.length === 0 ? <Empty text="ยังไม่มีรายการซื้ออุปกรณ์" link="/equipment" linkText="ไปเลือกซื้ออุปกรณ์" /> : equipmentOrders.map((order) => {
        const itemCount = (order.equipment_order_items || []).reduce((sum, item) => sum + item.quantity, 0);
        const productNames = (order.equipment_order_items || []).map((item) => item.product_name).join(', ');
        return <article key={order.id} className={`space-y-4 rounded-2xl border bg-white p-5 shadow-sm ${order.id === newEquipmentOrder ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-emerald-200'}`}>
          <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center"><div><span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">ออเดอร์อุปกรณ์ #{order.id.slice(0,8)} · วันที่สั่ง {formatDateDMY(order.created_at)}</span><h3 className="mt-0.5 font-bold text-slate-900">{productNames || 'รายการอุปกรณ์'}</h3></div><div className="flex flex-wrap items-center gap-2"><Badge type="custom" label="จัดส่งปกติ" className="bg-purple-50 text-purple-700 border-purple-200" /><Badge type="custom" label={equipmentStatus[order.status]} className={equipmentStatusColors[order.status]} /><Badge status={order.payment_status} type="payment" /></div></div>
          <div className="flex flex-col justify-between gap-4 text-sm sm:flex-row sm:items-center"><div className="space-y-1 text-slate-600"><p className="flex items-center gap-1.5 font-medium"><Calendar className="h-4 w-4 text-emerald-600" />จำนวนสินค้า: {itemCount} ชิ้น · เก็บเงินปลายทาง</p><p className="text-xs text-slate-500">{productNames || 'อุปกรณ์ปลูก'}</p></div><div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3 sm:border-0 sm:pt-0"><strong>{money(order.total_amount)}</strong><Link to={`/orders/equipment/${order.id}`} className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-800 hover:bg-slate-200">รายละเอียด <ArrowRight className="h-3.5 w-3.5" /></Link></div></div>
        </article>;
      })}
    </section>}
  </div>;
};

const Empty: React.FC<{ text: string; link: string; linkText: string }> = ({ text, link, linkText }) => <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center"><p className="text-sm font-bold text-slate-600">{text}</p><Link to={link} className="mt-3 text-sm font-extrabold text-emerald-700 hover:underline">{linkText} <ArrowRight className="inline h-4 w-4" /></Link></div>;
