import { Router, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase.js';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../../middlewares/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/chat-origins', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin.from('orders')
      .select('admin_request_payload')
      .eq('order_source', 'facebook_chat')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) { res.status(500).json({ error: 'โหลดช่องทางที่เคยบันทึกไม่สำเร็จ' }); return; }
    const seen = new Set<string>();
    const origins: string[] = [];
    for (const order of data || []) {
      const origin = order.admin_request_payload?.order_origin;
      if (typeof origin !== 'string') continue;
      const value = origin.trim();
      const key = value.toLocaleLowerCase('th-TH');
      if (!value || seen.has(key)) continue;
      seen.add(key);
      origins.push(value);
    }
    res.json(origins);
  } catch { res.status(500).json({ error: 'โหลดช่องทางที่เคยบันทึกไม่สำเร็จ' }); }
});

const schema = z.object({
  request_id: z.string().uuid(), round_id: z.string().uuid(),
  customer_id: z.string().uuid().nullable().default(null),
  customer_name: z.string().trim().min(1, 'กรุณากรอกชื่อลูกค้า').max(200),
  contact_phone: z.string().trim().min(9, 'กรุณากรอกเบอร์โทรศัพท์').max(30),
  order_origin: z.string().trim().max(100).optional(),
  fulfillment_method: z.enum(['pickup', 'delivery']),
  delivery_address: z.string().trim().max(2000).default(''),
  source_reference: z.string().trim().max(1000).default(''),
  note: z.string().trim().max(2000).default(''),
  accepted_substitution_terms: z.literal(true),
  items: z.array(z.object({ round_item_id: z.string().uuid(),
    qty_kg: z.number().min(0.5).max(99999999).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001, 'ปริมาณต้องมีทศนิยมไม่เกิน 2 ตำแหน่ง'),
  })).min(1).max(100),
});
router.post('/from-chat', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0].message }); return; }
  const { request_id, ...payload } = parsed.data;
  if (new Set(payload.items.map(i => i.round_item_id)).size !== payload.items.length) {
    res.status(400).json({ error: 'รายการผักต้องไม่ซ้ำกัน' }); return;
  }
  if (payload.fulfillment_method === 'delivery' && !payload.delivery_address) {
    res.status(400).json({ error: 'กรุณากรอกที่อยู่จัดส่ง' }); return;
  }
  try {
    const { data, error } = await supabaseAdmin.rpc('create_admin_chat_order', {
      p_actor_id: req.user!.id, p_request_id: request_id, p_payload: payload,
    });
    if (error) {
      const missing = ['42883','42P01','42703','PGRST202','PGRST204','PGRST205'].includes(error.code);
      res.status(missing ? 503 : 400).json({ error: missing ? 'กรุณารัน migration 033 ใน Supabase ก่อนเพิ่มออเดอร์นอกระบบ' : error.message }); return;
    }
    res.status(201).json(data);
  } catch { res.status(500).json({ error: 'บันทึกไม่สำเร็จ กรุณาลองอีกครั้งด้วยข้อมูลเดิมเพื่อป้องกันออเดอร์ซ้ำ' }); }
});
export default router;
