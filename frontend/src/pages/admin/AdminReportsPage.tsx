import {scopeOrderToRound} from '../../lib/pooledBooking.js';
import { orderCustomerKey } from '../../lib/orderCustomer.js';
import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatDateDMY } from '../../lib/dateFormat.js';
import { Order, PlantingRound } from '../../types/index.js';
import {
  BarChart3,
  Users,
  ShoppingBag,
  Leaf,
  PackageCheck,
  RefreshCw,
  TrendingUp,
  Medal,
  Repeat2,
  Download,
} from 'lucide-react';

type CropReport = { name: string; bookedKg: number; soldKg: number };
type SubstituteReport = { name: string; qtyKg: number; totalCost: number };
type CustomerReport = { id: string; name: string; phone: string; orderCount: number; bookedKg: number };

const numberFormat = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 });
const kg = (value: number) => `${numberFormat.format(value)} กก.`;

export const AdminReportsPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [rounds, setRounds] = useState<PlantingRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [selectedRoundId, setSelectedRoundId] = useState('');
  const [exporting, setExporting] = useState(false);

  const loadAllOrders = async (): Promise<Order[]> => {
    const pageSize = 500;
    const all: Order[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const page = await api.get<Order[]>(`/admin/orders?offset=${offset}&limit=${pageSize}`);
      all.push(...page);
      if (page.length < pageSize) return all;
    }
  };

  const loadReport = async () => {
    try {
      setLoading(true);
      setError('');
      const [orderData, roundData] = await Promise.all([
        loadAllOrders(),
        api.get<PlantingRound[]>('/admin/rounds'),
      ]);
      setOrders(orderData || []);
      setRounds(roundData || []);
      setUpdatedAt(new Date());
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถโหลดรายงานได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadReport(); }, []);

  const report = useMemo(() => {
    const scopedOrders = selectedRoundId ? orders.map(order=>scopeOrderToRound(order,selectedRoundId)).filter((order):order is Order=>order!==null) : orders;
    const scopedRounds = selectedRoundId ? rounds.filter((round) => round.id === selectedRoundId) : rounds;
    const countableOrders = scopedOrders.filter((order) => order.status !== 'cancelled');
    const soldOrders = scopedOrders.filter((order) => order.status === 'completed');
    const cropMap = new Map<string, CropReport>();
    const customerMap = new Map<string, CustomerReport>();
    const substituteMap = new Map<string, SubstituteReport>();
    let substituteKg = 0;
    let substituteCost = 0;

    for (const order of countableOrders) {
      const customerId = orderCustomerKey(order);
      const customer = customerMap.get(customerId) || {
        id: customerId,
        name: (order.customer_name || order.profiles?.full_name) || 'ไม่ระบุชื่อ',
        phone: order.contact_phone || order.profiles?.phone || '-',
        orderCount: 0,
        bookedKg: 0,
      };
      customer.orderCount += 1;

      for (const item of order.order_items || []) {
        const name = item.round_items?.crops?.name || 'ไม่ระบุชนิดผัก';
        const row = cropMap.get(name) || { name, bookedKg: 0, soldKg: 0 };
        row.bookedKg += Number(item.qty_kg || 0);
        customer.bookedKg += Number(item.qty_kg || 0);
        cropMap.set(name, row);

        if (item.fulfillment_source === 'substitute') {
          const qtyKg = Number(item.fulfilled_qty_kg || 0);
          const totalCost = Number(item.substitute_total_cost ?? (qtyKg * Number(item.substitute_cost_per_kg || 0)));
          const substitute = substituteMap.get(name) || { name, qtyKg: 0, totalCost: 0 };
          substitute.qtyKg += qtyKg;
          substitute.totalCost += totalCost;
          substituteKg += qtyKg;
          substituteCost += totalCost;
          substituteMap.set(name, substitute);
        }
      }
      customerMap.set(customerId, customer);
    }

    for (const order of soldOrders) {
      for (const item of order.order_items || []) {
        const name = item.round_items?.crops?.name || 'ไม่ระบุชนิดผัก';
        const row = cropMap.get(name) || { name, bookedKg: 0, soldKg: 0 };
        row.soldKg += Number(item.qty_kg || 0);
        cropMap.set(name, row);
      }
    }

    const crops = [...cropMap.values()].sort((a, b) => b.bookedKg - a.bookedKg);
    const customers = [...customerMap.values()].sort((a, b) => b.orderCount - a.orderCount || b.bookedKg - a.bookedKg);
    const reservedKg = countableOrders.reduce((sum, order) => sum + (order.order_items || []).reduce((itemSum, item) => itemSum + Number(item.qty_kg || 0), 0), 0);
    const soldKg = soldOrders.reduce((sum, order) => sum + (order.order_items || []).reduce((itemSum, item) => itemSum + Number(item.qty_kg || 0), 0), 0);
    const openedKg = reservedKg;

    return {
      countableOrders,
      uniqueCustomers: new Set(countableOrders.map(orderCustomerKey)).size,
      reservedKg,
      soldKg,
      openedKg,
      crops,
      substituteCrops: [...substituteMap.values()].sort((a, b) => b.qtyKg - a.qtyKg),
      substituteKg,
      substituteCost,
      customers: customers.slice(0, 10),
    };
  }, [orders, rounds, selectedRoundId]);

  const sellThrough = report.openedKg > 0 ? Math.min(100, (report.soldKg / report.openedKg) * 100) : 0;

  const handleExport = async () => {
    try {
      setExporting(true);
      setError('');
      const { exportVegetableReport } = await import('../../lib/exportVegetableReport.js');
      await exportVegetableReport({ orders, rounds, selectedRoundId, exportedAt: new Date() });
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถส่งออกรายงาน Excel ได้');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 inline-flex items-center gap-2 text-xs font-bold text-emerald-700"><BarChart3 className="h-4 w-4" /> รายงานภาพรวมฟาร์ม</div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">รายงาน</h1>
          <p className="mt-1 text-xs text-slate-500">สรุปคำสั่งจอง ลูกค้า ผลผลิตที่เปิดจอง และยอดขายสำเร็จ</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <span className="hidden sm:inline">รอบปลูก</span>
            <select value={selectedRoundId} onChange={(e) => setSelectedRoundId(e.target.value)} className="max-w-52 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="">ทุกรอบ</option>
              {rounds.map((round) => <option key={round.id} value={round.id}>{round.name}</option>)}
            </select>
          </label>
          {updatedAt && <span className="text-[11px] text-slate-400">อัปเดต {formatDateDMY(updatedAt.toISOString())}</span>}
          <button type="button" onClick={() => void loadReport()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-800 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> รีเฟรช
          </button>
          <button type="button" onClick={() => void handleExport()} disabled={loading || exporting || Boolean(error && orders.length === 0)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
            <Download className="h-4 w-4" /> {exporting ? 'กำลังสร้างไฟล์...' : 'ส่งออก Excel'}
          </button>
        </div>
      </header>

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

      {loading && orders.length === 0 ? <div className="rounded-3xl border border-slate-200 bg-white p-16 text-center text-sm text-slate-500">กำลังรวบรวมข้อมูลรายงาน...</div> : <>
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="คำสั่งจอง" value={`${report.countableOrders.length}`} detail="ไม่นับออเดอร์ที่ยกเลิก" icon={ShoppingBag} tone="emerald" />
          <MetricCard label="ลูกค้าที่สั่งจอง" value={`${report.uniqueCustomers}`} detail="จำนวนลูกค้าไม่ซ้ำกัน" icon={Users} tone="blue" />
          <MetricCard label="ปริมาณที่จอง" value={kg(report.reservedKg)} detail="รวมออเดอร์ที่ไม่ถูกยกเลิก" icon={Leaf} tone="amber" />
          <MetricCard label="ขายสำเร็จแล้ว" value={kg(report.soldKg)} detail="นับจากออเดอร์สถานะสำเร็จ" icon={PackageCheck} tone="purple" />
          <MetricCard label="ผักที่ทดแทน" value={kg(report.substituteKg)} detail={`ซื้อมาแทนรวม ฿${numberFormat.format(report.substituteCost)}`} icon={Repeat2} tone="amber" />
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="font-extrabold text-slate-900">ยอดจองแยกตามชนิดผัก</h2><p className="mt-1 text-xs text-slate-500">จำนวนกิโลกรัมที่ลูกค้าสั่ง แสดงเทียบกับยอดขายสำเร็จ</p></div>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Leaf className="h-5 w-5" /></span>
            </div>
            {report.crops.length === 0 ? <EmptyReport text="ยังไม่มีข้อมูลคำสั่งจอง" /> : <>
              <div className="mt-5 flex flex-wrap gap-4 text-[11px] font-semibold text-slate-600">
                <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> ปริมาณจอง</span>
                <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-sky-500" /> ขายสำเร็จ</span>
              </div>
              <div className="mt-3 overflow-x-auto"><CropBarChart crops={report.crops} /></div>
              {report.crops.length > 8 && <p className="mt-2 text-center text-[11px] text-slate-400">แสดง 8 อันดับชนิดผักที่มียอดจองสูงสุด</p>}
            </>}
          </div>

          <div className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="font-extrabold text-slate-900">ยอดสั่งจองเทียบกับออเดอร์สำเร็จ</h2><p className="mt-1 text-xs text-slate-500">รวมกิโลกรัมที่ลูกค้าสั่ง และจำนวนตามออเดอร์ที่ส่งมอบสำเร็จ</p></div>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-emerald-700 shadow-sm"><TrendingUp className="h-5 w-5" /></span>
            </div>
            <div className="mt-5 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <SalesDonut percentage={sellThrough} soldKg={report.soldKg} openedKg={report.openedKg} />
              <div className="w-full space-y-2 sm:max-w-[190px]">
                <div className="rounded-2xl border border-slate-100 bg-white p-3.5"><p className="flex items-center gap-2 text-[11px] font-semibold text-slate-500"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-600" /> ยอดสั่งจอง</p><p className="mt-1 text-lg font-black text-slate-900">{kg(report.openedKg)}</p></div>
                <div className="rounded-2xl border border-sky-100 bg-white p-3.5"><p className="flex items-center gap-2 text-[11px] font-semibold text-slate-500"><i className="h-2.5 w-2.5 rounded-sm bg-sky-500" /> ออเดอร์สำเร็จ</p><p className="mt-1 text-lg font-black text-sky-800">{kg(report.soldKg)}</p></div>
              </div>
            </div>
            <p className="mt-4 text-center text-[11px] text-slate-500">ยอดขายนับเฉพาะคำสั่งจองที่ยืนยันสถานะสำเร็จแล้ว</p>
          </div>
        </section>

        <section className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-800"><Repeat2 className="h-5 w-5" /></span>
              <div><h2 className="font-extrabold text-slate-900">รายงานปริมาณผักที่ทดแทน</h2><p className="mt-1 text-xs text-slate-500">สรุปผักที่ซื้อจากแหล่งอื่นมาแทนผลผลิตที่ขาด พร้อมต้นทุนที่บันทึกในออเดอร์</p></div>
            </div>
            <div className="flex gap-2 self-stretch sm:self-auto">
              <div className="flex-1 rounded-2xl border border-amber-100 bg-white px-4 py-3 sm:min-w-36"><p className="text-[10px] font-semibold text-slate-500">ปริมาณทดแทนรวม</p><p className="mt-1 text-lg font-black text-amber-800">{kg(report.substituteKg)}</p></div>
              <div className="flex-1 rounded-2xl border border-amber-100 bg-white px-4 py-3 sm:min-w-36"><p className="text-[10px] font-semibold text-slate-500">ต้นทุนรวม</p><p className="mt-1 text-lg font-black text-slate-900">฿{numberFormat.format(report.substituteCost)}</p></div>
            </div>
          </div>
          {report.substituteCrops.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-amber-200 bg-white/70 py-8 text-center text-xs text-slate-500">ยังไม่มีข้อมูลผักทดแทนในคำสั่งจอง</div> : <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
            {report.substituteCrops.map((crop) => <SubstituteBar key={crop.name} crop={crop} maxQty={report.substituteCrops[0]?.qtyKg || 1} />)}
          </div>}
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
            <div><h2 className="font-extrabold text-slate-900">ลูกค้าที่สั่งจองบ่อย</h2><p className="mt-1 text-xs text-slate-500">จัดอันดับจากจำนวนออเดอร์ที่ไม่ถูกยกเลิก</p></div>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700"><Medal className="h-5 w-5" /></span>
          </div>
          {report.customers.length === 0 ? <EmptyReport text="ยังไม่มีข้อมูลลูกค้า" /> : <div className="divide-y divide-slate-100">
            {report.customers.map((customer, index) => <div key={customer.id} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 px-5 py-3.5 sm:grid-cols-[2rem_1fr_8rem_8rem] sm:px-6">
              <span className={`grid h-8 w-8 place-items-center rounded-full text-xs font-black ${index < 3 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{index + 1}</span>
              <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-800">{customer.name}</p><p className="truncate text-[11px] text-slate-500">{customer.phone}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500" style={{ width: `${Math.max(8, customer.orderCount / (report.customers[0]?.orderCount || 1) * 100)}%` }} /></div></div>
              <span className="hidden text-xs text-slate-600 sm:block">{kg(customer.bookedKg)}</span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-center text-[11px] font-extrabold text-emerald-800">{customer.orderCount} ออเดอร์</span>
            </div>)}
          </div>}
        </section>
      </>}
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: string; detail: string; icon: React.ElementType; tone: 'emerald' | 'blue' | 'amber' | 'purple' }> = ({ label, value, detail, icon: Icon, tone }) => {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    purple: 'bg-purple-50 text-purple-700',
  };
  return <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between gap-3"><span className="text-xs font-bold text-slate-500">{label}</span><span className={`grid h-9 w-9 place-items-center rounded-xl ${tones[tone]}`}><Icon className="h-4.5 w-4.5" /></span></div>
    <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">{value}</p><p className="mt-1 text-[11px] text-slate-400">{detail}</p>
  </div>;
};

const EmptyReport: React.FC<{ text: string }> = ({ text }) => <div className="py-12 text-center text-sm text-slate-400">{text}</div>;

const SubstituteBar: React.FC<{ crop: SubstituteReport; maxQty: number }> = ({ crop, maxQty }) => <div>
  <div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="font-bold text-slate-800">{crop.name}</span><span className="shrink-0 font-semibold text-slate-600">{kg(crop.qtyKg)} <span className="text-amber-700">· ฿{numberFormat.format(crop.totalCost)}</span></span></div>
  <div className="h-2.5 overflow-hidden rounded-full bg-amber-100"><div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${Math.max(2, crop.qtyKg / Math.max(1, maxQty) * 100)}%` }} /></div>
</div>;

const CropBarChart: React.FC<{ crops: CropReport[] }> = ({ crops }) => {
  const data = crops.slice(0, 8);
  const width = Math.max(760, data.length * 112 + 70);
  const height = 300;
  const left = 52;
  const right = 18;
  const top = 40;
  const bottom = 52;
  const plotHeight = height - top - bottom;
  const plotWidth = width - left - right;
  const maxValue = Math.max(1, ...data.map((crop) => Math.max(crop.bookedKg, crop.soldKg)));
  const step = Math.max(1, Math.ceil(maxValue / 4));
  const axisMax = step * 4;
  const groupWidth = plotWidth / Math.max(1, data.length);
  const barWidth = Math.min(24, groupWidth * 0.27);
  const gap = Math.max(4, barWidth * 0.22);
  const y = (value: number) => top + plotHeight - (value / axisMax) * plotHeight;

  return <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="กราฟแท่งเปรียบเทียบยอดจองและยอดขายสำเร็จของแต่ละชนิดผัก" className="min-w-[620px] w-full overflow-visible">
    {[0, 1, 2, 3, 4].map((tick) => {
      const value = step * tick;
      const yy = y(value);
      return <g key={tick}>
        <line x1={left} y1={yy} x2={width - right} y2={yy} stroke="#e2e8f0" strokeDasharray={tick === 0 ? undefined : '4 5'} />
        <text x={left - 9} y={yy + 4} textAnchor="end" fill="#94a3b8" fontSize="10">{numberFormat.format(value)}</text>
      </g>;
    })}
    {data.map((crop, index) => {
      const center = left + groupWidth * index + groupWidth / 2;
      const bookedX = center - barWidth - gap / 2;
      const soldX = center + gap / 2;
      const bookedHeight = Math.max(crop.bookedKg > 0 ? 2 : 0, crop.bookedKg / axisMax * plotHeight);
      const soldHeight = Math.max(crop.soldKg > 0 ? 2 : 0, crop.soldKg / axisMax * plotHeight);
      const bookedLabelY = y(crop.bookedKg) - 8 - (Math.abs(y(crop.bookedKg) - y(crop.soldKg)) < 16 ? 16 : 0);
      return <g key={crop.name}>
        <title>{crop.name}: จอง {kg(crop.bookedKg)}, ขายสำเร็จ {kg(crop.soldKg)}</title>
        <rect x={bookedX} y={y(crop.bookedKg)} width={barWidth} height={bookedHeight} rx="6" fill="#10b981" />
        <rect x={soldX} y={y(crop.soldKg)} width={barWidth} height={soldHeight} rx="6" fill="#0ea5e9" />
        <text x={bookedX + barWidth / 2} y={bookedLabelY} textAnchor="middle" fill="#047857" fontSize="11" fontWeight="700">{numberFormat.format(crop.bookedKg)}</text>
        <text x={soldX + barWidth / 2} y={y(crop.soldKg) - 8} textAnchor="middle" fill="#0369a1" fontSize="11" fontWeight="700">{numberFormat.format(crop.soldKg)}</text>
        <text x={center} y={height - 24} textAnchor="middle" fill="#475569" fontSize="10" fontWeight="600">{crop.name.length > 10 ? `${crop.name.slice(0, 9)}…` : crop.name}</text>
      </g>;
    })}
    <text x={left} y={12} fill="#94a3b8" fontSize="9">กิโลกรัม</text>
  </svg>;
};

const SalesDonut: React.FC<{ percentage: number; soldKg: number; openedKg: number }> = ({ percentage, soldKg, openedKg }) => {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = circumference * (Math.min(100, Math.max(0, percentage)) / 100);
  return <div className="relative h-40 w-40 shrink-0" role="img" aria-label={`ขายสำเร็จ ${kg(soldKg)} จากยอดสั่งจอง ${kg(openedKg)} คิดเป็น ${percentage.toFixed(0)} เปอร์เซ็นต์`}>
    <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
      <circle cx="70" cy="70" r={radius} fill="none" stroke="#d1fae5" strokeWidth="13" />
      <circle cx="70" cy="70" r={radius} fill="none" stroke="#059669" strokeWidth="13" strokeLinecap="round" strokeDasharray={`${progress} ${circumference}`} className="transition-all duration-700" />
      <circle cx="70" cy="70" r="38" fill="white" />
    </svg>
    <div className="absolute inset-0 flex flex-col items-center justify-center">
      <span className="text-3xl font-black tracking-tight text-emerald-800">{percentage.toFixed(0)}%</span>
      <span className="mt-0.5 text-[10px] font-semibold text-slate-500">ขายสำเร็จ</span>
    </div>
  </div>;
};
