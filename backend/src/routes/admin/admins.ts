import { Router, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase.js';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../../middlewares/auth.js';
import { recordAuditLog } from '../../services/audit.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const addAdminSchema = z.object({
  email: z.string().email('รูปแบบอีเมลไม่ถูกต้อง'),
});

// GET /api/admin/admins - List admin users
router.get('/', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('admin_users')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json(data || []);
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงรายชื่อแอดมิน' });
  }
});

// POST /api/admin/admins - Add new admin email
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parsed = addAdminSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message || 'ข้อมูลไม่ถูกต้อง' });
      return;
    }

    const email = parsed.data.email.toLowerCase().trim();

    const { data, error } = await supabaseAdmin
      .from('admin_users')
      .insert({ email })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        res.status(400).json({ error: 'อีเมลนี้เป็นแอดมินอยู่แล้ว' });
        return;
      }
      res.status(400).json({ error: error.message });
      return;
    }

    await recordAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      entityType: 'admin_users',
      entityId: data.id,
      action: 'create',
      newData: data,
    });

    res.status(201).json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเพิ่มแอดมิน' });
  }
});

// DELETE /api/admin/admins/:id - Delete admin email
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    // Check count of admins to avoid locking everyone out
    const { data: admins } = await supabaseAdmin.from('admin_users').select('id, email');
    if ((admins?.length || 0) <= 1) {
      res.status(400).json({ error: 'ต้องมีผู้ดูแลระบบอย่างน้อย 1 บัญชี ไม่สามารถลบได้' });
      return;
    }

    const { data: deleted, error } = await supabaseAdmin
      .from('admin_users')
      .delete()
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
      entityType: 'admin_users',
      entityId: id,
      action: 'delete',
      oldData: deleted,
    });

    res.json({ message: 'ลบสิทธิ์แอดมินเรียบร้อยแล้ว' });
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบแอดมิน' });
  }
});

export default router;
