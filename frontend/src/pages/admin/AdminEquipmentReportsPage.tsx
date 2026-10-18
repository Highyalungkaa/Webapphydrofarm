import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, Clock3, Coins, Download, PackageCheck, ShoppingBag, Truck, Wallet } from 'lucide-react';
import { api } from '../../lib/api.js';
import { EquipmentOrder, EquipmentProduct } from '../../types/index.js';

interface ReportData { orders: (Pick<EquipmentOrder, 'id'|'status'|'payment_status'|'total_amount'|'shipping_fee'|'created_at'|'equipment_order_items'> & { equipment_order_items?: { product_name: string; sku: string; quantity: number; unit_price: number }[] })[]; low_stock: Pick<EquipmentProduct, 'id'|'name'|'sku'|'stock_quantity'|'low_stock_threshold'>[] }
type Period = '7'|'30'|'90'|'all';
const money = (n: number) => `฿${Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
const dateLabel = (date: Date, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => new Intl.DateTimeFormat('th-TH', { ...options, timeZone: 'Asia/Bangkok' }).format(date);
const statusLabels: Record<string, string> = { pending_confirmation: 'รอยืนยัน', confirmed: 'ยืนยันแล้ว', processing: 'กำลังเตรียม', shipped: 'จัดส่งแล้ว', completed: 'สำเร็จ', cancelled: 'ยกเลิก' };

export const AdminEquipmentReportsPage: React.FC = () => {
  const [report, setReport] = useState<ReportData | null>(null);
  const [period, setPeriod] = useState<Period>('30');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  useEffect(() => { api.get<ReportData>('/equipment/admin/reports').then(setReport).catch((err) => setError(err.message)).finally(() => setLoading(false)); }, []);
  const summary = useMemo(() => {
    const all = report?.orders || [];
    const cutoff = period === 'all' ? null : new Date(Date.now() - Number(period) * 86400000);
    const orders = all.filter((o) => !cutoff || new Date(o.created_at) >= cutoff);
    const sales = orders.filter((o) => ['shipped','completed'].includes(o.status));
    const products = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const order of sales) for (const item of order.equipment_order_items || []) {
      const row = products.get(item.sku) || { name: item.product_name, quantity: 0, revenue: 0 };
      row.quantity += Number(item.quantity); row.revenue += Number(item.quantity) * Number(item.unit_price); products.set(item.sku, row);
    }
    const daily = new Map<string, { label: string; revenue: number; orders: number }>();
    const days = period === '7' ? 7 : 14;
    for (let i = days - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; daily.set(key, { label: dateLabel(d), revenue: 0, orders: 0 }); }
    for (const order of sales) { const d = new Date(order.created_at); const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; const day = daily.get(key); if (day) { day.revenue += Number(order.total_amount); day.orders++; } }
    const counts = Object.fromEntries(Object.keys(statusLabels).map((s) => [s, orders.filter((o) => o.status === s).length]));
    return { orders, sales, products: [...products.values()].sort((a,b) => b.quantity - a.quantity), revenue: sales.reduce((sum,o) => sum + Number(o.total_amount),0), units: [...products.values()].reduce((sum,p) => sum + p.quantity,0), paid: orders.filter((o) => o.payment_status === 'paid').length, unpaid: orders.filter((o) => o.payment_status !== 'paid' && o.status !== 'cancelled').length, cancelled: counts.cancelled, counts, daily: [...daily.values()] };
  }, [report, period]);
  const maxQty = Math.max(1, ...summary.products.slice(0, 6).map((p) => p.quantity));
  const maxRevenue = Math.max(1, ...summary.daily.map((d) => d.revenue));
  const handleExport = async () => {
    try {
      setExporting(true);
      setError('');
      const [data, { exportEquipmentReport }] = await Promise.all([
        api.get<import('../../lib/exportEquipmentReport.js').EquipmentExportData>(`/equipment/admin/reports/export?period=${period}`),
        import('../../lib/exportEquipmentReport.js'),
      ]);
      await exportEquipmentReport(data, period, new Date());
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถส่งออกรายงาน Excel ได้');
    } finally {
      setExporting(false);
    }
  };
  if (loading) return <div className="p-14 text-center text-slate-500">กำลังคำนวณรายงาน...</div>;
  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[.18em] text-emerald-700">HydroFarm Supply</p><h1 className="mt-1 text-2xl font-black text-slate-950">รายงานสินค้าอุปกรณ์</h1><p className="mt-1 text-sm text-slate-500">ภาพรวมยอดขาย คำสั่งซื้อ การชำระเงิน และสต็อก</p></div><div className="flex flex-wrap items-center gap-2 sm:justify-end"><div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">{([['7','7 วัน'],['30','30 วัน'],['90','90 วัน'],['all','ทั้งหมด']] as [Period,string][]).map(([key,label]) => <button key={key} type="button" onClick={() => setPeriod(key)} className={`rounded-lg px-3 py-2 text-xs font-bold transition ${period===key?'bg-emerald-700 text-white shadow':'text-slate-600 hover:bg-slate-100'}`}>{label}</button>)}</div><button type="button" onClick={() => void handleExport()} disabled={exporting} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-xs font-extrabold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-4 w-4" />{exporting ? 'กำลังสร้างไฟล์...' : 'ส่งออก Excel'}</button></div></div>
    {error && <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={<Coins />} label="ยอดขายสำเร็จ" value={money(summary.revenue)} detail="ออเดอร์จัดส่งแล้วหรือสำเร็จ" color="emerald" /><Metric icon={<ShoppingBag />} label="ออเดอร์ทั้งหมด" value={`${summary.orders.length} รายการ`} detail={`ยกเลิก ${summary.cancelled} รายการ`} color="sky" /><Metric icon={<PackageCheck />} label="สินค้าที่ขายได้" value={`${summary.units} ชิ้น`} detail="นับเฉพาะรายการจัดส่งแล้ว/สำเร็จ" color="violet" /><Metric icon={<AlertTriangle />} label="สินค้าใกล้หมด" value={`${report?.low_stock.length || 0} รายการ`} detail="ต่ำกว่าระดับแจ้งเตือน" color="amber" /></div>
    <div className="grid gap-3 sm:grid-cols-3"><MiniMetric icon={<Clock3 />} title="รอยืนยันออเดอร์" value={`${summary.counts.pending_confirmation || 0}`} hint="ต้องตรวจสอบ" /><MiniMetric icon={<Wallet />} title="ยังไม่ชำระ" value={`${summary.unpaid}`} hint="รวมออเดอร์ที่ยังดำเนินการ" /><MiniMetric icon={<CheckCircle2 />} title="ชำระแล้ว" value={`${summary.paid}`} hint="ออเดอร์ในช่วงเวลาที่เลือก" /></div>
    <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]"><section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-center gap-3"><span className="rounded-xl bg-emerald-100 p-2.5 text-emerald-800"><BarChart3 className="h-5 w-5" /></span><div><h2 className="font-black text-slate-900">แนวโน้มยอดขาย</h2><p className="text-xs text-slate-500">{period==='7'?'รายวันย้อนหลัง 7 วัน':'รายวันย้อนหลัง 14 วัน'} · เฉพาะออเดอร์จัดส่งแล้ว/สำเร็จ</p></div></div><div className="flex h-52 items-end gap-2 border-b border-slate-100 pb-2">{summary.daily.map((day,i) => <div key={`${day.label}-${i}`} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2"><div title={`${day.label}: ${money(day.revenue)} · ${day.orders} ออเดอร์`} className="w-full max-w-8 rounded-t-md bg-gradient-to-t from-emerald-700 to-lime-400 transition hover:opacity-80" style={{height:`${day.revenue?Math.max(8,day.revenue/maxRevenue*100):3}%`}} /><span className="truncate text-[9px] text-slate-400">{day.label}</span></div>)}</div><div className="mt-3 flex justify-between text-xs text-slate-500"><span>ยอดขายในช่วงที่เลือก</span><strong className="text-slate-900">{money(summary.revenue)}</strong></div></section>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-center gap-3"><span className="rounded-xl bg-sky-100 p-2.5 text-sky-800"><Truck className="h-5 w-5" /></span><div><h2 className="font-black text-slate-900">สถานะคำสั่งซื้อ</h2><p className="text-xs text-slate-500">จำนวนออเดอร์ในช่วงเวลาที่เลือก</p></div></div><div className="space-y-3">{Object.entries(statusLabels).map(([key,label]) => { const value=Number(summary.counts[key]||0); const width=summary.orders.length?value/summary.orders.length*100:0; return <div key={key}><div className="mb-1 flex justify-between text-xs"><span className="font-semibold text-slate-600">{label}</span><strong className="text-slate-900">{value}</strong></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${key==='cancelled'?'bg-rose-400':key==='completed'?'bg-emerald-600':key==='pending_confirmation'?'bg-amber-400':'bg-sky-500'}`} style={{width:`${width}%`}} /></div></div>})}</div></section></div>
    <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]"><section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-center gap-3"><span className="rounded-xl bg-emerald-100 p-2.5 text-emerald-800"><BarChart3 className="h-5 w-5" /></span><div><h2 className="font-black text-slate-900">สินค้าขายดี</h2><p className="text-xs text-slate-500">เรียงตามจำนวนชิ้นที่ขายได้จริง</p></div></div>{summary.products.length===0?<p className="py-10 text-center text-sm text-slate-500">ยังไม่มีข้อมูลการขาย</p>:<div className="space-y-4">{summary.products.slice(0,6).map((product,i)=><div key={product.name}><div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="truncate font-bold text-slate-800"><span className="mr-2 text-xs text-slate-400">{String(i+1).padStart(2,'0')}</span>{product.name}</span><span className="shrink-0 font-black text-slate-900">{product.quantity} ชิ้น</span></div><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-lime-400" style={{width:`${Math.max(4,product.quantity/maxQty*100)}%`}} /></div><p className="mt-1 text-right text-[11px] text-slate-400">ยอดรายการ {money(product.revenue)}</p></div>)}</div>}</section>
      <section className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm sm:p-6"><div className="mb-4 flex items-center gap-3"><span className="rounded-xl bg-amber-200 p-2.5 text-amber-900"><AlertTriangle className="h-5 w-5" /></span><div><h2 className="font-black text-slate-900">ควรเติมสต็อก</h2><p className="text-xs text-slate-600">สินค้าถึงหรือต่ำกว่าจุดแจ้งเตือน</p></div></div>{(report?.low_stock||[]).length===0?<p className="rounded-xl bg-white/80 p-4 text-sm font-semibold text-emerald-800">สินค้าทุกชนิดมีสต็อกเพียงพอ</p>:<div className="space-y-2">{report!.low_stock.map((product)=><div key={product.id} className="flex items-center justify-between gap-2 rounded-xl border border-amber-100 bg-white/80 p-3"><div className="min-w-0"><p className="truncate text-sm font-extrabold text-slate-900">{product.name}</p><p className="text-[11px] text-slate-500">{product.sku} · แจ้งเตือนที่ {product.low_stock_threshold}</p></div><span className="shrink-0 text-lg font-black text-amber-800">{product.stock_quantity}</span></div>)}</div>}</section></div>
  </div>;
};

const Metric: React.FC<{ icon: React.ReactNode; label: string; value: string; detail: string; color: 'emerald'|'sky'|'violet'|'amber' }> = ({ icon,label,value,detail,color }) => <article className={`rounded-2xl border p-4 ${color==='emerald'?'border-emerald-200 bg-emerald-50/70':color==='sky'?'border-sky-200 bg-sky-50/70':color==='violet'?'border-violet-200 bg-violet-50/70':'border-amber-200 bg-amber-50/70'}`}><div className="flex items-center justify-between"><span className="text-xs font-extrabold text-slate-600">{label}</span><span className="text-emerald-800">{icon}</span></div><p className="mt-3 text-2xl font-black text-slate-950">{value}</p><p className="mt-1 text-[11px] text-slate-500">{detail}</p></article>;
const MiniMetric: React.FC<{icon:React.ReactNode;title:string;value:string;hint:string}> = ({icon,title,value,hint}) => <article className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className="rounded-xl bg-slate-100 p-2.5 text-slate-700">{icon}</span><div className="min-w-0"><p className="text-xs font-bold text-slate-500">{title}</p><p className="text-xl font-black text-slate-950">{value}<span className="ml-1 text-xs font-semibold text-slate-500">ออเดอร์</span></p><p className="text-[10px] text-slate-400">{hint}</p></div></article>;
