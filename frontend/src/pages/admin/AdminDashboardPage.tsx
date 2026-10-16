import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { PlantingRound, Order } from '../../types/index.js';
import { Badge } from '../../components/common/Badge.js';
import {
  CalendarDays,
  ShoppingBag,
  Clock,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  Plus,
} from 'lucide-react';

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

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('th-TH', {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const pendingConfirmationOrders = orders.filter((o) => o.status === 'pending_confirmation');
  const unpaidOrders = orders.filter((o) => o.payment_status === 'unpaid' && o.status !== 'cancelled');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">ภาพรวมระบบ (Dashboard)</h1>
          <p className="text-xs sm:text-sm text-slate-500">
            รอบการปลูกเรียงตามวันเก็บเกี่ยว และสรุปสถานะการสั่งจอง
          </p>
        </div>
        <Link
          to="/admin/rounds"
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-sm transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>สร้างรอบการปลูกใหม่</span>
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">รอบการปลูกทั้งหมด</span>
            <div className="p-2 rounded-xl bg-slate-100 text-slate-600">
              <CalendarDays className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900">{rounds.length}</p>
          <span className="text-[11px] text-emerald-600 font-medium">
            เปิดจองอยู่ {rounds.filter((r) => r.status === 'booking_open').length} รอบ
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">คำสั่งจองทั้งหมด</span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900">{orders.length}</p>
          <span className="text-[11px] text-slate-500 font-medium">
            ยืนยันแล้ว {orders.filter((o) => o.status === 'confirmed').length} รายการ
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-700">รอยืนยัน (ออเดอร์ใหญ่)</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-600">{pendingConfirmationOrders.length}</p>
          <span className="text-[11px] text-amber-700 font-medium">
            {pendingConfirmationOrders.length > 0 ? 'รอแอดมินโทรยืนยัน' : 'ไม่มีรายการค้าง'}
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">รอรับเงิน (ตอนรับของ)</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900">{unpaidOrders.length}</p>
          <span className="text-[11px] text-slate-500 font-medium">
            มูลค่า ฿{unpaidOrders.reduce((sum, o) => sum + Number(o.total_amount), 0).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Main Section: Planting rounds sorted by expected harvest date */}
      <section className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              รอบการปลูกเรียงตามวันเก็บเกี่ยว (ใกล้เก็บ → ยังไม่เปิด)
            </h2>
            <p className="text-xs text-slate-500">
              เปรียบเทียบยอดจองจริง vs ยอดที่เปิดให้จอง vs ประมาณการผลผลิต
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
        ) : rounds.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">ยังไม่มีรอบการปลูกในระบบ</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rounds.map((round) => {
              const bookedKg = Number(round.total_booked_kg || 0);
              const bookableKg = Number(round.total_bookable_kg || 0);
              const estimatedKg = Number(round.total_estimated_kg || 0);
              const percent = bookableKg > 0 ? Math.min(100, Math.round((bookedKg / bookableKg) * 100)) : 0;

              return (
                <div key={round.id} className="py-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="px-3 py-1.5 rounded-xl bg-slate-100 text-center flex-shrink-0">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">เก็บเกี่ยว</span>
                        <span className="text-xs font-extrabold text-slate-900">
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
                  <div className="space-y-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-100">
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
