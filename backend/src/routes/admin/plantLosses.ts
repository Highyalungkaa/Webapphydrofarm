import { Router, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase.js';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../../middlewares/auth.js';
import { parseSlipImage } from '../../services/equipmentPayments.js';

const router = Router();
router.use(requireAuth, requireAdmin);
const uuid = z.string().uuid();
const lossSchema = z.object({
  request_id: uuid,
  round_item_id: uuid,
  plot_id: uuid.nullable().optional(),
  loss_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'กรุณาระบุวันที่ให้ถูกต้อง'),
  plant_count: z.number().int().positive('จำนวนเสียหายต้องเป็นจำนวนเต็มมากกว่า 0').max(2147483647),
  reason: z.string().trim().min(1, 'กรุณาระบุสาเหตุ').max(300),
  note: z.string().trim().max(2000).optional(),
  image_path: z.string().max(500).nullable().optional(),
});

const fail = (res: Response, error: any) => {
  const missing = ['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205'].includes(error?.code);
  res.status(missing ? 503 : 400).json({ error: missing
    ? 'กรุณาอัปเดตฐานข้อมูลด้วย migration 031 ก่อนใช้งานบันทึกผักเสียหาย'
    : error?.message || 'ไม่สามารถบันทึกข้อมูลผักเสียหายได้' });
};

router.get('/:id/losses', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!uuid.safeParse(req.params.id).success) { res.status(400).json({ error: 'รหัสรอบปลูกไม่ถูกต้อง' }); return; }
    const { data: round, error: roundError } = await supabaseAdmin.from('planting_rounds')
      .select('id,notes,status,current_step,seed_date,created_at,sold_out_date,completed_date').eq('id', req.params.id).maybeSingle();
    if (roundError) { fail(res, roundError); return; }
    if (!round) { res.status(404).json({ error: 'ไม่พบรอบปลูก' }); return; }
    const [itemResult, lossResult, plotResult, bookedResult] = await Promise.all([
      supabaseAdmin.from('round_items').select('*,crops(name,slots_per_kg)').eq('round_id', round.id),
      supabaseAdmin.from('plant_losses').select('*').eq('round_id', round.id).order('created_at', { ascending: false }),
      supabaseAdmin.from('plots').select('id,name'),
      supabaseAdmin.from('orders').select('status,order_items(round_item_id,qty_kg)').eq('round_id', round.id).neq('status', 'cancelled'),
    ]);
    const error = itemResult.error || lossResult.error || plotResult.error || bookedResult.error;
    if (error) { fail(res, error); return; }
    let plotIds: Record<string, string[]> = {};
    try { plotIds = JSON.parse(round.notes || '{}').cropPlotIds || {}; } catch { /* legacy notes */ }
    const booked = new Map<string, number>();
    for (const order of bookedResult.data || []) for (const item of order.order_items || []) {
      booked.set(item.round_item_id, (booked.get(item.round_item_id) || 0) + Number(item.qty_kg));
    }
    const items = (itemResult.data || []).map((item: any) => {
      const rate = Number(item.loss_plants_per_kg ?? item.planting_plants_per_kg ?? item.crops?.slots_per_kg ?? 0);
      const original = Number(item.loss_baseline_plant_count ?? item.plant_count ?? Math.round(Number(item.estimated_qty_kg) * rate));
      const lost = Number(item.lost_plant_count || 0);
      const originalKg = rate > 0 ? Math.floor(original * 100 / Math.round(rate * 100)) : Number(item.estimated_qty_kg);
      const remainingKg = Number(item.remaining_estimated_qty_kg ?? item.estimated_qty_kg);
      return { id: item.id, crop_name: item.crops?.name || 'ผัก', original_plant_count: original, lost_plant_count: lost,
        remaining_plant_count: original - lost, original_estimated_kg: originalKg, remaining_estimated_kg: remainingKg,
        lost_estimated_kg: Math.max(0, originalKg - remainingKg), plants_per_kg: rate, is_approximate: item.plant_count == null,
        shortage_kg: Math.max(0, (booked.get(item.id) || 0) - remainingKg),
        plots: (plotResult.data || []).filter(p => Array.isArray(plotIds[item.crop_id]) && plotIds[item.crop_id].includes(p.id)),
      };
    });
    const history = await Promise.all((lossResult.data || []).map(async entry => {
      if (!entry.image_path) return { ...entry, image_url: null };
      const { data } = await supabaseAdmin.storage.from('plant-loss-images').createSignedUrl(entry.image_path, 3600);
      return { ...entry, image_url: data?.signedUrl || null };
    }));
    res.json({ round, items, history });
  } catch (error) { fail(res, error); }
});

