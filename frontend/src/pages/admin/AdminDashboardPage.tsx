import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { formatDateDMY } from '../../lib/dateFormat.js';
import { PlantingRound, Order } from '../../types/index.js';
import { Badge } from '../../components/common/Badge.js';
import {
  ShoppingBag,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  Plus,
  Sprout,
  CheckCircle2,
  Leaf,
  WalletCards,
  CircleAlert,
  ArrowUpRight,
} from 'lucide-react';

const addDays = (dateStr: string | null | undefined, days: number): string | null => {
  if (!dateStr) return null;
  const date = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const dayDifference = (dateStr: string): number => {
  const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
  const target = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
};

const STEP_TITLES: Record<number, string> = {
  2: 'ใส่ปุ๋ย',
  3: 'เริ่มปลูก',
  4: 'ย้ายลงแปลงปลูก',
  5: 'เปิดรับจอง',
  6: 'อัปเดตพร้อมเก็บเกี่ยว',
  7: 'ตรวจสอบและบันทึกการขายหมด',
  8: 'ปิดรอบหลังส่งมอบครบ',
};

export const AdminDashboardPage: React.FC = () => {
  const [rounds, setRounds] = useState<PlantingRound[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<PlantingRound[]>('/admin/rounds'),
      api.get<Order[]>('/admin/orders'),
    ])
      .then(([roundsData, ordersData]) => {
        // Sort rounds by expected harvest date (Rule 6)
        const sortedRounds = [...roundsData].sort(
          (a, b) => new Date(a.expected_harvest_date).getTime() - new Date(b.expected_harvest_date).getTime()
        );
        setRounds(sortedRounds);
        setOrders(ordersData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const formatDate = formatDateDMY;

  const pendingConfirmationOrders = orders.filter((o) => o.status === 'pending_confirmation');
  const unpaidOrders = orders.filter((o) => o.payment_status === 'unpaid' && o.status !== 'cancelled');
  const activeRounds = rounds.filter((round) => round.status !== 'completed' && round.status !== 'cancelled' && !round.completed_date);
  const activeOrders = orders.filter((order) => !['completed', 'cancelled', 'no_show'].includes(order.status));
  const openBookingRounds = rounds.filter((round) => round.status === 'booking_open');

  const roundReminders = rounds.flatMap((round) => {
    if (round.status === 'completed' || round.status === 'cancelled' || round.completed_date) return [];
    const currentStep = Number(round.current_step || 1);
    const nextStep = Math.min(8, currentStep);
    let dueDate: string | null = null;

    if (nextStep === 2) dueDate = round.fertilizing_date || addDays(round.seed_date, 7);
    else if (nextStep === 3) dueDate = round.planting_start_date || null;
    else if (nextStep === 4) dueDate = round.transplant_date || addDays(round.seed_date, 14);
    else if (nextStep === 5) dueDate = round.booking_opens_at?.slice(0, 10) || null;
    else if (nextStep === 6) dueDate = round.harvest_sale_date || round.expected_harvest_date || null;
    else if (nextStep === 8) dueDate = round.fulfillment_date || null;

    // Selling out is event driven; prompt the admin when the round is fully booked.
    if (nextStep === 7 && round.is_all_sold_out) dueDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    if (!dueDate) return [];

    const daysLeft = dayDifference(dueDate);
    if (daysLeft > 7) return [];
    return [{ round, nextStep, dueDate, daysLeft }];
  }).sort((a, b) => a.daysLeft - b.daysLeft);

  return (
    <div className="space-y-6">
      {/* Welcome hero */}
      <section className="relative isolate overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-950 via-emerald-800 to-green-700 p-6 text-white shadow-xl sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-20 h-64 w-64 rounded-full bg-lime-300/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-28 right-1/4 h-72 w-72 rounded-full border-[40px] border-white/5" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-100">
              <span className="h-1.5 w-1.5 rounded-full bg-lime-300 shadow-[0_0_10px_#bef264]" /> HydroFarm · Admin Overview
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">ภาพรวมฟาร์ม</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-emerald-50/80">ติดตามรอบปลูก คำสั่งจอง และงานที่ต้องดูแลในวันนี้ได้จากจุดเดียว</p>
            <p className="mt-4 text-xs font-medium text-emerald-100/70">{new Intl.DateTimeFormat('th-TH', { dateStyle: 'full', timeZone: 'Asia/Bangkok' }).format(new Date())}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/reports" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-xs font-bold text-white backdrop-blur transition hover:bg-white/15">
              <TrendingUp className="h-4 w-4" /> ดูรายงาน <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            <Link to="/admin/rounds" className="inline-flex items-center gap-2 rounded-xl bg-lime-300 px-4 py-3 text-xs font-extrabold text-emerald-950 shadow-lg shadow-emerald-950/15 transition hover:bg-lime-200">
              <Plus className="h-4 w-4" /> สร้างรอบปลูก
            </Link>
          </div>
        </div>
        <div className="relative mt-7 grid grid-cols-2 gap-2 border-t border-white/15 pt-4 text-xs sm:flex sm:gap-8">
          <span className="flex items-center gap-2 text-emerald-50"><Leaf className="h-4 w-4 text-lime-300" /> รอบที่กำลังดำเนินการ <strong className="text-white">{activeRounds.length}</strong></span>
          <span className="flex items-center gap-2 text-emerald-50"><ShoppingBag className="h-4 w-4 text-lime-300" /> ออเดอร์ที่ต้องดูแล <strong className="text-white">{activeOrders.length}</strong></span>
        </div>
      </section>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="group rounded-3xl border border-emerald-100 bg-gradient-to-br from-white to-emerald-50/70 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">รอบที่กำลังปลูก</span>
            <div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-700 transition group-hover:bg-emerald-600 group-hover:text-white">
              <Sprout className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">{loading ? '—' : activeRounds.length}</p>
          <p className="mt-1 text-[11px] font-medium text-emerald-700">เปิดรับจอง {openBookingRounds.length} รอบ</p>
        </div>

        <div className="group rounded-3xl border border-sky-100 bg-gradient-to-br from-white to-sky-50/70 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">ออเดอร์ที่กำลังดำเนินการ</span>
            <div className="rounded-xl bg-sky-100 p-2.5 text-sky-700 transition group-hover:bg-sky-600 group-hover:text-white">
              <ShoppingBag className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">{loading ? '—' : activeOrders.length}</p>
          <p className="mt-1 text-[11px] font-medium text-sky-700">ยืนยันแล้ว {orders.filter((o) => o.status === 'confirmed').length} รายการ</p>
        </div>

        <div className="group rounded-3xl border border-amber-100 bg-gradient-to-br from-white to-amber-50/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">ต้องยืนยันออเดอร์</span>
            <div className="rounded-xl bg-amber-100 p-2.5 text-amber-700 transition group-hover:bg-amber-500 group-hover:text-white">
              <CircleAlert className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-black tracking-tight text-amber-700">{loading ? '—' : pendingConfirmationOrders.length}</p>
          <Link to="/admin/orders?status=pending_confirmation" className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 hover:underline">{pendingConfirmationOrders.length ? 'เปิดรายการรอยืนยัน' : 'ไม่มีรายการค้าง'} <ArrowRight className="h-3 w-3" /></Link>
        </div>

        <div className="group rounded-3xl border border-violet-100 bg-gradient-to-br from-white to-violet-50/70 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">ยอดรอชำระ</span>
            <div className="rounded-xl bg-violet-100 p-2.5 text-violet-700 transition group-hover:bg-violet-600 group-hover:text-white">
              <WalletCards className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">฿{unpaidOrders.reduce((sum, o) => sum + Number(o.total_amount), 0).toLocaleString()}</p>
          <p className="mt-1 text-[11px] font-medium text-violet-700">{unpaidOrders.length} ออเดอร์รอรับชำระ</p>
        </div>
      </div>

      {/* Upcoming round status updates */}
      <section className={`overflow-hidden rounded-3xl border-2 bg-white shadow-md ${roundReminders.some(({ daysLeft }) => daysLeft <= 0) ? 'border-amber-300 shadow-amber-100/70' : 'border-emerald-300 shadow-emerald-100/70'}`}>
        <div className={`flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${roundReminders.some(({ daysLeft }) => daysLeft <= 0) ? 'border-amber-200 bg-gradient-to-r from-amber-100 via-amber-50 to-orange-50' : 'border-emerald-200 bg-gradient-to-r from-emerald-100 via-emerald-50 to-lime-50'}`}>
          <div className="flex items-center gap-2.5">
            <div className={`rounded-2xl p-3 text-white shadow-sm ${roundReminders.some(({ daysLeft }) => daysLeft <= 0) ? 'bg-amber-600' : 'bg-emerald-700'}`}>
              {roundReminders.some(({ daysLeft }) => daysLeft <= 0) ? <CircleAlert className="h-6 w-6" /> : <Sprout className="h-6 w-6" />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black leading-tight text-slate-950 sm:text-2xl">งานอัปเดตสถานะรอบปลูก</h2>
                {!loading && roundReminders.length > 0 && <span className={`rounded-full px-3 py-1.5 text-xs font-black sm:text-sm ${roundReminders.some(({ daysLeft }) => daysLeft <= 0) ? 'bg-amber-600 text-white' : 'bg-emerald-700 text-white'}`}>{roundReminders.length} งานที่ต้องติดตาม</span>}
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-700 sm:text-base">เตือนงานที่ถึงกำหนดหรือกำลังจะถึงภายใน 7 วัน</p>
            </div>
          </div>
          <Link to="/admin/rounds" className="inline-flex items-center gap-2 self-start rounded-xl bg-white px-4 py-2.5 text-sm font-extrabold text-emerald-900 shadow-sm transition hover:bg-white/90 sm:self-auto sm:text-base">
            จัดการรอบปลูก <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {loading ? (
          <div className="px-5 py-7 text-base font-semibold text-slate-500">กำลังตรวจสอบกำหนดการ...</div>
        ) : roundReminders.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-7 text-base font-semibold text-slate-600 sm:text-lg">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />ยังไม่มีงานอัปเดตสถานะที่ถึงกำหนดใน 7 วันนี้
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {roundReminders.map(({ round, nextStep, dueDate, daysLeft }) => (
              <Link key={`${round.id}-${nextStep}`} to={`/admin/rounds/${round.id}`} className={`flex flex-col gap-3 border-l-[6px] px-5 py-4 transition sm:flex-row sm:items-center sm:justify-between sm:px-6 ${daysLeft < 0 ? 'border-rose-500 bg-rose-50/70 hover:bg-rose-100/70' : daysLeft === 0 ? 'border-amber-500 bg-amber-50/70 hover:bg-amber-100/70' : 'border-emerald-400 bg-white hover:bg-emerald-50/70'}`}>
                <div className="flex min-w-0 items-center gap-4">
                  <span className={`h-3.5 w-3.5 shrink-0 rounded-full ${daysLeft < 0 ? 'bg-rose-500' : daysLeft === 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  <div className="min-w-0">
                    <p className="truncate text-base font-extrabold text-slate-950 sm:text-lg">{round.name} <span className="font-semibold text-slate-700">· ขั้นที่ {nextStep}: {STEP_TITLES[nextStep]}</span></p>
                    <p className="mt-1 text-sm font-semibold text-slate-700 sm:text-base">กำหนด {formatDate(dueDate)}</p>
                  </div>
                </div>
                <span className={`self-start rounded-full px-3.5 py-2 text-sm font-black sm:self-auto sm:text-base ${daysLeft < 0 ? 'bg-rose-200 text-rose-900' : daysLeft === 0 ? 'bg-amber-200 text-amber-950' : 'bg-emerald-100 text-emerald-900'}`}>
                  {daysLeft < 0 ? `เลยกำหนด ${Math.abs(daysLeft)} วัน` : daysLeft === 0 ? 'ถึงกำหนดวันนี้' : `อีก ${daysLeft} วัน`}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Main Section: Planting rounds sorted by expected harvest date */}
      <section className="space-y-4 rounded-[1.75rem] border border-slate-200/90 bg-gradient-to-br from-white via-white to-emerald-50/50 p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-slate-900 sm:text-lg">
              รอบปลูกที่ต้องติดตาม
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              เรียงตามวันเก็บเกี่ยว พร้อมยอดจองเทียบกับปริมาณที่เปิดให้จอง
            </p>
          </div>
          <Link
            to="/admin/rounds"
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
          >
            <span>จัดการรอบทั้งหมด</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-500 text-sm">กำลังโหลดข้อมูลแดชบอร์ด...</div>
        ) : activeRounds.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">ไม่มีรอบปลูกที่กำลังดำเนินการ</div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {activeRounds.map((round) => {
              const bookedKg = Number(round.total_booked_kg || 0);
              const bookableKg = Number(round.total_bookable_kg || 0);
              const estimatedKg = Number(round.total_estimated_kg || 0);
              const percent = bookableKg > 0 ? Math.min(100, Math.round((bookedKg / bookableKg) * 100)) : 0;

              return (
                <div key={round.id} className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs transition hover:border-emerald-200 hover:shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="min-w-[82px] rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-center flex-shrink-0">
                        <span className="block text-[9px] font-extrabold uppercase tracking-wide text-emerald-700">เก็บเกี่ยว</span>
                        <span className="text-xs font-extrabold text-emerald-950">
                          {formatDate(round.expected_harvest_date)}
                        </span>
                      </div>
                      <div>
                        <Link
                          to={`/admin/rounds/${round.id}`}
                          className="font-bold text-sm text-slate-900 hover:text-emerald-600 transition-colors"
                        >
                          {round.name}
                        </Link>
                        <p className="text-xs text-slate-500">
                          ส่งมอบ: {formatDate(round.fulfillment_date)} • ผัก {round.round_items?.length || 0} ชนิด
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge status={round.status} type="round" />
                      <Link
                        to={`/admin/rounds/${round.id}`}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                        title="ดูรายละเอียดรอบ"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>

                  {/* Progress bar and metrics */}
                  <div className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 font-medium">
                        ยอดจอง: <strong className="text-slate-900">{bookedKg.toFixed(1)}</strong> / {bookableKg.toFixed(1)} กก.
                        (ประมาณการ: {estimatedKg.toFixed(1)} กก.)
                      </span>
                      <span className="font-extrabold text-emerald-700">{percent}%</span>
                    </div>

                    <div className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          percent >= 100
                            ? 'bg-rose-500'
                            : percent >= 75
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${percent}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Quick Orders Alert Section */}
      {pendingConfirmationOrders.length > 0 && (
        <section className="p-5 rounded-3xl bg-amber-50 border border-amber-200 text-amber-900 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <h3 className="font-bold text-sm">
                มี {pendingConfirmationOrders.length} ออเดอร์ขนาดใหญ่ที่ต้องรอการยืนยัน
              </h3>
            </div>
            <Link
              to="/admin/orders?status=pending_confirmation"
              className="text-xs font-bold text-amber-800 underline hover:text-amber-950"
            >
              ดูรายการรอยืนยัน →
            </Link>
          </div>
        </section>
      )}
    </div>
  );
};
