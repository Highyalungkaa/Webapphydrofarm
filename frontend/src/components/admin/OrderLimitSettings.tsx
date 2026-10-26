import React, { useState } from 'react';
import { api } from '../../lib/api.js';
import { OrderLimitNotice } from '../common/OrderLimitNotice.js';
import type { PlantingRound, RoundItem } from '../../types/index.js';

const cropName = (item: RoundItem) => item.crop_name || item.crops?.name || 'ผัก';

export const OrderLimitSettings: React.FC<{ round: PlantingRound; onChanged: () => Promise<void> }> = ({ round, onChanged }) => {
  const crops = round.round_items || round.items || [];
  const initialSelected = () => crops.filter(item => item.order_limit_remaining != null || round.order_limit_remaining != null).map(item => item.id);
  const initialQuantities = () => Object.fromEntries(crops.map(item => [item.id, String(item.order_limit_remaining ?? round.order_limit_remaining ?? 2)]));
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [quantities, setQuantities] = useState<Record<string, string>>(initialQuantities);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const closed = ['completed', 'cancelled'].includes(round.status) || !!round.closure_reason;
  const valid = selected.every(id => /^\d+$/.test(quantities[id] || '') && Number(quantities[id]) <= 1000000);
  const configuredCrops = crops.filter(item => item.order_limit_remaining != null);

  const toggleEditing = () => {
    setSelected(initialSelected());
    setQuantities(initialQuantities());
    setError('');
    setEditing(!editing);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !valid) return;
    setSaving(true);
    setError('');
    try {
      await api.patch('/admin/rounds/' + round.id + '/crop-order-limits', {
        items: crops.filter(item => selected.includes(item.id)).map(item => ({ id: item.id, remaining: Number(quantities[item.id]) })),
      });
      await onChanged();
      setEditing(false);
    } catch (err: any) {
      setError(err.message || 'บันทึกโควตาออเดอร์ไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return <section className="space-y-3 border-t border-orange-100 pt-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-extrabold text-slate-900">จำกัดจำนวนออเดอร์</h3>
        <p className="mt-1 text-xs text-slate-500">เลือกผักในรอบนี้ แล้วตั้งจำนวนออเดอร์ที่ยังรับได้แยกตามชนิด</p>
      </div>
      {!closed && <button type="button" disabled={saving || crops.length === 0} onClick={toggleEditing}
        className="rounded-xl border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-bold text-orange-900 disabled:opacity-50">
        {editing ? 'ปิดการตั้งค่า' : 'ตั้งค่าโควตาต่อผัก'}
      </button>}
    </div>
    {round.order_limit_remaining != null && <><OrderLimitNotice remaining={round.order_limit_remaining}/><p className="text-xs text-slate-500">โควตาเดิมนับทั้งรอบ เมื่อบันทึกการตั้งค่าใหม่จะเปลี่ยนเป็นโควตาแยกตามผัก</p></>}
    {!editing && configuredCrops.length > 0 && <div className="grid gap-2 sm:grid-cols-2">
      {configuredCrops.map(item => <div key={item.id} className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5 text-sm">
        <span className="font-bold text-slate-900">{cropName(item)}</span>
        <span className="ml-2 text-orange-900">{item.order_limit_remaining === 0 ? 'รับออเดอร์ครบแล้ว' : 'รับได้อีก ' + Number(item.order_limit_remaining).toLocaleString() + ' ออเดอร์'}</span>
      </div>)}
    </div>}
    {!editing && configuredCrops.length === 0 && round.order_limit_remaining == null && <p className="text-xs text-slate-500">ยังไม่จำกัดจำนวนออเดอร์ของผักในรอบนี้</p>}
    {editing && <form onSubmit={save} className="space-y-4 rounded-xl border border-orange-200 bg-orange-50 p-4">
      <p className="text-xs leading-5 text-orange-950">เลือกเฉพาะผักที่ต้องการจำกัดจำนวนออเดอร์ ผักที่ไม่เลือกจะรับออเดอร์ได้โดยไม่จำกัดจำนวน</p>
      <fieldset disabled={saving} className="grid gap-2 sm:grid-cols-2">
        {crops.map(item => {
          const checked = selected.includes(item.id);
          return <div key={item.id} className={'rounded-xl border p-3 ' + (checked ? 'border-orange-300 bg-white' : 'border-slate-200 bg-slate-50')}>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-900">
              <input type="checkbox" checked={checked} onChange={event => setSelected(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))}/>
              {cropName(item)}
            </label>
            {checked && <label className="mt-3 block text-xs font-semibold text-slate-700">รับได้อีก (ออเดอร์)
              <input required type="number" min="0" max="1000000" step="1" value={quantities[item.id] || ''}
                onChange={event => setQuantities(current => ({ ...current, [item.id]: event.target.value }))}
                className="mt-1.5 w-full rounded-lg border border-orange-200 bg-white px-3 py-2.5 text-sm"/>
            </label>}
          </div>;
        })}
      </fieldset>
      <p className="text-xs leading-5 text-slate-600">ออเดอร์ที่มีผักที่จำกัดจะลดโควตาของผักชนิดนั้น 1 ออเดอร์ หากมีหลายชนิดจะลดชนิดละ 1 เมื่อยกเลิก ระบบคืนโควตาที่ใช้ในการตั้งค่าชุดปัจจุบัน การบันทึกใหม่จะใช้จำนวนที่กรอกแทนยอดเดิม</p>
      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
      <button disabled={saving || !valid} className="rounded-xl bg-orange-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">
        {saving ? 'กำลังบันทึก...' : 'บันทึกโควตาออเดอร์'}
      </button>
    </form>}
  </section>;
};
