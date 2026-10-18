import { Router, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getSupabaseClient, supabaseAdmin } from '../../config/supabase.js';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../../middlewares/auth.js';
import { recordAuditLog } from '../../services/audit.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// POST /api/admin/crops/image - Upload a crop image from an admin device
router.post('/image', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const parsed = z.object({
    mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
    data: z.string().min(1),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'กรุณาเลือกรูปภาพ JPEG, PNG, WebP หรือ GIF' });
    return;
  }

  try {
    const buffer = Buffer.from(parsed.data.data, 'base64');
    if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
      res.status(400).json({ error: 'ขนาดรูปภาพต้องไม่เกิน 5 MB' });
      return;
    }
    const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' } as const)[parsed.data.mime_type];
    const path = `${randomUUID()}.${extension}`;
    const { error } = await supabaseAdmin.storage.from('crop-images').upload(path, buffer, {
      contentType: parsed.data.mime_type,
      upsert: false,
    });
    if (error) {
      res.status(400).json({ error: `อัปโหลดรูปไม่สำเร็จ: ${error.message}` });
      return;
    }
    const { data } = supabaseAdmin.storage.from('crop-images').getPublicUrl(path);
    res.status(201).json({ image_url: data.publicUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'อัปโหลดรูปไม่สำเร็จ' });
  }
});

const cropSchema = z.object({
  name: z.string().min(1, 'กรุณาระบุชื่อชนิดผัก').max(100),
  default_price_per_kg: z.number().min(0, 'ราคาต่อกก. ต้องไม่ติดลบ'),
  slots_per_kg: z.number().min(0.1, 'จำนวน slot ปลูก ต่อ 1 กก. ต้องมากกว่า 0').default(4.0),
  growing_days: z.number().int().min(1, 'ระยะเวลาปลูกต้องอย่างน้อย 1 วัน').default(45),
  image_url: z.string().url('รูปแบบ URL รูปภาพไม่ถูกต้อง').optional().nullable().or(z.literal('')),
  description: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
});

// GET /api/admin/crops - List all crops
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const db = getSupabaseClient(req);
    const { data, error } = await db
      .from('crops')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json(data || []);
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลผัก' });
  }
});

// POST /api/admin/crops - Create new crop
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parsed = cropSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message || 'ข้อมูลไม่ถูกต้อง' });
      return;
    }

    const { name, default_price_per_kg, slots_per_kg, image_url, description, is_active } = parsed.data;
    const db = getSupabaseClient(req);

    const { data, error } = await db
      .from('crops')
      .insert({
        name: name.trim(),
        default_price_per_kg,
        slots_per_kg: slots_per_kg || 4.0,
        image_url: image_url ? image_url.trim() : null,
        description: description ? description.trim() : null,
        is_active,
      })
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: 'ไม่สามารถสร้างรายการผักได้: ' + error.message });
      return;
    }

    await recordAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      entityType: 'crops',
      entityId: data.id,
      action: 'create',
      newData: data,
    });

    res.status(201).json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเพิ่มรายการผัก' });
  }
});

// PUT /api/admin/crops/:id - Update crop
router.put('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const parsed = cropSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message || 'ข้อมูลไม่ถูกต้อง' });
      return;
    }

    const { name, default_price_per_kg, slots_per_kg, image_url, description, is_active } = parsed.data;
    const db = getSupabaseClient(req);

    const { data: oldCrop } = await db.from('crops').select('*').eq('id', id).single();

    const { data, error } = await db
      .from('crops')
      .update({
        name: name.trim(),
        default_price_per_kg,
        slots_per_kg: slots_per_kg || 4.0,
        image_url: image_url ? image_url.trim() : null,
        description: description ? description.trim() : null,
        is_active,
      })
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
      entityType: 'crops',
      entityId: id,
      action: 'update',
      oldData: oldCrop,
      newData: data,
    });

    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการแก้ไขรายการผัก' });
  }
});

// DELETE /api/admin/crops/:id - Delete crop
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const db = getSupabaseClient(req);

    const { data: oldCrop } = await db.from('crops').select('*').eq('id', id).single();

    const { error } = await db.from('crops').delete().eq('id', id);

    if (error) {
      res.status(400).json({
        error: 'ไม่สามารถลบชนิดผักนี้ได้ เนื่องจากมีรอบการปลูกหรือแปลงปลูกที่อ้างอิงอยู่ (แนะนำให้เลือก "ปิดใช้งาน" แทน)',
      });
      return;
    }

    await recordAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      entityType: 'crops',
      entityId: id,
      action: 'delete',
      oldData: oldCrop,
    });

    res.json({ message: 'ลบชนิดผักเรียบร้อยแล้ว' });
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบชนิดผัก' });
  }
});

export default router;
