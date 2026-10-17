import { Router, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../../middlewares/auth.js';
import { recordAuditLog } from '../../services/audit.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// GET /api/admin/settings - Get all application settings
router.get('/', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select('*')
      .order('key');

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    // Convert array to key-value map for frontend convenience
    const settingsMap: Record<string, any> = {};
    for (const item of data || []) {
      settingsMap[item.key] = item.value;
    }

    res.json({
      raw: data || [],
      map: settingsMap,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลการตั้งค่า' });
  }
});

// PUT /api/admin/settings - Update application settings
router.put('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const settings = req.body; // e.g. { delivery_min_total_kg: 0, large_order_threshold_kg: 10, ... }

    if (!settings || typeof settings !== 'object') {
      res.status(400).json({ error: 'ข้อมูลการตั้งค่าไม่ถูกต้อง' });
      return;
    }

    const { data: oldSettings } = await supabaseAdmin.from('app_settings').select('*');

    for (const [key, value] of Object.entries(settings)) {
      await supabaseAdmin
        .from('app_settings')
        .upsert({
          key,
          value,
          updated_at: new Date().toISOString(),
        });
    }

    await recordAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      entityType: 'app_settings',
      entityId: 'global',
      action: 'update',
      oldData: oldSettings,
      newData: settings,
    });

    res.json({ message: 'บันทึกการตั้งค่าระบบเรียบร้อยแล้ว' });
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกการตั้งค่า' });
  }
});

export default router;
