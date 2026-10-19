import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, ChevronDown, Sprout } from 'lucide-react';
import type { PlotOccupyingRound } from '../../types/index.js';
import { formatDateDMY } from '../../lib/dateFormat.js';
import { Badge } from '../common/Badge.js';

const STEP_NAMES: Record<number, string> = {
  1: 'วันที่ปักเม็ด', 2: 'วันใส่ปุ๋ย', 3: 'วันเริ่มปลูก', 4: 'วันปลูกจริง',
  5: 'เปิดสั่งจองล่วงหน้า', 6: 'พร้อมเก็บและขาย', 7: 'ขายหมด', 8: 'สิ้นสุดรอบ',
};

export const PlotRoundTimeline: React.FC<{ rounds: PlotOccupyingRound[] }> = ({ rounds }) => {
  const grouped = new Map<string, PlotOccupyingRound[]>();
  for (const round of rounds) grouped.set(round.id, [...(grouped.get(round.id) || []), round]);

  return (
    <section className="mt-5 space-y-2.5 border-t border-slate-100 pt-4" aria-label="รอบปลูกและวันที่สำคัญ">
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
          <Sprout className="h-4 w-4 text-emerald-600" />รอบปลูกในแปลงนี้
        </h4>
        <span className="text-[11px] font-semibold text-slate-500">{grouped.size} รอบ</span>
      </div>
      {grouped.size === 0 && <p className="rounded-xl border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-400">ยังไม่มีรอบปลูกใช้แปลงนี้</p>}
      {Array.from(grouped.entries()).map(([id, crops], roundIndex) => {
        const round = crops[0];
        const dates = [
          ['วันที่ปักเม็ด', round.seed_date], ['วันใส่ปุ๋ย', round.fertilizing_date],
          ['วันเริ่มปลูก', round.planting_start_date], ['วันปลูกจริง', round.transplant_date],
        ];
        const totalSlots = crops.reduce((sum, crop) => sum + Number(crop.used_slots || 0), 0);
        const firstHarvest = crops.map((crop) => crop.calculated_harvest_date).filter((date): date is string => !!date).sort()[0];
        return (
          <details key={id} open={roundIndex === 0} className="group/round overflow-hidden rounded-xl border border-slate-200 bg-white">
            <summary className="cursor-pointer list-none space-y-2 bg-slate-50/70 p-3 transition hover:bg-slate-100/70 [&::-webkit-details-marker]:hidden">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 break-words text-xs font-extrabold text-slate-900">{round.name}</span>
                <div className="flex shrink-0 items-center gap-2">{round.status && <Badge status={round.status} type="round" />}<ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open/round:rotate-180" /></div>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500"><strong className="text-slate-700">{totalSlots.toLocaleString()} ต้น</strong> · {crops.map((crop) => crop.crop_name).join(', ')}</p>
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700"><CalendarDays className="h-3.5 w-3.5 shrink-0" />{firstHarvest ? `เริ่มเก็บเกี่ยวประมาณ ${formatDateDMY(firstHarvest)}` : 'รอบันทึกวันปลูกจริง'}</p>
            </summary>
            {!!round.current_step && <p className="border-t border-slate-100 px-3 pt-3 text-[11px] text-slate-500">ขั้นตอนปัจจุบัน: <span className="font-semibold text-slate-700">{STEP_NAMES[round.current_step] || '-'}</span></p>}
            <dl className="grid grid-cols-2 gap-x-3 gap-y-3 p-3">
              {dates.map(([label, date]) => (
                <div key={label}>
                  <dt className="text-[11px] text-slate-500">{label}</dt>
                  <dd className={`mt-1 text-xs ${date ? 'font-bold text-slate-800' : 'text-slate-400'}`}>{date ? formatDateDMY(date) : 'ยังไม่บันทึก'}</dd>
                </div>
              ))}
            </dl>
            <div className="mx-3 mb-3 space-y-2 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-900"><CalendarDays className="h-3.5 w-3.5" />วันเก็บเกี่ยว (ระบบคำนวณ)</p>
              {crops.map((crop, index) => (
                <div key={`${crop.crop_name}-${index}`} className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-xs">
                  <span className="text-emerald-800">{crop.crop_name}<span className="ml-1 text-[10px] text-emerald-700/70">{crop.growing_days ? `(${crop.growing_days} วัน)` : ''}</span></span>
                  <strong className={crop.calculated_harvest_date ? 'text-emerald-950' : 'text-[11px] font-medium text-slate-500'}>{crop.calculated_harvest_date ? formatDateDMY(crop.calculated_harvest_date) : 'รอบันทึกวันปลูกจริง'}</strong>
                </div>
              ))}
              <p className="border-t border-emerald-200/60 pt-2 text-[10px] leading-relaxed text-emerald-800/70">คำนวณจากวันปลูกจริง + จำนวนวันปลูกของผักแต่ละชนิด</p>
            </div>
            <Link to={`/admin/rounds/${id}`} className="mx-3 mb-3 flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800">ดูรายละเอียดรอบปลูก<ArrowUpRight className="h-3.5 w-3.5" /></Link>
          </details>
        );
      })}
    </section>
  );
};
