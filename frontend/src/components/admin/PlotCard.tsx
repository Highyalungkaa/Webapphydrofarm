import React from 'react';
import { Edit2, Leaf, MapPin, Power, Trash2 } from 'lucide-react';
import type { Crop, Plot } from '../../types/index.js';
import { getPlotCropIds } from '../../lib/plotCrops.js';
import { PlotRoundTimeline } from './PlotRoundTimeline.js';

interface Props {
  plot: Plot;
  crops: Crop[];
  onEdit: (plot: Plot) => void;
  onToggle: (plot: Plot) => void;
  onDelete: (plot: Plot) => void;
}

export const PlotCard: React.FC<Props> = ({ plot, crops, onEdit, onToggle, onDelete }) => {
  const capacity = Number(plot.slot_capacity || 0);
  const used = Math.max(0, Math.min(capacity, Number(plot.used_slots || 0)));
  const free = Math.max(0, capacity - used);
  const percent = capacity > 0 ? Math.round((used / capacity) * 100) : 0;
  const cropIds = getPlotCropIds(plot);
  const state = !plot.is_active ? 'เลิกใช้งานแล้ว' : used === 0 ? 'ว่างพร้อมปลูก' : free === 0 ? 'เต็มแปลง' : 'กำลังปลูก';
  const statusStyle = !plot.is_active ? 'bg-slate-100 text-slate-500' : free === 0
    ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800';

  return (
    <article aria-label={plot.name} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className={`h-1 ${plot.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      <div className="p-4 sm:p-5">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="break-words text-lg font-extrabold leading-snug text-slate-900">{plot.name}</h3>
            <p className="mt-1 flex items-start gap-1 text-xs text-slate-500"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="break-words">{plot.zone_name}</span></p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${statusStyle}`}>{state}</span>
        </header>

        <dl className="mt-5 grid grid-cols-3 divide-x divide-slate-200 rounded-xl bg-slate-50 py-3">
          <div className="px-2 text-center"><dt className="text-[11px] text-slate-500">กำลังปลูก</dt><dd className="mt-1 text-xl font-black tabular-nums text-slate-900">{used.toLocaleString()}<span className="mt-0.5 block text-[10px] font-medium text-slate-500">ต้น</span></dd></div>
          <div className="px-2 text-center"><dt className="text-[11px] text-slate-500">ปลูกเพิ่มได้</dt><dd className="mt-1 text-xl font-black tabular-nums text-emerald-700">{free.toLocaleString()}<span className="mt-0.5 block text-[10px] font-medium text-slate-500">ต้น</span></dd></div>
          <div className="px-2 text-center"><dt className="text-[11px] text-slate-500">รองรับทั้งหมด</dt><dd className="mt-1 text-xl font-black tabular-nums text-slate-600">{capacity.toLocaleString()}<span className="mt-0.5 block text-[10px] font-medium text-slate-500">ต้น</span></dd></div>
        </dl>
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-500"><span>การใช้พื้นที่แปลง</span><span className="font-bold text-slate-700">{percent}%</span></div>
          <div role="progressbar" aria-label={`การใช้งานแปลง ${plot.name}`} aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={used} className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full transition-all ${percent >= 90 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${percent}%` }} />
          </div>
        </div>

        <section className="mt-5" aria-label="ผักที่ปลูกได้">
          <h4 className="mb-2 text-xs font-bold text-slate-700">ผักที่ปลูกได้ <span className="font-normal text-slate-400">{cropIds.length} ชนิด</span></h4>
          <div className="flex flex-wrap gap-1.5">
            {cropIds.map((id) => <span key={id} className="inline-flex max-w-full items-start gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-600"><Leaf className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /><span className="break-words">{crops.find((crop) => crop.id === id)?.name || (plot.crops?.id === id ? plot.crops.name : 'ไม่พบชนิดผัก')}</span></span>)}
          </div>
          {cropIds.length === 0 && <button type="button" onClick={() => onEdit(plot)} className="rounded-lg border border-dashed border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">+ กำหนดผักให้แปลงนี้</button>}
        </section>

        <PlotRoundTimeline rounds={plot.occupying_rounds || []} />
        {plot.notes && <p className="mt-4 break-words rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500"><span className="font-semibold">หมายเหตุ: </span>{plot.notes}</p>}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
        <button type="button" onClick={() => onEdit(plot)} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 transition hover:bg-emerald-50 hover:text-emerald-800"><Edit2 className="h-3.5 w-3.5" />แก้ไขแปลง</button>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onToggle(plot)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-medium text-slate-500 hover:bg-white hover:text-slate-800"><Power className="h-3.5 w-3.5" />{plot.is_active ? 'เลิกใช้งาน' : 'เปิดใช้งานอีกครั้ง'}</button>
          <button type="button" onClick={() => onDelete(plot)} aria-label={`ลบหรือเลิกใช้งานแปลง ${plot.name}`} title="ลบหรือเลิกใช้งานแปลง" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
        </div>
      </footer>
    </article>
  );
};
