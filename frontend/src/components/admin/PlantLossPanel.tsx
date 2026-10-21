import React, { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Plus, X } from 'lucide-react';
import { api } from '../../lib/api.js';
import { formatDateDMY, formatDateTimeDMY, toBangkokDateString } from '../../lib/dateFormat.js';
import { plantCountToKg } from '../../lib/plantingQuantities.js';
import { getLossPlotChoices, getLossItemsForPlot, isValidLossDate } from '../../lib/plantLossWizard.js';

interface LossItem {
  id: string; crop_name: string; original_plant_count: number; lost_plant_count: number;
  remaining_plant_count: number; original_estimated_kg: number; remaining_estimated_kg: number;
  lost_estimated_kg: number; plants_per_kg: number; is_approximate: boolean; shortage_kg: number;
  plots: { id: string; name: string }[];
}
interface LossEntry {
  id: string; round_item_id: string; plot_name: string | null; loss_date: string; plant_count: number;
  reason: string; note: string | null; estimated_loss_kg: number; stage: number;
  recorded_by_email: string; created_at: string; image_url: string | null;
  voided_at: string | null; void_reason: string | null;
}
interface LossData {
  round: { status: string; seed_date: string | null; created_at: string; sold_out_date: string | null; completed_date: string | null };
  items: LossItem[]; history: LossEntry[];
}
const stages = ['ปักเม็ด','ใส่ปุ๋ย','เริ่มปลูก','ปลูกจริง','เปิดจองล่วงหน้า','พร้อมเก็บและขาย','รอขายหมด','สิ้นสุดรอบ'];
const number = (value: number) => value.toLocaleString('th-TH', { maximumFractionDigits: 2 });
const inputClass = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100';
const lossSteps = ['เลือกแปลง', 'เลือกชนิดผัก', 'จำนวนต้น', 'สาเหตุ', 'วันที่พบ'];

