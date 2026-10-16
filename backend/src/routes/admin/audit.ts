import { Router, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../../middlewares/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// GET /api/admin/audit - List audit logs
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { entity_type, limit = '100' } = req.query;

    let query = supabaseAdmin
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit as string, 10) || 100);

    if (entity_type && typeof entity_type === 'string') {
      query = query.eq('entity_type', entity_type);
    }

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json(data || []);
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูล audit log' });
  }
});

export default router;
