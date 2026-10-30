import { Router, Response } from 'express';
import { getSupabaseClient } from '../../config/supabase.js';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../../middlewares/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// Keep the old read endpoint for existing links, but derive capacity from plots.
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const db = getSupabaseClient(req);
    const { data: plots, error: plotsError } = await db
      .from('plots')
      .select('id, slot_capacity, is_active, zone_name');

    if (plotsError) {
      throw plotsError;
    }

    const plotList = plots || [];
    const totalAllocatedSlots = plotList.reduce((sum, p) => sum + Number(p.slot_capacity || 0), 0);

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
      total_allocated_slots: totalAllocatedSlots,
      total_plots: plotList.length,
      active_plots: activePlots,
      inactive_plots: inactivePlots,
      zones,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลการตั้งค่าฟาร์ม' });
  }
});

router.put('/', (_req: AuthenticatedRequest, res: Response): void => {
  res.status(410).json({ error: 'ยกเลิกการตั้งความจุฟาร์มรวมแล้ว กรุณากำหนดจำนวนต้นที่แต่ละแปลงปลูก' });
});

export default router;
