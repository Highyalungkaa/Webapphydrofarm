import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { Plot, Crop } from '../../types/index.js';
import {
  LayoutGrid,
  Plus,
  Edit2,
  Trash2,
  Leaf,
  MapPin,
  Sprout,
  AlertCircle,
  X,
  Settings,
  SlidersHorizontal,
} from 'lucide-react';

export const AdminPlotsPage: React.FC = () => {
  const [allPlots, setAllPlots] = useState<Plot[]>([]);
  const [unassignedRoundItems, setUnassignedRoundItems] = useState<Array<{ round_id: string; round_name: string; crop_name: string }>>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [farmTotalSlots, setFarmTotalSlots] = useState<number>(5000);
  const [totalAllocatedSlots, setTotalAllocatedSlots] = useState<number>(0);
  const [availableSlots, setAvailableSlots] = useState<number>(5000);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters
  const [zoneFilter, setZoneFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlotId, setEditingPlotId] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [zoneName, setZoneName] = useState('');
  const [slotCapacity, setSlotCapacity] = useState<number>(200);
  const [cropId, setCropId] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [plotsRes, cropsData] = await Promise.all([
        api.get<{ plots: Plot[]; farm_total_slots: number; total_allocated_slots: number; available_slots: number; unassigned_round_items?: Array<{ round_id: string; round_name: string; crop_name: string }> }>(
          '/admin/plots'
        ),
        api.get<Crop[]>('/admin/crops'),
      ]);

      setAllPlots(plotsRes.plots || []);
      setUnassignedRoundItems(plotsRes.unassigned_round_items || []);
      setFarmTotalSlots(plotsRes.farm_total_slots || 5000);
      setTotalAllocatedSlots(plotsRes.total_allocated_slots || 0);
      setAvailableSlots(plotsRes.available_slots || 0);
      setCrops(cropsData || []);
    } catch (err: any) {
      setLoadError(err.message || 'ไม่สามารถโหลดข้อมูลการใช้แปลงปลูกได้');
    } finally {
      setLoading(false);
    }
  };

  const plots = allPlots.filter((plot) =>
    (!zoneFilter || plot.zone_name === zoneFilter) &&
    (!activeFilter || String(plot.is_active) === activeFilter)
  );
  const activeCrops = crops.filter((crop) => crop.is_active !== false);

  // Get unique zone names from existing plots
  const existingZones = Array.from(new Set(allPlots.map((p) => p.zone_name).filter(Boolean)));

  const openCreateModal = () => {
    setEditingPlotId(null);
    setName(`แปลงที่ ${allPlots.length + 1}`);
    setZoneName(existingZones.length > 0 ? existingZones[0] : 'โซน A (โรงเรือน 1)');
    setSlotCapacity(Math.min(200, Math.max(1, availableSlots)));
    setCropId(activeCrops.length > 0 ? activeCrops[0].id : '');
    setIsActive(true);
    setNotes('');
    setError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (plot: Plot) => {
    setEditingPlotId(plot.id);
    setName(plot.name);
    setZoneName(plot.zone_name);
    setSlotCapacity(plot.slot_capacity);
    setCropId(plot.crop_id || '');
    setIsActive(plot.is_active);
    setNotes(plot.notes || '');
    setError(null);
    setIsModalOpen(true);
  };

  const togglePlotActive = async (plot: Plot) => {
    try {
      await api.put(`/admin/plots/${plot.id}`, {
        name: plot.name,
        zone_name: plot.zone_name,
        slot_capacity: plot.slot_capacity,
        crop_id: plot.crop_id || null,
        is_active: !plot.is_active,
        notes: plot.notes,
      });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'ไม่สามารถเปลี่ยนสถานะได้');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Calculate max allowed capacity for this plot
    let currentAllowed = availableSlots;
    if (editingPlotId) {
      const currentPlot = plots.find((p) => p.id === editingPlotId);
      currentAllowed += currentPlot ? currentPlot.slot_capacity : 0;
    }

    if (slotCapacity > currentAllowed) {
      setError(
        `จำนวนช่องปลูก (${slotCapacity.toLocaleString()} ช่อง) เกินโควตาความจุฟาร์มคงเหลือที่จัดสรรได้ (เหลือสูงสุด ${currentAllowed.toLocaleString()} ช่อง)`
      );
      return;
    }

    try {
      setSaving(true);
      const payload = {
        name: name.trim(),
        zone_name: zoneName.trim(),
        slot_capacity: Number(slotCapacity),
        crop_id: cropId || null,
        is_active: isActive,
        notes: notes.trim() || null,
      };

      if (editingPlotId) {
        await api.put(`/admin/plots/${editingPlotId}`, payload);
      } else {
        await api.post('/admin/plots', payload);
      }

      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูลแปลงปลูก');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (plot: Plot) => {
    if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบ "${plot.name}" (${plot.slot_capacity} ช่องปลูก)?`)) return;

    try {
      await api.delete(`/admin/plots/${plot.id}`);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'ไม่สามารถลบแปลงปลูกได้');
    }
  };

  const percentUsed = farmTotalSlots > 0 ? Math.min(100, Math.round((totalAllocatedSlots / farmTotalSlots) * 100)) : 0;
  const occupiedSlots = allPlots.reduce((sum, plot) => sum + Number(plot.used_slots || 0), 0);
  const occupiedPlots = allPlots.filter((plot) => Number(plot.used_slots || 0) > 0).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">การจัดการแปลงปลูก (Plots Management)</h1>
          <p className="text-xs sm:text-sm text-slate-500">
            สร้างแปลงปลูกแยกตามชนิดผักและโซน พร้อมตรวจสอบความจุช่องปลูก (Slots) กับขนาดฟาร์มทั้งหมด
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Link
            to="/admin/farm"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs sm:text-sm transition-colors"
          >
            <Settings className="w-4 h-4" />
            <span>ตั้งค่าความจุฟาร์ม</span>
          </Link>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>สร้างแปลงใหม่</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          <span>โหลดข้อมูลแปลงปลูกไม่สำเร็จ: {loadError}</span>
          <button type="button" onClick={() => void loadData()} className="rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-rose-800 shadow-sm">ลองอีกครั้ง</button>
        </div>
      )}

      {/* Farm Capacity Quota Bar */}
      <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs sm:text-sm">
          <div>
            <span className="font-extrabold text-slate-900 text-sm">
              โควตาช่องปลูกรวมของฟาร์ม (Farm Slots Quota):
            </span>{' '}
            <span className="text-slate-600">
              จัดสรรแล้ว <strong className="text-emerald-700">{totalAllocatedSlots.toLocaleString()}</strong> จาก{' '}
              <strong>{farmTotalSlots.toLocaleString()}</strong> ช่อง
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">คงเหลือสร้างแปลงได้อีก:</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-900">
              {availableSlots.toLocaleString()} ช่อง
            </span>
            <span className="font-bold text-slate-700">({percentUsed}%)</span>
          </div>
        </div>

        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
          <div
            className={`h-full rounded-full transition-all ${
              percentUsed >= 100
                ? 'bg-rose-500'
                : percentUsed >= 80
                ? 'bg-amber-500'
                : 'bg-emerald-500'
            }`}
            style={{ width: `${percentUsed}%` }}
          ></div>
        </div>
      </div>

      {!loading && !loadError && allPlots.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-bold text-emerald-800">ช่องปลูกที่กำลังใช้งาน</p>
            <p className="mt-1 text-xl font-black text-emerald-950">{occupiedSlots.toLocaleString()} <span className="text-xs font-semibold">ช่อง</span></p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs font-bold text-slate-600">ช่องว่างในแปลงที่สร้างแล้ว</p>
            <p className="mt-1 text-xl font-black text-slate-900">{Math.max(0, totalAllocatedSlots - occupiedSlots).toLocaleString()} <span className="text-xs font-semibold">ช่อง</span></p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs font-bold text-slate-600">แปลงที่มีรอบใช้งาน</p>
            <p className="mt-1 text-xl font-black text-slate-900">{occupiedPlots.toLocaleString()} <span className="text-xs font-semibold">/ {allPlots.length.toLocaleString()} แปลง</span></p>
          </div>
        </div>
      )}

      {unassignedRoundItems.length > 0 && !loadError && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="flex items-center gap-2 font-bold"><AlertCircle className="h-4 w-4" />มี {unassignedRoundItems.length} รายการผักในรอบที่ยังไม่พบแปลงปลูก</p>
          <p className="mt-1 text-xs text-amber-800">รายการเหล่านี้ยังไม่ถูกนับในพื้นที่ใช้งานของแต่ละแปลง กรุณาตรวจการกำหนดแปลงในรอบปลูก</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {unassignedRoundItems.slice(0, 5).map((item, index) => (
              <Link key={`${item.round_id}-${item.crop_name}-${index}`} to={`/admin/rounds/${item.round_id}`} className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-amber-900 shadow-sm hover:bg-amber-100">
                {item.round_name} · {item.crop_name}
              </Link>
            ))}
            {unassignedRoundItems.length > 5 && <span className="px-2 py-1 text-xs">และอีก {unassignedRoundItems.length - 5} รายการ</span>}
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-2xl border border-slate-200 text-xs">
        <div className="flex items-center gap-2 text-slate-500 font-semibold">
          <SlidersHorizontal className="w-4 h-4" />
          <span>ตัวกรอง:</span>
        </div>

        <select
          value={zoneFilter}
          onChange={(e) => setZoneFilter(e.target.value)}
          className="p-2 rounded-xl border border-slate-200 bg-white"
        >
          <option value="">-- ทุกโซน --</option>
          {existingZones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>

        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value)}
          className="p-2 rounded-xl border border-slate-200 bg-white"
        >
          <option value="">-- สถานะทั้งหมด --</option>
          <option value="true">เปิดใช้งาน</option>
          <option value="false">ปิดใช้งาน</option>
        </select>

        {(zoneFilter || activeFilter) && (
          <button
            onClick={() => {
              setZoneFilter('');
              setActiveFilter('');
            }}
            className="text-emerald-700 hover:underline font-semibold"
          >
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {/* Plot cards */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-500 text-sm">กำลังโหลดข้อมูลแปลงปลูก...</div>
        ) : plots.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm space-y-3">
            <p>ยังไม่มีแปลงปลูกในระบบ หรือไม่พบแปลงตามเงื่อนไขที่เลือก</p>
            <button onClick={openCreateModal} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs">
              + สร้างแปลงแรกของฟาร์ม
            </button>
          </div>
        ) : (
          <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {plots.map((plot) => {
              const capacity = Number(plot.slot_capacity || 0);
              const used = Math.min(capacity, Number(plot.used_slots || 0));
              const free = Math.max(0, capacity - used);
              const usagePercent = capacity > 0 ? Math.round((used / capacity) * 100) : 0;
              const barColor = usagePercent >= 90 ? 'bg-amber-500' : usagePercent > 0 ? 'bg-emerald-500' : 'bg-slate-300';

              return (
                <article key={plot.id} className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${plot.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        <LayoutGrid className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-black text-slate-900">{plot.name}</h3>
                        <div className="mt-1 flex items-center gap-1 text-xs font-medium text-slate-500">
                          <MapPin className="h-3.5 w-3.5" />
                          <span className="truncate">{plot.zone_name}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => togglePlotActive(plot)}
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold transition ${plot.is_active ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                      title="คลิกเพื่อเปลี่ยนสถานะ"
                    >
                      {plot.is_active ? 'ใช้งาน' : 'ปิดใช้งาน'}
                    </button>
                  </div>

                  <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                    <div className="mb-2 flex items-end justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-semibold text-slate-500">ช่องปลูกที่รอบปัจจุบันใช้งาน</p>
                        <p className="mt-0.5 text-xl font-black leading-none text-slate-900">
                          {used.toLocaleString()} <span className="text-xs font-semibold text-slate-500">/ {capacity.toLocaleString()} ช่อง</span>
                        </p>
                      </div>
                      <span className={`text-sm font-black ${usagePercent >= 90 ? 'text-amber-700' : 'text-emerald-700'}`}>{usagePercent}%</span>
                    </div>
                    <div role="progressbar" aria-label={`การใช้งานแปลง ${plot.name}`} aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={used} className="h-2.5 overflow-hidden rounded-full bg-white ring-1 ring-slate-200">
                      <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${usagePercent}%` }} />
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">เหลือพื้นที่ {free.toLocaleString()} ช่อง</p>
                  </div>

                  <div className="mt-4 min-h-[68px]">
                    <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      <Sprout className="h-3.5 w-3.5 text-emerald-600" />ผักที่กำลังปลูก
                    </div>
                    {(plot.crop_names || []).length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {(plot.crop_names || []).map((cropName) => (
                          <span key={cropName} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                            <Leaf className="h-3 w-3" />{cropName}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400">ยังไม่มีผักปลูกในแปลงนี้</p>
                    )}
                  </div>

                  {(plot.occupying_rounds || []).length > 0 && (
                    <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5">
                      <p className="text-[11px] font-bold text-emerald-900">รอบที่ใช้แปลงนี้</p>
                      <div className="mt-1.5 space-y-1">
                        {(plot.occupying_rounds || []).map((round, index) => (
                          <p key={`${round.id}-${index}`} className="flex items-center justify-between gap-2 text-xs text-emerald-900">
                            <span className="min-w-0 truncate">{round.name} · {round.crop_name}</span>
                            <strong className="shrink-0">{round.used_slots.toLocaleString()} ช่อง</strong>
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {plot.notes && <p className="mt-3 truncate border-t border-slate-100 pt-3 text-[11px] text-slate-400" title={plot.notes}>{plot.notes}</p>}

                  <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                    <button onClick={() => openEditModal(plot)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-emerald-50 hover:text-emerald-700" title="แก้ไขแปลง">
                      <Edit2 className="h-3.5 w-3.5" />แก้ไข
                    </button>
                    <button onClick={() => handleDelete(plot)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-rose-50 hover:text-rose-700" title="ลบแปลง">
                      <Trash2 className="h-3.5 w-3.5" />ลบ
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-lg font-bold text-slate-900">
                {editingPlotId ? 'แก้ไขข้อมูลแปลงปลูก' : 'สร้างแปลงปลูกใหม่'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs sm:text-sm">
              {/* Plot Name */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">ชื่อแปลงปลูก *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="เช่น แปลง A1, รางปลูกไฮโดร 01"
                  required
                  className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Zone Name */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">ชื่อโซน / โรงเรือน *</label>
                <input
                  type="text"
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                  placeholder="เช่น โซน A (โรงเรือนกรีนเฮ้าส์ 1)"
                  required
                  className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {existingZones.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-[11px] text-slate-400">เลือกโซนเดิม:</span>
                    {existingZones.map((z) => (
                      <button
                        key={z}
                        type="button"
                        onClick={() => setZoneName(z)}
                        className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px]"
                      >
                        {z}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Slot Capacity */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-100 space-y-1">
                <label className="font-bold text-emerald-950 block">
                  จำนวนช่องปลูก (Slots) ในแปลงนี้ *
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={slotCapacity}
                  onChange={(e) => setSlotCapacity(parseInt(e.target.value, 10) || 0)}
                  required
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-extrabold text-emerald-800 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-[11px] text-emerald-800 block">
                  💡 โควตาช่องปลูกคงเหลือที่สร้างได้ในฟาร์ม: <strong>{availableSlots.toLocaleString()} ช่อง</strong> (ความจุฟาร์มรวม {farmTotalSlots.toLocaleString()} ช่อง)
                </span>
              </div>

              {/* Crop Selection */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  ชนิดผักที่จะปลูกในแปลงนี้
                </label>
                <select
                  value={cropId}
                  onChange={(e) => setCropId(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- ยังไม่ระบุชนิดผัก --</option>
                  {activeCrops.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (฿{Number(c.default_price_per_kg).toFixed(0)}/กก. • {c.slots_per_kg || 4} ช่อง/กก.)
                    </option>
                  ))}
                  {cropId && !activeCrops.some((crop) => crop.id === cropId) && crops.find((crop) => crop.id === cropId) && (
                    <option value={cropId} disabled>{crops.find((crop) => crop.id === cropId)?.name} (ปิดใช้งานแล้ว · รายการเดิม)</option>
                  )}
                </select>
                {cropId && (() => {
                  const sel = crops.find(c => c.id === cropId);
                  const slotsRate = sel?.slots_per_kg ? Number(sel.slots_per_kg) : 4.0;
                  const estYield = Number(slotCapacity) > 0 ? (Number(slotCapacity) / slotsRate).toFixed(1) : 0;
                  return (
                    <span className="text-[11px] text-sky-700 bg-sky-50 border border-sky-100 p-2 rounded-xl mt-2 block">
                      🌱 อัตราส่วน {slotsRate} ช่อง/กก. ➔ เมื่อปลูกเต็มแปลง ({slotCapacity || 0} ช่อง) จะได้ผลผลิตประมาณ <strong>{estYield} กก.</strong>
                    </span>
                  );
                })()}
                <span className="text-[11px] text-slate-400 mt-1 block">
                  * ดึงรายการผักจากแคตตาล็อกชนิดผักที่ได้บันทึกไว้
                </span>
              </div>

              {/* Plot Active Toggle */}
              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded"
                  />
                  <div>
                    <span className="font-bold text-slate-900 block">เปิดใช้งานแปลงปลูกนี้</span>
                    <span className="text-[11px] text-slate-500">
                      {isActive ? 'แปลงนี้เปิดใช้งานอยู่ พร้อมสำหรับการปลูก' : 'แปลงนี้ปิดใช้งานชั่วคราว'}
                    </span>
                  </div>
                </label>
              </div>

              {/* Notes */}
              <div>
                <label className="font-medium text-slate-700 block mb-1">หมายเหตุเพิ่มเติม</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="เช่น รางปลูกระบบ NFT 12 แถว"
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  {saving ? 'กำลังบันทึก...' : editingPlotId ? 'บันทึกการแก้ไข' : 'สร้างแปลงปลูก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
