import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { PlantingRound } from '../../types/index.js';
import { Badge } from '../../components/common/Badge.js';
import {
  History,
  Calendar,
  CheckCircle2,
  Leaf,
  Layers,
  ArrowLeft,
  ExternalLink,
  ShoppingBag,
  TrendingUp,
  Search,
  Clock,
  Sparkles,
  ChevronRight,
  Filter,
} from 'lucide-react';

export const AdminRoundsHistoryPage: React.FC = () => {
  const [rounds, setRounds] = useState<PlantingRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadCompletedRounds();
  }, []);

  const loadCompletedRounds = async () => {
    try {
      setLoading(true);
      // Fetch all rounds and filter completed ones
      const data = await api.get<PlantingRound[]>('/admin/rounds?status=completed');
      setRounds(data || []);
    } catch (err: any) {
      console.error('Error loading completed rounds:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredRounds = rounds.filter((r) => {
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
  const totalRoundsCompleted = rounds.length;
  const totalKgSold = rounds.reduce((sum, r) => sum + Number(r.total_booked_kg || 0), 0);
  const totalKgHarvested = rounds.reduce((sum, r) => sum + Number(r.total_bookable_kg || 0), 0);

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
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">ประวัติรอบการปลูก</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
              สิ้นสุดรอบแล้ว ({rounds.length})
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            รวบรวมประวัติและผลลัพธ์ของรอบการปลูกที่สิ้นสุดวงจรชีวิตการเพาะปลูกและจัดส่งมอบแล้ว
          </p>
        </div>

        {/* Tab switch buttons */}
        <div className="flex items-center gap-2 self-start sm:self-auto bg-slate-200/80 p-1 rounded-2xl">
          <Link
            to="/admin/rounds"
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors"
          >
            รอบปลูกปัจจุบัน
          </Link>
          <span className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white text-emerald-800 shadow-xs">
            ประวัติรอบปลูก
          </span>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            {totalKgHarvested > 0 ? ((totalKgSold / totalKgHarvested) * 100).toFixed(0) : 100}%
          </p>
          <p className="text-[11px] text-slate-400">สัดส่วนผลผลิตที่จำหน่ายได้ตามเป้า</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="ค้นหาชื่อรอบการปลูก หรือชนิดผักที่เคยปลูก..."
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
      </div>

      {/* Rounds List Cards */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm bg-white rounded-3xl border border-slate-200">
            กำลังโหลดประวัติรอบการปลูก...
          </div>
        ) : filteredRounds.length === 0 ? (
          <div className="p-16 text-center text-slate-500 bg-white rounded-3xl border border-slate-200 space-y-3">
            <History className="w-12 h-12 mx-auto text-slate-300 stroke-[1.5]" />
            <h3 className="text-base font-bold text-slate-800">
              {searchQuery ? 'ไม่พบประวัติรอบที่ค้นหา' : 'ยังไม่มีประวัติรอบการปลูกที่สิ้นสุด'}
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {searchQuery
                ? 'ลองเปลี่ยนคำค้นหาใหม่อีกครั้ง'
                : 'เมื่อรอบการปลูกปัจจุบันดำเนินการครบทั้ง 7 สเต็ปและกดยืนยันสถานะ "สิ้นสุดรอบ" ระบบจะย้ายรอบนั้นมาเก็บไว้ที่หน้านี้อัตโนมัติ'}
            </p>
            {!searchQuery && (
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
                          {round.completed_date || round.updated_at?.slice(0, 10) || '-'}
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
                          {round.seed_date || '-'}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-slate-100 shadow-2xs">
                        <span className="text-[10px] text-slate-400 block font-medium">2. ใส่ปุ๋ย</span>
                        <span className="font-bold text-slate-800 block mt-0.5">
                          {round.fertilizing_date || '-'}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-slate-100 shadow-2xs">
                        <span className="text-[10px] text-slate-400 block font-medium">3. ปลูกจริง</span>
                        <span className="font-bold text-slate-800 block mt-0.5">
                          {round.transplant_date || round.planted_at || '-'}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-slate-100 shadow-2xs">
                        <span className="text-[10px] text-slate-400 block font-medium">4. เปิดสั่งจอง</span>
                        <span className="font-bold text-slate-800 block mt-0.5">
                          {round.booking_opens_at ? round.booking_opens_at.slice(0, 10) : '-'}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-slate-100 shadow-2xs">
                        <span className="text-[10px] text-slate-400 block font-medium">5. เก็บ & ขาย</span>
                        <span className="font-bold text-slate-800 block mt-0.5">
                          {round.harvest_sale_date || round.expected_harvest_date || '-'}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-slate-100 shadow-2xs">
                        <span className="text-[10px] text-slate-400 block font-medium">6. ขายหมด</span>
                        <span className="font-bold text-slate-800 block mt-0.5">
                          {round.sold_out_date || '-'}
                        </span>
                      </div>
                      <div className="p-2.5 bg-purple-50 rounded-xl border border-purple-100 shadow-2xs">
                        <span className="text-[10px] text-purple-600 block font-bold">7. สิ้นสุดรอบ</span>
                        <span className="font-bold text-purple-900 block mt-0.5">
                          {round.completed_date || '-'}
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
      </div>
    </div>
  );
};
