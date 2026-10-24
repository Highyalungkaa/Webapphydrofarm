import { Router, Response } from 'express';
import { z } from 'zod';
import { getSupabaseClient } from '../../config/supabase.js';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../../middlewares/auth.js';
import { recordAuditLog } from '../../services/audit.js';

import { getPlotCropIds } from '../../services/plotCrops.js';
import { getPlotRoundTimeline } from '../../services/plotRoundTimeline.js';
import { getPlotPlantingAllocations } from '../../services/plotPlantingAllocations.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const plotSchema = z.object({
  name: z.string().min(1, 'กรุณาระบุชื่อแปลงปลูก').max(100),
  zone_name: z.string().min(1, 'กรุณาระบุชื่อโซน').max(100),
  slot_capacity: z.number().int().min(1, 'จำนวนต้น ต้องมากกว่า 0'),
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
        *,
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

    // Get farm settings for reference
    const { data: settingsData } = await db
      .from('app_settings')
      .select('key, value')
      .in('key', ['farm_total_slots']);

    const settingsMap: Record<string, any> = {};
    for (const item of settingsData || []) {
      settingsMap[item.key] = item.value;
    }

    const farmTotalSlots = Number(settingsMap['farm_total_slots']) || 5000;
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
          id, crop_id, plant_count, estimated_qty_kg, bookable_qty_kg,
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
      ...usage.get(plot.id),
    }));

    res.json({
      plots: plotsWithUsage,
      unassigned_round_items: unassignedItems,
      farm_total_slots: farmTotalSlots,
      total_allocated_slots: totalAllocatedSlots,
      available_slots: Math.max(0, farmTotalSlots - totalAllocatedSlots),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลแปลงปลูก' });
  }
});

// POST /api/admin/plots - Create new plot with slot capacity check
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

    // 1. Get farm_total_slots
    const { data: settingRow } = await db
      .from('app_settings')
      .select('value')
      .eq('key', 'farm_total_slots')
      .maybeSingle();

    const farmTotalSlots = Number(settingRow?.value) || 5000;

    // 2. Sum existing slot capacities
    const { data: existingPlots } = await db.from('plots').select('slot_capacity');
    const currentAllocated = (existingPlots || []).reduce((sum, p) => sum + Number(p.slot_capacity || 0), 0);
    const availableSlots = farmTotalSlots - currentAllocated;

    // 3. Capacity check
    if (slot_capacity > availableSlots) {
      res.status(400).json({
        error: `จำนวนต้นของแปลงนี้ (${slot_capacity.toLocaleString()} ต้น) เกินโควตาที่จัดสรรได้ (ความจุฟาร์มทั้งหมด: ${farmTotalSlots.toLocaleString()} ต้น, จัดสรรไปแล้ว: ${currentAllocated.toLocaleString()} ต้น, เหลือสร้างได้อีกเพียง: ${Math.max(0, availableSlots).toLocaleString()} ต้น)`,
      });
      return;
    }

    // 4. Insert plot
    const { data, error } = await db
      .from('plots')
      .insert({
        name: name.trim(),
        zone_name: zone_name.trim(),
        slot_capacity,
        crop_id: selectedCropIds[0] || null,
        crop_ids: selectedCropIds,
        is_active,
        status: is_active ? 'growing' : 'empty', // backward compatibility
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
      res.status(400).json({ error: 'ไม่สามารถสร้างแปลงปลูกได้: ' + error.message });
      return;
    }

    await recordAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      entityType: 'planting_rounds',
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

// PUT /api/admin/plots/:id - Update plot with slot capacity check
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

    // 1. Get farm_total_slots
    const { data: settingRow } = await db
      .from('app_settings')
      .select('value')
      .eq('key', 'farm_total_slots')
      .maybeSingle();

    const farmTotalSlots = Number(settingRow?.value) || 5000;

    // 2. Sum existing slot capacities excluding this plot
    const { data: allPlots } = await db.from('plots').select('id, slot_capacity');
    const otherAllocated = (allPlots || [])
      .filter(p => p.id !== id)
      .reduce((sum, p) => sum + Number(p.slot_capacity || 0), 0);

    const availableForThis = farmTotalSlots - otherAllocated;

    // 3. Capacity check
    if (slot_capacity > availableForThis) {
      res.status(400).json({
        error: `จำนวนต้น (${slot_capacity.toLocaleString()} ต้น) เกินโควตาความจุฟาร์ม (ความจุฟาร์ม: ${farmTotalSlots.toLocaleString()} ต้น, แปลงอื่นๆ ใช้ไป: ${otherAllocated.toLocaleString()} ต้น, แปลงนี้เพิ่มได้สูงสุด: ${Math.max(0, availableForThis).toLocaleString()} ต้น)`,
      });
      return;
    }

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

    // 4. Update plot
    const { data, error } = await db
      .from('plots')
      .update({
        name: name.trim(),
        zone_name: zone_name.trim(),
        slot_capacity,
        crop_id: selectedCropIds[0] || null,
        crop_ids: selectedCropIds,
        is_active,
        status: is_active ? 'growing' : 'empty', // backward compatibility
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
      res.status(400).json({ error: 'ไม่สามารถแก้ไขแปลงปลูกได้: ' + error.message });
      return;
    }

    await recordAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      entityType: 'planting_rounds',
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

    const { data: oldPlot } = await db.from('plots').select('*').eq('id', id).single();

    const { error } = await db.from('plots').delete().eq('id', id);

    if (error) {
      res.status(400).json({ error: 'ไม่สามารถลบแปลงปลูกได้: ' + error.message });
      return;
    }

    await recordAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      entityType: 'planting_rounds',
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
