import { RoundStatusBadge } from '../../components/common/RoundStatusBadge.js';
import { getRoundCropAvailability } from '../../lib/roundCropAvailability.js';
import { plantCountToKg } from '../../lib/plantingQuantities.js';
import { plotSupportsCrop, allocatePlotSlots } from '../../lib/plotCrops.js';
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { formatDateDMY } from '../../lib/dateFormat.js';
import { transplantDate } from '../../lib/roundStepDates.js';
import { PlantingRound, Crop, Plot } from '../../types/index.js';
import {
  CalendarDays,
  Plus,
  Trash2,
  AlertCircle,
  X,
  Leaf,
  Sprout,
  Layers,
  ArrowRight,
  Clock,
  Sparkles,
  LayoutGrid,
  CheckCircle2,
  History,
  AlertTriangle,
  Info,
} from 'lucide-react';

interface RoundItemForm {
  crop_id: string;
  selected_plot_ids: string[];
  plant_count: number;
  price_per_kg: number;
  growing_days: number | '';
}

export const AdminRoundsPage: React.FC = () => {
  const navigate = useNavigate();
  const [rounds, setRounds] = useState<PlantingRound[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [loading, setLoading] = useState(true);
  const [setupLoadError, setSetupLoadError] = useState<string | null>(null);

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
      setSetupLoadError(null);
      const [roundsRes, cropsRes, plotsRes] = await Promise.allSettled([
        api.get<PlantingRound[]>('/admin/rounds'),
        api.get<Crop[]>('/admin/crops'),
        api.get<{ plots: Plot[] }>('/admin/plots'),
      ]);
      const failures = [
        { result: roundsRes, label: 'รอบปลูก' }, { result: cropsRes, label: 'แคตตาล็อกผัก' }, { result: plotsRes, label: 'แปลงปลูก' },
      ].filter((entry) => entry.result.status === 'rejected');
      if (failures.length) setSetupLoadError('ไม่สามารถโหลดข้อมูล' + failures.map((entry) => entry.label).join(', ') + ' จึงยังตรวจสอบความพร้อมสำหรับเพิ่มผักไม่ได้ กรุณาลองโหลดข้อมูลอีกครั้ง');
      if (roundsRes.status === 'fulfilled') setRounds(roundsRes.value || []);
      if (cropsRes.status === 'fulfilled') setCrops(cropsRes.value || []);
      if (plotsRes.status === 'fulfilled') setPlots(plotsRes.value?.plots || []);
    } catch (err: any) {
      setSetupLoadError(err.message || 'ไม่สามารถโหลดข้อมูลความพร้อมของผักและแปลงปลูกได้');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const activePlots = plots.filter((p) => p.is_active);
  const cropAvailability = getRoundCropAvailability(crops, plots, items.map((item) => item.crop_id));
  const designatedCrops = cropAvailability.readyCrops;

  // Active ongoing rounds that are currently occupying farm plots (step 1 to 7, not completed or cancelled)
  const activeOngoingRounds = React.useMemo(() => {
    return rounds.filter(
      (r) => r.status !== 'completed' && r.status !== 'cancelled' && (r.current_step ?? 1) < 8 && !r.completed_date
    );
  }, [rounds]);

  // Calculate used slots per plot from active ongoing rounds
  const plotOccupancyMap = React.useMemo(() => {
    const map: Record<
      string,
      {
        occupiedSlots: number;
        occupyingRounds: Array<{ roundId: string; roundName: string; cropName: string; usedSlots: number; step: number }>;
      }
    > = {};

    activePlots.forEach((p) => {
      map[p.id] = { occupiedSlots: 0, occupyingRounds: [] };
    });

    activeOngoingRounds.forEach((r) => {
      let rCropPlotIds: Record<string, string[]> = {};
      try {
        const parsed = JSON.parse(r.notes || '{}');
        if (parsed && typeof parsed.cropPlotIds === 'object') {
          rCropPlotIds = parsed.cropPlotIds;
        }
      } catch {}

      (r.round_items || []).forEach((item: any) => {
        const crop = crops.find((c) => c.id === item.crop_id) || item.crops;
        const rate = crop?.slots_per_kg ? Number(crop.slots_per_kg) : 4.0;
        let slotsNeeded = item.plant_count ?? Math.round((Number(item.bookable_qty_kg) || 0) * rate);

        // Plots assigned to this item
        const itemPlotIds: string[] = rCropPlotIds[item.crop_id] || (Array.isArray(item.plot_ids) ? item.plot_ids : []);
        const itemPlots = itemPlotIds.length > 0
          ? activePlots.filter((p) => itemPlotIds.includes(p.id))
          : activePlots.filter((p) => plotSupportsCrop(p, item.crop_id));

        itemPlots.forEach((plot) => {
          if (slotsNeeded <= 0) return;
          const occ = map[plot.id];
          if (!occ) return;
          const cap = Number(plot.slot_capacity || 0);
          const currentOcc = occ.occupiedSlots;
          const remainingInPlot = Math.max(0, cap - currentOcc);
          const usedInThisPlot = Math.min(slotsNeeded, remainingInPlot);
          occ.occupiedSlots += usedInThisPlot;
          occ.occupyingRounds.push({
            roundId: r.id,
            roundName: r.name,
            cropName: crop?.name || 'ผัก',
            usedSlots: usedInThisPlot,
            step: r.current_step || 1,
          });
          slotsNeeded -= usedInThisPlot;
        });
      });
    });

    return map;
  }, [rounds, activePlots, crops, activeOngoingRounds]);

  const farmTotalSlots = activePlots.reduce((s, p) => s + Number(p.slot_capacity || 0), 0);
  const farmOccupiedSlots = Object.values(plotOccupancyMap).reduce((s, o) => s + o.occupiedSlots, 0);
  const farmAvailableSlots = Math.max(0, farmTotalSlots - farmOccupiedSlots);
  const isFarmFullyOccupied = farmTotalSlots > 0 && farmAvailableSlots === 0;

  const openCreateModal = () => {
    const today = new Date().toISOString().split('T')[0];
    const yearTh = new Date().getFullYear() + 543;
    const roundNumber = rounds.length + 1;

    setName(`รอบการปลูกที่ ${roundNumber}/${yearTh}`);
    setSeedDate(today);
    setNotes('');

    // Let the administrator choose which crops to include in this round.
    setItems([]);

    setFormError(null);
    setIsModalOpen(true);
  };

  const plotSlotAllocation = allocatePlotSlots(
    activePlots, items,
    Object.fromEntries(crops.map((crop) => [crop.id, Number(crop.slots_per_kg) || 4])),
    Object.fromEntries(Object.entries(plotOccupancyMap).map(([id, usage]) => [id, usage.occupiedSlots])),
  );
  const itemOccupiedSlots = (index: number, plotId: string) =>
    plotSlotAllocation.beforeItem[index]?.[plotId] ?? plotOccupancyMap[plotId]?.occupiedSlots ?? 0;

  const handleAddItem = () => {
    setFormError(null);
    const availableCrop = cropAvailability.remainingCrops[0];
    if (!availableCrop) {
      setFormError(setupLoadError || cropAvailability.issues[0]?.message || 'เพิ่มผักที่พร้อมปลูกครบทุกชนิดแล้ว หากต้องการเพิ่มชนิดอื่น กรุณาตรวจสอบแคตตาล็อกผักและแปลงปลูก');
      return;
    }
    const cropPlots = activePlots.filter((p) => plotSupportsCrop(p, availableCrop.id));
    const availableCropPlots = cropPlots.filter((p) => {
      const occ = plotSlotAllocation.used[p.id] || 0;
      return Number(p.slot_capacity || 0) - occ > 0;
    });
    const plotIds = availableCropPlots.map((p) => p.id);
    const totalAvailableSlots = availableCropPlots.reduce((sum, p) => {
      const occ = plotSlotAllocation.used[p.id] || 0;
      return sum + Math.max(0, Number(p.slot_capacity || 0) - occ);
    }, 0);
    const rate = availableCrop.slots_per_kg ? Number(availableCrop.slots_per_kg) : 4.0;
    const defaultPlantCount = Math.max(0, Math.floor(totalAvailableSlots));

    setItems((prev) => [
      ...prev,
      {
        crop_id: availableCrop.id,
        selected_plot_ids: plotIds,
        plant_count: defaultPlantCount,
        price_per_kg: Number(availableCrop.default_price_per_kg) || 130,
        growing_days: '',
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemCropChange = (index: number, cropId: string) => {
    const selected = designatedCrops.find((c) => c.id === cropId);
    if (!selected) {
      const crop = crops.find((crop) => crop.id === cropId);
      setFormError(crop ? getRoundCropAvailability([crop], plots).issues[0]?.message || 'ชนิดผักนี้ยังไม่พร้อมปลูก' : 'ไม่พบชนิดผักนี้ กรุณาตรวจสอบแคตตาล็อกผัก');
      return;
    }
    if (items.some((item, itemIndex) => itemIndex !== index && item.crop_id === cropId)) {
      setFormError('ชนิดผักนี้อยู่ในรอบแล้ว กรุณาเลือกชนิดอื่น');
      return;
    }
    setFormError(null);
    const cropPlots = activePlots.filter((p) => plotSupportsCrop(p, cropId));
    const availableCropPlots = cropPlots.filter((p) => {
      const occ = itemOccupiedSlots(index, p.id);
      return Number(p.slot_capacity || 0) - occ > 0;
    });
    const plotIds = availableCropPlots.map((p) => p.id);
    const totalAvailableSlots = availableCropPlots.reduce((sum, p) => {
      const occ = itemOccupiedSlots(index, p.id);
      return sum + Math.max(0, Number(p.slot_capacity || 0) - occ);
    }, 0);
    const rate = selected?.slots_per_kg ? Number(selected.slots_per_kg) : 4.0;
    const defaultPlantCount = Math.max(0, Math.floor(totalAvailableSlots));

    setItems(
      items.map((it, i) => {
        if (i !== index) return it;
        return {
          ...it,
          crop_id: cropId,
          selected_plot_ids: plotIds,
          plant_count: defaultPlantCount,
          price_per_kg: selected ? Number(selected.default_price_per_kg) : it.price_per_kg,
          growing_days: '',
        };
      })
    );
  };

  const handleTogglePlot = (itemIndex: number, plotId: string) => {
    const occ = plotOccupancyMap[plotId];
    const plot = activePlots.find((p) => p.id === plotId);
    if (!plot || !plotSupportsCrop(plot, items[itemIndex]?.crop_id)) {
      setFormError('เลือกได้เฉพาะแปลงที่กำหนดไว้สำหรับผักชนิดนี้');
      return;
    }
    const cap = Number(plot?.slot_capacity || 0);
    const available = Math.max(0, cap - itemOccupiedSlots(itemIndex, plotId));

    setItems((prevItems) =>
      prevItems.map((it, idx) => {
        if (idx !== itemIndex) return it;

        const currentSelected = it.selected_plot_ids || [];
        const isSelected = currentSelected.includes(plotId);

        // If plot is 100% full by other active rounds and user tries to select it
        if (!isSelected && available === 0) {
          const roundNames = occ?.occupyingRounds?.map((r) => r.roundName).join(', ') || 'รอบที่กำลังปลูกอยู่';
          alert(`⚠️ แปลง "${plot?.name}" ถูกใช้งานเต็ม 100% โดย ${roundNames} แล้ว ไม่สามารถเลือกปลูกในรอบนี้ได้`);
          return it;
        }

        const newSelected = isSelected
          ? currentSelected.filter((id) => id !== plotId)
          : [...currentSelected, plotId];

        // Recalculate available slots from chosen plots
        const crop = crops.find((c) => c.id === it.crop_id);
        const rate = crop?.slots_per_kg ? Number(crop.slots_per_kg) : 4.0;
        const chosenPlots = activePlots.filter((p) => newSelected.includes(p.id));
        const newAvailableSlots = chosenPlots.reduce((sum, p) => {
          const pOcc = itemOccupiedSlots(itemIndex, p.id);
          return sum + Math.max(0, Number(p.slot_capacity || 0) - pOcc);
        }, 0);
        const calculatedPlantCount = Math.max(0, Math.floor(newAvailableSlots));

        return {
          ...it,
          selected_plot_ids: newSelected,
          plant_count: it.plant_count === 0 ? calculatedPlantCount : it.plant_count,
        };
      })
    );
  };

  const handleSelectAllPlotsForCrop = (itemIndex: number) => {
    setItems((prevItems) =>
      prevItems.map((it, idx) => {
        if (idx !== itemIndex) return it;
        const designatedPlots = activePlots.filter((p) => plotSupportsCrop(p, it.crop_id));
        // Only select plots that have available space > 0
        const availablePlots = designatedPlots.filter((p) => {
          const occ = itemOccupiedSlots(itemIndex, p.id);
          return Number(p.slot_capacity || 0) - occ > 0;
        });
        const plotIds = availablePlots.map((p) => p.id);
        const crop = crops.find((c) => c.id === it.crop_id);
        const rate = crop?.slots_per_kg ? Number(crop.slots_per_kg) : 4.0;
        const newSlots = availablePlots.reduce((sum, p) => {
          const occ = itemOccupiedSlots(itemIndex, p.id);
          return sum + Math.max(0, Number(p.slot_capacity || 0) - occ);
        }, 0);
        const newPlantCount = Math.max(0, Math.floor(newSlots));

        return {
          ...it,
          selected_plot_ids: plotIds,
          plant_count: newPlantCount,
        };
      })
    );
  };

  const handleDeselectAllPlots = (itemIndex: number) => {
    setItems((prevItems) =>
      prevItems.map((it, idx) => (idx === itemIndex ? { ...it, selected_plot_ids: [], plant_count: 0 } : it))
    );
  };

  const handleMatchCapacityPlants = (itemIndex: number) => {
    setItems((prevItems) =>
      prevItems.map((it, idx) => {
        if (idx !== itemIndex) return it;
        const crop = crops.find((c) => c.id === it.crop_id);
        const rate = crop?.slots_per_kg ? Number(crop.slots_per_kg) : 4.0;
        const chosenPlots = activePlots.filter((p) => (it.selected_plot_ids || []).includes(p.id));
        const availableSlotsInChosen = chosenPlots.reduce((sum, p) => {
          const occ = itemOccupiedSlots(itemIndex, p.id);
          return sum + Math.max(0, Number(p.slot_capacity || 0) - occ);
        }, 0);
        const matchedPlantCount = Math.max(0, Math.floor(availableSlotsInChosen));
        return {
          ...it,
          plant_count: matchedPlantCount,
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
    if (loading || setupLoadError) {
      setFormError(setupLoadError || 'กำลังตรวจสอบข้อมูลผักและแปลงปลูก กรุณารอสักครู่');
      return;
    }

    if (!name.trim()) {
      setFormError('กรุณาระบุชื่อรอบการปลูก');
      return;
    }

    if (items.length === 0) {
      setFormError('กรุณาเพิ่มรายการผักที่จะปลูกในรอบนี้อย่างน้อย 1 ชนิด');
      return;
    }

    // 1. Check if whole farm is full
    if (isFarmFullyOccupied) {
      const roundNames = activeOngoingRounds.map((r) => r.name).join(', ');
      setFormError(
        `ไม่สามารถสร้างรอบปลูกใหม่ได้: แปลงปลูกในฟาร์มทั้งหมดถูกใช้งานเต็ม 100% แล้ว (${roundNames}) กรุณารอให้รอบเดิมสิ้นสุดก่อน`
      );
      return;
    }

    // 2. Strict validation: check each item against actual remaining plot space
    for (const [itemIndex, it] of items.entries()) {
      const crop = crops.find((c) => c.id === it.crop_id);
      const cropName = crop?.name || 'ผัก';
      if (it.growing_days === '' || !Number.isSafeInteger(it.growing_days) || it.growing_days < 1) {
        setFormError(`กรุณาระบุวันปลูกของ ${cropName} เป็นจำนวนเต็มมากกว่า 0`);
        return;
      }
      if (!designatedCrops.some((designated) => designated.id === it.crop_id)) {
        setFormError(crop ? getRoundCropAvailability([crop], plots).issues[0]?.message || `${cropName} ยังไม่พร้อมปลูก` : 'ไม่พบชนิดผักที่เลือก กรุณาตรวจสอบแคตตาล็อกผัก');
        return;
      }
      const rate = crop?.slots_per_kg ? Number(crop.slots_per_kg) : 4.0;
      const targetKg = plantCountToKg(it.plant_count, rate);
      const requiredSlots = it.plant_count;
      if (!Number.isSafeInteger(it.plant_count) || it.plant_count <= 0) {
        setFormError(`กรุณาระบุจำนวนต้นของ ${cropName} เป็นจำนวนเต็มมากกว่า 0`);
        return;
      }
      const selectedPlotIds = it.selected_plot_ids || [];
      const chosenPlots = activePlots.filter((p) => selectedPlotIds.includes(p.id) && plotSupportsCrop(p, it.crop_id));

      if (chosenPlots.length === 0 || chosenPlots.length !== selectedPlotIds.length) {
        setFormError(`กรุณาเลือกแปลงปลูกสำหรับ ${cropName} อย่างน้อย 1 แปลง`);
        return;
      }

      // Calculate REAL available slots in chosen plots (deducting other active rounds)
      let availableSlotsInChosen = 0;
      let occupiedInChosen = 0;
      const occupyingRoundNames: string[] = [];

      chosenPlots.forEach((p) => {
        const occ = plotOccupancyMap[p.id];
        const pOccupied = itemOccupiedSlots(itemIndex, p.id);
        const pCap = Number(p.slot_capacity || 0);
        occupiedInChosen += pOccupied;
        availableSlotsInChosen += Math.max(0, pCap - pOccupied);
        occ?.occupyingRounds.forEach((r) => {
          if (!occupyingRoundNames.includes(r.roundName)) occupyingRoundNames.push(r.roundName);
        });
      });

      if (availableSlotsInChosen === 0) {
        setFormError(
          `แปลงที่เลือกสำหรับ ${cropName} ถูกใช้งานเต็ม 100% แล้วในรอบ ${occupyingRoundNames.join(', ')} จึงไม่สามารถสร้างรอบใหม่ได้ กรุณาเลือกแปลงอื่นที่มีพื้นที่ว่าง`
        );
        return;
      }

      if (requiredSlots > availableSlotsInChosen) {
        const maxKg = plantCountToKg(availableSlotsInChosen, rate);
        setFormError(
          `พื้นที่แปลงสำหรับ ${cropName} ไม่เพียงพอ! แปลงที่เลือกเหลือพื้นที่ว่างจริงเพียง ${availableSlotsInChosen.toLocaleString()} ต้น (~${maxKg} กก.) แต่เป้าหมายต้องการ ${requiredSlots.toLocaleString()} ต้น (มีรอบเดิมใช้อยู่ ${occupiedInChosen.toLocaleString()} ต้น) กรุณาปรับลดจำนวนต้นไม่ให้เกิน ${availableSlotsInChosen.toLocaleString()} ต้น`
        );
        return;
      }
    }

    try {
      setSaving(true);
      const maxGrowingDays = Math.max(...items.map((i) => Number(i.growing_days)));

      const payload = {
        name: name.trim(),
        seed_date: seedDate || new Date().toISOString().split('T')[0],
        growing_days: maxGrowingDays,
        notes: notes.trim() || null,
        items: items.map((it) => ({
          crop_id: it.crop_id,
          plant_count: it.plant_count,
          estimated_qty_kg: plantCountToKg(it.plant_count, Number(crops.find((crop) => crop.id === it.crop_id)?.slots_per_kg) || 4),
          bookable_qty_kg: plantCountToKg(it.plant_count, Number(crops.find((crop) => crop.id === it.crop_id)?.slots_per_kg) || 4),
          price_per_kg: it.price_per_kg,
          growing_days: Number(it.growing_days),
          plot_ids: it.selected_plot_ids || [],
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
    if (round.closure_reason === 'unsold') return <RoundStatusBadge round={round} />;
    const step = round.current_step || 1;
    switch (step) {
      case 1:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
            🌱 สเต็ป 1: ปักเม็ด ({formatDateDMY(round.seed_date)})
          </span>
        );
      case 2:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 text-xs font-bold border border-sky-200">
            🧪 สเต็ป 2: ใส่ปุ๋ย ({formatDateDMY(round.fertilizing_date)})
          </span>
        );
      case 3:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-lime-50 text-lime-700 text-xs font-bold border border-lime-200">
            🌱 สเต็ป 3: เริ่มปลูก ({formatDateDMY(round.planting_start_date)})
          </span>
        );
      case 4:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 text-teal-700 text-xs font-bold border border-teal-200">
            🌿 สเต็ป 4: ปลูกจริง ({formatDateDMY(transplantDate(round))})
          </span>
        );
      case 5:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-300">
            🛒 สเต็ป 5: เปิดสั่งจองล่วงหน้า ({formatDateDMY(round.booking_opens_at)})
          </span>
        );
      case 6:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 text-xs font-bold border border-amber-300">
            🧺 สเต็ป 6: วันที่พร้อมเก็บและขาย ({formatDateDMY(round.harvest_sale_date || round.expected_harvest_date)})
          </span>
        );
      case 7:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200">
            🏷️ สเต็ป 7: ขายหมดแล้ว ({formatDateDMY(round.sold_out_date)})
          </span>
        );
      case 8:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold border border-slate-300">
            🏁 สเต็ป 8: สิ้นสุดรอบ
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
            สร้างรอบปลูกและจัดการวงจรชีวิต 8 สเต็ป: ปักเม็ด ➔ ใส่ปุ๋ย ➔ เริ่มปลูก ➔ ปลูกจริง ➔ เปิดจอง ➔ เก็บและขาย ➔ ขายหมด ➔ สิ้นสุดรอบ
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
                  const availableTotal = Number(round.total_available_kg ?? Math.max(0, bookableTotal - bookedTotal));
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
                          สร้างเมื่อ: {formatDateDMY(round.created_at)}
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
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-5 sm:p-7 max-w-3xl w-full shadow-2xl space-y-5 my-1 sm:my-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">สร้างรอบการปลูกใหม่</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  เลือกได้เฉพาะชนิดผักที่กำหนดไว้ในแปลงปลูก และเลือกแปลงของผักชนิดนั้นเท่านั้น
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
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-300 text-rose-800 text-xs flex items-start gap-2 shadow-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600 mt-0.5" />
                <span className="font-semibold leading-relaxed">{formError}</span>
              </div>
            )}

            {isFarmFullyOccupied && (
              <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-400 text-rose-900 space-y-2 shadow-sm">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h3 className="font-bold text-sm text-rose-800">
                      🚨 แปลงปลูกในฟาร์มถูกใช้งานเต็ม 100% แล้ว (ไม่มีพื้นที่ว่างสำหรับสร้างรอบใหม่)
                    </h3>
                    <p className="text-xs text-rose-700 leading-relaxed">
                      ฟาร์มมีความจุทั้งหมด <strong>{farmTotalSlots.toLocaleString()} ต้น</strong> ถูกใช้งานไปแล้ว <strong>{farmOccupiedSlots.toLocaleString()} ต้น</strong>
                      {activeOngoingRounds.length > 0 && (
                        <span> โดยรอบที่กำลังดำเนินการ: <strong>{activeOngoingRounds.map((r) => r.name).join(', ')}</strong></span>
                      )}
                    </p>
                    <p className="text-[11px] text-rose-600">
                      💡 หากต้องการสร้างรอบใหม่ กรุณารอให้รอบที่กำลังดำเนินการจบขั้นตอนและบันทึกสิ้นสุดรอบ หรือไปจัดการเพิ่มแปลงปลูกใหม่ในหน้า "จัดการแปลงปลูก"
                    </p>
                  </div>
                </div>
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
              <div className="rounded-3xl border-2 border-emerald-400 bg-emerald-100 shadow-sm">
                <div className="flex flex-col gap-3 rounded-t-3xl border-b-2 border-emerald-300 bg-emerald-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white shadow-sm">
                      <Leaf className="h-4 w-4" />
                    </div>
                    <div>
                      <label className="block text-sm font-black text-emerald-950">
                        ผักที่จะปลูกในรอบนี้ <span className="text-rose-500">*</span>
                      </label>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">
                        เลือกผักและระบุจำนวนต้น ระบบคำนวณน้ำหนักจากจำนวนต้นต่อกิโลกรัม โดยปัดเศษลงเป็นกิโลกรัมจำนวนเต็ม
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    disabled={loading || !!setupLoadError || isFarmFullyOccupied || cropAvailability.remainingCrops.length === 0}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-xs font-extrabold text-white shadow-md transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
                  >
                    <Plus className="h-4 w-4" />
                    <span>เพิ่มชนิดผัก</span>
                  </button>
                </div>

                <div className="space-y-4 p-3 sm:p-5">
                {setupLoadError ? (
                  <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-900">
                    <p>{setupLoadError}</p>
                    <button type="button" disabled={loading} onClick={() => void loadData()} className="mt-2 font-bold underline disabled:opacity-50">{loading ? 'กำลังโหลด...' : 'โหลดข้อมูลอีกครั้ง'}</button>
                  </div>
                ) : (
                  <>
                    {cropAvailability.issues.map((issue) => (
                      <div key={issue.kind} className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                        <p className="font-semibold leading-relaxed">{issue.message}</p>
                        <Link to={issue.href} target="_blank" rel="noopener noreferrer" className="self-start font-bold underline underline-offset-2">{issue.action} ↗</Link>
                      </div>
                    ))}
                    {cropAvailability.allAdded && <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0" />เพิ่มผักที่พร้อมปลูกครบทุกชนิดแล้ว ({designatedCrops.length} ชนิด)</p>}
                    {cropAvailability.issues.length > 0 && <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-600">หลังแก้ไขในหน้าที่เปิดใหม่แล้ว ให้กด<button type="button" disabled={loading} onClick={() => void loadData()} className="font-bold text-emerald-800 underline disabled:opacity-50">{loading ? 'กำลังตรวจสอบ...' : 'ตรวจสอบข้อมูลอีกครั้ง'}</button></p>}
                  </>
                )}

                {/* Overall Round Farm Capacity & Alert Summary Banner */}
                {items.length > 0 && (() => {
                  const allChosenPlotIds = Array.from(new Set(items.flatMap((it) => it.selected_plot_ids || [])));
                  const totalChosenPlotsSlots = activePlots
                    .filter((p) => allChosenPlotIds.includes(p.id))
                    .reduce((s, p) => s + Number(p.slot_capacity || 0), 0);
                  const totalAvailableInChosenPlots = activePlots
                    .filter((p) => allChosenPlotIds.includes(p.id))
                    .reduce((s, p) => {
                      const occ = plotOccupancyMap[p.id]?.occupiedSlots || 0;
                      return s + Math.max(0, Number(p.slot_capacity || 0) - occ);
                    }, 0);
                  const totalTargetKg = items.reduce((sum, it) => sum + plantCountToKg(it.plant_count, Number(crops.find((crop) => crop.id === it.crop_id)?.slots_per_kg) || 4), 0);
                  const totalRequiredSlots = items.reduce((s, it) => {
                    const c = crops.find((cr) => cr.id === it.crop_id);
                    const r = c?.slots_per_kg ? Number(c.slots_per_kg) : 4.0;
                    return s + it.plant_count;
                  }, 0);

                  const itemsWithoutPlots = items.filter((it) => (it.selected_plot_ids || []).length === 0);
                  const itemsOvercapacity = items.filter((it, itemIndex) => {
                    const c = crops.find((cr) => cr.id === it.crop_id);
                    const r = c?.slots_per_kg ? Number(c.slots_per_kg) : 4.0;
                    const req = it.plant_count;
                    const avail = activePlots
                      .filter((p) => (it.selected_plot_ids || []).includes(p.id))
                      .reduce((sum, p) => {
                        const occ = itemOccupiedSlots(itemIndex, p.id);
                        return sum + Math.max(0, Number(p.slot_capacity || 0) - occ);
                      }, 0);
                    return req > avail;
                  });

                  const plotUsageCounts: Record<string, number> = {};
                  items.forEach((it) => {
                    (it.selected_plot_ids || []).forEach((pid) => {
                      plotUsageCounts[pid] = (plotUsageCounts[pid] || 0) + 1;
                    });
                  });
                  const sharedPlotIds = Object.keys(plotUsageCounts).filter((pid) => plotUsageCounts[pid] > 1);

                  return (
                    <div className="mb-3 p-3.5 rounded-2xl bg-gradient-to-r from-emerald-50/90 via-teal-50/70 to-slate-50 border border-emerald-100/90 shadow-2xs space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-lg text-white ${isFarmFullyOccupied ? 'bg-rose-600' : 'bg-emerald-600'}`}>
                            <Layers className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-slate-800">
                              สรุปพื้นที่แปลงปลูก (คำนวณจากรอบเดิมที่กำลังดำเนินการ)
                            </h4>
                            <p className="text-[10px] text-slate-500">
                              ความจุฟาร์มรวม: {activePlots.length} แปลง ({farmTotalSlots.toLocaleString()} ต้น) • รอบเดิมใช้ไป: {farmOccupiedSlots.toLocaleString()} ต้น •
                              <strong className={farmAvailableSlots > 0 ? 'text-emerald-700 ml-1' : 'text-rose-600 ml-1'}>
                                {farmAvailableSlots > 0 ? `พื้นที่ว่างในฟาร์มเหลือ: ${farmAvailableSlots.toLocaleString()} ต้น` : 'แปลงในฟาร์มเต็มแล้ว (เหลือ 0 ต้น)'}
                              </strong>
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-slate-600">
                            ปลูกรอบนี้: <strong className="text-emerald-800">{totalRequiredSlots.toLocaleString()} ต้น</strong> (น้ำหนักประมาณ {totalTargetKg.toLocaleString()} กก.)
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="font-semibold text-slate-600">
                            แปลงที่เลือกรอบนี้: <strong className="text-slate-900">{allChosenPlotIds.length} แปลง</strong> (พื้นที่ว่างในแปลงที่เลือก: {totalAvailableInChosenPlots.toLocaleString()} ต้น)
                          </span>
                        </div>
                      </div>

                      {/* Overall farm capacity bar: Occupied vs Free */}
                      <div className="space-y-1">
                        <div className="w-full h-2.5 bg-slate-200/80 rounded-full overflow-hidden flex">
                          {/* Segment 1: Occupied by other rounds */}
                          <div
                            className="h-full bg-rose-500 transition-all duration-300"
                            style={{
                              width: `${farmTotalSlots > 0 ? Math.min(100, (farmOccupiedSlots / farmTotalSlots) * 100) : 0}%`,
                            }}
                            title={`รอบเดิมใช้ไป: ${farmOccupiedSlots} ต้น`}
                          />
                          {/* Segment 2: Allocated in this new round */}
                          <div
                            className="h-full bg-emerald-500 transition-all duration-300"
                            style={{
                              width: `${farmTotalSlots > 0 ? Math.min(100 - (farmOccupiedSlots / farmTotalSlots) * 100, (totalRequiredSlots / farmTotalSlots) * 100) : 0}%`,
                            }}
                            title={`รอบนี้ต้องการ: ${totalRequiredSlots} ต้น`}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-500">
                          <span className="flex items-center gap-3">
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
                              รอบเดิมใช้: {farmOccupiedSlots.toLocaleString()} ต้น ({farmTotalSlots > 0 ? Math.round((farmOccupiedSlots / farmTotalSlots) * 100) : 0}%)
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                              รอบนี้เลือก: {totalRequiredSlots.toLocaleString()} ต้น
                            </span>
                          </span>
                          <span>
                            {farmAvailableSlots > 0 ? (
                              <span className="text-emerald-700 font-semibold">
                                เหลือพื้นที่ว่างในฟาร์ม: {farmAvailableSlots.toLocaleString()} ต้น
                              </span>
                            ) : (
                              <strong className="text-rose-600">แปลงในฟาร์มเต็ม 100%</strong>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Alert Badges */}
                      {(itemsWithoutPlots.length > 0 || itemsOvercapacity.length > 0 || isFarmFullyOccupied) ? (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-emerald-100/60">
                          {isFarmFullyOccupied && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-900 border border-rose-300">
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              <span>แปลงในฟาร์มถูกใช้งานเต็มทั้งหมดแล้ว</span>
                            </span>
                          )}
                          {itemsWithoutPlots.length > 0 && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              <span>มี {itemsWithoutPlots.length} ผักยังไม่ได้เลือกแปลงปลูก</span>
                            </span>
                          )}
                          {itemsOvercapacity.length > 0 && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              <span>มี {itemsOvercapacity.length} ผักที่พื้นที่ว่างในแปลงไม่พอ</span>
                            </span>
                          )}

                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 pt-1 border-t border-emerald-100/60 text-[10px] font-bold text-emerald-700">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>เลือกแปลงปลูกครบถ้วนและพื้นที่เพียงพอกับเป้าหมาย</span>
                        </div>
                      )}
                      {sharedPlotIds.length > 0 && (
                        <p className="flex items-center gap-1.5 text-[11px] text-sky-800"><Info className="h-3.5 w-3.5 shrink-0" />ใช้แปลงร่วมกัน {sharedPlotIds.length} แปลง โดยนับความจุแต่ละแปลงเพียงครั้งเดียว</p>
                      )}
                    </div>
                  );
                })()}

                {items.length === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed border-emerald-300 bg-white px-5 py-8 text-center">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                      <Sprout className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-xs font-bold text-slate-700">ยังไม่ได้เพิ่มผักในรอบนี้</p>
                    <p className="mt-1 text-[11px] text-slate-500">เริ่มต้นโดยกด “เพิ่มชนิดผัก” แล้วเลือกผักที่ต้องการปลูก</p>
                  </div>
                ) : (
                  <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
                    {items.map((it, idx) => {
                      const selectedCrop = crops.find((c) => c.id === it.crop_id);
                      const cropRate = selectedCrop?.slots_per_kg ? Number(selectedCrop.slots_per_kg) : 4.0;
                      const targetKg = plantCountToKg(it.plant_count, cropRate);
                      const requiredSlots = it.plant_count;

                      // Only plots designated for this crop can be selected.
                      const designatedPlots = activePlots.filter((p) => plotSupportsCrop(p, it.crop_id));

                      // Selected plots for this item
                      const selectedPlotIds = it.selected_plot_ids || [];
                      const selectedPlots = activePlots.filter((p) => selectedPlotIds.includes(p.id));
                      const totalSelectedRawCapacity = selectedPlots.reduce((sum, p) => sum + Number(p.slot_capacity || 0), 0);
                      const totalSelectedOccupied = selectedPlots.reduce((sum, p) => sum + itemOccupiedSlots(idx, p.id), 0);
                      const totalSelectedAvailableSlots = selectedPlots.reduce((sum, p) => {
                        const occ = itemOccupiedSlots(idx, p.id);
                        return sum + Math.max(0, Number(p.slot_capacity || 0) - occ);
                      }, 0);

                      // Sharing a plot across crop items is supported.
                      const sharedPlotIds = selectedPlotIds.filter((pid) =>
                        items.some((otherIt, otherIdx) => otherIdx !== idx && (otherIt.selected_plot_ids || []).includes(pid))
                      );
                      const sharedPlotNames = activePlots.filter((p) => sharedPlotIds.includes(p.id)).map((p) => p.name);

                      // Capacity checks based on REAL remaining available slots
                      const isNoPlot = selectedPlots.length === 0;
                      const isSelectedPlotsZeroFree = selectedPlots.length > 0 && totalSelectedAvailableSlots === 0;
                      const isOverCapacity = selectedPlots.length > 0 && totalSelectedAvailableSlots > 0 && requiredSlots > totalSelectedAvailableSlots;
                      const isUnderCapacity = selectedPlots.length > 0 && totalSelectedAvailableSlots > 0 && totalSelectedAvailableSlots > requiredSlots;
                      const isOptimal = selectedPlots.length > 0 && totalSelectedAvailableSlots > 0 && totalSelectedAvailableSlots === requiredSlots;

                      const missingSlots = Math.max(0, requiredSlots - totalSelectedAvailableSlots);
                      const extraSlots = Math.max(0, totalSelectedAvailableSlots - requiredSlots);
                      const missingKg = plantCountToKg(missingSlots, cropRate);
                      const extraKg = plantCountToKg(extraSlots, cropRate);
                      const matchCapacityPlants = Math.floor(totalSelectedAvailableSlots);

                      // Gauge bar calculation
                      const usagePercent = totalSelectedAvailableSlots > 0 ? Math.min(100, Math.round((requiredSlots / totalSelectedAvailableSlots) * 100)) : (isSelectedPlotsZeroFree ? 100 : 0);
                      const invalidGrowingDays = it.growing_days === '' || !Number.isSafeInteger(it.growing_days) || it.growing_days < 1;

                      return (
                        <div
                          key={idx}
                          className="rounded-2xl border-2 border-emerald-300 border-l-4 border-l-emerald-700 bg-emerald-50 p-4 shadow-md transition-shadow hover:shadow-lg sm:p-5"
                        >
                          {/* Crop, plant count, growing days and delete action */}
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2.5">
                            {/* Crop select */}
                            <div className="min-w-0 flex-1">
                              <label className="text-[10px] font-bold text-slate-500 block mb-0.5">
                                ชนิดผักที่ ({idx + 1})
                              </label>
                              <select
                                value={it.crop_id}
                                onChange={(e) => handleItemCropChange(idx, e.target.value)}
                                className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-bold text-xs focus:ring-2 focus:ring-emerald-500 text-slate-900"
                              >
                                {designatedCrops.filter((crop) => crop.id === it.crop_id || !items.some((item) => item.crop_id === crop.id)).map((c) => {
                                  const plotsCount = activePlots.filter((p) => plotSupportsCrop(p, c.id)).length;
                                  return (
                                    <option key={c.id} value={c.id}>
                                      {c.name} (มีแปลงประจำ {plotsCount} แปลง)
                                    </option>
                                  );
                                })}
                              </select>
                            </div>

                            {/* Plant count */}
                            <div className="w-full sm:w-32 sm:shrink-0">
                              <label htmlFor={`plant-count-${idx}`} className="text-[10px] font-bold text-slate-500 block mb-0.5">
                                จำนวนต้น
                              </label>
                              <input
                                id={`plant-count-${idx}`}
                                type="number"
                                min="1"
                                step="1"
                                value={it.plant_count}
                                onChange={(e) =>
                                  handleItemFieldChange(idx, 'plant_count', Math.max(0, Math.floor(Number(e.target.value) || 0)))
                                }
                                className="w-full p-2.5 rounded-xl border border-slate-200 bg-white text-xs font-black text-emerald-800 focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>

                            {/* Growing Days */}
                            <div className="w-full sm:w-24 sm:shrink-0">
                              <label htmlFor={`growing-days-${idx}`} className="text-[10px] font-bold text-slate-500 block mb-0.5">วันปลูก <span className="text-rose-600">*</span></label>
                              <input
                                id={`growing-days-${idx}`}
                                type="number"
                                min="1"
                                step="1"
                                value={it.growing_days}
                                onChange={(e) =>
                                  handleItemFieldChange(idx, 'growing_days', e.target.value === '' ? '' : Number(e.target.value))
                                }
                                placeholder="จำนวนวัน"
                                aria-invalid={invalidGrowingDays}
                                aria-describedby={invalidGrowingDays ? `growing-days-warning-${idx}` : undefined}
                                title="ระยะเวลาปลูก (วัน)"
                                className={`w-full p-2.5 rounded-xl border bg-white text-xs font-semibold focus:ring-2 focus:ring-emerald-500 ${invalidGrowingDays ? 'border-rose-400' : 'border-slate-200'}`}
                              />
                              {invalidGrowingDays && <p id={`growing-days-warning-${idx}`} className="mt-1 text-[10px] font-semibold text-rose-600">{it.growing_days === '' ? 'กรุณาระบุวันปลูก' : 'กรุณากรอกจำนวนเต็มมากกว่า 0'}</p>}
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

                          <div className="my-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-emerald-200 bg-white/90 px-3.5 py-3">
                            <div className="flex items-baseline gap-3">
                              <span className="text-xs font-semibold text-slate-600">น้ำหนักประมาณ</span>
                              <output htmlFor={`plant-count-${idx}`} className="text-xl font-black tabular-nums text-emerald-800">
                                {targetKg.toLocaleString()} <span className="text-sm font-semibold">กก.</span>
                              </output>
                            </div>
                            <p className="text-[11px] text-slate-500">{cropRate} ต้น/กก. · ปัดเศษลง</p>
                          </div>

                          {/* PROMINENT REAL-TIME WARNING & NOTIFICATION ALERT BOX */}
                          <div className="space-y-2">
                            {/* 1. Shared plot information */}
                            {sharedPlotNames.length > 0 && (
                              <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 text-xs flex items-start gap-2">
                                <Info className="w-4 h-4 text-sky-600 flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                  <p className="font-bold">ปลูกผักหลายชนิดร่วมแปลงเดียวกัน</p>
                                  <p className="text-[11px] text-sky-800 mt-0.5">
                                    แปลง <strong>{sharedPlotNames.join(', ')}</strong> ใช้ร่วมกับผักชนิดอื่นในรอบนี้ โดยระบบหักจำนวนต้นที่ใช้ร่วมกันแล้ว
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* 2. No Plot Selected Alert */}
                            {isNoPlot && (
                              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 shadow-2xs">
                                <div className="flex items-start gap-2">
                                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                                  <div>
                                    <p className="font-bold">⚠️ ยังไม่ได้เลือกแปลงปลูกสำหรับ {selectedCrop?.name || 'ผักนี้'}!</p>
                                    <p className="text-[11px] text-amber-800 mt-0.5">
                                      จำนวนที่ปลูก <strong>{requiredSlots.toLocaleString()} ต้น</strong> (ประมาณ {targetKg} กก.) ต้องการพื้นที่อย่างน้อย <strong>{requiredSlots.toLocaleString()} ต้น</strong> (อัตรา ~{cropRate} ต้น/กก.) กรุณาเลือกแปลงปลูกด้านล่าง
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  {designatedPlots.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => handleSelectAllPlotsForCrop(idx)}
                                      className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] transition-colors shadow-2xs"
                                    >
                                      ⚡ เลือกทุกแปลงของผักนี้ ({designatedPlots.length} แปลง)
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* 3. Selected Plots Are Fully Occupied By Other Active Rounds */}
                            {isSelectedPlotsZeroFree && (
                              <div className="p-3.5 rounded-xl bg-rose-50 border-2 border-rose-300 text-rose-900 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 shadow-2xs">
                                <div className="flex items-start gap-2">
                                  <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                                  <div>
                                    <p className="font-bold">🚨 แปลงที่เลือกถูกรอบอื่นใช้งานเต็ม 100% แล้ว (ไม่มีพื้นที่ว่าง)!</p>
                                    <p className="text-[11px] text-rose-800 mt-0.5">
                                      แปลงที่เลือก ({selectedPlots.map((p) => p.name).join(', ')}) ถูกรอบเดิมที่กำลังดำเนินการใช้งานเต็มความจุ {totalSelectedRawCapacity.toLocaleString()} ต้น ไม่สามารถปลูกในรอบนี้ได้ กรุณาเลือกแปลงอื่นที่มีพื้นที่ว่าง
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* 4. Overcapacity Warning (Target > Remaining Available Space) */}
                            {isOverCapacity && (
                              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 shadow-2xs">
                                <div className="flex items-start gap-2">
                                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                                  <div>
                                    <p className="font-bold">🚨 พื้นที่ว่างในแปลงที่เลือกไม่เพียงพอสำหรับจำนวนที่ปลูก {requiredSlots.toLocaleString()} ต้น!</p>
                                    <p className="text-[11px] text-rose-800 mt-0.5">
                                      ต้องการ <strong>{requiredSlots.toLocaleString()} ต้น</strong> แต่แปลงที่เลือกเหลือพื้นที่ว่างจริงเพียง <strong>{totalSelectedAvailableSlots.toLocaleString()} ต้น</strong>
                                      {totalSelectedOccupied > 0 && ` (รอบเดิมใช้ไป ${totalSelectedOccupied.toLocaleString()} ต้น)`}
                                      {' '}(ขาดอีก <strong>{missingSlots.toLocaleString()} ต้น</strong> หรือ ~{missingKg} กก.)
                                    </p>
                                  </div>
                                </div>
                                {matchCapacityPlants > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => handleMatchCapacityPlants(idx)}
                                    className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] transition-colors whitespace-nowrap shadow-2xs"
                                  >
                                    ⚡ ปรับเป้าหมายเป็น {matchCapacityPlants.toLocaleString()} ต้น (ตามพื้นที่ว่างที่เหลือ)
                                  </button>
                                )}
                              </div>
                            )}

                            {/* 5. Undercapacity Info (Available Space > Target) */}
                            {isUnderCapacity && (
                              <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-300 text-sky-900 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 shadow-2xs">
                                <div className="flex items-start gap-2">
                                  <Info className="w-4 h-4 text-sky-600 flex-shrink-0 mt-0.5" />
                                  <div>
                                    <p className="font-bold">ℹ️ แปลงที่เลือกมีพื้นที่ว่างเหลือ!</p>
                                    <p className="text-[11px] text-sky-800 mt-0.5">
                                      แปลงที่เลือกมีพื้นที่ว่าง <strong>{totalSelectedAvailableSlots.toLocaleString()} ต้น</strong> เป้าหมายรอบนี้ใช้ <strong>{requiredSlots.toLocaleString()} ต้น</strong> (เหลือว่างอีก <strong>{extraSlots.toLocaleString()} ต้น</strong> หรือ ~{extraKg} กก.)
                                    </p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleMatchCapacityPlants(idx)}
                                  className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-[11px] transition-colors whitespace-nowrap shadow-2xs"
                                >
                                  ⚡ ปรับเป้าหมายเป็น {matchCapacityPlants.toLocaleString()} ต้น (เต็มพื้นที่ว่าง)
                                </button>
                              </div>
                            )}

                            {/* 6. Optimal Capacity */}
                            {isOptimal && (
                              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                                  <span className="font-bold">
                                    ✓ พื้นที่ว่างในแปลงที่เลือกพอดีกับเป้าหมายผลผลิต ({totalSelectedAvailableSlots.toLocaleString()} ต้น)
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* PLOTS MANAGEMENT BOX */}
                          <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
                            {/* Toolbar: Stats & Action Buttons */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs border-b border-slate-100 pb-2.5">
                              <div className="flex items-center gap-2 font-bold text-slate-800">
                                <LayoutGrid className="w-4 h-4 text-emerald-600" />
                                <span>แปลงปลูกสำหรับ {selectedCrop?.name || 'ผักนี้'}:</span>
                                <span className="text-slate-500 font-normal">
                                  (เลือก {selectedPlots.length} แปลง • พื้นที่ว่างรวม {totalSelectedAvailableSlots.toLocaleString()} ต้น)
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5">
                                {designatedPlots.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => handleSelectAllPlotsForCrop(idx)}
                                    className="px-2 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                                  >
                                    เลือกแปลงประจำ ({designatedPlots.length})
                                  </button>
                                )}
                                {totalSelectedAvailableSlots > 0 && totalSelectedAvailableSlots !== requiredSlots && (
                                  <button
                                    type="button"
                                    onClick={() => handleMatchCapacityPlants(idx)}
                                    className="px-2 py-1 text-[11px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors"
                                  >
                                    ปรับจำนวนต้นตามพื้นที่ว่าง ({matchCapacityPlants.toLocaleString()} ต้น)
                                  </button>
                                )}
                                {selectedPlotIds.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeselectAllPlots(idx)}
                                    className="px-2 py-1 text-[11px] font-semibold text-slate-500 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 rounded-lg transition-colors"
                                  >
                                    ล้างการเลือก
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* CROP TOTAL CAPACITY GAUGE BAR */}
                            {selectedPlots.length > 0 && (
                              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1.5">
                                <div className="flex justify-between text-[11px]">
                                  <span className="font-semibold text-slate-700">
                                    การใช้พื้นที่แปลงที่เลือกของ {selectedCrop?.name}:
                                  </span>
                                  <span className="font-bold text-slate-800">
                                    {isSelectedPlotsZeroFree ? (
                                      <span className="text-rose-600">รอบเดิมใช้เต็ม 100% (ว่าง 0 ต้น)</span>
                                    ) : (
                                      <span>ใช้ {requiredSlots.toLocaleString()} / พื้นที่ว่าง {totalSelectedAvailableSlots.toLocaleString()} ต้น ({usagePercent}%)</span>
                                    )}
                                  </span>
                                </div>
                                <div className="w-full h-2 bg-slate-200/70 rounded-full overflow-hidden flex">
                                  {/* Occupied by other rounds in these plots */}
                                  <div
                                    className="h-full bg-rose-500 transition-all duration-300"
                                    style={{
                                      width: `${totalSelectedRawCapacity > 0 ? Math.min(100, (totalSelectedOccupied / totalSelectedRawCapacity) * 100) : 0}%`,
                                    }}
                                    title={`รอบเดิมใช้: ${totalSelectedOccupied} ต้น`}
                                  />
                                  {/* Used by this crop in this round */}
                                  <div
                                    className={`h-full transition-all duration-300 ${
                                      isOverCapacity ? 'bg-rose-500' : usagePercent >= 100 ? 'bg-emerald-600' : 'bg-sky-500'
                                    }`}
                                    style={{
                                      width: `${totalSelectedRawCapacity > 0 ? Math.min(100 - (totalSelectedOccupied / totalSelectedRawCapacity) * 100, (requiredSlots / totalSelectedRawCapacity) * 100) : 0}%`,
                                    }}
                                    title={`รอบนี้ใช้: ${requiredSlots} ต้น`}
                                  />
                                </div>
                                <div className="flex justify-between text-[10px] text-slate-500">
                                  <span>จำนวนที่ปลูก: {it.plant_count.toLocaleString()} ต้น · ประมาณ {targetKg} กก.</span>
                                  <span>
                                    {isSelectedPlotsZeroFree ? (
                                      <strong className="text-rose-600">รอบอื่นใช้งานเต็มแล้ว</strong>
                                    ) : isOverCapacity ? (
                                      <strong className="text-rose-600">เกินพื้นที่ว่าง {missingSlots.toLocaleString()} ต้น</strong>
                                    ) : extraSlots > 0 ? (
                                      <strong className="text-sky-700">เหลือพื้นที่ว่าง {extraSlots.toLocaleString()} ต้น (~{extraKg} กก.)</strong>
                                    ) : (
                                      <strong className="text-emerald-700">เต็มพื้นที่ว่างพอดี 100%</strong>
                                    )}
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* PLOT CARDS RENDERER HELPER */}
                            {(() => {
                              let remainingToAllocate = requiredSlots;

                              const renderPlotCard = (plot: Plot) => {
                                const isChecked = selectedPlotIds.includes(plot.id);
                                const cap = Number(plot.slot_capacity || 0);
                                const occ = plotOccupancyMap[plot.id];
                                const occupiedByOtherRounds = itemOccupiedSlots(idx, plot.id);
                                const occupyingRoundNames = occ?.occupyingRounds.map((r) => r.roundName) || [];
                                const availableInPlot = Math.max(0, cap - occupiedByOtherRounds);
                                const isPlotFull = availableInPlot === 0;

                                let usedInPlot = 0;
                                if (isChecked) {
                                  usedInPlot = Math.min(availableInPlot, Math.max(0, remainingToAllocate));
                                  remainingToAllocate -= usedInPlot;
                                }

                                const remainingFreeInPlot = isChecked ? Math.max(0, availableInPlot - usedInPlot) : availableInPlot;

                                // Other item using this plot?
                                const otherItemUsing = items.find(
                                  (otherIt, otherIdx) => otherIdx !== idx && (otherIt.selected_plot_ids || []).includes(plot.id)
                                );
                                const otherCropUsing = otherItemUsing ? crops.find((c) => c.id === otherItemUsing.crop_id) : null;

                                return (
                                  <div
                                    key={plot.id}
                                    onClick={() => {
                                      if (isPlotFull && !isChecked) {
                                        alert(`แปลง "${plot.name}" ถูกใช้งานเต็ม 100% แล้วโดย: ${occupyingRoundNames.join(', ')}\nไม่สามารถเลือกใช้ในรอบนี้ได้`);
                                        return;
                                      }
                                      handleTogglePlot(idx, plot.id);
                                    }}
                                    className={`p-2.5 rounded-xl border transition-all cursor-pointer select-none space-y-1.5 ${
                                      isPlotFull && !isChecked
                                        ? 'bg-rose-50/50 border-rose-300 opacity-80'
                                        : isChecked
                                        ? 'bg-white border-emerald-500 shadow-2xs ring-1 ring-emerald-400'
                                        : otherItemUsing
                                        ? 'bg-amber-50/40 border-amber-200 hover:border-amber-300'
                                        : 'bg-slate-50 border-slate-200/80 hover:border-slate-300 opacity-90'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-1.5">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span
                                          className={`w-4 h-4 rounded flex items-center justify-center border text-[10px] font-bold flex-shrink-0 ${
                                            isChecked
                                              ? 'bg-emerald-600 border-emerald-600 text-white'
                                              : isPlotFull
                                              ? 'border-rose-400 bg-rose-100 text-rose-600 font-bold'
                                              : 'border-slate-300 bg-white text-transparent'
                                          }`}
                                        >
                                          {isChecked ? '✓' : isPlotFull ? '✕' : ''}
                                        </span>
                                        <span className="font-bold text-slate-800 text-xs truncate">
                                          {plot.name}
                                        </span>
                                        <span className="text-[10px] text-slate-400 flex-shrink-0">
                                          ({plot.zone_name})
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-1 flex-shrink-0">
                                        {isPlotFull ? (
                                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-300">
                                            🔴 เต็ม (ติด {occupyingRoundNames[0] || 'รอบอื่น'})
                                          </span>
                                        ) : otherItemUsing ? (
                                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800">
                                            เลือกใน {otherCropUsing?.name || 'ผักอื่น'}
                                          </span>
                                        ) : isChecked ? (
                                          <span
                                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                                              usedInPlot >= availableInPlot
                                                ? 'bg-emerald-100 text-emerald-800'
                                                : 'bg-sky-100 text-sky-800'
                                            }`}
                                          >
                                            {usedInPlot >= availableInPlot ? 'เต็มโควตาว่าง' : `ใช้ ${usedInPlot} ต้น`}
                                          </span>
                                        ) : occupiedByOtherRounds > 0 ? (
                                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800">
                                            🟠 ว่าง {availableInPlot}/{cap} ต้น
                                          </span>
                                        ) : (
                                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600">
                                            🟢 ว่าง {cap} ต้น
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Per-plot capacity bar */}
                                    <div className="space-y-0.5">
                                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200 flex">
                                        {/* Occupied by other rounds */}
                                        <div
                                          className="h-full bg-rose-500 transition-all duration-300"
                                          style={{ width: `${cap > 0 ? Math.min(100, (occupiedByOtherRounds / cap) * 100) : 0}%` }}
                                        />
                                        {/* Used in this round */}
                                        {isChecked && (
                                          <div
                                            className="h-full bg-emerald-500 transition-all duration-300"
                                            style={{
                                              width: `${cap > 0 ? Math.min(100 - (occupiedByOtherRounds / cap) * 100, (usedInPlot / cap) * 100) : 0}%`,
                                            }}
                                          />
                                        )}
                                      </div>

                                      <div className="flex justify-between text-[10px] text-slate-500">
                                        <span>
                                          {isPlotFull ? (
                                            <span className="text-rose-600 font-bold">รอบเดิมใช้เต็ม {cap} ต้น</span>
                                          ) : isChecked ? (
                                            <>
                                              รอบนี้ใช้ <strong className="text-slate-800">{usedInPlot}</strong> / ว่าง {availableInPlot} ต้น
                                            </>
                                          ) : occupiedByOtherRounds > 0 ? (
                                            <>รอบเดิมใช้ {occupiedByOtherRounds} / {cap} ต้น</>
                                          ) : (
                                            <>ความจุ {cap} ต้น (ว่าง 100%)</>
                                          )}
                                        </span>
                                        <span>
                                          {isPlotFull ? (
                                            <span className="text-rose-600 font-semibold">สร้างรอบทับไม่ได้</span>
                                          ) : isChecked ? (
                                            remainingFreeInPlot > 0 ? (
                                              <span className="text-sky-700 font-semibold">เหลือ {remainingFreeInPlot} ต้น</span>
                                            ) : (
                                              <span className="text-emerald-700 font-semibold">เต็มพื้นที่ว่าง</span>
                                            )
                                          ) : (
                                            <span className="text-emerald-600 font-medium">ว่าง {availableInPlot} ต้น</span>
                                          )}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              };

                              return (
                                <div className="space-y-3">
                                  {/* SECTION 1: Designated plots (if any) */}
                                  {designatedPlots.length > 0 && (
                                    <div className="space-y-1.5">
                                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                                        <span>🌱 แปลงที่กำหนดไว้สำหรับ {selectedCrop?.name} ({designatedPlots.length} แปลง):</span>
                                        <span className="text-[10px] text-slate-400 font-normal">
                                          ความจุรวม: {designatedPlots.reduce((s, p) => s + p.slot_capacity, 0).toLocaleString()} ต้น
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {designatedPlots.map(renderPlotCard)}
                                      </div>
                                    </div>
                                  )}

                                  {/* A crop cannot use plots designated for another crop. */}
                                  {designatedPlots.length === 0 && (
                                    <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200 text-amber-800 text-[11px] flex items-center justify-between">
                                      <span>
                                        ผักนี้ยังไม่มีแปลงปลูกที่กำหนดไว้ กรุณากำหนดชนิดผักให้แปลงก่อนสร้างรอบ
                                      </span>
                                      <Link
                                        to="/admin/plots"
                                        target="_blank"
                                        className="inline-flex items-center gap-1 font-bold text-amber-900 underline whitespace-nowrap ml-2"
                                      >
                                        <span>จัดการแปลง</span>
                                      </Link>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                </div>
              </div>

              {/* Crop-Specific Summary Table with Area Progress Bars */}
              {items.length > 0 && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span>สรุปพื้นที่แปลงปลูกแยกตามชนิดผัก:</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead>
                        <tr className="text-slate-400 border-b border-slate-200 pb-1.5 font-semibold">
                          <th className="py-1 px-1">ชนิดผัก</th>
                          <th className="py-1 px-2">จำนวนต้น / น้ำหนักคำนวณ</th>
                          <th className="py-1 px-2">แปลงที่เลือกปลูก</th>
                          <th className="py-1 px-2 min-w-[140px]">หลอดความจุแปลง</th>
                          <th className="py-1 px-2">สถานะพื้นที่</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {items.map((it, idx) => {
                          const crop = crops.find((c) => c.id === it.crop_id);
                          const cropRate = crop?.slots_per_kg ? Number(crop.slots_per_kg) : 4.0;
                          const targetKg = plantCountToKg(it.plant_count, cropRate);
                          const requiredSlots = it.plant_count;

                          const selectedPlotIds = it.selected_plot_ids || [];
                          const selectedPlots = activePlots.filter((p) => selectedPlotIds.includes(p.id));
                          const rawSelectedSlots = selectedPlots.reduce((s, p) => s + Number(p.slot_capacity || 0), 0);
                          const availableSelectedSlots = selectedPlots.reduce((s, p) => {
                            const occ = itemOccupiedSlots(idx, p.id);
                            return s + Math.max(0, Number(p.slot_capacity || 0) - occ);
                          }, 0);
                          const usedPercent = availableSelectedSlots > 0 ? Math.min(100, Math.round((requiredSlots / availableSelectedSlots) * 100)) : 0;

                          const isNoPlot = selectedPlots.length === 0;
                          const isZeroAvail = selectedPlots.length > 0 && availableSelectedSlots === 0;
                          const isOver = selectedPlots.length > 0 && availableSelectedSlots > 0 && requiredSlots > availableSelectedSlots;
                          const isUnder = selectedPlots.length > 0 && availableSelectedSlots > 0 && availableSelectedSlots > requiredSlots;

                          return (
                            <tr key={idx} className="hover:bg-white/60">
                              <td className="py-2 px-1 font-bold text-slate-800 whitespace-nowrap">
                                {crop?.name || 'ผัก'}
                              </td>
                              <td className="py-2 px-2 text-slate-700 whitespace-nowrap">
                                <strong className="text-emerald-800">{requiredSlots.toLocaleString()} ต้น</strong>
                                <span className="text-[10px] text-slate-400 block">ประมาณ {targetKg} กก.</span>
                              </td>
                              <td className="py-2 px-2 text-slate-700 whitespace-nowrap">
                                {selectedPlots.length > 0 ? (
                                  <div>
                                    <span className="font-bold text-slate-900">{selectedPlots.length} แปลง</span>
                                    <span className="text-[10px] text-slate-400 block">
                                      {selectedPlots.map((p) => p.name).join(', ')} (ว่าง {availableSelectedSlots.toLocaleString()}/{rawSelectedSlots.toLocaleString()} ต้น)
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-amber-700 font-semibold italic">ยังไม่ได้เลือกแปลง</span>
                                )}
                              </td>
                              {/* Gauge Bar */}
                              <td className="py-2 px-2">
                                {selectedPlots.length > 0 ? (
                                  <div className="space-y-1">
                                    <div className="flex justify-between text-[10px]">
                                      <span className="font-semibold text-slate-700">
                                        {requiredSlots.toLocaleString()} / ว่าง {availableSelectedSlots.toLocaleString()} ต้น
                                      </span>
                                      <span className={`font-bold ${isZeroAvail || isOver ? 'text-rose-600' : 'text-slate-700'}`}>
                                        {isZeroAvail ? 'เต็ม 100%' : `${usedPercent}%`}
                                      </span>
                                    </div>
                                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${
                                          isZeroAvail || isOver
                                            ? 'bg-rose-500'
                                            : usedPercent >= 100
                                            ? 'bg-emerald-600'
                                            : 'bg-sky-500'
                                        }`}
                                        style={{ width: `${isZeroAvail ? 100 : usedPercent}%` }}
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>
                              <td className="py-2 px-2 whitespace-nowrap">
                                {isNoPlot ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                    ⚠️ ยังไม่เลือกแปลง
                                  </span>
                                ) : isZeroAvail ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-800 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                                    🔴 ติดรอบอื่น (เต็ม)
                                  </span>
                                ) : isOver ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-800 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                                    🚨 ขาด {(requiredSlots - availableSelectedSlots).toLocaleString()} ต้น
                                  </span>
                                ) : isUnder ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                                    ℹ️ ว่าง {(availableSelectedSlots - requiredSlots).toLocaleString()} ต้น
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                    ✓ พอดีพื้นที่ว่าง
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
                  disabled={saving || isFarmFullyOccupied}
                  className={`inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-bold transition-colors ${
                    isFarmFullyOccupied
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                  } disabled:opacity-60`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {saving
                      ? 'กำลังสร้างรอบ...'
                      : isFarmFullyOccupied
                      ? '❌ แปลงในฟาร์มเต็มแล้ว (สร้างรอบใหม่ไม่ได้)'
                      : 'สร้างรอบปลูก ➔ เข้าสู่หน้าจัดการ'}
                  </span>
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