export const PlantLossPanel: React.FC<{ roundId: string; onChanged: () => Promise<void> }> = ({ roundId, onChanged }) => {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const [data, setData] = useState<LossData | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [formStep, setFormStep] = useState(1);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const [saving, setSaving] = useState(false);
  const [itemId, setItemId] = useState('');
  const [plotId, setPlotId] = useState('');
  const [date, setDate] = useState(toBangkokDateString(new Date().toISOString()) || '');
  const [count, setCount] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [voidEntry, setVoidEntry] = useState<LossEntry | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { setData(await api.get<LossData>(`/admin/rounds/${roundId}/losses`)); }
    catch (err: any) { setError(err.message || 'โหลดประวัติผักเสียหายไม่สำเร็จ'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [roundId]);
  useEffect(() => { if (open) stepHeading.current?.focus(); }, [open, formStep]);
  const plotChoices = getLossPlotChoices(data?.items || []);
  const plotItems = getLossItemsForPlot(data?.items || [], plotId);
  const selected = plotItems.find(item => item.id === itemId);
  const selectedPlot = plotChoices.find(plot => plot.id === plotId);
  const quantity = Number(count);
  const validCount = !!selected && Number.isInteger(quantity) && quantity > 0 && quantity <= selected.remaining_plant_count;
  const afterCount = selected ? Math.max(0, selected.remaining_plant_count - (validCount ? quantity : 0)) : 0;
  const afterKg = selected ? plantCountToKg(afterCount, selected.plants_per_kg) : 0;
  const canRecord = !!data && !['completed','cancelled'].includes(data.round.status) && !data.round.sold_out_date && !data.round.completed_date;
  const today = toBangkokDateString(new Date().toISOString()) || '';
  const minDate = data?.round.seed_date || toBangkokDateString(data?.round.created_at) || '';
  const validDate = isValidLossDate(date, minDate, today);
  const formValid = !!selectedPlot && !!selected && validCount && !!reason.trim() && validDate;
  const stepValid = [!!selectedPlot, !!selected, validCount, !!reason.trim(), formValid][formStep - 1];
  const totals = data?.items.reduce((sum, item) => ({ original: sum.original + item.original_plant_count, lost: sum.lost + item.lost_plant_count, remaining: sum.remaining + item.remaining_plant_count }), { original: 0, lost: 0, remaining: 0 });
  const shortage = data?.items.reduce((sum, item) => sum + item.shortage_kg, 0) || 0;
  const start = () => {
    setItemId(''); setPlotId(''); setFormStep(1);
    setCount(''); setReason(''); setNote(''); setRequestId(crypto.randomUUID());
    setDate(today); setError(''); setMessage(''); setVoidEntry(null); setOpen(true);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (saving || !stepValid) return;
    if (formStep < 5) { setError(''); setFormStep(step => step + 1); return; }
    if (!formValid || !selected) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await api.post(`/admin/rounds/${roundId}/losses`, { request_id: requestId, round_item_id: itemId,
        plot_id: plotId, loss_date: date, plant_count: quantity, reason: reason.trim(), note: note.trim() });
      setOpen(false); setMessage('บันทึกผักเสียหายแล้ว และคำนวณจำนวนต้นกับน้ำหนักคงเหลือใหม่เรียบร้อย');
      await load(); await onChanged();
    } catch (err: any) { setError(err.message || 'บันทึกผักเสียหายไม่สำเร็จ'); }
    finally { setSaving(false); }
  };
  const voidLoss = async (event: React.FormEvent) => {
    event.preventDefault(); if (!voidEntry || saving) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await api.post(`/admin/rounds/${roundId}/losses/${voidEntry.id}/void`, { round_item_id: voidEntry.round_item_id, reason: voidReason });
      setVoidEntry(null); setMessage('ยกเลิกรายการแล้ว ประวัติเดิมยังคงอยู่และยอดคงเหลือถูกคำนวณใหม่');
      await load(); await onChanged();
    } catch (err: any) { setError(err.message || 'ยกเลิกรายการไม่สำเร็จ'); }
    finally { setSaving(false); }
  };

  return <section className="space-y-3">
    <button type="button" aria-expanded={expanded} aria-controls={panelId} disabled={saving} onClick={() => setExpanded(value => !value)} className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-bold text-rose-700 shadow-sm hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50">
      <AlertTriangle aria-hidden="true" className="h-4 w-4" />ผักเสียหายระหว่างปลูก
      {!!totals?.lost && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs">สูญเสีย {number(totals.lost)} ต้น</span>}
      <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
    </button>
    {!expanded && shortage > 0 && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900"><AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" /><span>ผลผลิตคาดการณ์ไม่พอยอดจอง ขาด {number(shortage)} กก.</span><button type="button" onClick={() => setExpanded(true)} className="font-bold underline">ดูรายละเอียด</button></div>}
    <div id={panelId} hidden={!expanded} className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-extrabold text-slate-900">ผักเสียหายระหว่างปลูก</h2><p className="mt-1 text-xs text-slate-500">บันทึกได้หลายครั้ง ตั้งแต่ปักเม็ดจนถึงพร้อมเก็บและขาย พร้อมประวัติย้อนหลัง</p></div>
      {canRecord && !open && <button type="button" onClick={start} disabled={saving || loading || !data?.items.some(i => i.remaining_plant_count > 0)} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"><Plus className="h-4 w-4" />บันทึกผักเสียหาย</button>}
    </div>
    {loading && <p className="text-sm text-slate-500">กำลังโหลดข้อมูลผักเสียหาย...</p>}
    {error && <div role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}{!data && <button type="button" onClick={load} className="ml-3 font-bold underline">ลองใหม่</button>}</div>}
    {message && <p role="status" className="flex gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="h-5 w-5 shrink-0" />{message}</p>}
    {data && <>
      {!open && <>
      <div className="grid grid-cols-3 gap-2 sm:gap-4">{[
        ['ปลูกเริ่มต้น',totals!.original,'text-slate-900'],['สูญเสียสะสม',totals!.lost,'text-rose-700'],['ต้นคงเหลือ',totals!.remaining,'text-emerald-800'],
      ].map(([label,value,color]) => <div key={label} className="rounded-2xl bg-slate-50 p-3 sm:p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className={`mt-1 text-lg font-extrabold sm:text-2xl ${color}`}>{number(Number(value))} <span className="text-xs font-semibold">ต้น</span></p></div>)}</div>
      {data.items.map(item => <div key={item.id} className="space-y-2 rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-slate-900">{item.crop_name}</h3><span className="text-xs text-slate-500">อัตราสูญเสีย {item.original_plant_count ? number(item.lost_plant_count / item.original_plant_count * 100) : 0}%</span></div>
        <p className="text-sm text-slate-600">ปลูก {number(item.original_plant_count)} ต้น · เสียหาย <strong className="text-rose-700">{number(item.lost_plant_count)}</strong> ต้น · เหลือ <strong className="text-emerald-800">{number(item.remaining_plant_count)}</strong> ต้น</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm"><span>น้ำหนักคงเหลือคาดการณ์ <strong className="text-emerald-800">{number(item.remaining_estimated_kg)} กก.</strong></span><span className="text-rose-700">ลดลง {number(item.lost_estimated_kg)} กก.</span></div>
        <p className="text-xs text-slate-500">คำนวณจาก {number(item.plants_per_kg)} ต้น/กก. และปัดลงเป็นกิโลกรัมเต็ม{item.is_approximate ? ' · รอบเดิมนี้ใช้จำนวนต้นโดยประมาณจากน้ำหนักเริ่มต้น' : ''}</p>
        {item.shortage_kg > 0 && <p role="alert" className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900"><AlertTriangle className="h-5 w-5 shrink-0" />ผลผลิตคาดการณ์ไม่เพียงพอต่อยอดจอง ขาด {number(item.shortage_kg)} กก. กรุณาจัดเตรียมผักทดแทน โดยยอดจองลูกค้ายังคงเดิม</p>}
      </div>)}
      {!canRecord && <p className="text-xs text-slate-500">รอบนี้ขายหมด สิ้นสุด หรือยกเลิกแล้ว ดูประวัติได้ แต่ไม่สามารถเพิ่มหรือยกเลิกรายการเสียหายได้</p>}
      </>}
      {open && <form onSubmit={submit} className="space-y-4 rounded-2xl border border-rose-200 bg-rose-50/40 p-4">
        <div className="flex items-center justify-between gap-2"><h3 ref={stepHeading} tabIndex={-1} className="font-extrabold text-slate-900 outline-none">ขั้นตอนที่ {formStep} จาก 5 · {lossSteps[formStep - 1]}</h3><button type="button" aria-label="ปิดแบบฟอร์ม" disabled={saving} onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-rose-100"><X className="h-4 w-4" /></button></div>
        <ol aria-label="ขั้นตอนบันทึกผักเสียหาย" className="grid grid-cols-5 gap-1.5">{lossSteps.map((label,index) => <li key={label} aria-current={formStep === index + 1 ? 'step' : undefined} className={`rounded-xl p-2 text-center ${formStep === index + 1 ? 'bg-rose-600 text-white' : index + 1 < formStep ? 'bg-emerald-100 text-emerald-900' : 'bg-white text-slate-400'}`}><span className="text-sm font-extrabold">{index + 1}</span><span className="mt-1 block text-[10px] font-semibold sm:text-xs">{label}</span></li>)}</ol>
        {formStep > 1 && <p className="text-xs leading-relaxed text-slate-500">แปลง: {selectedPlot?.name}{selected && ` · ผัก: ${selected.crop_name}`}{formStep > 3 && ` · เสียหาย ${number(quantity)} ต้น`}</p>}
        <fieldset disabled={saving} className="space-y-4">
          {formStep === 1 && <label className="block text-sm font-semibold text-slate-700">แปลงที่พบผักเสียหาย <span className="text-rose-600">*</span><select required value={plotId} onChange={e => { setPlotId(e.target.value); setItemId(''); setCount(''); }} className={inputClass}><option value="">เลือกแปลงที่พบ</option>{plotChoices.map(plot => <option key={plot.id} value={plot.id}>{plot.name}</option>)}</select><span className="mt-2 block text-xs font-normal text-slate-500">แสดงเฉพาะแปลงที่มีผักปลูกอยู่ในรอบนี้</span></label>}
          {formStep === 1 && !plotChoices.length && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">ยังไม่พบแปลงที่มีผักปลูกในรอบนี้ กรุณาตรวจสอบข้อมูลที่ <a href="/admin/plots" target="_blank" rel="noreferrer" className="font-bold underline">จัดการแปลงปลูก</a> แล้วโหลดหน้านี้ใหม่</p>}
          {formStep === 2 && <label className="block text-sm font-semibold text-slate-700">ชนิดผักที่เสียหาย <span className="text-rose-600">*</span><select required value={itemId} onChange={e => { setItemId(e.target.value); setCount(''); }} className={inputClass}><option value="">เลือกชนิดผัก</option>{plotItems.map(item => <option key={item.id} value={item.id}>{item.crop_name} (คงเหลือในรอบ {number(item.remaining_plant_count)} ต้น)</option>)}</select><span className="mt-2 block text-xs font-normal text-slate-500">เลือกได้เฉพาะผักที่ปลูกในแปลงที่เลือก</span></label>}
          {formStep === 3 && <label className="block text-sm font-semibold text-slate-700">จำนวนต้นที่เสียหาย <span className="text-rose-600">*</span><input type="number" inputMode="numeric" required min={1} max={selected?.remaining_plant_count} step={1} value={count} onChange={e => setCount(e.target.value)} className={inputClass} placeholder="เช่น 50" /><span className="mt-2 block text-xs font-normal text-slate-500">กรอกจำนวนเต็ม ตั้งแต่ 1 ถึง {number(selected?.remaining_plant_count || 0)} ต้น (ยอดคงเหลือของผักชนิดนี้ทั้งรอบ)</span></label>}
          {formStep === 4 && <><label className="block text-sm font-semibold text-slate-700">สาเหตุที่ผักเสียหาย <span className="text-rose-600">*</span><input required maxLength={300} value={reason} onChange={e => setReason(e.target.value)} className={inputClass} placeholder="เช่น รากเน่า แมลง โรค หรือไม่ทราบสาเหตุ" /></label><label className="block text-sm font-semibold text-slate-700">หมายเหตุ (ถ้ามี)<textarea maxLength={2000} value={note} onChange={e => setNote(e.target.value)} rows={2} className={inputClass} /></label></>}
          {formStep === 5 && <><label className="block text-sm font-semibold text-slate-700">วันที่พบผักเสียหาย <span className="text-rose-600">*</span><input type="date" required value={date} min={minDate || undefined} max={today} onChange={e => setDate(e.target.value)} className={inputClass} /></label><div className="space-y-2 rounded-xl bg-white p-4 text-sm text-slate-700"><h4 className="font-bold text-slate-900">ตรวจสอบก่อนบันทึก</h4><p>แปลง: <strong>{selectedPlot?.name}</strong></p><p>ชนิดผัก: <strong>{selected?.crop_name}</strong></p><p>จำนวนเสียหาย: <strong>{number(quantity)} ต้น</strong></p><p className="break-words">สาเหตุ: {reason}</p>{note && <p className="break-words">หมายเหตุ: {note}</p>}<p>วันที่พบ: <strong>{formatDateDMY(date)}</strong></p></div></>}
        </fieldset>
        {formStep >= 3 && validCount && <p role="status" className="rounded-xl bg-white p-3 text-sm text-slate-700">หลังบันทึก: เหลือ <strong>{number(afterCount)} ต้น</strong> ≈ <strong>{number(afterKg)} กก.</strong> · น้ำหนักคาดการณ์ลดลง <strong className="text-rose-700">{number(selected!.remaining_estimated_kg - afterKg)} กก.</strong></p>}
        <div className="flex items-center justify-between gap-3">{formStep > 1 ? <button type="button" disabled={saving} onClick={() => { setError(''); setFormStep(step => step - 1); }} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-50">ย้อนกลับ</button> : <span />}<button type="submit" disabled={saving || !stepValid} className="rounded-xl bg-rose-600 px-5 py-3 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50">{saving ? 'กำลังบันทึก...' : formStep < 5 ? 'ถัดไป' : 'ยืนยันบันทึกผักเสียหาย'}</button></div>
      </form>}
      {!open && <details className="rounded-2xl border border-slate-200 p-4" open={data.history.length > 0}>
        <summary className="cursor-pointer text-sm font-bold text-slate-800">ประวัติผักเสียหาย ({data.history.length} รายการ)</summary>
        {!data.history.length && <p className="mt-3 text-sm text-slate-500">ยังไม่มีการบันทึกผักเสียหายในรอบนี้</p>}
        <div className="mt-3 space-y-3">{data.history.map(entry => <article key={entry.id} className={`space-y-2 rounded-xl border p-3 text-sm ${entry.voided_at ? 'border-slate-200 bg-slate-50' : 'border-rose-100 bg-white'}`}>
          <div className="flex flex-wrap justify-between gap-2"><strong>{data.items.find(i => i.id === entry.round_item_id)?.crop_name} · {number(entry.plant_count)} ต้น</strong><span className={entry.voided_at ? 'text-slate-500' : 'text-rose-700'}>{entry.voided_at ? 'ยกเลิกรายการแล้ว' : `น้ำหนักลดลง ณ เวลาบันทึก ${number(Number(entry.estimated_loss_kg))} กก.`}</span></div>
          <p className="text-slate-600">{formatDateDMY(entry.loss_date)} · {entry.plot_name || 'ไม่ระบุแปลง'} · สถานะ {stages[entry.stage-1]}</p>
          <p className="break-words">สาเหตุ: {entry.reason}{entry.note && <span className="block text-slate-500">หมายเหตุ: {entry.note}</span>}</p>
          <p className="break-all text-xs text-slate-500">บันทึกโดย {entry.recorded_by_email} · {formatDateTimeDMY(entry.created_at)}</p>
          {entry.image_url && <a href={entry.image_url} target="_blank" rel="noreferrer" className="inline-block"><img src={entry.image_url} alt={`ภาพผักเสียหาย ${formatDateDMY(entry.loss_date)}`} className="h-24 w-32 rounded-lg object-cover" /></a>}
          {entry.voided_at ? <p className="text-xs text-slate-500">เหตุผลที่ยกเลิก: {entry.void_reason} · {formatDateTimeDMY(entry.voided_at)}</p> : canRecord && <button type="button" disabled={saving} onClick={() => { setVoidEntry(entry); setVoidReason(''); setOpen(false); setError(''); }} className="block text-xs font-semibold text-rose-700 underline">ยกเลิกรายการที่บันทึกผิด</button>}
          {voidEntry?.id === entry.id && <form onSubmit={voidLoss} className="space-y-2 rounded-xl bg-amber-50 p-3"><p className="text-xs text-amber-900">จำนวนต้นจะถูกคืนเข้าสู่ยอดคงเหลือ โดยยังเก็บประวัติเดิมไว้</p><label className="block text-xs font-semibold">เหตุผลที่ยกเลิก<input required disabled={saving} maxLength={500} value={voidReason} onChange={e => setVoidReason(e.target.value)} className={inputClass} placeholder="เช่น กรอกจำนวนผิด" /></label><div className="flex gap-3"><button disabled={saving} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white">{saving ? 'กำลังบันทึก...' : 'ยืนยันยกเลิกรายการ'}</button><button type="button" disabled={saving} onClick={() => setVoidEntry(null)} className="text-xs font-bold text-slate-600">กลับ</button></div></form>}
        </article>)}</div>
      </details>}
      <p className="text-xs leading-relaxed text-slate-500">น้ำหนักเป็นค่าคาดการณ์ตามจำนวนต้น ไม่ใช่น้ำหนักชั่งจริง การสูญเสียไม่คืนพื้นที่แปลงอัตโนมัติ และไม่เปลี่ยนจำนวนในออเดอร์ลูกค้า</p>
    </>}
    </div>
  </section>;
};
