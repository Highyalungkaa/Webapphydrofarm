import { RoundWeightSummary } from '../../components/admin/RoundWeightSummary.js';
import { PurchaseLimitPanel } from '../../components/admin/PurchaseLimitPanel.js';
import { RoundStatusBadge } from '../../components/common/RoundStatusBadge.js';
import { ChatOrderButton } from '../../components/admin/ChatOrderButton.js';
import { plotSupportsCrop } from '../../lib/plotCrops.js';
import { PlantLossPanel } from '../../components/admin/PlantLossPanel.js';
import { UnsoldRoundClose } from '../../components/admin/UnsoldRoundClose.js';
import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { formatDateDMY, formatDateTimeDMY, toBangkokDateString, differenceInBangkokCalendarDays } from '../../lib/dateFormat.js';
import { plantingStartDate, transplantDate } from '../../lib/roundStepDates.js';
import { PlantingRound } from '../../types/index.js';
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
  AlertTriangle,
  Info,
} from 'lucide-react';

interface StepDef {
  number: number;
  key: string;
  title: string;
  subtitle: string;
  icon: string;
  field: 'seed_date' | 'fertilizing_date' | 'planting_start_date' | 'transplant_date' | 'booking_opens_at' | 'harvest_sale_date' | 'sold_out_date' | 'completed_date';
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
    key: 'planting_start',
    title: '3. วันเริ่มปลูก',
    subtitle: 'เริ่มปลูกหลังระยะอนุบาล',
    icon: '🌱',
    field: 'planting_start_date',
    color: 'lime',
  },
  {
    number: 4,
    key: 'transplanting',
    title: '4. วันปลูกจริง',
    subtitle: 'ย้ายลงรางปลูกไฮโดรโปนิกส์',
    icon: '🌿',
    field: 'transplant_date',
    color: 'teal',
  },
  {
    number: 5,
    key: 'booking_open',
    title: '5. เปิดสั่งจองล่วงหน้า',
    subtitle: 'เปิดรับจองผลผลิตล่วงหน้า',
    icon: '🛒',
    field: 'booking_opens_at',
    color: 'emerald',
  },
  {
    number: 6,
    key: 'harvest_sale',
    title: '6. วันที่พร้อมเก็บและขาย',
    subtitle: 'ผลผลิตพร้อมเก็บเกี่ยว & ส่งมอบ',
    icon: '🧺',
    field: 'harvest_sale_date',
    color: 'amber',
  },
  {
    number: 7,
    key: 'sold_out',
    title: '7. วันที่ขายหมด',
    subtitle: 'ผลผลิตถูกจอง/ขายหมด',
    icon: '🏷️',
    field: 'sold_out_date',
    color: 'rose',
  },
  {
    number: 8,
    key: 'completed',
    title: '8. สิ้นสุดรอบ',
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

  useEffect(() => {
    if (!loading && round && window.location.hash === '#purchase-limits') {
      document.getElementById('purchase-limits')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [loading, round?.id]);

  const loadRound = async () => {
    try {
      setLoading(true);
      const data = await api.get<PlantingRound>(`/admin/rounds/${id}`);
      setRound(data);

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
      defaultVal = plantingStartDate(currentRound) || today;
    } else if (stepNum === 4) {
      defaultVal = transplantDate(currentRound) || today;
    } else if (stepNum === 5) {
      defaultVal = toBangkokDateString(currentRound.booking_opens_at) || today;
    } else if (stepNum === 6) {
      defaultVal = currentRound.harvest_sale_date || currentRound.expected_harvest_date || currentRound.fulfillment_date || today;
    } else if (stepNum === 7) {
      defaultVal = (currentRound.closure_reason === 'unsold' ? currentRound.completed_date : currentRound.sold_out_date) || today;
    } else if (stepNum === 8) {
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
    if (activeStepTab !== (round.current_step || 1) || round.status === 'completed' || !!round.completed_date) return;
    if (activeStepTab === 5 && !isBookingConfirmed) {
      setError('กรุณาเปิดรอบจองที่หน้า “การเปิดสั่งจองล่วงหน้า” ก่อน จึงจะยืนยันไปสถานะถัดไปได้');
      return;
    }

    try {
      setUpdatingStep(true);
      setActionSuccess(null);
      setError(null);
      
      let formattedDate = inputDate;
      if (activeStepTab === 5 && inputDate.length === 10) {
        formattedDate = `${inputDate}T08:00:00+07:00`;
      }

      const maxDays = Object.values(itemDaysMap).length > 0
        ? Math.max(...Object.values(itemDaysMap))
        : (round.growing_days || 45);

      const payload: any = {
        step: activeStepTab,
        date: formattedDate,
        growing_days: maxDays,
      };

      if (activeStepTab === 4 && Object.keys(itemDaysMap).length > 0) {
        payload.crop_growing_days = itemDaysMap;
      }

      const updated = await api.patch<PlantingRound>(`/admin/rounds/${round.id}/step`, payload);
      setRound((previous) => previous ? { ...previous, ...updated } : updated);

      if (activeStepTab === 8) {
        setActionSuccess(`🏁 สิ้นสุดรอบการปลูก "${round.name}" เรียบร้อยแล้ว! กำลังนำทางไปยังหน้าประวัติรอบปลูก...`);
        setTimeout(() => {
          navigate('/admin/rounds/history');
        }, 1200);
        return;
      }

      // Advance to next step tab if available
      const nextStep = activeStepTab < 8 ? activeStepTab + 1 : 8;
      setActiveStepTab(nextStep);
      initDateForStep(nextStep, updated);

      setActionSuccess(
        activeStepTab === 5 && new Date(formattedDate) > new Date()
          ? `ตั้งเวลาเปิดจองของ "${round.name}" แล้ว ลูกค้าจะเริ่มจองได้เมื่อถึงวันที่กำหนด`
          : `อัปเดต "${STEPS[activeStepTab - 1].title}" เรียบร้อยแล้ว`
      );
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
  const isRoundCompleted = round.status === 'completed' || !!round.completed_date;
  const isViewingPastStep = activeStepTab < currentStep || isRoundCompleted;
  const nextStepInfo = currentStep < 8 ? STEPS[currentStep] : null;
  const isBookingConfirmed = ['booking_open', 'booking_closed'].includes(round.status)
    && !!round.booking_opens_at;
  const growingDays = round.growing_days || 45;
  const calculatedHarvestDate = inputDate && activeStepTab === 4 ? addDaysToDateStr(inputDate, growingDays) : round.expected_harvest_date;

  const totalBooked = Number(round.total_booked_kg || 0);
  const orders = (round as any).orders || [];
  const totalRevenue = orders
    .filter((order: any) => order.status !== 'cancelled')
    .reduce((sum: number, order: any) => sum + Math.round(Number(order.total_amount || 0) * 100), 0) / 100;

  const plantCounts = (round.round_items || []).reduce((sum, item) => {
    const initial = Math.max(0, Number(item.loss_baseline_plant_count ?? item.plant_count ?? 0));
    const lost = Math.max(0, Number(item.lost_plant_count || 0));
    return { initial: sum.initial + initial, remaining: sum.remaining + Math.max(0, initial - lost) };
  }, { initial: 0, remaining: 0 });

  return (
    <div className="space-y-6">
      {/* Top back link & Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="min-w-0">
          <Link
            to="/admin/rounds"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>กลับหน้ารายการรอบการปลูก</span>
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">{round.name}</h1>
            <RoundStatusBadge round={round} />
          </div>
          <p className="text-sm text-slate-500 mt-1">ติดตามความคืบหน้าและบันทึกวันที่ของแต่ละขั้นตอน</p>
        </div>

        {/* Quick summary numbers */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 items-center gap-3 self-stretch xl:min-w-[700px] bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="px-2 text-center">
            <span className="text-[10px] font-bold text-slate-500 block">จำนวนปลูกเริ่มต้น</span>
            <span className="text-base font-black text-slate-800">{plantCounts.initial.toLocaleString('th-TH')} ต้น</span>
          </div>
          <div className="px-2 text-center">
            <span className="text-[10px] font-bold text-teal-700 block">จำนวนต้นคงเหลือ</span>
            <span className="text-base font-black text-teal-800">{plantCounts.remaining.toLocaleString('th-TH')} ต้น</span>
          </div>
          <div className="px-2 text-center">
            <span className="text-[10px] uppercase font-bold text-emerald-600 block">จองแล้ว</span>
            <span className="text-base font-black text-emerald-700">{totalBooked.toFixed(1)} กก.</span>
          </div>
          <div className="px-2 text-center">
            <span className="text-[10px] font-bold text-sky-600 block">น้ำหนักจริงที่ขาย</span>
            <span className="text-base font-black text-sky-700">{orders.reduce((sum:number,o:any)=>o.status==='cancelled'||o.status==='no_show'?sum:sum+(o.order_items||[]).reduce((n:number,i:any)=>n+Number(i.own_qty_kg||0),0),0).toLocaleString('th-TH',{maximumFractionDigits:2})} กก.</span>
            <span className="block text-[9px] text-sky-600">น้ำหนักจริงที่ชั่งแล้วส่งให้ลูกค้า</span>
          </div>
          <div className="rounded-xl bg-amber-50 px-3 py-2 text-center" title="ยอดรวมออเดอร์ที่ไม่ถูกยกเลิก รวมทั้งชำระแล้วและยังไม่ชำระ">
            <span className="block text-[10px] font-bold text-amber-700">รายได้รวมรอบนี้</span>
            <span className="block whitespace-nowrap text-base font-black text-amber-900">฿{totalRevenue.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="block text-[9px] text-amber-700">ยอดออเดอร์ไม่รวมยกเลิก</span>
          </div>
        </div>
      </div>

      {/* Round progress and step navigation */}
      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6" aria-label="ขั้นตอนของรอบการปลูก">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">ความคืบหน้ารอบการปลูก</h2>
            <p className="mt-1 text-xs text-slate-500">กดขั้นตอนที่ทำแล้วเพื่อดูวันที่บันทึกไว้</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
            {isRoundCompleted ? 'ครบทั้ง 8 ขั้นตอนแล้ว' : `รอดำเนินการขั้นตอนที่ ${currentStep} จาก 8`}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={8} aria-valuenow={isRoundCompleted ? 8 : currentStep}>
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(isRoundCompleted ? 8 : currentStep) * 12.5}%` }} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 2xl:grid-cols-8">
          {STEPS.map((step) => {
            const isCompleted = step.number < currentStep || (isRoundCompleted && step.number === 8);
            const isCurrent = step.number === currentStep && !isRoundCompleted;
            const isSelected = step.number === activeStepTab;
            const unsoldStep = round.closure_reason === 'unsold' && step.number === 7;
            const recordedDate = unsoldStep ? round.completed_date : (round as any)[step.field];
            return (
              <button
                key={step.number}
                type="button"
                disabled={step.number > currentStep}
                onClick={() => handleSelectStepTab(step.number)}
                aria-pressed={isSelected}
                aria-current={isCurrent ? 'step' : undefined}
                className={`min-h-28 rounded-2xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
                  isSelected ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100' : isCompleted ? 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/50' : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400'
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-1">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-sm ${isCompleted || isCurrent ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                    {isCompleted ? <Check className="h-4 w-4" /> : step.icon}
                  </span>
                  <span className={`min-w-0 text-right text-[10px] font-bold leading-tight ${isCurrent ? 'text-emerald-700' : isCompleted ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isCurrent ? 'รอดำเนินการ' : isCompleted ? 'เสร็จแล้ว' : 'ยังไม่ถึง'}
                  </span>
                </div>
                <span className={`block text-xs font-bold leading-snug ${isSelected || isCompleted ? 'text-slate-900' : 'text-slate-500'}`}>
                  {step.number}. {unsoldStep ? 'มีผักขายไม่ออก' : step.title.replace(/^\d+\.\s*/, '')}
                </span>
                <span className="mt-1 block text-[11px] text-slate-500">
                  {recordedDate ? formatDateDMY(String(recordedDate)) : isCurrent ? 'รอบันทึกวันที่' : '—'}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Selected step details */}
      <section className="bg-gradient-to-br from-white to-emerald-50/30 rounded-3xl p-5 sm:p-8 border border-emerald-100 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-emerald-100/80 pb-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{STEPS[activeStepTab - 1].icon}</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100/70 px-2.5 py-0.5 rounded-full">
                  ขั้นตอนที่ {activeStepTab} จาก 8
                </span>
                {!isViewingPastStep && (
                  <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    รอดำเนินการ
                  </span>
                )}
                {isViewingPastStep && (
                  <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    ดูข้อมูลที่บันทึกไว้
                  </span>
                )}
              </div>
              <h2 className="text-xl font-black text-slate-900 mt-1">
                {round.closure_reason === 'unsold' && activeStepTab === 7 ? 'มีผักขายไม่ออก' : STEPS[activeStepTab - 1].title.replace(/^\d+\.\s*/, '')}
              </h2>
              <p className="mt-1 text-sm text-slate-600">{STEPS[activeStepTab - 1].subtitle}</p>
            </div>
          </div>
        </div>

        {isViewingPastStep && (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            {isRoundCompleted ? 'รอบนี้สิ้นสุดแล้ว ข้อมูลขั้นตอนต่าง ๆ ใช้สำหรับดูย้อนหลัง' : 'ขั้นตอนนี้บันทึกแล้ว เลือกขั้นตอนที่รอดำเนินการด้านบนเพื่อทำต่อ'}
          </p>
        )}

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
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(240px,320px)] lg:items-start">
          {/* Left Column: Date Input & Details */}
          <div className="space-y-4">
            {activeStepTab === 5 ? (
              <div className={`rounded-2xl border p-4 text-xs leading-relaxed ${round.booking_opens_at ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                {isViewingPastStep
                  ? round.booking_opens_at ? `เปิดรอบจองเมื่อ ${formatDateTimeDMY(round.booking_opens_at)}` : 'ยังไม่มีวันเปิดรอบจองที่บันทึกไว้'
                  : isBookingConfirmed
                  ? `เปิดรอบจองแล้ว (กำหนดเริ่มรับจอง ${formatDateTimeDMY(round.booking_opens_at)}) ยืนยันเพื่อไปยังขั้นตอนถัดไปได้`
                  : 'ขั้นตอนนี้ต้องเปิดรอบจองจากหน้า “การเปิดสั่งจองล่วงหน้า” ก่อน จึงจะยืนยันสถานะถัดไปได้'}
              </div>
            ) : <div>
              <label className="font-bold text-slate-800 block text-xs sm:text-sm mb-1.5">
                {isViewingPastStep ? 'วันที่บันทึก: ' : 'เลือก'}{STEPS[activeStepTab - 1].title.replace(/^\d+\.\s*/, '')} {!isViewingPastStep && <span className="text-rose-500">*</span>}
              </label>
              <div className="relative max-w-sm">
                <input
                  type="date"
                  value={inputDate}
                  onChange={(e) => setInputDate(e.target.value)}
                  disabled={isViewingPastStep}
                  className="w-full p-3 rounded-2xl border border-slate-300 bg-white font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm shadow-2xs disabled:cursor-default disabled:bg-slate-50"
                />
              </div>
              {!isViewingPastStep && <p className="text-[11px] text-slate-500 mt-1.5">
                {activeStepTab === 1 && '🌱 ระบุวันที่เริ่มปักเมล็ดลงฟองน้ำเพาะกล้า'}
                {activeStepTab === 2 && '🧪 ระบุวันที่เริ่มให้ปุ๋ย AB สูตรอนุบาล (ปกติ 5-7 วันหลังปักเม็ด)'}
                {activeStepTab === 3 && '🌱 ระบุวันเริ่มปลูกหลังจากใส่ปุ๋ยและอนุบาลต้นกล้า'}
                {activeStepTab === 4 && '🌿 ระบบแสดงวันเดียวกับวันเริ่มปลูกก่อน เปลี่ยนได้ตามวันที่ย้ายลงรางปลูกจริง'}
                {activeStepTab === 6 && '🧺 ระบุวันที่ผลผลิตเติบโตเต็มที่ พร้อมเก็บเกี่ยวและส่งมอบ/ขาย'}
                {activeStepTab === 7 && '🏷️ ระบุวันที่ผลผลิตในรอบนี้ถูกจองหรือขายหมดแล้ว'}
                {activeStepTab === 8 && '🏁 ระบุวันที่จัดส่งมอบเสร็จสิ้น และปิดรอบการปลูก'}
              </p>}
            </div>}

            {/* Special Feature for Step 4: Auto Harvest Calculation per Vegetable */}
            {activeStepTab === 4 && (
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
                                    disabled={isViewingPastStep}
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
                              วันปลูกจริง ({inputDate ? formatDateDMY(inputDate) : 'ยังไม่เลือก'}) + {itemDays} วัน ➔{' '}
                              <strong className="text-sky-950 font-black underline">
                                พร้อมเก็บและขาย: {formatDateDMY(itemHarvestDate)}
                              </strong>
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-3 bg-white rounded-xl border border-sky-100 text-xs text-sky-900">
                      วันปลูกจริง ({inputDate ? formatDateDMY(inputDate) : 'ยังไม่เลือก'}) + {growingDays} วัน ➔{' '}
                      <strong className="font-bold underline">พร้อมเก็บและขาย: {formatDateDMY(calculatedHarvestDate)}</strong>
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-sky-800/80 pt-1 border-t border-sky-200/60 flex items-center gap-1.5">
                  <span className="font-bold">💡 หมายเหตุ:</span>
                  <span>
                    วันที่พร้อมเก็บและขายคำนวณแยกของแต่ละผัก โดยอิงจาก <strong>จำนวนวันปลูกที่กรอกตอนเพิ่มผักในรอบนี้</strong> + <strong>วันปลูกจริง (Step 4)</strong>
                  </span>
                </p>
              </div>
            )}

            {/* Special Feature for Step 5: Display Harvest / Ready-to-Sell Dates as Decision Aid */}
            {activeStepTab === 5 && (
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

                      // Booking dates are managed on the booking page, not this form.
                      const daysDiff = differenceInBangkokCalendarDays(round.booking_opens_at, itemHarvestDate);

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
                                ระยะปลูก {itemDays} วัน {round.transplant_date ? `(วันปลูกจริง: ${formatDateDMY(round.transplant_date)})` : ''}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                            <div className="bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200/60 flex items-center gap-1.5 text-xs text-emerald-900">
                              <Calendar className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                              <span>
                                พร้อมเก็บและขาย:{' '}
                                <strong className="text-emerald-950 font-black underline">
                                  {formatDateDMY(itemHarvestDate)}
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
                                  : `⚠️ วันเปิดจองช้ากว่าวันเก็บเกี่ยวที่คำนวณไว้ ${Math.abs(daysDiff)} วัน`}
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
                        {round.expected_harvest_date ? formatDateDMY(round.expected_harvest_date) : 'ยังไม่มีข้อมูล'}
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

            {/* Only the current step can advance the round. */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              {isRoundCompleted ? (
                <div className="inline-flex items-center gap-2 rounded-2xl border border-purple-200 bg-purple-50 px-5 py-3 text-xs font-bold text-purple-800 sm:text-sm">
                  <CheckCircle2 className="h-4 w-4 text-purple-600" />
                  <span>สิ้นสุดรอบการปลูกแล้ว{round.completed_date ? ` เมื่อ ${formatDateDMY(round.completed_date)}` : ''}</span>
                </div>
              ) : isViewingPastStep ? (
                <button type="button" onClick={() => handleSelectStepTab(currentStep)} className="rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-bold text-emerald-700 hover:bg-emerald-50">
                  กลับไปขั้นตอนที่รอดำเนินการ
                </button>
              ) : <>
                {(activeStepTab !== 5 || isBookingConfirmed) && (
                  <button type="button" onClick={handleConfirmStepUpdate} disabled={updatingStep || !inputDate}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
                    <Check className="h-4 w-4" />
                    {updatingStep ? 'กำลังบันทึก...' : activeStepTab === 8 ? 'ยืนยันสิ้นสุดรอบ' : activeStepTab === 5 ? 'ยืนยันเปิดจองและไปขั้นตอนถัดไป' : 'บันทึกวันที่และไปขั้นตอนถัดไป'}
                  </button>
                )}
                {activeStepTab === 5 && (
                  <Link to="/admin/bookings" className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold ${isBookingConfirmed ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50' : 'bg-amber-500 text-white hover:bg-amber-600'}`}>
                    <BookmarkCheck className="h-4 w-4" />
                    {isBookingConfirmed ? 'จัดการการจอง' : 'ไปเปิดรับจอง'}
                  </Link>
                )}
                {nextStepInfo && <span className="text-xs text-slate-500">ขั้นตอนถัดไป: {nextStepInfo.title.replace(/^\d+\.\s*/, '')}</span>}
              </>}
            </div>
            {(round.closure_reason === 'unsold' || (!isViewingPastStep && (activeStepTab === 6 || activeStepTab === 7) && currentStep >= 6 && !round.sold_out_date && ['booking_open','booking_closed','harvested'].includes(round.status))) && <UnsoldRoundClose round={round} onChanged={loadRound} />}
          </div>

          <aside className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-2xs" aria-labelledby="round-crops-heading">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 id="round-crops-heading" className="text-sm font-extrabold text-slate-900">ผักที่ปลูกในรอบนี้</h3>
              <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                {(round.round_items || []).length} รายการ
              </span>
            </div>
            {round.round_items?.length ? (
              <ul className="max-h-72 space-y-2 overflow-y-auto">
                {round.round_items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                    <span className="min-w-0 truncate text-sm font-semibold text-slate-800">{item.crop_name || item.crops?.name || 'ผัก'}</span>
                    <span className="shrink-0 text-xs font-bold text-emerald-700">
                      {item.plant_count == null ? 'ไม่ระบุจำนวน' : `${Number(item.plant_count).toLocaleString('th-TH')} ต้น`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">ยังไม่มีรายการผักในรอบนี้</p>
            )}
          </aside>
        </div>
      </section>

      <div className="space-y-1">
        <h2 className="text-lg font-extrabold text-slate-900">ยอดจองและคำสั่งซื้อ</h2>
        <p className="text-sm text-slate-500">ดูน้ำหนักที่จอง น้ำหนักที่ชั่ง และคำสั่งจองของลูกค้าในรอบนี้</p>
      </div>
      <RoundWeightSummary round={round} />

      {/* Customer Orders in this Round */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              คำสั่งจองของลูกค้าในรอบนี้ ({orders.length} ออเดอร์)
            </h2>
            <p className="text-xs text-slate-400">ออเดอร์ที่ลูกค้าสั่งจองในรอบนี้ทั้งหมด</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">{round.status === 'booking_open' && <ChatOrderButton roundId={round.id} onCreated={loadRound}/>}<Link
            to={`/admin/orders?round_id=${round.id}`}
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
          >
            ไปที่หน้าจัดการออเดอร์ →
          </Link></div>
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
                      <div className="font-medium text-slate-800">{(ord.customer_name || ord.profiles?.full_name) || 'ลูกค้า'}{ord.order_source === 'facebook_chat' && <span className="ml-2 text-xs text-blue-700">จากแชตแฟนเพจ</span>}</div>
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

      <div className="space-y-1">
        <h2 className="text-lg font-extrabold text-slate-900">ข้อมูลผลผลิตและจัดการการสั่งซื้อ</h2>
        <p className="text-sm text-slate-500">บันทึกผักเสียและกำหนดจำนวนที่ลูกค้าแต่ละคนจองได้</p>
      </div>
      <PlantLossPanel roundId={round.id} onChanged={loadRound} />
      <PurchaseLimitPanel round={round} onChanged={loadRound} />
    </div>
  );
};
export default AdminRoundDetailPage;
