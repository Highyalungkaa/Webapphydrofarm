import { Router, Response } from 'express';
import { supabaseAdmin } from '../config/supabase.js';

const router = Router();

// Only the farm's public contact number and cancellation window are exposed.
router.get('/contact', async (_req, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select('key, value')
      .in('key', ['farm_contact_phone', 'cancellation_deadline_hours_before_harvest']);
    if (error) throw error;

    const settings = Object.fromEntries((data || []).map((item) => [item.key, item.value]));
    const phone = settings.farm_contact_phone;
    const digits = typeof phone === 'string' ? phone.replace(/\D/g, '') : '';
    const safePhone = typeof phone === 'string' && /^\+?[\d\s()-]+$/.test(phone) && digits.length >= 9 && digits.length <= 15
      ? phone.trim() : null;
    const configuredHours = Number(settings.cancellation_deadline_hours_before_harvest);
    res.json({
      phone: safePhone,
      cancellation_deadline_hours: Number.isFinite(configuredHours) && configuredHours >= 0 ? configuredHours : 24,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'ไม่สามารถโหลดข้อมูลติดต่อฟาร์มได้' });
  }
});

export default router;
