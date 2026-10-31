import { Router, Response } from 'express';
import { z } from 'zod';
import { getSupabaseClient } from '../../config/supabase.js';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../../middlewares/auth.js';
import { recordAuditLog } from '../../services/audit.js';

import { getPlotCropIds } from '../../services/plotCrops.js';
import { getPlotRoundTimeline } from '../../services/plotRoundTimeline.js';
import { getPlotPlantingAllocations } from '../../services/plotPlantingAllocations.js';
import { roundReferencesPlot } from '../../services/plotHistory.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const plotSchema = z.object({
  name: z.string().trim().min(1, 'กรุณาระบุชื่อแปลงปลูก').max(100),
  zone_name: z.string().trim().min(1, 'กรุณาระบุชื่อโซน').max(100),
  slot_capacity: z.number().int().min(1, 'จำนวนต้นต้องมากกว่า 0').max(2147483647, 'จำนวนต้นเกินขนาดที่ระบบรองรับ'),
  crop_ids: z.array(z.string().uuid('รหัสชนิดผักไม่ถูกต้อง')).optional(),
  crop_id: z.string().uuid('รหัสชนิดผักไม่ถูกต้อง').optional().nullable(),
  is_active: z.boolean().default(true),
  notes: z.string().optional().nullable(),
});

// GET /api/admin/plots - List all plots with crop details
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { zone_name, is_active, crop_id } = req.query;
    const db = getSupabaseClient(req);

    let query = db
      .from('plots')
      .select(`
        *, plant_losses(count),
        crops (
          id,
          name,
          default_price_per_kg
        )
      `)
      .order('zone_name', { ascending: true })
      .order('name', { ascending: true });

    if (zone_name && typeof zone_name === 'string') {
      query = query.eq('zone_name', zone_name);
    }
    if (is_active !== undefined && is_active !== '') {
      query = query.eq('is_active', is_active === 'true');
    }
    if (crop_id && typeof crop_id === 'string') {
      query = query.contains('crop_ids', [crop_id]);
    }

    const { data: plots, error } = await query;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const totalAllocatedSlots = (plots || []).reduce((sum, p) => sum + Number(p.slot_capacity || 0), 0);

    // Normalize plots to ensure is_active is boolean
    const normalizedPlots = (plots || []).map((p: any) => ({
      ...p,
      crop_ids: getPlotCropIds(p),
      is_active: p.is_active !== undefined ? !!p.is_active : p.status !== 'empty',
    }));

    const usage = new Map<string, {
      used_slots: number;
      crop_names: string[];
      occupying_rounds: Array<{ id: string; name: string; crop_name: string; used_slots: number } & ReturnType<typeof getPlotRoundTimeline>>;
    }>();
    for (const plot of normalizedPlots) {
      usage.set(plot.id, { used_slots: 0, crop_names: [], occupying_rounds: [] });
    }

    const { data: rounds, error: roundsError } = await db
      .from('planting_rounds')
      .select(`
        id, name, status, current_step, completed_date, sold_out_date, notes,
        seed_date, fertilizing_date, planting_start_date, transplant_date, planted_at, growing_days,
        round_items (
          *,
          crops (name, slots_per_kg, growing_days)
        )
      `)
      .order('created_at', { ascending: true });
    if (roundsError) {
      res.status(500).json({ error: roundsError.message });
      return;
    }

    const { allocations, unassignedItems } = getPlotPlantingAllocations(normalizedPlots, rounds || []);
    for (const allocation of allocations) {
      const round = (rounds || []).find(round => round.id === allocation.round_id)!;
      const item = round.round_items.find(item => item.crop_id === allocation.crop_id)!;
      const crop = item.crops as { name?: string } | null;
      const plotUsage = usage.get(allocation.plot_id)!;
      const cropName = crop?.name || 'ไม่ระบุชนิดผัก';
      plotUsage.used_slots += allocation.plant_count;
      if (!plotUsage.crop_names.includes(cropName)) plotUsage.crop_names.push(cropName);
      plotUsage.occupying_rounds.push({ id: round.id, name: round.name, crop_name: cropName, used_slots: allocation.plant_count,
        ...getPlotRoundTimeline(round, item) });
    }

    const plotsWithUsage = normalizedPlots.map((plot) => ({
      ...plot,
      has_history: Number(plot.plant_losses?.[0]?.count || 0) > 0 || (rounds || []).some(round => roundReferencesPlot(plot, round)),
      ...usage.get(plot.id),
    }));

    res.json({
      plots: plotsWithUsage,
      unassigned_round_items: unassignedItems,
      total_allocated_slots: totalAllocatedSlots,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลแปลงปลูก' });
  }
});

