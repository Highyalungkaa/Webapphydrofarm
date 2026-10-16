import { Router, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase.js';
import { requireAuth, AuthenticatedRequest } from '../middlewares/auth.js';

const router = Router();

const updateProfileSchema = z.object({
  full_name: z.string().min(1, 'กรุณาระบุชื่อ-นามสกุล').max(150, 'ชื่อยาวเกินไป'),
  phone: z.string().min(9, 'เบอร์โทรศัพท์ต้องมีอย่างน้อย 9 หลัก').max(20, 'เบอร์โทรศัพท์ยาวเกินไป'),
  address_detail: z.string().optional().nullable(),
  district_id: z.string().uuid('รหัสอำเภอ/ตำบลไม่ถูกต้อง').optional().nullable(),
});

// GET /api/profile - Get current user profile
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*, districts(id, name)')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: 'ไม่สามารถดึงข้อมูลโปรไฟล์ได้: ' + error.message });
      return;
    }

    if (!profile) {
      // If profile not yet created by trigger, create one
      const { data: newProfile, error: insertError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: userId,
          email: req.user!.email,
          full_name: req.user!.email.split('@')[0],
        })
        .select('*, districts(id, name)')
        .single();

      if (insertError) {
        res.status(500).json({ error: 'ไม่สามารถสร้างโปรไฟล์ได้: ' + insertError.message });
        return;
      }
      res.json({ ...newProfile, is_admin: req.user!.isAdmin });
      return;
    }

    res.json({ ...profile, is_admin: req.user!.isAdmin });
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลโปรไฟล์' });
  }
});

// PUT /api/profile - Update current user profile
router.put('/', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const parseResult = updateProfileSchema.safeParse(req.body);

    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message || 'ข้อมูลไม่ถูกต้อง';
      res.status(400).json({ error: firstError });
      return;
    }

    const { full_name, phone, address_detail, district_id } = parseResult.data;

    const { data: updated, error } = await supabaseAdmin
      .from('profiles')
      .update({
        full_name,
        phone,
        address_detail: address_detail || null,
        district_id: district_id || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select('*, districts(id, name)')
      .single();

    if (error) {
      res.status(500).json({ error: 'ไม่สามารถบันทึกโปรไฟล์ได้: ' + error.message });
      return;
    }

    res.json({
      message: 'บันทึกข้อมูลส่วนตัวเรียบร้อยแล้ว',
      profile: { ...updated, is_admin: req.user!.isAdmin },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกโปรไฟล์' });
  }
});

export default router;
