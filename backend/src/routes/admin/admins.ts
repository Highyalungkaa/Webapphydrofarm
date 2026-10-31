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

// Existing clients receive a clear response; membership is maintained in Supabase.
router.delete('/:id', (_req: AuthenticatedRequest, res: Response): void => {
  res.status(410).json({ error: 'เพิ่มหรือลบผู้ดูแลระบบผ่าน Supabase เท่านั้น' });
});

export default router;
