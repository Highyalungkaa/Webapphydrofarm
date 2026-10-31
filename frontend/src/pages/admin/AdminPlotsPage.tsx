import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { getPlotCropIds } from '../../lib/plotCrops.js';
import { PlotCard } from '../../components/admin/PlotCard.js';
import { Plot, Crop } from '../../types/index.js';
import {
  Plus,
  AlertCircle,
  X,
  SlidersHorizontal,
  Sprout,
  LayoutGrid,
} from 'lucide-react';

const isPlotInUse = (plot: Plot) => Number(plot.used_slots || 0) > 0 || (plot.occupying_rounds || []).length > 0;

export const AdminPlotsPage: React.FC = () => {
  const [allPlots, setAllPlots] = useState<Plot[]>([]);
  const [unassignedRoundItems, setUnassignedRoundItems] = useState<Array<{ round_id: string; round_name: string; crop_name: string }>>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters
  const [zoneFilter, setZoneFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('true');
  const [removalPlot, setRemovalPlot] = useState<Plot | null>(null);
  const [removalAction, setRemovalAction] = useState<'delete' | 'deactivate'>('delete');
  const [removing, setRemoving] = useState(false);
  const [removalError, setRemovalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlotId, setEditingPlotId] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [zoneName, setZoneName] = useState('');
  const [slotCapacity, setSlotCapacity] = useState<number>(200);
  const [cropIds, setCropIds] = useState<string[]>([]);
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
        api.get<{ plots: Plot[]; unassigned_round_items?: Array<{ round_id: string; round_name: string; crop_name: string }> }>(
          '/admin/plots'
        ),
        api.get<Crop[]>('/admin/crops'),
      ]);

      setAllPlots(plotsRes.plots || []);
      setUnassignedRoundItems(plotsRes.unassigned_round_items || []);
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
  const plotGroups = [
    { key: 'in-use', title: 'โซนใช้งาน', description: 'แปลงที่มีรอบปลูกกำลังใช้งานอยู่', plots: plots.filter(isPlotInUse), emptyMessage: 'ยังไม่มีแปลงที่กำลังใช้งาน', icon: Sprout },
    { key: 'vacant', title: 'โซนพื้นที่ว่าง', description: 'แปลงที่ยังไม่มีรอบปลูกใช้งาน', plots: plots.filter((plot) => !isPlotInUse(plot)), emptyMessage: 'ยังไม่มีแปลงว่าง', icon: LayoutGrid },
  ];

  // Get unique zone names from existing plots
  const existingZones = Array.from(new Set(allPlots.map((p) => p.zone_name).filter(Boolean)));

  const openCreateModal = () => {
    setEditingPlotId(null);
    setName(`แปลงที่ ${allPlots.length + 1}`);
    setZoneName(existingZones.length > 0 ? existingZones[0] : 'โซน A (โรงเรือน 1)');
    setSlotCapacity(200);
    setCropIds([]);
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
    setCropIds(getPlotCropIds(plot));
    setIsActive(plot.is_active);
    setNotes(plot.notes || '');
    setError(null);
    setIsModalOpen(true);
  };

  const togglePlotActive = async (plot: Plot) => {
    if (plot.is_active) { setRemovalAction('deactivate'); setRemovalPlot(plot); setRemovalError(null); return; }
    try {
      await api.put(`/admin/plots/${plot.id}`, {
        name: plot.name,
        zone_name: plot.zone_name,
        slot_capacity: plot.slot_capacity,
        crop_ids: getPlotCropIds(plot),
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

    try {
      setSaving(true);
      const payload = {
        name: name.trim(),
        zone_name: zoneName.trim(),
        slot_capacity: Number(slotCapacity),
        crop_ids: cropIds,
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

  const handleDelete = (plot: Plot) => { setRemovalAction('delete'); setRemovalPlot(plot); setRemovalError(null); };
  const removePlot = async (permanent: boolean) => {
    if (!removalPlot || removing) return;
    setRemoving(true); setRemovalError(null);
    try {
      if (permanent) await api.delete(`/admin/plots/${removalPlot.id}`);
      else await api.put(`/admin/plots/${removalPlot.id}`, {
        name: removalPlot.name, zone_name: removalPlot.zone_name,
        slot_capacity: removalPlot.slot_capacity, crop_ids: getPlotCropIds(removalPlot),
        is_active: false, notes: removalPlot.notes,
      });
      setRemovalPlot(null);
      setNotice(permanent ? 'ลบแปลงแล้ว ประวัติรอบปลูกและผักเสียหายยังอยู่' : 'เลิกใช้งานแปลงแล้ว ประวัติยังอยู่ครบ ดูหรือเปิดใช้งานอีกครั้งได้จากตัวกรอง “เลิกใช้งานแล้ว”');
      await loadData();
    } catch (err: any) { setRemovalError(err.message || 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setRemoving(false); }
  };

  const totalPlotCapacity = allPlots.reduce((sum, plot) => sum + Number(plot.slot_capacity || 0), 0);
  const occupiedSlots = allPlots.reduce((sum, plot) => sum + Number(plot.used_slots || 0), 0);
  const availableActiveSlots = allPlots
    .filter((plot) => plot.is_active)
    .reduce((sum, plot) => sum + Math.max(0, Number(plot.slot_capacity || 0) - Number(plot.used_slots || 0)), 0);
  const occupiedPlots = allPlots.filter((plot) => Number(plot.used_slots || 0) > 0).length;

  return (
    <div className="space-y-6">
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">การจัดการแปลงปลูก (Plots Management)</h1>
          <p className="text-xs sm:text-sm text-slate-500">
            สร้างแปลงปลูกตามโซน กำหนดจำนวนต้นที่แต่ละแปลงรองรับ และเลือกผักได้หลายชนิดต่อแปลง
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
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

      {!loading && !loadError && allPlots.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-bold text-emerald-800">ความจุรวมของแปลงทั้งหมด</p>
            <p className="mt-1 text-xl font-black text-emerald-950">{totalPlotCapacity.toLocaleString()} <span className="text-xs font-semibold">ต้น</span></p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-bold text-emerald-800">จำนวนต้นที่กำลังปลูก</p>
            <p className="mt-1 text-xl font-black text-emerald-950">{occupiedSlots.toLocaleString()} <span className="text-xs font-semibold">ต้น</span></p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs font-bold text-slate-600">พื้นที่ว่างในแปลงที่ใช้งาน</p>
            <p className="mt-1 text-xl font-black text-slate-900">{availableActiveSlots.toLocaleString()} <span className="text-xs font-semibold">ต้น</span></p>
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
          <option value="false">เลิกใช้งานแล้ว</option>
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
          <div className="space-y-7 bg-slate-50/70 p-4 sm:p-5">
            {plotGroups.map((group) => (
              <section key={group.key} aria-labelledby={`plot-group-${group.key}`}>
                <header className="mb-4 flex items-center gap-3">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${group.key === 'in-use' ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}><group.icon className="h-5 w-5" /></span>
                  <div>
                    <h3 id={`plot-group-${group.key}`} className="flex items-center gap-2 text-base font-extrabold text-slate-900">{group.title}<span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">{group.plots.length} แปลง</span></h3>
                    <p className="mt-0.5 text-xs text-slate-500">{group.description}</p>
                  </div>
                </header>
                {group.plots.length > 0 ? (
                  <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2 2xl:grid-cols-3">
                    {group.plots.map((plot) => <PlotCard key={plot.id} plot={plot} crops={crops} onEdit={openEditModal} onToggle={togglePlotActive} onDelete={handleDelete} />)}
                  </div>
                ) : (
                  <p className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-4 py-6 text-center text-sm text-slate-400">{group.emptyMessage}</p>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
      {removalPlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onKeyDown={e => { if (e.key === 'Escape' && !removing) setRemovalPlot(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="remove-plot-title" className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <h2 id="remove-plot-title" className="text-lg font-bold text-slate-900">{removalAction === 'delete' ? 'ลบแปลงถาวร' : 'เลิกใช้งานแปลง'} {removalPlot.name}</h2>
            <p className="text-sm leading-relaxed text-slate-600">{removalAction === 'delete'
              ? 'การลบถาวรจะนำแปลงออกจากรายการจัดการ ประวัติการปลูกและผักเสียหายที่บันทึกไว้จะยังอยู่'
              : 'แปลงนี้จะไม่แสดงให้เลือกในรอบปลูกใหม่ ประวัติเดิมยังอยู่ และเปิดใช้งานอีกครั้งได้'}</p>
            {removalAction === 'delete' && isPlotInUse(removalPlot) && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">แปลงนี้ยังมีรอบปลูกดำเนินอยู่ กรุณาสิ้นสุดรอบก่อนลบถาวร</p>}
            {removalError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{removalError}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <button autoFocus disabled={removing} onClick={() => setRemovalPlot(null)} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50">ยกเลิก</button>
              {removalAction === 'delete' && <button disabled={removing || isPlotInUse(removalPlot)} onClick={() => removePlot(true)} className="rounded-xl border border-rose-200 px-4 py-2 text-sm text-rose-700 disabled:opacity-50">ลบถาวร</button>}
              {removalAction === 'deactivate' && <button disabled={removing} onClick={() => removePlot(false)} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{removing ? 'กำลังบันทึก...' : 'เลิกใช้งานแปลง'}</button>}
            </div>
          </div>
        </div>
      )}
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
                  จำนวนต้นสูงสุดที่แปลงนี้รองรับ *
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
                  💡 กำหนดจำนวนต้นที่แปลงนี้รองรับได้ ระบบจะตรวจพื้นที่ว่างของแปลงเมื่อสร้างรอบปลูก
                </span>
              </div>

              {/* Crop Selection */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  ชนิดผักที่จะปลูกในแปลงนี้
                </label>
                <p className="mb-2 text-xs text-slate-500">เลือกผักได้หลายชนิด ไม่จำกัดจำนวนชนิดต่อแปลง (เลือกแล้ว {cropIds.length} ชนิด)</p>
                <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {crops.filter((crop) => crop.is_active !== false || cropIds.includes(crop.id)).map((crop) => (
                    <label key={crop.id} className="flex cursor-pointer items-center gap-3 p-3 hover:bg-emerald-50">
                      <input
                        type="checkbox"
                        checked={cropIds.includes(crop.id)}
                        onChange={(event) => setCropIds((previous) => event.target.checked ? [...previous, crop.id] : previous.filter((id) => id !== crop.id))}
                        className="h-4 w-4 rounded text-emerald-600"
                      />
                      <span>
                        <span className="block text-sm font-bold text-slate-800">{crop.name}{crop.is_active === false ? ' (ปิดใช้งานแล้ว · รายการเดิม)' : ''}</span>
                        <span className="text-xs text-slate-500">฿{Number(crop.default_price_per_kg).toFixed(0)}/กก.</span>
                      </span>
                    </label>
                  ))}
                  {activeCrops.length === 0 && cropIds.length === 0 && <p className="p-3 text-xs text-slate-500">ยังไม่มีชนิดผักที่เปิดใช้งานในแคตตาล็อก</p>}
                </div>
                <p className="mt-2 text-[11px] text-slate-500">จำนวนต้นที่รองรับเป็นความจุรวมของแปลง ใช้ร่วมกันสำหรับผักทุกชนิดที่เลือก</p>
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
