import { Router, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../../middlewares/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// GET /api/admin/customers - List customers and their no_show count
router.get('/', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { data: profiles, error } = await supabaseAdmin
      .from('profiles')
      .select(`
        id,
        email,
        full_name,
        phone,
        no_show_count,
        created_at,
        districts (
          id,
          name
        )
      `)
      .order('no_show_count', { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json(profiles || []);
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลลูกค้า' });
  }
});

export default router;
