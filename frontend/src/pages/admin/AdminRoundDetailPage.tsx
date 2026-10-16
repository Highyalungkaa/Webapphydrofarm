import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { PlantingRound, Plot } from '../../types/index.js';
import { Badge } from '../../components/common/Badge.js';
import {
  ArrowLeft,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Eye,
  Check,
  Leaf,
  Layers,
  Sparkles,
  ShoppingBag,
  Clock,
  ArrowRight,
  TrendingUp,
  LayoutGrid,
  BookmarkCheck,
} from 'lucide-react';

interface StepDef {
  number: number;
  key: string;
  title: string;
  subtitle: string;
  icon: string;
  field: 'seed_date' | 'fertilizing_date' | 'transplant_date' | 'booking_opens_at' | 'harvest_sale_date' | 'sold_out_date' | 'completed_date';
  color: string;
}

const STEPS: StepDef[] = [
  {
    number: 1,
    key: 'seeding',
    title: '1. วันที่ปักเม็ด',
    subtitle: 'เพาะเมล็ดลงฟองน้ำ',
    icon: '🌱',
    field: 'seed_date',
    color: 'emerald',
  },
  {
    number: 2,
    key: 'fertilizing',
    title: '2. วันใส่ปุ๋ย',
    subtitle: 'อนุบาลและเริ่มให้ปุ๋ย AB',
    icon: '🧪',
    field: 'fertilizing_date',
    color: 'sky',
  },
  {
    number: 3,
    key: 'transplanting',
    title: '3. วันปลูกจริง',
    subtitle: 'ย้ายลงรางปลูกไฮโดรโปนิกส์',
    icon: '🌿',
    field: 'transplant_date',
    color: 'teal',
  },
  {
    number: 4,
    key: 'booking_open',
    title: '4. เปิดสั่งจองล่วงหน้า',
    subtitle: 'เปิดรับจองผลผลิตล่วงหน้า',
    icon: '🛒',
    field: 'booking_opens_at',
    color: 'emerald',
  },
  {
    number: 5,
    key: 'harvest_sale',
    title: '5. วันที่พร้อมเก็บและขาย',
    subtitle: 'ผลผลิตพร้อมเก็บเกี่ยว & ส่งมอบ',
    icon: '🧺',
    field: 'harvest_sale_date',
    color: 'amber',
  },
  {
    number: 6,
    key: 'sold_out',
    title: '6. วันที่ขายหมด',
    subtitle: 'ผลผลิตถูกจอง/ขายหมด',
    icon: '🏷️',
    field: 'sold_out_date',
    color: 'rose',
  },
  {
    number: 7,
    key: 'completed',
    title: '7. สิ้นสุดรอบ',
    subtitle: 'ส่งมอบครบ ปิดรอบสมบูรณ์',
    icon: '🏁',
    field: 'completed_date',
    color: 'purple',
  },
];

function addDaysToDateStr(dateStr: string, days: number): string {
  try {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  } catch {
    return dateStr;
  }
}

