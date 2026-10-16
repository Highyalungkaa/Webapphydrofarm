import { Router, Response } from 'express';
import { supabaseAdmin } from '../config/supabase.js';

const router = Router();

// GET /api/districts - List active deliverable districts
router.get('/', async (_req, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('districts')
      .select('id, name, is_active')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      res.status(500).json({ error: 'ไม่สามารถดึงข้อมูลอำเภอ/ตำบลได้: ' + error.message });
      return;
    }

    res.json(data || []);
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลอำเภอ/ตำบล' });
  }
});

export default router;