router.post('/:id/losses/image', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = z.object({ mime_type: z.string(), data: z.string().max(7 * 1024 * 1024) }).safeParse(req.body);
    if (!uuid.safeParse(req.params.id).success || !parsed.success) { res.status(400).json({ error: 'ข้อมูลรูปภาพไม่ถูกต้อง' }); return; }
    const { data: round, error } = await supabaseAdmin.from('planting_rounds').select('id,status,sold_out_date,completed_date').eq('id', req.params.id).maybeSingle();
    if (error) { fail(res, error); return; }
    if (!round || ['completed','cancelled'].includes(round.status) || round.sold_out_date || round.completed_date) {
      res.status(400).json({ error: 'รอบนี้ไม่สามารถเพิ่มรูปผักเสียหายได้' }); return;
    }
    const { buffer, extension } = parseSlipImage(parsed.data.mime_type, parsed.data.data);
    const path = `${round.id}/${req.user!.id}/${randomUUID()}.${extension}`;
    const uploaded = await supabaseAdmin.storage.from('plant-loss-images').upload(path, buffer, { contentType: parsed.data.mime_type, upsert: false });
    if (uploaded.error) { fail(res, uploaded.error); return; }
    res.json({ path });
  } catch (error) { fail(res, error); }
});

router.post('/:id/losses', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = lossSchema.safeParse(req.body);
    if (!uuid.safeParse(req.params.id).success || !parsed.success) {
      res.status(400).json({ error: !parsed.success ? parsed.error.errors[0].message : 'รหัสรอบปลูกไม่ถูกต้อง' }); return;
    }
    const input = parsed.data;
    const { data, error } = await supabaseAdmin.rpc('record_plant_loss', {
      p_round_id: req.params.id, p_round_item_id: input.round_item_id, p_actor_id: req.user!.id,
      p_request_id: input.request_id, p_loss_date: input.loss_date, p_plant_count: input.plant_count,
      p_reason: input.reason, p_plot_id: input.plot_id || null, p_note: input.note || null, p_image_path: input.image_path || null,
    });
    if (error) { fail(res, error); return; }
    res.status(201).json(data);
  } catch (error) { fail(res, error); }
});

router.post('/:id/losses/:lossId/void', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = z.object({ round_item_id: uuid, reason: z.string().trim().min(1, 'กรุณาระบุเหตุผลที่ยกเลิกรายการ').max(500) }).safeParse(req.body);
    if (!uuid.safeParse(req.params.id).success || !uuid.safeParse(req.params.lossId).success || !parsed.success) {
      res.status(400).json({ error: !parsed.success ? parsed.error.errors[0].message : 'รหัสรายการไม่ถูกต้อง' }); return;
    }
    const { data, error } = await supabaseAdmin.rpc('record_plant_loss', {
      p_round_id: req.params.id, p_round_item_id: parsed.data.round_item_id, p_actor_id: req.user!.id,
      p_request_id: randomUUID(), p_loss_date: null, p_plant_count: null, p_reason: parsed.data.reason, p_void_id: req.params.lossId,
    });
    if (error) { fail(res, error); return; }
    res.json(data);
  } catch (error) { fail(res, error); }
});
export default router;
