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

    if (!settings || typeof settings !== 'object'||Array.isArray(settings)) {
      res.status(400).json({ error: 'ข้อมูลการตั้งค่าไม่ถูกต้อง' });
      return;
    }
    if (Object.prototype.hasOwnProperty.call(settings, 'farm_total_slots')) {
      res.status(410).json({ error: 'ยกเลิกการตั้งความจุฟาร์มรวมแล้ว กรุณากำหนดจำนวนต้นที่แต่ละแปลงปลูก' });
      return;
    }
    for(const key of ['delivery_min_total_kg','cancellation_deadline_hours_before_harvest','no_show_limit','large_order_threshold_kg']){
      const value=settings[key];if(value===undefined)continue;
      if(typeof value!=='number'||!Number.isFinite(value)||value<0||(key==='large_order_threshold_kg'&&value===0)
        ||(['no_show_limit','cancellation_deadline_hours_before_harvest'].includes(key)&&!Number.isInteger(value))){
        res.status(400).json({error:'ค่าจำนวนและระยะเวลาในการตั้งค่าต้องถูกต้อง ไม่ติดลบ และจำนวนครั้งหรือชั่วโมงต้องเป็นจำนวนเต็ม'});return;
      }
    }

    if (settings.farm_contact_phone !== undefined) {
      const phone = settings.farm_contact_phone;
      const digits = typeof phone === 'string' ? phone.replace(/\D/g, '') : '';
      if (typeof phone !== 'string' || (phone.trim() && (!/^\+?[\d\s()-]+$/.test(phone) || digits.length < 9 || digits.length > 15))) {
        res.status(400).json({ error: 'เบอร์โทรฟาร์มต้องเป็นตัวเลข 9–15 หลัก' });
        return;
      }
      settings.farm_contact_phone = phone.trim();
    }

    const { data: oldSettings } = await supabaseAdmin.from('app_settings').select('*');

    if (settings.pending_confirmation_hours !== undefined) {
      const hours=settings.pending_confirmation_hours;
      if(typeof hours!=='number'||!Number.isInteger(hours)||hours<0||hours>8760){
        res.status(400).json({error:'เวลารอยืนยันต้องเป็นจำนวนเต็ม 0 ถึง 8760 ชั่วโมง'});return;
      }
      const {error}=await supabaseAdmin.rpc('set_order_confirmation_timeout',{p_actor_id:req.user!.id,p_hours:hours});
      if(error){res.status(400).json({error:error.message});return;}
    }

    for (const [key, value] of Object.entries(settings)) {
      if(key==='pending_confirmation_hours')continue;
      const { error: saveError } = await supabaseAdmin
        .from('app_settings')
        .upsert({
          key,
          value,
          updated_at: new Date().toISOString(),
        });
      if (saveError) throw saveError;
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