// POST /api/admin/plots - Create new plot with its own capacity
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parsed = plotSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message || 'ข้อมูลไม่ถูกต้อง' });
      return;
    }

    const { name, zone_name, slot_capacity, crop_id, crop_ids, is_active, notes } = parsed.data;
    const db = getSupabaseClient(req);

    const selectedCropIds = [...new Set(crop_ids ?? (crop_id ? [crop_id] : []))];
    if (selectedCropIds.length) {
      const { data: selectedCrops, error: cropError } = await db.from('crops').select('id, is_active').in('id', selectedCropIds);
      if (cropError || selectedCrops?.length !== selectedCropIds.length || selectedCrops.some((crop) => !crop.is_active)) {
        res.status(400).json({ error: 'เลือกได้เฉพาะชนิดผักที่เปิดใช้งานและมีอยู่ในระบบ' });
        return;
      }
    }

    // Each plot owns its capacity. The database still protects active plant allocations.
    const { data, error } = await db
      .from('plots')
      .insert({
        name: name.trim(),
        zone_name: zone_name.trim(),
        slot_capacity,
        crop_id: selectedCropIds[0] || null,
        crop_ids: selectedCropIds,
        is_active,
        notes: notes ? notes.trim() : null,
      })
      .select(`
        *,
        crops (
          id,
          name,
          default_price_per_kg
        )
      `)
      .single();

    if (error) {
      const oldFarmLimit = error.message?.includes('เกินความจุฟาร์ม');
      res.status(oldFarmLimit ? 503 : 400).json({ error: oldFarmLimit
        ? 'ฐานข้อมูลยังจำกัดความจุฟาร์มรวมอยู่ กรุณารัน migration 047 ก่อนเพิ่มความจุแปลง'
        : 'ไม่สามารถสร้างแปลงปลูกได้: ' + error.message });
      return;
    }

    await recordAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      entityType: 'plots',
      entityId: data.id,
      action: 'create',
      newData: data,
    });

    res.status(201).json({
      message: 'สร้างแปลงปลูกเรียบร้อยแล้ว',
      plot: data,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างแปลงปลูก' });
  }
});

