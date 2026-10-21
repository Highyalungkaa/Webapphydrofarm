import { Router, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase.js';
import { AuthenticatedRequest, requireAuth, requireAdmin } from '../../middlewares/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);
const uuid = z.string().uuid();
const inputSchema = z.object({
  request_id: uuid,
  closed_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ไม่ถูกต้อง'),
  note: z.string().trim().max(2000).default(''),
  items: z.array(z.object({
    round_item_id: uuid,
    unsold_plant_count: z.number().int().min(0).max(2147483647),
    other_sales_kg: z.number().min(0).max(99999999).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001, 'ปริมาณต้องมีทศนิยมไม่เกิน 2 ตำแหน่ง'),
    disposition: z.enum(['discard','donate','consume','process','other']).nullable(),
    note: z.string().trim().max(1000).default(''),
  })).min(1),
});
function fail(res: Response, error: any) {
  const missing = ['42P01','42703','42883','PGRST202','PGRST204','PGRST205'].includes(error?.code);
  res.status(missing ? 503 : 400).json({ error: missing
    ? 'กรุณารัน migration 032 ใน Supabase ก่อนใช้การบันทึกผักขายไม่ออกและสิ้นสุดรอบ'
    : error?.message || 'ไม่สามารถบันทึกผักขายไม่ออกได้' });
}
router.get('/:id/unsold', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!uuid.safeParse(req.params.id).success) { res.status(400).json({ error: 'รหัสรอบไม่ถูกต้อง' }); return; }
    const [roundResult,itemResult,orderResult,closureResult,historyResult] = await Promise.all([
      supabaseAdmin.from('planting_rounds').select('*').eq('id',req.params.id).maybeSingle(),
      supabaseAdmin.from('round_items').select('*,crops(name,slots_per_kg)').eq('round_id',req.params.id),
      supabaseAdmin.from('orders').select('id,status,payment_status,order_items(round_item_id,qty_kg,fulfilled_qty_kg,fulfillment_source)').eq('round_id',req.params.id),
      supabaseAdmin.from('round_unsold_closures').select('*').eq('round_id',req.params.id).maybeSingle(),
      supabaseAdmin.from('round_unsold_items').select('*').eq('round_id',req.params.id),
    ]);
    const error=roundResult.error || itemResult.error || orderResult.error || closureResult.error || historyResult.error;
    if (error) { fail(res,error); return; }
    const round=roundResult.data;
    if (!round) { res.status(404).json({ error:'ไม่พบรอบปลูก' }); return; }
    const blocking=(orderResult.data || []).filter(o => !['completed','cancelled','no_show'].includes(o.status) || (o.status==='completed' && o.payment_status!=='paid'));
    const consumed=new Map<string,number>();
    for (const order of orderResult.data || []) if(order.status==='completed') for (const item of order.order_items || []) {
      const own=Math.max(0,Number(item.qty_kg)-(item.fulfillment_source==='substitute' ? Number(item.fulfilled_qty_kg || 0) : 0));
      consumed.set(item.round_item_id,(consumed.get(item.round_item_id)||0)+own);
    }
    const items=(itemResult.data || []).map((item:any) => {
      const rate=Number(item.loss_plants_per_kg ?? item.planting_plants_per_kg ?? item.crops?.slots_per_kg ?? 0);
      const remaining=Math.max(0,Number(item.loss_baseline_plant_count ?? item.plant_count ?? Math.round(Number(item.estimated_qty_kg)*rate))-Number(item.lost_plant_count||0));
      const yieldKg=Number(item.actual_qty_kg ?? item.remaining_estimated_qty_kg ?? item.estimated_qty_kg);
      const delivered=consumed.get(item.id)||0;
      return { id:item.id,crop_name:item.crops?.name || 'ผัก',remaining_plant_count:remaining,plants_per_kg:rate,
        farm_yield_kg:yieldKg,yield_is_actual:item.actual_qty_kg!=null,delivered_own_kg:delivered,
        available_kg:Math.max(0,Math.round((yieldKg-delivered)*100)/100) };
    });
    res.json({ round,items,blocking_orders:blocking.map(o=>({id:o.id,status:o.status,payment_status:o.payment_status})),
      closure:closureResult.data,history:historyResult.data || [] });
  } catch (error) { fail(res,error); }
});
router.post('/:id/close-unsold', async (req: AuthenticatedRequest,res: Response) => {
  try {
    const parsed=inputSchema.safeParse(req.body);
    if(!uuid.safeParse(req.params.id).success || !parsed.success) {
      res.status(400).json({ error:!parsed.success ? parsed.error.errors[0].message : 'รหัสรอบไม่ถูกต้อง' }); return;
    }
    const input=parsed.data;
    if(new Set(input.items.map(i=>i.round_item_id)).size!==input.items.length) {res.status(400).json({error:'รายการผักต้องไม่ซ้ำกัน'});return;}
    const {data,error}=await supabaseAdmin.rpc('close_round_unsold',{p_round_id:req.params.id,p_actor_id:req.user!.id,
      p_request_id:input.request_id,p_closed_date:input.closed_date,p_note:input.note,p_items:input.items});
    if(error) {fail(res,error);return;}
    res.json(data);
  } catch(error) {fail(res,error);}
});
export default router;
