import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { formatDateDMY, formatDateTimeDMY } from '../../lib/dateFormat.js';
import { Order, PlantingRound } from '../../types/index.js';
import { Badge } from '../../components/common/Badge.js';
import {
  History,
  Leaf,
  ArrowLeft,
  ShoppingBag,
  TrendingUp,
  Search,
  ChevronRight,
  Truck,
  Store,
  CircleCheck,
  Ban,
  UserRoundX,
  PackageCheck,
  LockKeyhole,
  CalendarClock,
  CalendarDays,
} from 'lucide-react';

const bangkokDateKey = (value?: string | null): string => {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

const ArchivedOrderCard: React.FC<{ order: Order }> = ({ order }) => {
  const isCompleted = order.status === 'completed';
  const isCancelled = order.status === 'cancelled';
  const StatusIcon = isCompleted ? CircleCheck : isCancelled ? Ban : UserRoundX;
  const tone = isCompleted ? 'emerald' : isCancelled ? 'rose' : 'amber';
  const toneClasses: Record<string, string> = {
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-800',
    rose: 'border-rose-100 bg-rose-50 text-rose-800',
    amber: 'border-amber-100 bg-amber-50 text-amber-800',
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className={`flex items-start justify-between gap-3 border-b px-4 py-3 ${toneClasses[tone]}`}>
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/80"><StatusIcon className="h-5 w-5" /></span>
          <div>
            <p className="text-sm font-extrabold">ออเดอร์ #{order.id.slice(0, 8)}</p>
            <p className="mt-0.5 text-[11px] opacity-80">{isCompleted ? 'ปิดรายการเมื่อ' : isCancelled ? 'ยกเลิกเมื่อ' : 'บันทึกเมื่อ'} {formatDateTimeDMY(isCancelled ? order.cancelled_at || order.updated_at : order.updated_at)}</p>
          </div>
        </div>
        <Badge status={order.status} type="order" />
      </div>
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div><p className="text-slate-400">ลูกค้า</p><p className="mt-0.5 font-bold text-slate-800">{order.profiles?.full_name || 'ไม่ระบุชื่อ'}</p><p className="text-slate-500">{order.contact_phone}</p></div>
          <div><p className="text-slate-400">รอบปลูก</p><p className="mt-0.5 font-bold text-slate-800">{order.planting_rounds?.name || 'ไม่ระบุรอบ'}</p><p className="text-slate-500">{formatDateDMY(order.created_at)}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
          <span className="inline-flex items-center gap-1">{order.fulfillment_method === 'pickup' ? <Store className="h-3.5 w-3.5" /> : <Truck className="h-3.5 w-3.5" />}{order.fulfillment_method === 'pickup' ? 'รับที่ฟาร์ม' : 'จัดส่งปกติ'}</span>
          <span>ชำระเงิน: {order.payment_status === 'paid' ? 'ชำระแล้ว' : 'รอชำระ'}</span>
          <span className="font-extrabold text-slate-800">฿{Number(order.total_amount).toLocaleString()}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
          {(order.order_items || []).map((item) => <span key={item.id} className="rounded-lg bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700">{item.round_items?.crops?.name || 'ผัก'} × {Number(item.qty_kg).toFixed(1)} กก.</span>)}
        </div>
        {isCancelled && order.cancel_reason && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-800"><span className="font-bold">เหตุผล:</span> {order.cancel_reason}</p>}
      </div>
    </article>
  );
};

const ClosedBookingCard: React.FC<{ round: PlantingRound }> = ({ round }) => {
  const totalKg = Number(round.total_bookable_kg || 0);
  const bookedKg = Number(round.total_booked_kg || 0);
  const percentage = totalKg > 0 ? Math.min(100, (bookedKg / totalKg) * 100) : 0;

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-200 text-slate-700"><LockKeyhole className="h-5 w-5" /></span>
          <div><h3 className="font-extrabold text-slate-900">{round.name}</h3><p className="mt-0.5 text-[11px] text-slate-500">ปิดรับจองเมื่อ {formatDateTimeDMY(round.booking_closes_at)}</p></div>
        </div>
        <Badge status={round.status} type="round" />
      </div>
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl bg-slate-50 p-3"><p className="flex items-center gap-1 text-slate-500"><CalendarClock className="h-3.5 w-3.5" /> เปิดรับจอง</p><p className="mt-1 font-bold text-slate-800">{formatDateTimeDMY(round.booking_opens_at)}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-500">วันเก็บเกี่ยว</p><p className="mt-1 font-bold text-slate-800">{formatDateDMY(round.expected_harvest_date)}</p></div>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between text-xs"><span className="font-bold text-slate-700">ยอดจองเมื่อปิดรอบ</span><span className="font-extrabold text-slate-800">{bookedKg.toFixed(1)} / {totalKg.toFixed(1)} กก.</span></div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-500" style={{ width: `${percentage}%` }} /></div>
          <p className="mt-1 text-right text-[10px] text-slate-500">{percentage.toFixed(0)}% ของปริมาณที่เปิดจอง</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(round.round_items || []).map((item: any) => <span key={item.id} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700">{item.crop_name || item.crops?.name || 'ผัก'} · {Number(item.booked_qty_kg || 0).toFixed(1)} กก.</span>)}
        </div>
        <Link to={`/admin/rounds/${round.id}`} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:border-emerald-300 hover:text-emerald-800">ดูรายละเอียดรอบปลูก <ChevronRight className="h-4 w-4" /></Link>
      </div>
    </article>
  );
};

export const AdminRoundsHistoryPage: React.FC = () => {
  const [rounds, setRounds] = useState<PlantingRound[]>([]);
  const [closedBookingRounds, setClosedBookingRounds] = useState<PlantingRound[]>([]);
  const [archivedOrders, setArchivedOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [activeSection, setActiveSection] = useState<'rounds' | 'orders' | 'bookings'>('rounds');

  useEffect(() => {
    loadCompletedRounds();
  }, []);

  const loadCompletedRounds = async () => {
    try {
      setLoading(true);
      const [allRoundData, orderData] = await Promise.all([
        api.get<PlantingRound[]>('/admin/rounds'),
        api.get<Order[]>('/admin/orders'),
      ]);
      const allRounds = allRoundData || [];
      setRounds(allRounds.filter((round) => round.status === 'completed'));
      setClosedBookingRounds(allRounds.filter((round) => !!round.booking_closes_at || ['booking_closed', 'harvested', 'completed'].includes(round.status)));
      setArchivedOrders((orderData || []).filter((order) => ['completed', 'cancelled', 'no_show'].includes(order.status)));
    } catch (err: any) {
      console.error('Error loading completed rounds:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredRounds = rounds.filter((r) => {
    if (selectedDate && bangkokDateKey(r.completed_date || r.updated_at) !== selectedDate) return false;
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const nameMatch = r.name?.toLowerCase().includes(query);
    const cropsMatch = (r.round_items || []).some(
      (it: any) =>
        it.crop_name?.toLowerCase().includes(query) ||
        it.crops?.name?.toLowerCase().includes(query)
    );
    return nameMatch || cropsMatch;
  });

  // Calculate high-level summary KPIs
  const totalRoundsCompleted = filteredRounds.length;
  const filteredClosedBookingRounds = closedBookingRounds.filter((round) => {
    if (selectedDate && bangkokDateKey(round.booking_closes_at || round.updated_at) !== selectedDate) return false;
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return round.name?.toLowerCase().includes(query) || (round.round_items || []).some((item: any) => (item.crop_name || item.crops?.name || '').toLowerCase().includes(query));
  });
  const totalKgSold = filteredRounds.reduce((sum, r) => sum + Number(r.total_booked_kg || 0), 0);
  const totalKgHarvested = filteredRounds.reduce((sum, r) => sum + Number(r.total_bookable_kg || 0), 0);
  const filteredOrders = archivedOrders.filter((order) => {
    if (selectedDate && bangkokDateKey(order.status === 'cancelled' ? order.cancelled_at || order.updated_at : order.updated_at) !== selectedDate) return false;
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return order.id.toLowerCase().includes(query)
      || order.profiles?.full_name?.toLowerCase().includes(query)
      || order.planting_rounds?.name?.toLowerCase().includes(query)
      || (order.order_items || []).some((item) => item.round_items?.crops?.name?.toLowerCase().includes(query));
  });
  const completedOrders = filteredOrders.filter((order) => order.status === 'completed');
  const specialOrders = filteredOrders.filter((order) => order.status === 'cancelled' || order.status === 'no_show');

  return (
    <div className="space-y-6">
      {/* Navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              to="/admin/rounds"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-emerald-600 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>กลับหน้ารอบการปลูกปัจจุบัน</span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">ประวัติ</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">ทั้งหมด {rounds.length + archivedOrders.length + closedBookingRounds.length} รายการ</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            ดูประวัติรอบการปลูก คำสั่งจอง และรอบที่ปิดรับจองแล้ว
          </p>
        </div>

        <Link to="/admin/rounds" className="inline-flex items-center gap-1.5 self-start sm:self-auto px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:border-emerald-300 hover:text-emerald-800 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> รอบปลูกปัจจุบัน
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-3xl border border-emerald-200 bg-gradient-to-r from-emerald-50/90 to-green-100/70 p-2 shadow-sm">
        <button type="button" onClick={() => { setActiveSection('rounds'); setSearchQuery(''); }} className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left transition-all ${activeSection === 'rounds' ? 'bg-white shadow-sm ring-1 ring-emerald-200' : 'text-slate-700 hover:bg-white/70'}`}>
          <span className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-purple-100 text-purple-700"><History className="h-5 w-5" /></span><span><span className="block text-sm font-extrabold text-slate-900">ประวัติรอบปลูก</span><span className="block text-[11px] text-slate-500">รอบที่สิ้นสุดแล้ว</span></span></span>
          <span className="rounded-full bg-purple-50 px-2.5 py-1 text-xs font-black text-purple-700">{rounds.length}</span>
        </button>
        <button type="button" onClick={() => { setActiveSection('orders'); setSearchQuery(''); }} className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left transition-all ${activeSection === 'orders' ? 'bg-white shadow-sm ring-1 ring-emerald-200' : 'text-slate-700 hover:bg-white/70'}`}>
          <span className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><PackageCheck className="h-5 w-5" /></span><span><span className="block text-sm font-extrabold text-slate-900">ประวัติคำสั่งจอง</span><span className="block text-[11px] text-slate-500">สำเร็จและกรณีพิเศษ</span></span></span>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">{archivedOrders.length}</span>
        </button>
        <button type="button" onClick={() => { setActiveSection('bookings'); setSearchQuery(''); }} className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left transition-all ${activeSection === 'bookings' ? 'bg-white shadow-sm ring-1 ring-emerald-200' : 'text-slate-700 hover:bg-white/70'}`}>
          <span className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-200 text-slate-700"><LockKeyhole className="h-5 w-5" /></span><span><span className="block text-sm font-extrabold text-slate-900">ประวัติการเปิดจอง</span><span className="block text-[11px] text-slate-500">รอบที่ปิดรับจองแล้ว</span></span></span>
          <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-black text-slate-700">{closedBookingRounds.length}</span>
        </button>
      </div>

      {/* KPI Metric Cards */}
      {activeSection === 'rounds' ? <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              รอบปลูกที่สิ้นสุดแล้ว
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <History className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900">{totalRoundsCompleted} รอบ</p>
          <p className="text-[11px] text-slate-400">ปิดรอบและส่งมอบเสร็จสิ้นสมบูรณ์</p>
        </div>

        <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              ผลผลิตที่จองและขายสำเร็จ
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-700">{totalKgSold.toFixed(1)} กก.</p>
          <p className="text-[11px] text-slate-400">จากยอดเปิดจองรวม {totalKgHarvested.toFixed(1)} กก.</p>
        </div>

        <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              อัตราความสำเร็จ
            </span>
            <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-sky-700">
            {totalKgHarvested > 0 ? ((totalKgSold / totalKgHarvested) * 100).toFixed(0) : 0}%
          </p>
          <p className="text-[11px] text-slate-400">สัดส่วนผลผลิตที่จำหน่ายได้ตามเป้า</p>
        </div>
      </div> : activeSection === 'orders' ? <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4"><p className="text-xs font-bold text-emerald-800">คำสั่งจองสำเร็จ</p><p className="mt-1 text-2xl font-black text-slate-900">{completedOrders.length}</p><p className="text-[11px] text-slate-500">ส่งมอบให้ลูกค้าเรียบร้อย</p></div>
        <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50 to-white p-4"><p className="text-xs font-bold text-rose-800">ยกเลิกออเดอร์</p><p className="mt-1 text-2xl font-black text-slate-900">{filteredOrders.filter((order) => order.status === 'cancelled').length}</p><p className="text-[11px] text-slate-500">ปิดรายการโดยการยกเลิก</p></div>
        <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-4"><p className="text-xs font-bold text-amber-800">ไม่มารับสินค้า</p><p className="mt-1 text-2xl font-black text-slate-900">{filteredOrders.filter((order) => order.status === 'no_show').length}</p><p className="text-[11px] text-slate-500">บันทึกเป็นกรณีพิเศษ</p></div>
      </div> : <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-100 to-white p-4"><p className="text-xs font-bold text-slate-700">รอบที่ปิดรับจอง</p><p className="mt-1 text-2xl font-black text-slate-900">{filteredClosedBookingRounds.length}</p><p className="text-[11px] text-slate-500">เก็บประวัติไว้ตรวจสอบย้อนหลัง</p></div>
        <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4"><p className="text-xs font-bold text-blue-800">ปริมาณที่เปิดจอง</p><p className="mt-1 text-2xl font-black text-slate-900">{filteredClosedBookingRounds.reduce((sum, round) => sum + Number(round.total_bookable_kg || 0), 0).toFixed(1)} กก.</p><p className="text-[11px] text-slate-500">รวมจากรอบที่แสดง</p></div>
        <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4"><p className="text-xs font-bold text-emerald-800">ยอดจองรวม</p><p className="mt-1 text-2xl font-black text-slate-900">{filteredClosedBookingRounds.reduce((sum, round) => sum + Number(round.total_booked_kg || 0), 0).toFixed(1)} กก.</p><p className="text-[11px] text-slate-500">ยอดก่อนปิดรับจองของแต่ละรอบ</p></div>
      </div>}

      {/* Search and Filters */}
      <div className="flex flex-col gap-3 bg-white p-3 rounded-2xl border border-slate-200/90 shadow-2xs sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={activeSection === 'rounds' || activeSection === 'bookings' ? 'ค้นหาชื่อรอบการปลูก หรือชนิดผัก...' : 'ค้นหารหัสออเดอร์ ลูกค้า รอบปลูก หรือชนิดผัก...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="text-xs font-semibold text-slate-400 hover:text-slate-600 px-2"
          >
            ล้างคำค้น
          </button>
        )}
        <label className="min-w-0 text-xs font-bold text-slate-600 sm:w-52">
          <span className="mb-1.5 block">{activeSection === 'rounds' ? 'วันที่สิ้นสุดรอบ' : activeSection === 'bookings' ? 'วันที่ปิดรับจอง' : 'วันที่ปิดรายการ'}</span>
          <span className="relative block">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-700" />
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-xs text-slate-800 outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100" />
          </span>
        </label>
        {selectedDate && <button type="button" onClick={() => setSelectedDate('')} className="self-start rounded-xl px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 sm:self-end">ล้างวันที่</button>}
      </div>

      {/* History records */}
      {activeSection === 'rounds' ? <div className="space-y-4">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm bg-white rounded-3xl border border-slate-200">
            กำลังโหลดประวัติรอบการปลูก...
          </div>
        ) : filteredRounds.length === 0 ? (
          <div className="p-16 text-center text-slate-500 bg-white rounded-3xl border border-slate-200 space-y-3">
            <History className="w-12 h-12 mx-auto text-slate-300 stroke-[1.5]" />
            <h3 className="text-base font-bold text-slate-800">
              {searchQuery || selectedDate ? 'ไม่พบประวัติรอบตามตัวกรอง' : 'ยังไม่มีประวัติรอบการปลูกที่สิ้นสุด'}
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {searchQuery || selectedDate
                ? 'ลองเปลี่ยนคำค้นหาหรือวันที่อีกครั้ง'
                : 'เมื่อรอบการปลูกปัจจุบันดำเนินการครบทั้ง 7 สเต็ปและกดยืนยันสถานะ "สิ้นสุดรอบ" ระบบจะย้ายรอบนั้นมาเก็บไว้ที่หน้านี้อัตโนมัติ'}
            </p>
            {!searchQuery && !selectedDate && (
              <div className="pt-2">
                <Link
                  to="/admin/rounds"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>ไปดูรอบการปลูกปัจจุบัน</span>
                </Link>
              </div>
            )}
          </div>
        ) : (
          filteredRounds.map((round) => {
            const items = round.round_items || [];
            const roundBookable = Number(round.total_bookable_kg || 0);
            const roundBooked = Number(round.total_booked_kg || 0);
            const sellPercentage = roundBookable > 0 ? (roundBooked / roundBookable) * 100 : 0;

            return (
              <div
                key={round.id}
                className="bg-white rounded-3xl border border-slate-200/90 shadow-2xs hover:shadow-sm transition-all overflow-hidden"
              >
                <div className="p-6 space-y-5">
                  {/* Top Bar: Title & Badge */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-lg font-black text-slate-900 tracking-tight">
                          {round.name}
                        </h2>
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                          🏁 สิ้นสุดรอบแล้ว
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        สิ้นสุดรอบเมื่อ:{' '}
                        <strong>
                          {formatDateDMY(round.completed_date || round.updated_at)}
                        </strong>
                      </p>
                    </div>

                    <Link
                      to={`/admin/rounds/${round.id}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors self-start sm:self-auto shadow-xs"
                    >
                      <span>ดูรายละเอียด & ออเดอร์</span>
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>

                  {/* 7-Step Timeline Record */}
                  <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/70">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-3">
                      บันทึกไทม์ไลน์ 7 สเต็ปของรอบนี้
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-center text-xs">
                      <div className="p-2.5 bg-white rounded-xl border border-slate-100 shadow-2xs">
                        <span className="text-[10px] text-slate-400 block font-medium">1. ปักเม็ด</span>
                        <span className="font-bold text-slate-800 block mt-0.5">
                          {formatDateDMY(round.seed_date)}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-slate-100 shadow-2xs">
                        <span className="text-[10px] text-slate-400 block font-medium">2. ใส่ปุ๋ย</span>
                        <span className="font-bold text-slate-800 block mt-0.5">
                          {formatDateDMY(round.fertilizing_date)}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-slate-100 shadow-2xs">
                        <span className="text-[10px] text-slate-400 block font-medium">3. ปลูกจริง</span>
                        <span className="font-bold text-slate-800 block mt-0.5">
                          {formatDateDMY(round.transplant_date || round.planted_at)}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-slate-100 shadow-2xs">
                        <span className="text-[10px] text-slate-400 block font-medium">4. เปิดสั่งจอง</span>
                        <span className="font-bold text-slate-800 block mt-0.5">
                          {formatDateDMY(round.booking_opens_at)}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-slate-100 shadow-2xs">
                        <span className="text-[10px] text-slate-400 block font-medium">5. เก็บ & ขาย</span>
                        <span className="font-bold text-slate-800 block mt-0.5">
                          {formatDateDMY(round.harvest_sale_date || round.expected_harvest_date)}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-slate-100 shadow-2xs">
                        <span className="text-[10px] text-slate-400 block font-medium">6. ขายหมด</span>
                        <span className="font-bold text-slate-800 block mt-0.5">
                          {formatDateDMY(round.sold_out_date)}
                        </span>
                      </div>
                      <div className="p-2.5 bg-purple-50 rounded-xl border border-purple-100 shadow-2xs">
                        <span className="text-[10px] text-purple-600 block font-bold">7. สิ้นสุดรอบ</span>
                        <span className="font-bold text-purple-900 block mt-0.5">
                          {formatDateDMY(round.completed_date)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Crops summary & Sales performance */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center pt-1">
                    {/* Vegetable list */}
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-slate-700 block">
                        รายการผักในรอบนี้ ({items.length} ชนิด):
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {items.map((it: any) => (
                          <div
                            key={it.id}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800"
                          >
                            <Leaf className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{it.crop_name || it.crops?.name || 'ผัก'}</span>
                            <span className="text-slate-400">•</span>
                            <span className="font-bold text-slate-900">
                              {Number(it.bookable_qty_kg || 0).toFixed(1)} กก.
                            </span>
                            <span className="text-slate-500">(฿{it.price_per_kg}/กก.)</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Sales Gauge */}
                    <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700">สรุปยอดจำหน่ายในรอบนี้:</span>
                        <span className="font-black text-emerald-800">
                          {roundBooked.toFixed(1)} / {roundBookable.toFixed(1)} กก. ({sellPercentage.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden p-0.5">
                        <div
                          className="h-full bg-emerald-600 rounded-full transition-all"
                          style={{ width: `${Math.min(100, sellPercentage)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div> : activeSection === 'orders' ? <div className="space-y-5">
        {loading ? <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">กำลังโหลดประวัติคำสั่งจอง...</div> : filteredOrders.length === 0 ? <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center"><PackageCheck className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 font-bold text-slate-800">{searchQuery || selectedDate ? 'ไม่พบออเดอร์ตามตัวกรอง' : 'ยังไม่มีประวัติคำสั่งจอง'}</p><p className="mt-1 text-xs text-slate-500">ออเดอร์ที่สำเร็จ ยกเลิก หรือไม่มารับ จะแสดงในส่วนนี้</p></div> : <>
          {completedOrders.filter((order) => filteredOrders.some((filtered) => filtered.id === order.id)).length > 0 && <section className="space-y-3">
            <div className="flex items-center gap-2"><CircleCheck className="h-5 w-5 text-emerald-600" /><h2 className="font-extrabold text-slate-900">สำเร็จแล้ว</h2><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">{completedOrders.filter((order) => filteredOrders.some((filtered) => filtered.id === order.id)).length}</span></div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {filteredOrders.filter((order) => order.status === 'completed').map((order) => <ArchivedOrderCard key={order.id} order={order} />)}
            </div>
          </section>}
          {specialOrders.filter((order) => filteredOrders.some((filtered) => filtered.id === order.id)).length > 0 && <section className="space-y-3">
            <div className="flex items-center gap-2"><History className="h-5 w-5 text-rose-600" /><h2 className="font-extrabold text-slate-900">กรณีพิเศษ</h2><span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-800">{specialOrders.filter((order) => filteredOrders.some((filtered) => filtered.id === order.id)).length}</span></div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {filteredOrders.filter((order) => order.status === 'cancelled' || order.status === 'no_show').map((order) => <ArchivedOrderCard key={order.id} order={order} />)}
            </div>
          </section>}
        </>}
      </div> : <div className="space-y-4">
        {loading ? <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">กำลังโหลดประวัติการเปิดจอง...</div> : filteredClosedBookingRounds.length === 0 ? <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center"><LockKeyhole className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 font-bold text-slate-800">{searchQuery || selectedDate ? 'ไม่พบรอบตามตัวกรอง' : 'ยังไม่มีรอบที่ปิดรับจอง'}</p><p className="mt-1 text-xs text-slate-500">เมื่อปิดรับจองแล้ว รอบนั้นจะถูกรวบรวมไว้ในประวัติส่วนนี้</p></div> : <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{filteredClosedBookingRounds.map((round) => <ClosedBookingCard key={round.id} round={round} />)}</div>}
      </div>}
    </div>
  );
};