// PUT /api/admin/plots/:id - Update plot capacity
router.put('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const parsed = plotSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message || 'ข้อมูลไม่ถูกต้อง' });
      return;
    }

    const { name, zone_name, slot_capacity, crop_id, crop_ids, is_active, notes } = parsed.data;
    const db = getSupabaseClient(req);

    const { data: oldPlot } = await db.from('plots').select('*').eq('id', id).single();

    if (!oldPlot) {
      res.status(404).json({ error: 'ไม่พบแปลงปลูก' });
      return;
    }
    const selectedCropIds = [...new Set(crop_ids ?? (crop_id !== undefined ? (crop_id ? [crop_id] : []) : getPlotCropIds(oldPlot)))];
    if (selectedCropIds.length) {
      const { data: selectedCrops, error: cropError } = await db.from('crops').select('id, is_active').in('id', selectedCropIds);
      const previousIds = getPlotCropIds(oldPlot);
      if (cropError || selectedCrops?.length !== selectedCropIds.length || selectedCrops.some((crop) => !crop.is_active && !previousIds.includes(crop.id))) {
        res.status(400).json({ error: 'เพิ่มได้เฉพาะชนิดผักที่เปิดใช้งานและมีอยู่ในระบบ' });
        return;
      }
    }

    // The database rejects shrinking below plants assigned to an active round.
    const { data, error } = await db
      .from('plots')
      .update({
        name: name.trim(),
        zone_name: zone_name.trim(),
        slot_capacity,
        crop_id: selectedCropIds[0] || null,
        crop_ids: selectedCropIds,
        is_active,
        notes: notes ? notes.trim() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`
        *,
        crops (
          id,
          name,
          default_price_per_kg
        )
      `)
      .single();

    if (error) {
      const oldFarmLimit = error.message?.includes('เกินความจุฟาร์ม');
      res.status(oldFarmLimit ? 503 : 400).json({ error: oldFarmLimit
        ? 'ฐานข้อมูลยังจำกัดความจุฟาร์มรวมอยู่ กรุณารัน migration 047 ก่อนเพิ่มความจุแปลง'
        : 'ไม่สามารถแก้ไขแปลงปลูกได้: ' + error.message });
      return;
    }

    await recordAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      entityType: 'plots',
      entityId: id,
      action: 'update',
      oldData: oldPlot,
      newData: data,
    });

    res.json({
      message: 'บันทึกการแก้ไขแปลงปลูกเรียบร้อยแล้ว',
      plot: data,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการแก้ไขแปลงปลูก' });
  }
});

// DELETE /api/admin/plots/:id - Delete plot
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const db = getSupabaseClient(req);

    const { data: oldPlot, error: lookupError } = await db.from('plots').select('*,plant_losses(count)').eq('id', id).single();
    if (lookupError && lookupError.code !== 'PGRST116') {
      res.status(500).json({ error: 'ตรวจสอบข้อมูลแปลงไม่สำเร็จ กรุณาลองใหม่' }); return;
    }
    if (!oldPlot) { res.status(404).json({ error: 'ไม่พบแปลงปลูกนี้ กรุณาโหลดรายการใหม่' }); return; }
    for (let start = 0; ; start += 500) {
      const { data: rounds, error: historyError } = await db.from('planting_rounds')
        .select('id,status,completed_date,notes,round_items(*)').order('id').range(start, start + 499);
      if (historyError) { res.status(500).json({ error: 'ตรวจสอบรอบปลูกไม่สำเร็จ กรุณาลองใหม่' }); return; }
      if ((rounds || []).some(round => round.status !== 'completed' && round.status !== 'cancelled'
        && !round.completed_date && roundReferencesPlot(oldPlot, round))) {
        res.status(409).json({ error: 'แปลงนี้ยังอยู่ในรอบปลูกที่ไม่สิ้นสุด กรุณาสิ้นสุดรอบก่อนลบ' }); return;
      }
      if ((rounds || []).length < 500) break;
    }
    const { error } = await db.from('plots').delete().eq('id', id);

    if (error) {
      if (error.code === '42703' && error.message?.includes('plot_ids')) {
        res.status(503).json({ error: 'ฐานข้อมูลขาดข้อมูลเชื่อมแปลงปลูก กรุณารัน migration 050 แล้วลองลบอีกครั้ง' }); return;
      }
      res.status(error.message?.includes('กรุณาสิ้นสุดรอบ') ? 409 : error.code === '23503' ? 503 : 400).json({ error: error.code === '23503'
        ? 'ฐานข้อมูลยังไม่รองรับการลบแปลงที่มีประวัติ กรุณารัน migration 049'
        : error.message?.includes('กรุณาสิ้นสุดรอบ') ? 'แปลงนี้ยังใช้ในรอบปลูก กรุณาสิ้นสุดรอบก่อนลบ'
        : 'ลบแปลงไม่สำเร็จ กรุณาโหลดรายการใหม่แล้วลองอีกครั้ง' });
      return;
    }

    await recordAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      entityType: 'plots',
      entityId: id,
      action: 'delete',
      oldData: oldPlot,
    });

    res.json({ message: 'ลบแปลงปลูกเรียบร้อยแล้ว' });
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบแปลงปลูก' });
  }
});

export default router;
