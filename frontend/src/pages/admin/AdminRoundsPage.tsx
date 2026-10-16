import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { PlantingRound, Crop, Plot } from '../../types/index.js';
import {
  CalendarDays,
  Plus,
  Trash2,
  AlertCircle,
  X,
  Leaf,
  Layers,
  ArrowRight,
  Clock,
  Sparkles,
  LayoutGrid,
  CheckCircle2,
  ExternalLink,
  History,
} from 'lucide-react';

interface RoundItemForm {
  crop_id: string;
  selected_plot_ids: string[];
  bookable_qty_kg: number;
  price_per_kg: number;
  growing_days: number;
}

export const AdminRoundsPage: React.FC = () => {
  const navigate = useNavigate();
  const [rounds, setRounds] = useState<PlantingRound[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [loading, setLoading] = useState(true);

  // Simple Create Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [seedDate, setSeedDate] = useState('');
  const [items, setItems] = useState<RoundItemForm[]>([]);
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [roundsData, cropsData, plotsRes] = await Promise.all([
        api.get<PlantingRound[]>('/admin/rounds'),
        api.get<Crop[]>('/admin/crops'),
        api.get<{ plots: Plot[] }>('/admin/plots'),
      ]);
      setRounds(roundsData || []);
      setCrops(cropsData || []);
      setPlots(plotsRes?.plots || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const activePlots = plots.filter((p) => p.is_active);

  const openCreateModal = () => {
    const today = new Date().toISOString().split('T')[0];
    const yearTh = new Date().getFullYear() + 543;
    const roundNumber = rounds.length + 1;

    setName(`รอบการปลูกที่ ${roundNumber}/${yearTh}`);
    setSeedDate(today);
    setNotes('');

    // Prepopulate with active crops and their designated plots
    const activeCrops = crops.filter((c) => c.is_active);
    if (activeCrops.length > 0) {
      setItems(
        activeCrops.map((c) => {
          // Find plots designated for this crop
          const cropPlots = activePlots.filter((p) => p.crop_id === c.id);
          const plotIds = cropPlots.map((p) => p.id);
          const totalSlots = cropPlots.reduce((sum, p) => sum + Number(p.slot_capacity || 0), 0);
          const rate = c.slots_per_kg ? Number(c.slots_per_kg) : 4.0;
          const defaultKg = totalSlots > 0 ? Math.round(totalSlots / rate) : 25;

          return {
            crop_id: c.id,
            selected_plot_ids: plotIds,
            bookable_qty_kg: defaultKg,
            price_per_kg: Number(c.default_price_per_kg) || 130,
            growing_days: Number(c.growing_days) || 45,
          };
        })
      );
    } else {
      setItems([]);
    }

    setFormError(null);
    setIsModalOpen(true);
  };

  const handleAddItem = () => {
    if (crops.length === 0) return;
    const firstCrop = crops[0];
    const cropPlots = activePlots.filter((p) => p.crop_id === firstCrop.id);
    const plotIds = cropPlots.map((p) => p.id);
    const totalSlots = cropPlots.reduce((sum, p) => sum + Number(p.slot_capacity || 0), 0);
    const rate = firstCrop.slots_per_kg ? Number(firstCrop.slots_per_kg) : 4.0;
    const defaultKg = totalSlots > 0 ? Math.round(totalSlots / rate) : 25;

    setItems([
      ...items,
      {
        crop_id: firstCrop.id,
        selected_plot_ids: plotIds,
        bookable_qty_kg: defaultKg,
        price_per_kg: Number(firstCrop.default_price_per_kg) || 130,
        growing_days: Number(firstCrop.growing_days) || 45,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemCropChange = (index: number, cropId: string) => {
    const selected = crops.find((c) => c.id === cropId);
    const cropPlots = activePlots.filter((p) => p.crop_id === cropId);
    const plotIds = cropPlots.map((p) => p.id);
    const totalSlots = cropPlots.reduce((sum, p) => sum + Number(p.slot_capacity || 0), 0);
    const rate = selected?.slots_per_kg ? Number(selected.slots_per_kg) : 4.0;
    const defaultKg = totalSlots > 0 ? Math.round(totalSlots / rate) : 25;

    setItems(
      items.map((it, i) => {
        if (i !== index) return it;
        return {
          ...it,
          crop_id: cropId,
          selected_plot_ids: plotIds,
          bookable_qty_kg: defaultKg,
          price_per_kg: selected ? Number(selected.default_price_per_kg) : it.price_per_kg,
          growing_days: selected?.growing_days ? Number(selected.growing_days) : it.growing_days,
        };
      })
    );
  };

  const handleTogglePlot = (itemIndex: number, plotId: string) => {
    setItems((prevItems) =>
      prevItems.map((it, idx) => {
        if (idx !== itemIndex) return it;

        const currentSelected = it.selected_plot_ids || [];
        const isSelected = currentSelected.includes(plotId);
        const newSelected = isSelected
          ? currentSelected.filter((id) => id !== plotId)
          : [...currentSelected, plotId];

        const crop = crops.find((c) => c.id === it.crop_id);
        const rate = crop?.slots_per_kg ? Number(crop.slots_per_kg) : 4.0;
        const chosenPlots = activePlots.filter((p) => newSelected.includes(p.id));
        const newSlots = chosenPlots.reduce((sum, p) => sum + Number(p.slot_capacity || 0), 0);
        const newKg = newSlots > 0 ? Math.round(newSlots / rate) : 0;

        return {
          ...it,
          selected_plot_ids: newSelected,
          bookable_qty_kg: newKg,
        };
      })
    );
  };

  const handleItemFieldChange = (index: number, field: keyof RoundItemForm, value: any) => {
    setItems(
      items.map((it, i) => (i === index ? { ...it, [field]: value } : it))
    );
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('กรุณาระบุชื่อรอบการปลูก');
      return;
    }

    if (items.length === 0) {
      setFormError('กรุณาเพิ่มรายการผักที่จะปลูกในรอบนี้อย่างน้อย 1 ชนิด');
      return;
    }

    try {
      setSaving(true);
      const maxGrowingDays = items.length > 0
        ? Math.max(...items.map((i) => Number(i.growing_days) || 45))
        : 45;

      const payload = {
        name: name.trim(),
        seed_date: seedDate || new Date().toISOString().split('T')[0],
        growing_days: maxGrowingDays,
        notes: notes.trim() || null,
        items: items.map((it) => ({
          crop_id: it.crop_id,
          estimated_qty_kg: it.bookable_qty_kg,
          bookable_qty_kg: it.bookable_qty_kg,
          price_per_kg: it.price_per_kg,
          growing_days: it.growing_days,
        })),
      };

      const createdRound = await api.post<PlantingRound>('/admin/rounds', payload);
      setIsModalOpen(false);

      // Redirect immediately to the round management page as requested!
      navigate(`/admin/rounds/${createdRound.id}`);
    } catch (err: any) {
      setFormError(err.message || 'เกิดข้อผิดพลาดในการสร้างรอบการปลูก');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRound = async (round: PlantingRound) => {
    if (!window.confirm(`ยืนยันการลบรอบการปลูก "${round.name}"?`)) return;
    try {
      setDeletingId(round.id);
      await api.delete(`/admin/rounds/${round.id}`);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'ไม่สามารถลบรอบการปลูกได้');
    } finally {
      setDeletingId(null);
    }
  };

  const getStepBadge = (round: PlantingRound) => {
    const step = round.current_step || 1;
    switch (step) {
      case 1:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
            🌱 สเต็ป 1: ปักเม็ด ({round.seed_date || 'ยังไม่ระบุ'})
          </span>
        );
      case 2:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 text-xs font-bold border border-sky-200">
            🧪 สเต็ป 2: ใส่ปุ๋ย ({round.fertilizing_date || 'ยังไม่ระบุ'})
          </span>
        );
      case 3:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 text-teal-700 text-xs font-bold border border-teal-200">
            🌿 สเต็ป 3: ปลูกจริง ({round.transplant_date || round.planted_at || 'ยังไม่ระบุ'})
          </span>
        );
      case 4:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-300">
            🛒 สเต็ป 4: เปิดสั่งจองล่วงหน้า ({round.booking_opens_at ? round.booking_opens_at.slice(0, 10) : ''})
          </span>
        );
      case 5:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 text-xs font-bold border border-amber-300">
            🧺 สเต็ป 5: วันที่พร้อมเก็บและขาย ({round.harvest_sale_date || round.expected_harvest_date || ''})
          </span>
        );
      case 6:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200">
            🏷️ สเต็ป 6: ขายหมดแล้ว ({round.sold_out_date || ''})
          </span>
        );
      case 7:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold border border-slate-300">
            🏁 สเต็ป 7: สิ้นสุดรอบ
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold">
            สเต็ป {step}
          </span>
        );
    }
  };

  const activeRounds = rounds.filter((r) => r.status !== 'completed');
  const completedRounds = rounds.filter((r) => r.status === 'completed');

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">การจัดการรอบการปลูก</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
              กำลังปลูก ({activeRounds.length})
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            สร้างรอบปลูกและจัดการวงจรชีวิต 7 สเต็ป: ปักเม็ด ➔ ใส่ปุ๋ย ➔ ปลูกจริง ➔ เปิดจอง ➔ เก็บและขาย ➔ ขายหมด ➔ สิ้นสุดรอบ
          </p>
        </div>
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <Link
            to="/admin/rounds/history"
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs sm:text-sm shadow-2xs transition-colors"
          >
            <History className="w-4 h-4 text-purple-600" />
            <span>ประวัติรอบปลูก ({completedRounds.length})</span>
          </Link>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>สร้างรอบปลูกใหม่</span>
          </button>
        </div>
      </div>

      {/* Rounds List */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-500 text-sm">กำลังโหลดข้อมูลรอบการปลูก...</div>
        ) : activeRounds.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm space-y-3">
            <CalendarDays className="w-10 h-10 mx-auto text-slate-300" />
            <p className="font-semibold text-slate-700">ไม่มีรอบการปลูกที่กำลังดำเนินการในขณะนี้</p>
            <p className="text-xs text-slate-400">
              {completedRounds.length > 0
                ? `(มีรอบการปลูกที่สิ้นสุดแล้ว ${completedRounds.length} รอบ สามารถดูได้ในหน้า "ประวัติรอบปลูก")`
                : 'กดปุ่ม "สร้างรอบปลูกใหม่" เพื่อระบุชื่อรอบและเริ่มเพาะปลูก'}
            </p>
            <div className="pt-2 flex items-center justify-center gap-3">
              {completedRounds.length > 0 && (
                <Link
                  to="/admin/rounds/history"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 font-bold text-xs hover:bg-purple-100 transition-colors"
                >
                  <History className="w-4 h-4" />
                  <span>ไปดูประวัติรอบปลูก ({completedRounds.length} รอบ)</span>
                </Link>
              )}
              <button
                onClick={openCreateModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-colors shadow-2xs"
              >
                <Plus className="w-4 h-4" />
                <span>สร้างรอบปลูกใหม่</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold tracking-wider">
                  <th className="py-3.5 px-4">ชื่อรอบการปลูก</th>
                  <th className="py-3.5 px-4">สถานะสเต็ปปัจจุบัน</th>
                  <th className="py-3.5 px-4">รายการผักในรอบนี้</th>
                  <th className="py-3.5 px-4">หลอดปริมาณผัก / ยอดจอง</th>
                  <th className="py-3.5 px-4 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeRounds.map((round) => {
                  const bookableTotal = Number(round.total_bookable_kg || 0);
                  const bookedTotal = Number(round.total_booked_kg || 0);
                  const availableTotal = Number(round.total_available_kg || Math.max(0, bookableTotal - bookedTotal));
                  const percentSold = bookableTotal > 0 ? Math.min(100, (bookedTotal / bookableTotal) * 100) : 0;

                  return (
                    <tr key={round.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Name & Created */}
                      <td className="py-4 px-4">
                        <Link
                          to={`/admin/rounds/${round.id}`}
                          className="font-bold text-slate-900 hover:text-emerald-600 block text-sm"
                        >
                          {round.name}
                        </Link>
                        <span className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" />
                          สร้างเมื่อ: {new Date(round.created_at).toLocaleDateString('th-TH')}
                        </span>
                      </td>

                      {/* Step Badge */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        {getStepBadge(round)}
                      </td>

                      {/* Crops Chips */}
                      <td className="py-4 px-4 max-w-xs">
                        <div className="flex flex-wrap gap-1">
                          {round.round_items && round.round_items.length > 0 ? (
                            round.round_items.map((item) => (
                              <span
                                key={item.id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium"
                              >
                                <Leaf className="w-3 h-3 text-emerald-500" />
                                {item.crop_name || item.crops?.name || 'ผัก'} ({Number(item.bookable_qty_kg).toFixed(0)} กก.)
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400 text-xs">-</span>
                          )}
                        </div>
                      </td>

                      {/* Stock / Sold Progress Bar */}
                      <td className="py-4 px-4 min-w-[180px]">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-slate-600 font-medium">
                              จองแล้ว: <strong className="text-emerald-700">{bookedTotal.toFixed(1)}</strong> / {bookableTotal.toFixed(1)} กก.
                            </span>
                            <span className="font-bold text-slate-800">{percentSold.toFixed(0)}%</span>
                          </div>
                          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                percentSold >= 100
                                  ? 'bg-rose-500'
                                  : percentSold >= 75
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${percentSold}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-slate-400 block">
                            คงเหลือเปิดจอง: {availableTotal.toFixed(1)} กก.
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <Link
                            to={`/admin/rounds/${round.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs transition-colors"
                          >
                            <span>จัดการสเต็ป</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            onClick={() => handleDeleteRound(round)}
                            disabled={deletingId === round.id}
                            className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="ลบรอบปลูก"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Round Modal - Organised by Crop & Designated Plots */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-5 sm:p-7 max-w-3xl w-full shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">สร้างรอบการปลูกใหม่</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  เลือกผักที่จะปลูกและติ๊กเลือกแปลงที่กำหนดไว้สำหรับผักชนิดนั้น ระบบจะแสดงแปลงที่เหลือให้อัตโนมัติ
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs sm:text-sm">
              {/* Round Name */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  ชื่อรอบการปลูก <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="เช่น รอบการปลูกที่ 1/2569 โซน A"
                  required
                  className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                />
              </div>

              {/* Seed Date (Step 1 Start Date) */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  🌱 วันที่ปักเม็ดเริ่มต้น (Step 1) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={seedDate}
                  onChange={(e) => setSeedDate(e.target.value)}
                  required
                  className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 max-w-xs"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  วันที่เริ่มเพาะเมล็ดลงฟองน้ำ สามารถปรับแก้อีกครั้งในหน้าจัดการรอบได้
                </span>
              </div>

              {/* Vegetables to plant in this round */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <label className="font-bold text-slate-800 block text-sm">
                      รายการผักและแปลงปลูกในรอบนี้ <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[11px] text-slate-500">
                      ระบบแสดงแปลงปลูกที่กำหนดไว้สำหรับผักแต่ละชนิด ให้ติ๊กเลือกแปลงที่จะใช้ปลูกในรอบนี้
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-bold bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-xl transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>เพิ่มผัก</span>
                  </button>
                </div>

                {items.length === 0 ? (
                  <div className="p-6 rounded-2xl border border-dashed border-slate-200 text-center text-xs text-slate-400 space-y-1">
                    <Leaf className="w-8 h-8 mx-auto text-slate-300" />
                    <p className="font-semibold text-slate-600">ยังไม่มีรายการผักในรอบนี้</p>
                    <p>กดปุ่ม "+ เพิ่มผัก" ด้านบน เพื่อระบุผักที่จะปลูก</p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
                    {items.map((it, idx) => {
                      const selectedCrop = crops.find((c) => c.id === it.crop_id);
                      const cropRate = selectedCrop?.slots_per_kg ? Number(selectedCrop.slots_per_kg) : 4.0;

                      // Matching plots designated specifically for this crop
                      const cropPlots = activePlots.filter((p) => p.crop_id === it.crop_id);
                      const totalCropSlots = cropPlots.reduce((sum, p) => sum + Number(p.slot_capacity || 0), 0);

                      // Selected vs Remaining plots for THIS crop
                      const selectedPlotIds = it.selected_plot_ids || [];
                      const selectedPlotsOfCrop = cropPlots.filter((p) => selectedPlotIds.includes(p.id));
                      const remainingPlotsOfCrop = cropPlots.filter((p) => !selectedPlotIds.includes(p.id));

                      const selectedSlots = selectedPlotsOfCrop.reduce((sum, p) => sum + Number(p.slot_capacity || 0), 0);
                      const remainingSlotsOfCrop = remainingPlotsOfCrop.reduce((sum, p) => sum + Number(p.slot_capacity || 0), 0);
                      const remainingKgOfCrop = (remainingSlotsOfCrop / cropRate).toFixed(1);

                      return (
                        <div
                          key={idx}
                          className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200 space-y-3 shadow-2xs"
                        >
                          {/* Top inputs: Crop, Target kg, Price, Growing days */}
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                            {/* Crop select */}
                            <div className="flex-1">
                              <label className="text-[10px] font-bold text-slate-500 block mb-0.5">
                                ชนิดผักที่ ({idx + 1})
                              </label>
                              <select
                                value={it.crop_id}
                                onChange={(e) => handleItemCropChange(idx, e.target.value)}
                                className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-bold text-xs focus:ring-2 focus:ring-emerald-500 text-slate-900"
                              >
                                {crops.map((c) => {
                                  const plotsCount = activePlots.filter((p) => p.crop_id === c.id).length;
                                  return (
                                    <option key={c.id} value={c.id}>
                                      {c.name} (มี {plotsCount} แปลง • ฿{Number(c.default_price_per_kg).toFixed(0)}/กก.)
                                    </option>
                                  );
                                })}
                              </select>
                            </div>

                            {/* Target Qty Kg */}
                            <div className="w-28">
                              <label className="text-[10px] font-bold text-slate-500 block mb-0.5">
                                เป้าหมาย (กก.)
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={it.bookable_qty_kg}
                                onChange={(e) =>
                                  handleItemFieldChange(idx, 'bookable_qty_kg', parseFloat(e.target.value) || 0)
                                }
                                className="w-full p-2.5 rounded-xl border border-slate-200 bg-white text-xs font-black text-emerald-800 focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>

                            {/* Price per Kg */}
                            <div className="w-24">
                              <label className="text-[10px] font-bold text-slate-500 block mb-0.5">฿/กก.</label>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={it.price_per_kg}
                                onChange={(e) =>
                                  handleItemFieldChange(idx, 'price_per_kg', parseFloat(e.target.value) || 0)
                                }
                                className="w-full p-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>

                            {/* Growing Days */}
                            <div className="w-20">
                              <label className="text-[10px] font-bold text-slate-500 block mb-0.5">วันปลูก</label>
                              <input
                                type="number"
                                min="1"
                                value={it.growing_days}
                                onChange={(e) =>
                                  handleItemFieldChange(idx, 'growing_days', parseInt(e.target.value, 10) || 45)
                                }
                                title="ระยะเวลาปลูก (วัน)"
                                className="w-full p-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>

                            {/* Delete button */}
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="p-2.5 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 self-end sm:self-center transition-colors"
                              title="ลบผักรายการนี้"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          {/* DESIGNATED PLOTS BOX FOR THIS SPECIFIC CROP WITH PROGRESS BARS */}
                          <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
                            {/* Header: Plots info and remaining badge */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs border-b border-slate-100 pb-2">
                              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                                <LayoutGrid className="w-4 h-4 text-emerald-600" />
                                <span>แปลงที่กำหนดไว้สำหรับ {selectedCrop?.name || 'ผักนี้'}:</span>
                                <span className="text-slate-500 font-normal">
                                  {cropPlots.length > 0
                                    ? `(${cropPlots.length} แปลง รวม ${totalCropSlots.toLocaleString()} ช่อง)`
                                    : '(ยังไม่ได้กำหนดแปลง)'}
                                </span>
                              </div>

                              {/* Remaining Plots Badge for THIS crop */}
                              <div>
                                {cropPlots.length > 0 && remainingPlotsOfCrop.length === 0 ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    <span>เลือกปลูกครบทุกแปลงของผักนี้แล้ว (เหลือ 0 แปลง)</span>
                                  </span>
                                ) : remainingPlotsOfCrop.length > 0 ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-50 text-sky-800 border border-sky-200">
                                    <span>
                                      🟢 เหลือแปลงที่ปลูกได้อีก: <strong>{remainingPlotsOfCrop.length} แปลง</strong> ({remainingSlotsOfCrop.toLocaleString()} ช่อง)
                                    </span>
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            {/* CROP TOTAL AREA GAUGE BAR */}
                            {cropPlots.length > 0 && (() => {
                              const targetSlots = Math.round((Number(it.bookable_qty_kg) || 0) * cropRate);
                              const cropUsagePercent = totalCropSlots > 0 ? Math.min(100, (targetSlots / totalCropSlots) * 100) : 0;
                              return (
                                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1.5">
                                  <div className="flex justify-between text-[11px]">
                                    <span className="font-semibold text-slate-700">
                                      หลอดพื้นที่รวมของ {selectedCrop?.name}:
                                    </span>
                                    <span className="font-bold text-slate-800">
                                      ใช้ {targetSlots.toLocaleString()} / {totalCropSlots.toLocaleString()} ช่อง ({cropUsagePercent.toFixed(0)}%)
                                    </span>
                                  </div>
                                  <div className="w-full h-2.5 bg-slate-200/70 rounded-full overflow-hidden p-0.5">
                                    <div
                                      className={`h-full rounded-full transition-all duration-300 ${
                                        targetSlots > totalCropSlots
                                          ? 'bg-rose-500'
                                          : cropUsagePercent >= 100
                                          ? 'bg-emerald-600'
                                          : cropUsagePercent >= 75
                                          ? 'bg-teal-500'
                                          : 'bg-emerald-500'
                                      }`}
                                      style={{ width: `${Math.min(100, cropUsagePercent)}%` }}
                                    />
                                  </div>
                                  <div className="flex justify-between text-[10px] text-slate-500">
                                    <span>เป้าหมายผลผลิต: {it.bookable_qty_kg} กก.</span>
                                    <span>
                                      {remainingSlotsOfCrop > 0
                                        ? `คงเหลือพื้นที่แปลงผักนี้: ${remainingSlotsOfCrop.toLocaleString()} ช่อง (~${remainingKgOfCrop} กก.)`
                                        : 'ใช้พื้นที่แปลงผักนี้เต็ม 100%'}
                                    </span>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Clickable Per-Plot Cards with Area Progress Bars */}
                            {cropPlots.length > 0 ? (() => {
                              // Distribute target slots across the plots
                              const targetSlots = Math.round((Number(it.bookable_qty_kg) || 0) * cropRate);
                              let remainingToAllocate = targetSlots;

                              return (
                                <div className="space-y-2">
                                  <p className="text-[10px] text-slate-500 font-medium">
                                    หลอดแสดงพื้นที่ที่ใช้ไปในแต่ละแปลง (คลิกที่แปลงเพื่อเลือก/ยกเลิกการใช้แปลงในรอบนี้):
                                  </p>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    {cropPlots.map((plot) => {
                                      const isChecked = selectedPlotIds.includes(plot.id);
                                      const cap = Number(plot.slot_capacity || 0);

                                      let usedInPlot = 0;
                                      if (isChecked) {
                                        usedInPlot = Math.min(cap, Math.max(0, remainingToAllocate));
                                        remainingToAllocate -= usedInPlot;
                                      }

                                      const plotPercent = cap > 0 ? Math.min(100, Math.round((usedInPlot / cap) * 100)) : 0;
                                      const remainingInPlot = isChecked ? Math.max(0, cap - usedInPlot) : cap;

                                      return (
                                        <div
                                          key={plot.id}
                                          onClick={() => handleTogglePlot(idx, plot.id)}
                                          className={`p-3 rounded-2xl border transition-all cursor-pointer select-none space-y-2 ${
                                            isChecked
                                              ? 'bg-white border-emerald-500 shadow-xs ring-1 ring-emerald-400'
                                              : 'bg-slate-50 border-slate-200/90 hover:border-slate-300 opacity-75'
                                          }`}
                                        >
                                          {/* Card Top: Checkbox, Name, Zone, Badge */}
                                          <div className="flex items-center justify-between gap-1.5">
                                            <div className="flex items-center gap-2 min-w-0">
                                              <span
                                                className={`w-4 h-4 rounded-md flex items-center justify-center border text-[11px] font-bold flex-shrink-0 ${
                                                  isChecked
                                                    ? 'bg-emerald-600 border-emerald-600 text-white'
                                                    : 'border-slate-300 bg-white text-transparent'
                                                }`}
                                              >
                                                ✓
                                              </span>
                                              <span className="font-bold text-slate-800 text-xs truncate">
                                                {plot.name}
                                              </span>
                                              <span className="text-[10px] text-slate-400 flex-shrink-0">
                                                ({plot.zone_name})
                                              </span>
                                            </div>

                                            <span
                                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                                                !isChecked
                                                  ? 'bg-slate-100 text-slate-500'
                                                  : plotPercent >= 100
                                                  ? 'bg-emerald-100 text-emerald-800'
                                                  : plotPercent > 0
                                                  ? 'bg-sky-100 text-sky-800'
                                                  : 'bg-amber-100 text-amber-800'
                                              }`}
                                            >
                                              {!isChecked
                                                ? 'ว่าง (ไม่ใช้)'
                                                : plotPercent >= 100
                                                ? 'เต็มแปลง (100%)'
                                                : `ใช้ไป ${plotPercent}%`}
                                            </span>
                                          </div>

                                          {/* Per-Plot Capacity Bar */}
                                          <div className="space-y-1">
                                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                              <div
                                                className={`h-full rounded-full transition-all duration-300 ${
                                                  !isChecked
                                                    ? 'bg-slate-200'
                                                    : plotPercent >= 100
                                                    ? 'bg-emerald-500'
                                                    : 'bg-sky-500'
                                                }`}
                                                style={{ width: `${isChecked ? plotPercent : 0}%` }}
                                              />
                                            </div>

                                            <div className="flex justify-between text-[10px] text-slate-500">
                                              <span>
                                                {isChecked ? (
                                                  <>
                                                    ใช้ไป{' '}
                                                    <strong className="text-slate-800">{usedInPlot}</strong> / {cap} ช่อง
                                                  </>
                                                ) : (
                                                  <>0 / {cap} ช่อง</>
                                                )}
                                              </span>
                                              <span>
                                                {isChecked ? (
                                                  remainingInPlot > 0 ? (
                                                    <span className="text-sky-700 font-semibold">
                                                      เหลือ {remainingInPlot} ช่อง
                                                    </span>
                                                  ) : (
                                                    <span className="text-emerald-700 font-semibold">
                                                      เต็มแปลง
                                                    </span>
                                                  )
                                                ) : (
                                                  <span className="text-slate-400 font-medium">
                                                    ว่างทั้งแปลง ({cap} ช่อง)
                                                  </span>
                                                )}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {/* Bottom helper text */}
                                  <div className="text-[11px] pt-1 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1">
                                    <span className="text-slate-600">
                                      เลือกปลูก: <strong>{selectedPlotsOfCrop.length}/{cropPlots.length} แปลง</strong> ({selectedSlots.toLocaleString()} ช่องปลูก)
                                    </span>
                                    {remainingPlotsOfCrop.length > 0 ? (
                                      <span className="text-sky-700 font-medium">
                                        แปลงที่ยังว่างสำหรับผักนี้:{' '}
                                        <strong>
                                          {remainingPlotsOfCrop.map((p) => `${p.name} (${p.slot_capacity} ช่อง)`).join(', ')}
                                        </strong>
                                        {' '}(ปลูกเพิ่มได้อีก ~{remainingKgOfCrop} กก.)
                                      </span>
                                    ) : (
                                      <span className="text-emerald-700 font-medium">
                                        ✓ ปลูกครบทุกแปลงของผักนี้ในรอบนี้แล้ว
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })() : (
                              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <span>
                                  ⚠️ ยังไม่มีแปลงที่กำหนดไว้สำหรับ <strong>{selectedCrop?.name}</strong> ในหน้า "จัดการแปลงปลูก"
                                </span>
                                <Link
                                  to="/admin/plots"
                                  target="_blank"
                                  className="inline-flex items-center gap-1 font-bold text-amber-900 hover:text-amber-950 underline whitespace-nowrap"
                                >
                                  <span>ไปกำหนดแปลงปลูก</span>
                                  <ExternalLink className="w-3 h-3" />
                                </Link>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Crop-Specific Summary Table with Area Progress Bars */}
              {items.length > 0 && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span>สรุปหลอดพื้นที่แปลงปลูกแยกตามชนิดผัก (อ้างอิงจากแปลงที่กำหนดไว้):</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead>
                        <tr className="text-slate-400 border-b border-slate-200 pb-1.5 font-semibold">
                          <th className="py-1 px-1">ชนิดผัก</th>
                          <th className="py-1 px-2">แปลงที่กำหนดไว้</th>
                          <th className="py-1 px-2 min-w-[150px]">หลอดพื้นที่ที่ใช้ไป</th>
                          <th className="py-1 px-2">แปลงที่เลือกปลูก</th>
                          <th className="py-1 px-2">ปริมาณแปลงที่เหลือที่จะปลูกได้</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {items.map((it, idx) => {
                          const crop = crops.find((c) => c.id === it.crop_id);
                          const cropRate = crop?.slots_per_kg ? Number(crop.slots_per_kg) : 4.0;
                          const cropPlots = activePlots.filter((p) => p.crop_id === it.crop_id);
                          const totalSlots = cropPlots.reduce((s, p) => s + Number(p.slot_capacity || 0), 0);
                          const targetSlots = Math.round((Number(it.bookable_qty_kg) || 0) * cropRate);
                          const usedPercent = totalSlots > 0 ? Math.min(100, Math.round((targetSlots / totalSlots) * 100)) : 0;

                          const selectedPlotIds = it.selected_plot_ids || [];
                          const selectedPlots = cropPlots.filter((p) => selectedPlotIds.includes(p.id));
                          const remainingPlots = cropPlots.filter((p) => !selectedPlotIds.includes(p.id));
                          const remainingSlots = remainingPlots.reduce((s, p) => s + Number(p.slot_capacity || 0), 0);

                          return (
                            <tr key={idx} className="hover:bg-white/60">
                              <td className="py-2 px-1 font-bold text-slate-800 whitespace-nowrap">
                                {crop?.name || 'ผัก'}
                              </td>
                              <td className="py-2 px-2 text-slate-600 whitespace-nowrap">
                                {cropPlots.length > 0 ? `${cropPlots.length} แปลง (${totalSlots.toLocaleString()} ช่อง)` : '-'}
                              </td>
                              {/* Mini Gauge Bar */}
                              <td className="py-2 px-2">
                                {cropPlots.length > 0 ? (
                                  <div className="space-y-1">
                                    <div className="flex justify-between text-[10px]">
                                      <span className="font-semibold text-slate-700">
                                        {targetSlots} / {totalSlots} ช่อง
                                      </span>
                                      <span className="font-bold text-slate-700">{usedPercent}%</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${
                                          usedPercent >= 100
                                            ? 'bg-emerald-600'
                                            : usedPercent >= 75
                                            ? 'bg-teal-500'
                                            : 'bg-emerald-500'
                                        }`}
                                        style={{ width: `${usedPercent}%` }}
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>
                              <td className="py-2 px-2 font-semibold text-emerald-700 whitespace-nowrap">
                                {selectedPlots.length} แปลง ({it.bookable_qty_kg} กก.)
                              </td>
                              <td className="py-2 px-2">
                                {cropPlots.length === 0 ? (
                                  <span className="text-slate-400 italic">- ไม่ได้ระบุแปลง -</span>
                                ) : remainingPlots.length === 0 ? (
                                  <span className="text-emerald-700 font-bold">✓ เต็มแล้ว (เหลือ 0 แปลง)</span>
                                ) : (
                                  <span className="text-sky-700 font-bold">
                                    🟢 เหลือ {remainingPlots.length} แปลง ({remainingPlots.map((p) => p.name).join(', ')} • {remainingSlots.toLocaleString()} ช่อง)
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
              )}

              {/* Notes */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">หมายเหตุเพิ่มเติม (ถ้ามี)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="เช่น ปลูกในโรงเรือน A รางที่ 1-4"
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-colors disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{saving ? 'กำลังสร้างรอบ...' : 'สร้างรอบปลูก ➔ เข้าสู่หน้าจัดการ'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default AdminRoundsPage;
