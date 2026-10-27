import { Router, Response } from 'express';
import { z } from 'zod';
import { getSupabaseClient } from '../../config/supabase.js';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../../middlewares/auth.js';
import { recordAuditLog } from '../../services/audit.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const farmSettingsSchema = z.object({
  farm_total_slots: z.number().int().min(1, 'จำนวนช่องปลูกทั้งหมดต้องมากกว่า 0'),
});

// GET /api/admin/farm - Get farm settings, capacity, and usage metrics
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const db = getSupabaseClient(req);

    // 1. Fetch settings from app_settings
    const { data: settingsData,error:settingsError } = await db
      .from('app_settings')
      .select('key, value')
      .in('key', ['farm_total_slots']);
    if(settingsError)throw settingsError;

    const settingsMap: Record<string, any> = {};
    for (const item of settingsData || []) {
      settingsMap[item.key] = item.value;
    }

    const farmTotalSlots = Number(settingsMap['farm_total_slots']) || 5000;

    // 2. Fetch all plots to calculate allocated slots and metrics
    const { data: plots, error: plotsError } = await db
      .from('plots')
      .select('id, slot_capacity, is_active, zone_name');

    if (plotsError) {
      throw plotsError;
    }

    const plotList = plots || [];
    const totalAllocatedSlots = plotList.reduce((sum, p) => sum + Number(p.slot_capacity || 0), 0);
    const availableSlots = Math.max(0, farmTotalSlots - totalAllocatedSlots);
    const usagePercent = farmTotalSlots > 0 ? Math.min(100, Math.round((totalAllocatedSlots / farmTotalSlots) * 100)) : 0;

    let activePlots = 0;
    let inactivePlots = 0;
    for (const p of plotList) {
      const active = !!p.is_active;
      if (active) activePlots++;
      else inactivePlots++;
    }

    // Unique zones
    const zones = Array.from(new Set(plotList.map(p => p.zone_name).filter(Boolean)));

    res.json({
      farm_total_slots: farmTotalSlots,
      total_allocated_slots: totalAllocatedSlots,
      available_slots: availableSlots,
      usage_percent: usagePercent,
      total_plots: plotList.length,
      active_plots: activePlots,
      inactive_plots: inactivePlots,
      zones,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลการตั้งค่าฟาร์ม' });
  }
});

// PUT /api/admin/farm - Update farm capacity
router.put('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parsed = farmSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message || 'ข้อมูลไม่ถูกต้อง' });
      return;
    }

    const { farm_total_slots } = parsed.data;
    const db = getSupabaseClient(req);

    // Check if new total slots is less than already allocated slots
    const { data: plots,error:plotsError } = await db.from('plots').select('slot_capacity');
    if(plotsError)throw plotsError;
    const currentAllocated = (plots || []).reduce((sum, p) => sum + Number(p.slot_capacity || 0), 0);

    if (farm_total_slots < currentAllocated) {
      res.status(400).json({
        error: `ไม่สามารถปรับลดความจุฟาร์มเหลือ ${farm_total_slots.toLocaleString()} ช่องได้ เนื่องจากมีแปลงปลูกที่จัดสรรไปแล้วรวม ${currentAllocated.toLocaleString()} ช่อง`,
      });
      return;
    }

    // Upsert settings
    const { error: saveError } = await db.from('app_settings').upsert(
      { key: 'farm_total_slots', value: farm_total_slots, updated_at: new Date().toISOString() }
    );
    if (saveError) throw saveError;

    await recordAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      entityType: 'app_settings',
      entityId: 'farm_settings',
      action: 'update',
      newData: { farm_total_slots },
    });

    res.json({
      message: 'บันทึกการตั้งค่าฟาร์มเรียบร้อยแล้ว',
      farm_total_slots,
      total_allocated_slots: currentAllocated,
      available_slots: farm_total_slots - currentAllocated,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกการตั้งค่าฟาร์ม' });
  }
});

export default router;
