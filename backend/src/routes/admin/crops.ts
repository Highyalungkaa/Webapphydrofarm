import { Router, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getSupabaseClient, supabaseAdmin } from '../../config/supabase.js';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../../middlewares/auth.js';
import { recordAuditLog } from '../../services/audit.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const CROP_IMAGE_BUCKET = 'crop-images';
const CROP_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const CROP_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];

async function ensureCropImageBucket(): Promise<void> {
  const storage = supabaseAdmin.storage;
  let { data: bucket, error } = await storage.getBucket(CROP_IMAGE_BUCKET);
  if (error) {
    if (error.status !== 404) throw error;
    const created = await storage.createBucket(CROP_IMAGE_BUCKET, {
      public: true,
      fileSizeLimit: CROP_IMAGE_MAX_BYTES,
      allowedMimeTypes: CROP_IMAGE_MIME_TYPES,
    });
    if (created.error) {
      // Another upload may have created the bucket while this request was waiting.
      const retry = await storage.getBucket(CROP_IMAGE_BUCKET);
      if (retry.error) throw created.error;
      bucket = retry.data;
    } else {
      return;
    }
  }
  if (!bucket) throw new Error('ไม่พบ bucket สำหรับรูปภาพผัก');
  const allowed = bucket.allowed_mime_types;
  if (!bucket.public || (bucket.file_size_limit || 0) < CROP_IMAGE_MAX_BYTES
      || (allowed && CROP_IMAGE_MIME_TYPES.some((mime) => !allowed.includes(mime)))) {
    const updated = await storage.updateBucket(CROP_IMAGE_BUCKET, {
      public: true,
      fileSizeLimit: Math.max(bucket.file_size_limit || 0, CROP_IMAGE_MAX_BYTES),
      allowedMimeTypes: allowed ? [...new Set([...allowed, ...CROP_IMAGE_MIME_TYPES])] : null,
    });
    if (updated.error) throw updated.error;
  }
}

// POST /api/admin/crops/image - Upload a crop image from an admin device
router.post('/image', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const parsed = z.object({
    mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']),
    data: z.string().min(1),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'กรุณาเลือกรูปภาพ JPEG, PNG, WebP, GIF หรือ SVG' });
    return;
  }

  try {
    const buffer = Buffer.from(parsed.data.data, 'base64');
    if (!buffer.length || buffer.length > CROP_IMAGE_MAX_BYTES) {
      res.status(400).json({ error: 'ขนาดรูปภาพต้องไม่เกิน 5 MB' });
      return;
    }
    if (parsed.data.mime_type === 'image/svg+xml') {
      const svg = buffer.toString('utf8');
      if (!/<svg\b/i.test(svg) || /<\s*(script|foreignObject|iframe|object|embed)\b|\bon\w+\s*=|javascript:/i.test(svg)) {
        res.status(400).json({ error: 'ไฟล์ SVG ไม่ถูกต้องหรือมีเนื้อหาที่ไม่อนุญาต' });
        return;
      }
    }
    const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' } as const)[parsed.data.mime_type];
    const path = `${randomUUID()}.${extension}`;
    await ensureCropImageBucket();
    const { error } = await supabaseAdmin.storage.from(CROP_IMAGE_BUCKET).upload(path, buffer, {
      contentType: parsed.data.mime_type,
      upsert: false,
    });
    if (error) {
      res.status(400).json({ error: `อัปโหลดรูปไม่สำเร็จ: ${error.message}` });
      return;
    }
    const { data } = supabaseAdmin.storage.from(CROP_IMAGE_BUCKET).getPublicUrl(path);
    res.status(201).json({ image_url: data.publicUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'อัปโหลดรูปไม่สำเร็จ' });
  }
});

const cropSchema = z.object({
  name: z.string().min(1, 'กรุณาระบุชื่อชนิดผัก').max(100),
  default_price_per_kg: z.number().min(0, 'ราคาต่อกก. ต้องไม่ติดลบ'),
  slots_per_kg: z.number().min(0.1, 'จำนวนต้นต่อกิโลกรัมต้องอย่างน้อย 0.1').max(999.99)
    .refine(n=>Math.abs(n*100-Math.round(n*100))<0.00001,'จำนวนต้นต่อกิโลกรัมมีทศนิยมได้ไม่เกิน 2 ตำแหน่ง').optional(),
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
        ...(slots_per_kg !== undefined ? { slots_per_kg } : {}),
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
        ...(slots_per_kg !== undefined ? { slots_per_kg } : {}),
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
