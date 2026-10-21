import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Plus, X } from 'lucide-react';
import { api } from '../../lib/api.js';
import { formatDateDMY, formatDateTimeDMY, toBangkokDateString } from '../../lib/dateFormat.js';
import { plantCountToKg } from '../../lib/plantingQuantities.js';

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

export const PlantLossPanel: React.FC<{ roundId: string; onChanged: () => Promise<void> }> = ({ roundId, onChanged }) => {
  const [data, setData] = useState<LossData | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [itemId, setItemId] = useState('');
  const [plotId, setPlotId] = useState('');
  const [date, setDate] = useState(toBangkokDateString(new Date().toISOString()) || '');
  const [count, setCount] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [imagePath, setImagePath] = useState('');
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
  useEffect(() => {
    if (!image) { setPreview(''); return; }
    const url = URL.createObjectURL(image); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);
  const selected = data?.items.find(item => item.id === itemId);
  const quantity = Number(count);
  const validCount = !!selected && Number.isInteger(quantity) && quantity > 0 && quantity <= selected.remaining_plant_count;
  const afterCount = selected ? Math.max(0, selected.remaining_plant_count - (validCount ? quantity : 0)) : 0;
  const afterKg = selected ? plantCountToKg(afterCount, selected.plants_per_kg) : 0;
  const canRecord = !!data && !['completed','cancelled'].includes(data.round.status) && !data.round.sold_out_date && !data.round.completed_date;
  const today = toBangkokDateString(new Date().toISOString()) || '';
  const totals = data?.items.reduce((sum, item) => ({ original: sum.original + item.original_plant_count, lost: sum.lost + item.lost_plant_count, remaining: sum.remaining + item.remaining_plant_count }), { original: 0, lost: 0, remaining: 0 });
  const start = () => {
    const first = data?.items.find(item => item.remaining_plant_count > 0);
    setItemId(first?.id || ''); setPlotId(first?.plots.length === 1 ? first.plots[0].id : '');
    setCount(''); setReason(''); setNote(''); setImage(null); setImagePath(''); setRequestId(crypto.randomUUID());
    setDate(today); setError(''); setMessage(''); setVoidEntry(null); setOpen(true);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!validCount || !selected || saving) return;
    setSaving(true); setError(''); setMessage('');
    try {
      let path = imagePath;
      if (image && !path) {
        const base64 = await new Promise<string>((resolve,reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = () => reject(new Error('อ่านรูปภาพไม่สำเร็จ')); reader.readAsDataURL(image);
        });
        const uploaded = await api.post<{ path: string }>(`/admin/rounds/${roundId}/losses/image`, { mime_type: image.type, data: base64 });
        path = uploaded.path; setImagePath(path);
      }
      await api.post(`/admin/rounds/${roundId}/losses`, { request_id: requestId, round_item_id: itemId,
        plot_id: plotId || null, loss_date: date, plant_count: quantity, reason, note, image_path: path || null });
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

  return <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-extrabold text-slate-900">ผักเสียหายระหว่างปลูก</h2><p className="mt-1 text-xs text-slate-500">บันทึกได้หลายครั้ง ตั้งแต่ปักเม็ดจนถึงพร้อมเก็บและขาย พร้อมประวัติย้อนหลัง</p></div>
      {canRecord && <button type="button" onClick={start} disabled={saving || loading || !data?.items.some(i => i.remaining_plant_count > 0)} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"><Plus className="h-4 w-4" />บันทึกผักเสียหาย</button>}
    </div>
    {loading && <p className="text-sm text-slate-500">กำลังโหลดข้อมูลผักเสียหาย...</p>}
    {error && <div role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}{!data && <button type="button" onClick={load} className="ml-3 font-bold underline">ลองใหม่</button>}</div>}
    {message && <p role="status" className="flex gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="h-5 w-5 shrink-0" />{message}</p>}
    {data && <>
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
      {open && <form onSubmit={submit} className="space-y-4 rounded-2xl border border-rose-200 bg-rose-50/40 p-4">
        <div className="flex items-center justify-between gap-2"><h3 className="font-extrabold text-slate-900">บันทึกผักเสียหาย</h3><button type="button" aria-label="ปิดแบบฟอร์ม" disabled={saving} onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-rose-100"><X className="h-4 w-4" /></button></div>
        <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">ชนิดผัก <span className="text-rose-600">*</span><select required value={itemId} onChange={e => { setItemId(e.target.value); const item = data.items.find(i => i.id === e.target.value); setPlotId(item?.plots.length === 1 ? item.plots[0].id : ''); }} className={inputClass}>{data.items.map(item => <option key={item.id} value={item.id}>{item.crop_name} (เหลือ {number(item.remaining_plant_count)} ต้น)</option>)}</select></label>
          <label className="text-sm font-semibold text-slate-700">แปลงปลูก {selected?.plots.length ? <span className="text-rose-600">*</span> : null}<select required={!!selected?.plots.length} value={plotId} onChange={e => setPlotId(e.target.value)} className={inputClass}><option value="">{selected?.plots.length ? 'เลือกแปลงที่พบผักเสียหาย' : 'รอบนี้ไม่ได้ระบุแปลง'}</option>{selected?.plots.map(plot => <option key={plot.id} value={plot.id}>{plot.name}</option>)}</select></label>
          <label className="text-sm font-semibold text-slate-700">วันที่พบ <span className="text-rose-600">*</span><input type="date" required value={date} min={data.round.seed_date || toBangkokDateString(data.round.created_at) || undefined} max={today} onChange={e => setDate(e.target.value)} className={inputClass} /></label>
          <label className="text-sm font-semibold text-slate-700">จำนวนเสียหาย (ต้น) <span className="text-rose-600">*</span><input type="number" inputMode="numeric" required min={1} max={selected?.remaining_plant_count} step={1} value={count} onChange={e => setCount(e.target.value)} className={inputClass} placeholder="เช่น 50" /></label>
          <label className="text-sm font-semibold text-slate-700 sm:col-span-2">สาเหตุ <span className="text-rose-600">*</span><input required maxLength={300} value={reason} onChange={e => setReason(e.target.value)} className={inputClass} placeholder="เช่น รากเน่า แมลง โรค หรือไม่ทราบสาเหตุ" /></label>
          <label className="text-sm font-semibold text-slate-700 sm:col-span-2">หมายเหตุ (ถ้ามี)<textarea maxLength={2000} value={note} onChange={e => setNote(e.target.value)} rows={2} className={inputClass} /></label>
          <label className="text-sm font-semibold text-slate-700 sm:col-span-2">รูปภาพประกอบ (ถ้ามี)<input type="file" accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-rose-100 file:px-3 file:py-2 file:font-bold file:text-rose-900" onChange={e => {
            const file = e.target.files?.[0]; if (!file) return;
            if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('กรุณาเลือกรูป JPEG, PNG หรือ WebP ขนาดไม่เกิน 5 MB'); e.target.value = ''; return; }
            setImage(file); setImagePath(''); setError('');
          }} /><span className="mt-1 block text-xs font-normal text-slate-500">JPEG, PNG หรือ WebP ไม่เกิน 5 MB</span></label>
          {preview && <div className="sm:col-span-2"><img src={preview} alt="ภาพผักเสียหายที่เลือก" className="max-h-48 rounded-xl object-contain" /><button type="button" onClick={() => { setImage(null); setImagePath(''); }} className="mt-2 text-xs font-bold text-rose-700">นำรูปออก</button></div>}
        </fieldset>
        {validCount && <p role="status" className="rounded-xl bg-white p-3 text-sm text-slate-700">หลังบันทึก: เหลือ <strong>{number(afterCount)} ต้น</strong> ≈ <strong>{number(afterKg)} กก.</strong> · น้ำหนักคาดการณ์ลดลง <strong className="text-rose-700">{number(selected!.remaining_estimated_kg - afterKg)} กก.</strong></p>}
        <button disabled={saving || !validCount} className="rounded-xl bg-rose-600 px-5 py-3 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50">{saving ? 'กำลังบันทึก...' : 'ยืนยันบันทึกผักเสียหาย'}</button>
      </form>}
      <details className="rounded-2xl border border-slate-200 p-4" open={data.history.length > 0}>
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
      </details>
      <p className="text-xs leading-relaxed text-slate-500">น้ำหนักเป็นค่าคาดการณ์ตามจำนวนต้น ไม่ใช่น้ำหนักชั่งจริง การสูญเสียไม่คืนพื้นที่แปลงอัตโนมัติ และไม่เปลี่ยนจำนวนในออเดอร์ลูกค้า</p>
    </>}
  </section>;
};
