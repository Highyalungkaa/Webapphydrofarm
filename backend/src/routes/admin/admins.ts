import { Router, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../../middlewares/auth.js';
import { recordAuditLog } from '../../services/audit.js';

const router = Router();
router.use(requireAuth, requireAdmin);

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