export const AdminRoundDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [round, setRound] = useState<PlantingRound | null>(null);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stepper active action state
  const [activeStepTab, setActiveStepTab] = useState<number>(1);
  const [inputDate, setInputDate] = useState<string>('');
  const [updatingStep, setUpdatingStep] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [itemDaysMap, setItemDaysMap] = useState<Record<string, number>>({});

  useEffect(() => {
    if (id) loadRound();
  }, [id]);

  const loadRound = async () => {
    try {
      setLoading(true);
      const [data, plotsRes] = await Promise.all([
        api.get<PlantingRound>(`/admin/rounds/${id}`),
        api.get<{ plots: Plot[] }>('/admin/plots'),
      ]);
      setRound(data);
      setPlots(plotsRes?.plots || []);

      const daysMap: Record<string, number> = {};
      if (data.round_items) {
        for (const it of data.round_items) {
          daysMap[it.crop_id] = Number(it.growing_days || it.crops?.growing_days || data.growing_days || 45);
        }
      }
      setItemDaysMap(daysMap);

      const currentStep = data.current_step || 1;
      setActiveStepTab(currentStep);
      initDateForStep(currentStep, data);
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถโหลดข้อมูลรอบได้');
    } finally {
      setLoading(false);
    }
  };

  const initDateForStep = (stepNum: number, currentRound: PlantingRound) => {
    const today = new Date().toISOString().split('T')[0];
    let defaultVal = today;

    if (stepNum === 1) {
      defaultVal = currentRound.seed_date || today;
    } else if (stepNum === 2) {
      defaultVal = currentRound.fertilizing_date || (currentRound.seed_date ? addDaysToDateStr(currentRound.seed_date, 7) : today);
    } else if (stepNum === 3) {
      defaultVal = currentRound.transplant_date || currentRound.planted_at || (currentRound.seed_date ? addDaysToDateStr(currentRound.seed_date, 14) : today);
    } else if (stepNum === 4) {
      defaultVal = currentRound.booking_opens_at ? currentRound.booking_opens_at.split('T')[0] : today;
    } else if (stepNum === 5) {
      defaultVal = currentRound.harvest_sale_date || currentRound.expected_harvest_date || currentRound.fulfillment_date || today;
    } else if (stepNum === 6) {
      defaultVal = currentRound.sold_out_date || today;
    } else if (stepNum === 7) {
      defaultVal = currentRound.completed_date || today;
    }

    setInputDate(defaultVal);
  };

  const handleSelectStepTab = (stepNum: number) => {
    setActiveStepTab(stepNum);
    if (round) {
      initDateForStep(stepNum, round);
    }
  };

  const handleConfirmStepUpdate = async () => {
    if (!round || !inputDate) return;

    try {
      setUpdatingStep(true);
      setActionSuccess(null);
      setError(null);
      
      let formattedDate = inputDate;
      if (activeStepTab === 4 && inputDate.length === 10) {
        formattedDate = `${inputDate}T08:00:00`;
      }

      const maxDays = Object.values(itemDaysMap).length > 0
        ? Math.max(...Object.values(itemDaysMap))
        : (round.growing_days || 45);

      const payload: any = {
        step: activeStepTab,
        date: formattedDate,
        growing_days: maxDays,
      };

      if (activeStepTab === 3 && Object.keys(itemDaysMap).length > 0) {
        payload.crop_growing_days = itemDaysMap;
      }

      const updated = await api.patch<PlantingRound>(`/admin/rounds/${round.id}/step`, payload);
      setRound(updated);

      if (activeStepTab === 7) {
        setActionSuccess(`🏁 สิ้นสุดรอบการปลูก "${round.name}" เรียบร้อยแล้ว! กำลังนำทางไปยังหน้าประวัติรอบปลูก...`);
        setTimeout(() => {
          navigate('/admin/rounds/history');
        }, 1200);
        return;
      }

      // Advance to next step tab if available
      const nextStep = activeStepTab < 7 ? activeStepTab + 1 : 7;
      setActiveStepTab(nextStep);
      initDateForStep(nextStep, updated);

      setActionSuccess(`อัปเดต "${STEPS[activeStepTab - 1].title}" เรียบร้อยแล้ว`);
      await loadRound();
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการอัปเดตสเต็ป');
    } finally {
      setUpdatingStep(false);
    }
  };

  if (loading) {
    return <div className="py-20 text-center text-slate-500 text-sm">กำลังโหลดข้อมูลรอบการปลูก...</div>;
  }

  if (error && !round) {
    return (
      <div className="p-8 text-center space-y-4">
        <div className="p-4 rounded-xl bg-rose-50 text-rose-700 text-sm max-w-md mx-auto">
          {error || 'ไม่พบรอบการปลูกที่ระบุ'}
        </div>
        <Link to="/admin/rounds" className="text-sm font-semibold text-emerald-600">
          ← กลับหน้ารายการรอบ
        </Link>
      </div>
    );
  }

  if (!round) return null;

  const currentStep = round.current_step || 1;
  const growingDays = round.growing_days || 45;
  const calculatedHarvestDate = inputDate && activeStepTab === 3 ? addDaysToDateStr(inputDate, growingDays) : round.expected_harvest_date;

  const totalBookable = Number(round.total_bookable_kg || 0);
  const totalBooked = Number(round.total_booked_kg || 0);
  const totalAvailable = Number(round.total_available_kg || Math.max(0, totalBookable - totalBooked));
  const percentSold = totalBookable > 0 ? Math.min(100, (totalBooked / totalBookable) * 100) : 0;
  const orders = (round as any).orders || [];

  // Plot capacity metrics
  const activePlots = plots.filter((p) => p.is_active);
  const totalActivePlotSlots = activePlots.reduce((sum, p) => sum + Number(p.slot_capacity || 0), 0);
  const totalRoundSlotsNeeded = (round.round_items || []).reduce((sum: number, it: any) => {
    const rate = it.crops?.slots_per_kg ? Number(it.crops.slots_per_kg) : 4.0;
    return sum + Math.round((Number(it.bookable_qty_kg) || 0) * rate);
  }, 0);
  const remainingPlotSlots = totalActivePlotSlots - totalRoundSlotsNeeded;
  const avgSlotsPerPlot = activePlots.length > 0 ? totalActivePlotSlots / activePlots.length : 250;
  const remainingPlotsEst = Math.max(0, Math.floor(remainingPlotSlots / avgSlotsPerPlot));

  return (
    <div className="space-y-6">
      {/* Top back link & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            to="/admin/rounds"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>กลับหน้ารายการรอบการปลูก</span>
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">{round.name}</h1>
            <Badge status={round.status} type="round" />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            วงจรการปลูกไฮโดรโปนิกส์ 7 ขั้นตอน • ควบคุมและอัปเดตสเต็ปตามขั้นตอนจริง
          </p>
        </div>

        {/* Quick summary numbers */}
        <div className="flex items-center gap-3 self-start sm:self-auto bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="px-3 border-r border-slate-100 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">เปิดจองรวม</span>
            <span className="text-base font-black text-slate-800">{totalBookable.toFixed(1)} กก.</span>
          </div>
          <div className="px-3 border-r border-slate-100 text-center">
            <span className="text-[10px] uppercase font-bold text-emerald-600 block">จองแล้ว</span>
            <span className="text-base font-black text-emerald-700">{totalBooked.toFixed(1)} กก.</span>
          </div>
          <div className="px-3 text-center">
            <span className="text-[10px] uppercase font-bold text-sky-600 block">คงเหลือ</span>
            <span className="text-base font-black text-sky-700">{totalAvailable.toFixed(1)} กก.</span>
          </div>
        </div>
      </div>

      {/* Interactive 7-Step Visual Stepper Bar */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-xs overflow-x-auto">
        <div className="flex items-center min-w-[840px] justify-between relative">
          {/* Background progress bar line */}
          <div className="absolute top-1/2 left-6 right-6 -translate-y-1/2 h-1 bg-slate-100 z-0" />
          <div
            className="absolute top-1/2 left-6 -translate-y-1/2 h-1 bg-emerald-500 z-0 transition-all duration-500"
            style={{ width: `${Math.max(0, Math.min(100, ((currentStep - 1) / 6) * 100))}%` }}
          />

          {STEPS.map((step) => {
            const isCompleted = step.number < currentStep;
            const isCurrent = step.number === currentStep;
            const isSelected = step.number === activeStepTab;
            const recordedDate = (round as any)[step.field];

            return (
              <button
                key={step.number}
                type="button"
                onClick={() => handleSelectStepTab(step.number)}
                className={`relative z-10 flex flex-col items-center group transition-transform ${
                  isSelected ? 'scale-105' : 'hover:scale-102'
                }`}
              >
                {/* Step Circle Icon */}
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-sm shadow-xs transition-all ${
                    isCompleted
                      ? 'bg-emerald-600 text-white ring-4 ring-emerald-100'
                      : isCurrent
                      ? 'bg-emerald-500 text-white ring-4 ring-emerald-300 animate-pulse'
                      : 'bg-white border-2 border-slate-200 text-slate-400'
                  } ${isSelected ? 'ring-4 ring-emerald-500' : ''}`}
                >
                  {isCompleted ? <Check className="w-5 h-5 stroke-[3]" /> : step.icon}
                </div>

                {/* Step Title & Date */}
                <div className="text-center mt-2">
                  <span
                    className={`block text-xs font-bold ${
                      isCurrent
                        ? 'text-emerald-700 font-black'
                        : isCompleted
                        ? 'text-slate-800'
                        : 'text-slate-400'
                    }`}
                  >
                    {step.title}
                  </span>
                  <span className="block text-[10px] text-slate-400 font-medium">
                    {recordedDate ? recordedDate : step.subtitle}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Current Step Action Card */}
      <div className="bg-gradient-to-br from-white to-emerald-50/30 rounded-3xl p-6 sm:p-8 border border-emerald-100 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-emerald-100/80 pb-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{STEPS[activeStepTab - 1].icon}</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100/70 px-2.5 py-0.5 rounded-full">
                  ขั้นตอนที่ {activeStepTab} จาก 7
                </span>
                {activeStepTab === currentStep && (
                  <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    กำลังดำเนินการ
                  </span>
                )}
                {activeStepTab < currentStep && (
                  <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    ยืนยันแล้ว
                  </span>
                )}
              </div>
              <h2 className="text-xl font-black text-slate-900 mt-1">
                {STEPS[activeStepTab - 1].title}: {STEPS[activeStepTab - 1].subtitle}
              </h2>
            </div>
          </div>
        </div>

        {actionSuccess && (
          <div className="p-3.5 rounded-2xl bg-emerald-50 text-emerald-800 text-xs font-semibold flex items-center gap-2 border border-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-50 text-rose-800 text-xs font-semibold flex items-center gap-2 border border-rose-200">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Step-specific content and confirmation */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          {/* Left Column: Date Input & Details */}
          <div className="space-y-4">
            <div>
              <label className="font-bold text-slate-800 block text-xs sm:text-sm mb-1.5">
                เลือก{STEPS[activeStepTab - 1].title.replace(/^\d+\.\s*/, '')} <span className="text-rose-500">*</span>
              </label>
              <div className="relative max-w-sm">
                <input
                  type="date"
                  value={inputDate}
                  onChange={(e) => setInputDate(e.target.value)}
                  className="w-full p-3 rounded-2xl border border-slate-300 bg-white font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm shadow-2xs"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                {activeStepTab === 1 && '🌱 ระบุวันที่เริ่มปักเมล็ดลงฟองน้ำเพาะกล้า'}
                {activeStepTab === 2 && '🧪 ระบุวันที่เริ่มให้ปุ๋ย AB สูตรอนุบาล (ปกติ 5-7 วันหลังปักเม็ด)'}
                {activeStepTab === 3 && '🌿 ระบุวันที่ย้ายต้นกล้าลงรางปลูกจริง (ระบบจะคำนวณวันเก็บเกี่ยวให้)'}
                {activeStepTab === 4 && '🛒 ระบุวันเปิดสั่งจองล่วงหน้าสำหรับลูกค้า'}
                {activeStepTab === 5 && '🧺 ระบุวันที่ผลผลิตเติบโตเต็มที่ พร้อมเก็บเกี่ยวและส่งมอบ/ขาย'}
                {activeStepTab === 6 && '🏷️ ระบุวันที่ผลผลิตในรอบนี้ถูกจองหรือขายหมดแล้ว'}
                {activeStepTab === 7 && '🏁 ระบุวันที่จัดส่งมอบเสร็จสิ้น และปิดรอบการปลูก'}
              </p>
            </div>

            {/* Special Feature for Step 3: Auto Harvest Calculation per Vegetable */}
            {activeStepTab === 3 && (
              <div className="p-4 sm:p-5 rounded-2xl bg-sky-50/90 border border-sky-200 space-y-3.5">
                <div className="flex items-center gap-2 font-bold text-sky-950 text-xs sm:text-sm">
                  <Sparkles className="w-4 h-4 text-sky-600 flex-shrink-0" />
                  <span>ระบบคำนวณวันเก็บเกี่ยวอัตโนมัติตามระยะเวลาปลูก (แยกตามชนิดผักในรอบนี้):</span>
                </div>

                <div className="space-y-2.5">
                  {(round.round_items && round.round_items.length > 0) ? (
                    round.round_items.map((it: any) => {
                      const itemDays = Number(itemDaysMap[it.crop_id] ?? (it.growing_days || it.crops?.growing_days || growingDays || 45));
                      const itemHarvestDate = inputDate
                        ? addDaysToDateStr(inputDate, itemDays)
                        : addDaysToDateStr(round.transplant_date || round.planted_at || new Date().toISOString().split('T')[0], itemDays);
                      const cropName = it.crop_name || it.crops?.name || 'ผัก';

                      return (
                        <div
                          key={it.id || it.crop_id}
                          className="p-3 bg-white rounded-xl border border-sky-100 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                              <Leaf className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="font-bold text-slate-900 text-xs sm:text-sm block">
                                {cropName}
                              </span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[11px] text-slate-500">ระยะเวลาปลูก:</span>
                                <div className="inline-flex items-center gap-1 bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-200">
                                  <input
                                    type="number"
                                    min="1"
                                    value={itemDays}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value, 10) || 1;
                                      setItemDaysMap((prev) => ({
                                        ...prev,
                                        [it.crop_id]: val,
                                      }));
                                    }}
                                    className="w-10 text-center font-bold text-sky-800 bg-transparent focus:outline-hidden"
                                    title="แก้ไขจำนวนวันปลูกของผักชนิดนี้"
                                  />
                                  <span className="text-[11px] font-bold text-sky-700">วัน</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="bg-sky-50 px-3 py-1.5 rounded-xl border border-sky-200/60 flex items-center gap-2 text-xs text-sky-900 self-start sm:self-auto">
                            <Calendar className="w-3.5 h-3.5 text-sky-600 flex-shrink-0" />
                            <span>
                              วันปลูกจริง ({inputDate || 'ยังไม่เลือก'}) + {itemDays} วัน ➔{' '}
                              <strong className="text-sky-950 font-black underline">
                                พร้อมเก็บและขาย: {itemHarvestDate}
                              </strong>
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-3 bg-white rounded-xl border border-sky-100 text-xs text-sky-900">
                      วันปลูกจริง ({inputDate || 'ยังไม่เลือก'}) + {growingDays} วัน ➔{' '}
                      <strong className="font-bold underline">พร้อมเก็บและขาย: {calculatedHarvestDate}</strong>
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-sky-800/80 pt-1 border-t border-sky-200/60 flex items-center gap-1.5">
                  <span className="font-bold">💡 หมายเหตุ:</span>
                  <span>
                    วันที่พร้อมเก็บและขายคำนวณแยกของแต่ละผัก โดยอิงจาก <strong>จำนวนวันปลูกที่กรอกตอนเพิ่มผักในรอบนี้</strong> + <strong>วันปลูกจริง (Step 3)</strong>
                  </span>
                </p>
              </div>
            )}

            {/* Special Feature for Step 4: Display Harvest / Ready-to-Sell Dates as Decision Aid */}
            {activeStepTab === 4 && (
              <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/90 border border-amber-200 space-y-3.5">
                <div className="flex items-center gap-2 font-bold text-amber-950 text-xs sm:text-sm">
                  <Sparkles className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span>วันที่พร้อมเก็บและขายของผักในรอบนี้ (ข้อมูลอ้างอิงเพื่อตัดสินใจเลือกวันเปิดจอง):</span>
                </div>

                <div className="space-y-2.5">
                  {(round.round_items && round.round_items.length > 0) ? (
                    round.round_items.map((it: any) => {
                      const itemDays = Number(itemDaysMap[it.crop_id] ?? (it.growing_days || it.crops?.growing_days || growingDays || 45));
                      const baseDate = round.transplant_date || round.planted_at || round.seed_date || new Date().toISOString().split('T')[0];
                      const itemHarvestDate = addDaysToDateStr(baseDate, itemDays);
                      const cropName = it.crop_name || it.crops?.name || 'ผัก';

                      // Calculate days difference relative to selected booking date (inputDate)
                      let daysDiff: number | null = null;
                      if (inputDate && itemHarvestDate) {
                        const tHarvest = new Date(itemHarvestDate).getTime();
                        const tOpen = new Date(inputDate).getTime();
                        daysDiff = Math.round((tHarvest - tOpen) / (1000 * 60 * 60 * 24));
                      }

                      return (
                        <div
                          key={it.id || it.crop_id}
                          className="p-3 bg-white rounded-xl border border-amber-100 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                              <Leaf className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="font-bold text-slate-900 text-xs sm:text-sm block">
                                {cropName}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                ระยะปลูก {itemDays} วัน {round.transplant_date ? `(วันปลูกจริง: ${round.transplant_date})` : ''}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                            <div className="bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200/60 flex items-center gap-1.5 text-xs text-emerald-900">
                              <Calendar className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                              <span>
                                พร้อมเก็บและขาย:{' '}
                                <strong className="text-emerald-950 font-black underline">
                                  {itemHarvestDate}
                                </strong>
                              </span>
                            </div>

                            {daysDiff !== null && (
                              <span
                                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border ${
                                  daysDiff > 0
                                    ? 'bg-amber-50 text-amber-900 border-amber-200'
                                    : daysDiff === 0
                                    ? 'bg-sky-50 text-sky-900 border-sky-200'
                                    : 'bg-rose-50 text-rose-900 border-rose-200'
                                }`}
                              >
                                {daysDiff > 0
                                  ? `เปิดจองล่วงหน้า ${daysDiff} วัน`
                                  : daysDiff === 0
                                  ? 'เปิดจองวันเดียวกับวันเก็บเกี่ยว'
                                  : `⚠️ เปิดหลังวันเก็บเกี่ยว ${Math.abs(daysDiff)} วัน`}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-3 bg-white rounded-xl border border-amber-100 text-xs text-amber-900">
                      พร้อมเก็บและขายโดยประมาณ:{' '}
                      <strong className="font-bold underline">
                        {round.expected_harvest_date || 'ยังไม่มีข้อมูล'}
                      </strong>
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-amber-900/80 pt-1 border-t border-amber-200/60 flex items-center gap-1.5">
                  <span className="font-bold">💡 คำแนะนำ:</span>
                  <span>
                    แนะนำให้เปิดสั่งจองล่วงหน้าประมาณ <strong>7 - 14 วัน</strong> ก่อนถึงวันที่พร้อมเก็บและขาย เพื่อให้ลูกค้ามีเวลาสั่งจองและฟาร์มเตรียมการเก็บเกี่ยวได้ทัน
                  </span>
                </p>
              </div>
            )}

            {/* Action button to confirm step */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <button
                type="button"
                onClick={handleConfirmStepUpdate}
                disabled={updatingStep || !inputDate}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-md transition-all disabled:opacity-50"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>
                  {updatingStep
                    ? 'กำลังบันทึก...'
                    : activeStepTab === 1
                    ? 'กดยืนยันวันที่ปักเม็ด ➔ ไปสถานะถัดไป (วันใส่ปุ๋ย)'
                    : activeStepTab === 2
                    ? 'กดยืนยันวันใส่ปุ๋ย ➔ ไปสถานะถัดไป (วันปลูกจริง)'
                    : activeStepTab === 3
                    ? 'กดยืนยันวันปลูกจริง ➔ ไปสถานะถัดไป (เปิดสั่งจองล่วงหน้า)'
                    : activeStepTab === 4
                    ? 'กดยืนยันบันทึกวันเปิดจอง ➔ ไปสถานะถัดไป (วันที่พร้อมเก็บและขาย)'
                    : activeStepTab === 5
                    ? 'กดยืนยันวันที่พร้อมเก็บและขาย ➔ ไปสถานะถัดไป (วันที่ขายหมด)'
                    : activeStepTab === 6
                    ? 'กดยืนยันวันที่ขายหมด ➔ ไปสถานะถัดไป (สิ้นสุดรอบ)'
                    : 'กดยืนยันสถานะสิ้นสุดรอบการปลูก'}
                </span>
              </button>

              {activeStepTab === 4 && (
                (round.status === 'booking_closed' || round.status === 'harvested' || round.status === 'completed') ? (
                  <span className="inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-slate-100 text-slate-500 font-bold text-xs sm:text-sm border border-slate-200">
                    <CheckCircle2 className="w-4 h-4 text-slate-400" />
                    <span>ปิดรับการจองแล้ว</span>
                  </span>
                ) : (
                  <Link
                    to="/admin/bookings"
                    className="inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs sm:text-sm shadow-sm transition-colors"
                  >
                    <BookmarkCheck className="w-4 h-4" />
                    <span>ไปจัดการเปิดรับจองที่หน้า "การเปิดสั่งจองล่วงหน้า" →</span>
                  </Link>
                )
              )}
            </div>
          </div>

          {/* Right Column: Visual Status & Step 4 Stock Progress Gauge */}
          <div className="p-5 rounded-3xl bg-white border border-slate-200/80 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                หลอดปริมาณผักภาพรวมในรอบนี้
              </span>
              <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
                จองแล้ว {percentSold.toFixed(0)}%
              </span>
            </div>

            {/* Big Progress Bar */}
            <div className="space-y-2">
              <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden border border-slate-200 p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    percentSold >= 100
                      ? 'bg-rose-500'
                      : percentSold >= 80
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${percentSold}%` }}
                />
              </div>

              <div className="flex justify-between text-xs">
                <span className="text-slate-500">
                  จองแล้ว: <strong className="text-slate-800">{totalBooked.toFixed(1)} กก.</strong>
                </span>
                <span className="text-slate-500">
                  คงเหลือ: <strong className="text-emerald-700">{totalAvailable.toFixed(1)} กก.</strong>
                </span>
                <span className="text-slate-500">
                  เป้าหมาย: <strong className="text-slate-800">{totalBookable.toFixed(1)} กก.</strong>
                </span>
              </div>
            </div>

            {/* Next Action Suggestion */}
            {activeStepTab === 4 && (
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-800 flex items-center justify-between gap-2">
                <span>เมื่อถึงกำหนดเปิดจองแล้ว สามารถกดไปสเต็ป 5 ได้ทันที:</span>
                <button
                  type="button"
                  onClick={() => handleSelectStepTab(5)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold whitespace-nowrap text-[11px]"
                >
                  ไปวันที่พร้อมเก็บและขาย →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Vegetables in this Round Table with Stock Progress Bars */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              หลอดปริมาณผักแต่ละชนิดในรอบนี้
            </h2>
            <p className="text-xs text-slate-400">
              ตรวจสอบยอดเปิดจอง ยอดที่ถูกจองแล้ว และปริมาณคงเหลือแบบเรียลไทม์
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 uppercase text-[11px] font-semibold">
                <th className="py-2.5 px-3">ชนิดผัก</th>
                <th className="py-2.5 px-3">ราคา/กก.</th>
                <th className="py-2.5 px-3 min-w-[200px]">หลอดปริมาณการจอง (จองแล้ว / ทั้งหมด)</th>
                <th className="py-2.5 px-3 text-right">คงเหลือ</th>
                <th className="py-2.5 px-3 text-center">สถานะสต็อก</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {round.round_items?.map((item: any) => {
                const booked = Number(item.booked_qty_kg || 0);
                const bookable = Number(item.bookable_qty_kg || 0);
                const available = Number(item.available_qty_kg || Math.max(0, bookable - booked));
                const itemPercent = bookable > 0 ? Math.min(100, (booked / bookable) * 100) : 0;

                return (
                  <tr key={item.id} className="hover:bg-slate-50/60">
                    <td className="py-3.5 px-3 font-bold text-slate-900 flex items-center gap-2.5">
                      {item.crops?.image_url ? (
                        <img
                          src={item.crops.image_url}
                          alt={item.crop_name}
                          className="w-9 h-9 rounded-xl object-cover border border-slate-200"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                          <Leaf className="w-4 h-4" />
                        </div>
                      )}
                      <div>
                        <span className="block">{item.crop_name || item.crops?.name || 'ผักสลัด'}</span>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          <span>ระยะปลูก: {item.growing_days || item.crops?.growing_days || 45} วัน</span>
                          {(() => {
                            const cropPlots = activePlots.filter((p) => p.crop_id === item.crop_id);
                            const cropRate = item.crops?.slots_per_kg ? Number(item.crops.slots_per_kg) : 4.0;
                            let remainingSlots = Math.round(bookable * cropRate);

                            return cropPlots.length > 0 ? (
                              <div className="w-full mt-2 space-y-1.5 pt-2 border-t border-slate-100">
                                <span className="text-[10px] font-bold text-slate-600 flex items-center gap-1">
                                  <LayoutGrid className="w-3 h-3 text-emerald-600" />
                                  <span>หลอดแสดงพื้นที่ที่ใช้ไปในแต่ละแปลง ({cropPlots.length} แปลง):</span>
                                </span>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {cropPlots.map((plot) => {
                                    const cap = Number(plot.slot_capacity || 0);
                                    const usedInPlot = Math.min(cap, Math.max(0, remainingSlots));
                                    remainingSlots -= usedInPlot;
                                    const pct = cap > 0 ? Math.min(100, Math.round((usedInPlot / cap) * 100)) : 0;

                                    return (
                                      <div
                                        key={plot.id}
                                        className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-[10px] space-y-1"
                                      >
                                        <div className="flex justify-between font-semibold">
                                          <span className="text-slate-800">{plot.name} ({plot.zone_name})</span>
                                          <span
                                            className={
                                              pct >= 100
                                                ? 'text-emerald-700 font-bold'
                                                : pct > 0
                                                ? 'text-sky-700 font-bold'
                                                : 'text-slate-400'
                                            }
                                          >
                                            {pct >= 100 ? 'เต็มแปลง' : pct > 0 ? `ใช้ไป ${pct}%` : 'ว่าง'}
                                          </span>
                                        </div>
                                        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                          <div
                                            className={`h-full rounded-full transition-all duration-300 ${
                                              pct >= 100 ? 'bg-emerald-600' : 'bg-sky-500'
                                            }`}
                                            style={{ width: `${pct}%` }}
                                          />
                                        </div>
                                        <div className="flex justify-between text-slate-400">
                                          <span>ใช้ {usedInPlot} / {cap} ช่อง</span>
                                          <span>
                                            {cap - usedInPlot > 0 ? (
                                              <strong className="text-sky-700">เหลือ {cap - usedInPlot} ช่อง</strong>
                                            ) : (
                                              <strong className="text-emerald-700">เต็มพอดี</strong>
                                            )}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null;
                          })()}
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-3 text-slate-800 font-semibold">
                      ฿{Number(item.price_per_kg).toFixed(0)}/กก.
                    </td>

                    {/* Crop Stock Progress Bar */}
                    <td className="py-3.5 px-3">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="font-semibold text-slate-700">
                            {booked.toFixed(1)} / {bookable.toFixed(1)} กก.
                          </span>
                          <span className="font-bold text-slate-600">{itemPercent.toFixed(0)}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              itemPercent >= 100
                                ? 'bg-rose-500'
                                : itemPercent >= 75
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${itemPercent}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-3 text-right">
                      <span className="font-bold text-slate-900">{available.toFixed(1)} กก.</span>
                    </td>

                    <td className="py-3.5 px-3 text-center">
                      {available <= 0 ? (
                        <span className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full">
                          ขายหมดแล้ว
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                          เปิดให้จอง
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Orders in this Round */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              คำสั่งจองของลูกค้าในรอบนี้ ({orders.length} ออเดอร์)
            </h2>
            <p className="text-xs text-slate-400">ออเดอร์ที่ลูกค้าสั่งจองในรอบนี้ทั้งหมด</p>
          </div>
          <Link
            to={`/admin/orders?round_id=${round.id}`}
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
          >
            ไปที่หน้าจัดการออเดอร์ →
          </Link>
        </div>

        {orders.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            ยังไม่มีคำสั่งจองในรอบการปลูกนี้ เมื่อสเต็ปถึง "เปิดสั่งจองล่วงหน้า" ลูกค้าจะสามารถสั่งซื้อได้
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 uppercase text-[11px] font-semibold">
                  <th className="py-2.5 px-3">รหัสออเดอร์</th>
                  <th className="py-2.5 px-3">ลูกค้า / เบอร์โทร</th>
                  <th className="py-2.5 px-3">วิธีรับ</th>
                  <th className="py-2.5 px-3">ยอดรวม</th>
                  <th className="py-2.5 px-3">สถานะออเดอร์</th>
                  <th className="py-2.5 px-3">การชำระเงิน</th>
                  <th className="py-2.5 px-3 text-right">ดู</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((ord: any) => (
                  <tr key={ord.id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-3 font-semibold text-slate-900">
                      #{ord.id.slice(0, 8)}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-medium text-slate-800">{ord.profiles?.full_name || 'ลูกค้า'}</div>
                      <span className="text-[11px] text-slate-400">{ord.contact_phone}</span>
                    </td>
                    <td className="py-3 px-3">
                      <Badge status={ord.fulfillment_method} type="fulfillment" />
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-900">
                      ฿{Number(ord.total_amount).toLocaleString()}
                    </td>
                    <td className="py-3 px-3">
                      <Badge status={ord.status} type="order" />
                    </td>
                    <td className="py-3 px-3">
                      <Badge status={ord.payment_status} type="payment" />
                    </td>
                    <td className="py-3 px-3 text-right">
                      <Link
                        to={`/admin/orders/${ord.id}`}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-slate-100 inline-block"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
export default AdminRoundDetailPage;
