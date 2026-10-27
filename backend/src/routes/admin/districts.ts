import { Router, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase.js';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../../middlewares/auth.js';
import { recordAuditLog } from '../../services/audit.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const districtSchema = z.object({
  name: z.string().trim().min(1, 'กรุณาระบุชื่ออำเภอ/ตำบล').max(100),
  is_active: z.boolean().default(true),
});

// GET /api/admin/districts - List all districts
router.get('/', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('districts')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json(data || []);
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลอำเภอ/ตำบล' });
  }
});

// POST /api/admin/districts - Add new district
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parsed = districtSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message || 'ข้อมูลไม่ถูกต้อง' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('districts')
      .insert(parsed.data)
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: 'ไม่สามารถเพิ่มอำเภอ/ตำบลได้: ' + error.message });
      return;
    }

    await recordAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      entityType: 'districts',
      entityId: data.id,
      action: 'create',
      newData: data,
    });

    res.status(201).json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเพิ่มอำเภอ/ตำบล' });
  }
});

// PUT /api/admin/districts/:id - Update district
router.put('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const parsed = districtSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message || 'ข้อมูลไม่ถูกต้อง' });
      return;
    }

    const { data: oldDistrict } = await supabaseAdmin.from('districts').select('*').eq('id', id).single();

    const { data, error } = await supabaseAdmin
      .from('districts')
      .update(parsed.data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    await recordAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      entityType: 'districts',
      entityId: id,
      action: 'update',
      oldData: oldDistrict,
      newData: data,
    });

    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการแก้ไขอำเภอ/ตำบล' });
  }
});

export default router;
