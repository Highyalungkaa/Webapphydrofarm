import { Router, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase.js';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../../middlewares/auth.js';
import { recordAuditLog } from '../../services/audit.js';
import { roundOrderFilter } from '../../services/roundOrders.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const amendSchema=z.object({
  request_id:z.string().uuid(),expected_updated_at:z.string().datetime({offset:true}),reason:z.string().trim().min(1,'กรุณาระบุเหตุผล').max(1000),
  preview_token:z.string().regex(/^[a-f0-9]{32}$/).optional(),
  items:z.array(z.object({crop_id:z.string().uuid(),qty_kg:z.number().min(0.5).max(99999999).refine(n=>Math.abs(n*100-Math.round(n*100))<0.000001)})).min(1).max(100),
}).refine(body=>new Set(body.items.map(i=>i.crop_id)).size===body.items.length,'ชนิดผักต้องไม่ซ้ำกัน');
function amendHandler(preview:boolean){return async(req:AuthenticatedRequest,res:Response):Promise<void>=>{
  const parsed=amendSchema.safeParse(req.body);
  if(!z.string().uuid().safeParse(req.params.id).success||!parsed.success){res.status(400).json({error:!parsed.success?parsed.error.errors[0].message:'รหัสออเดอร์ไม่ถูกต้อง'});return;}
  const {request_id,...payload}=parsed.data;
  if(!preview&&!payload.preview_token){res.status(400).json({error:'กรุณาตรวจสอบสต๊อกและยอดใหม่ก่อนบันทึก'});return;}
  try{
    const {data,error}=await supabaseAdmin.rpc('amend_order_items',{p_actor_id:req.user!.id,p_order_id:req.params.id,p_request_id:request_id,p_payload:payload,p_preview:preview});
    if(error){res.status(400).json({error:error.message});return;}
    res.json({data});
  }catch(error:any){res.status(500).json({error:'ไม่สามารถแก้รายการออเดอร์ได้ กรุณาลองใหม่'});}
};}
router.post('/:id/items/preview',amendHandler(true));
router.post('/:id/items',amendHandler(false));

const updateOrderSchema = z.object({
  expected_updated_at: z.string().datetime({ offset: true }).optional(),
  allocation_items: z.array(z.object({
    id: z.string().uuid(),
    own_qty_kg: z.number().min(0).max(99999999).nullable(),
    substitute_qty_kg: z.number().min(0).max(99999999),
    substitute_total_cost: z.number().min(0).max(99999999),
    discount_amount: z.number().min(0).max(99999999),
  })).min(1).max(100).optional(),
  status: z.enum(['pending_confirmation', 'confirmed', 'ready', 'completed', 'cancelled', 'no_show']).optional(),
  payment_status: z.enum(['unpaid', 'paid']).optional(),
  payment_method: z.enum(['cash', 'transfer']).optional().nullable(),
  cancel_reason: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  substitute_items: z.array(z.object({
    id: z.string().uuid(),
    qty_kg: z.number().min(0).max(100000),
    total_cost: z.number().min(0).max(100000000),
  })).optional(),
  item_discounts: z.array(z.object({
    id: z.string().uuid(),
    discount_amount: z.number().min(0).max(100000000),
  })).optional(),
});

// GET /api/admin/orders - List all orders with multi-parameter filtering
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { round_id, status, fulfillment_method, payment_status, search, offset, limit } = req.query;
    const pageOffset = offset === undefined ? null : Number(offset);
    const pageLimit = limit === undefined ? null : Number(limit);
    if ((pageOffset !== null && (!Number.isInteger(pageOffset) || pageOffset < 0)) ||
        (pageLimit !== null && (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > 1000))) {
      res.status(400).json({ error: 'offset หรือ limit ไม่ถูกต้อง' });
      return;
    }

    let query = supabaseAdmin
      .from('orders')
      .select(`
        *,
        planting_rounds:planting_rounds!orders_round_id_fkey (
          id,
          name,
          fulfillment_date
        ),
        districts (
          id,
          name
        ),
        profiles (
          id,
          full_name,
          email,
          phone,
          no_show_count
        ),
        order_items (
          id,
          round_item_id,
          qty_kg,
          price_per_kg,
          discount_amount,
          fulfilled_qty_kg,
          own_qty_kg,
          fulfillment_source,
          substitute_supplier,
          substitute_cost_per_kg,
          substitute_total_cost,
          substitute_note,
          round_items (
            id,
            round_id,
            planting_rounds(id,name),
            crops (
              id,
              name
            )
          )
        )
      `)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    if (round_id && typeof round_id === 'string') {
      query = query.or(await roundOrderFilter(supabaseAdmin,round_id));
    }

    if (status && typeof status === 'string') {
      query = query.eq('status', status);
    }

    if (fulfillment_method && typeof fulfillment_method === 'string') {
      query = query.eq('fulfillment_method', fulfillment_method);
    }

    if (payment_status && typeof payment_status === 'string') {
      query = query.eq('payment_status', payment_status);
    }

    if (pageOffset !== null || pageLimit !== null) {
      const start = pageOffset || 0;
      query = query.range(start, start + (pageLimit || 500) - 1);
    }

    const { data: orders, error } = await query;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    let filtered = orders || [];

    if (search && typeof search === 'string') {
      const q = search.toLowerCase();
      filtered = filtered.filter((o: any) =>
        (o.contact_phone && o.contact_phone.toLowerCase().includes(q)) ||
        (o.customer_name && o.customer_name.toLowerCase().includes(q)) ||
        (o.profiles?.full_name && o.profiles.full_name.toLowerCase().includes(q)) ||
        (o.profiles?.email && o.profiles.email.toLowerCase().includes(q)) ||
        (o.id && o.id.toLowerCase().includes(q))
      );
    }

    res.json(filtered);
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงรายการคำสั่งจอง' });
  }
});

// GET /api/admin/orders/:id - Get single order
router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select(`
        *,
        planting_rounds:planting_rounds!orders_round_id_fkey (
          id,
          name,
          expected_harvest_date,
          fulfillment_date,
          delivery_start_time,
          delivery_end_time,
          status
        ),
        districts (
          id,
          name
        ),
        profiles (
          id,
          full_name,
          email,
          phone,
          no_show_count
        ),
        order_items (
          id,
          round_item_id,
          qty_kg,
          price_per_kg,
          discount_amount,
          fulfilled_qty_kg,
          own_qty_kg,
          fulfillment_source,
          substitute_supplier,
          substitute_cost_per_kg,
          substitute_total_cost,
          substitute_note,
          round_items (
            id,
            round_id,
            planting_rounds(id,name),
            crop_id,
            crops (
              id,
              name
            )
          )
        )
      `)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Read admin order failed:', error.code, error.message);
      res.status(500).json({ error: 'ไม่สามารถโหลดข้อมูลคำสั่งจองได้ กรุณาลองใหม่' });
      return;
    }
    if (!order) {
      res.status(404).json({ error: 'ไม่พบคำสั่งจองที่ระบุ' });
      return;
    }

    res.json(order);
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลออเดอร์' });
  }
});

// PATCH /api/admin/orders/:id - Update order status, payment, or mark no-show
router.patch('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const parsed = updateOrderSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message || 'ข้อมูลไม่ถูกต้อง' });
      return;
    }

    if (parsed.data.allocation_items) {
      const { data, error } = await supabaseAdmin.rpc('save_admin_order_allocation', {
        p_actor_id: req.user!.id, p_order_id: id, p_payload: parsed.data,
      });
      if (error) {
        const missing = ['42883','42P01','42703','PGRST202','PGRST204','PGRST205'].includes(error.code);
        res.status(missing ? 503 : 400).json({error: missing ? 'กรุณารัน migration 035 ใน Supabase ก่อนบันทึกการจัดผักจริง' : error.message}); return;
      }
      res.json({message:'บันทึกน้ำหนักจัดจริงและออเดอร์แล้ว',order:data}); return;
    }

    const { data: currentOrder,error:currentError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if(currentError){res.status(500).json({error:'ไม่สามารถอ่านออเดอร์ล่าสุดได้ กรุณาลองใหม่'});return;}

    if (!currentOrder) {
      res.status(404).json({ error: 'ไม่พบคำสั่งจองที่ระบุ' });
      return;
    }

    if ((parsed.data.status ?? currentOrder.status) === 'completed'
      && (parsed.data.payment_status ?? currentOrder.payment_status) !== 'paid'
      && ((parsed.data.status !== undefined && parsed.data.status !== currentOrder.status)
        || (parsed.data.payment_status !== undefined && parsed.data.payment_status !== currentOrder.payment_status))) {
      res.status(400).json({ error: 'ต้องบันทึกว่าชำระเงินแล้วก่อนปิดออเดอร์เป็นสำเร็จ' });
      return;
    }

    let substituteItemsById: Map<string, { id: string; qty_kg: number; price_per_kg: number }> | undefined;
    if (parsed.data.substitute_items || parsed.data.item_discounts) {
      const { data: orderItems, error: itemsError } = await supabaseAdmin
        .from('order_items')
        .select('id, qty_kg, price_per_kg')
        .eq('order_id', id);

      if (itemsError || !orderItems) {
        res.status(400).json({ error: itemsError?.message || 'ไม่สามารถอ่านรายการผักในออเดอร์ได้' });
        return;
      }

      substituteItemsById = new Map(orderItems.map((item: any) => [item.id, item]));
      for (const substitute of parsed.data.substitute_items || []) {
        const item = substituteItemsById.get(substitute.id);
        if (!item || substitute.qty_kg > Number(item.qty_kg)) {
          res.status(400).json({ error: 'จำนวนผักทดแทนต้องไม่เกินจำนวนที่ลูกค้าสั่ง' });
          return;
        }
      }
      for (const discount of parsed.data.item_discounts || []) {
        const item = substituteItemsById.get(discount.id);
        if (!item || discount.discount_amount > Number(item.qty_kg) * Number(item.price_per_kg)) {
          res.status(400).json({ error: 'ส่วนลดต้องไม่เกินยอดรวมของรายการผัก' });
          return;
        }
      }
    }

    const {data:storedItems,error:itemsError}=await supabaseAdmin.from('order_items').select('*').eq('order_id',id);
    if(itemsError||!storedItems){res.status(500).json({error:'ไม่สามารถอ่านรายการผักได้ กรุณาลองใหม่'});return;}
    const allocation_items=storedItems.map((item:any)=>{
      const substitute=parsed.data.substitute_items?.find(i=>i.id===item.id);
      const discount=parsed.data.item_discounts?.find(i=>i.id===item.id);
      return {id:item.id,own_qty_kg:item.own_qty_kg??null,
        substitute_qty_kg:substitute?.qty_kg??(item.fulfillment_source==='substitute'?Number(item.fulfilled_qty_kg||0):0),
        substitute_total_cost:substitute?.total_cost??(item.fulfillment_source==='substitute'?Number(item.substitute_total_cost??Number(item.fulfilled_qty_kg||0)*Number(item.substitute_cost_per_kg||0)):0),
        discount_amount:discount?.discount_amount??Number(item.discount_amount||0)};
    });
    const {data,error}=await supabaseAdmin.rpc('save_admin_order_allocation',{
      p_actor_id:req.user!.id,p_order_id:id,
      p_payload:{...parsed.data,expected_updated_at:parsed.data.expected_updated_at||currentOrder.updated_at,allocation_items},
    });
    if(error){res.status(400).json({error:error.message});return;}
    res.json({message:'อัปเดตคำสั่งจองเรียบร้อยแล้ว',order:data});
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัปเดตคำสั่งจอง' });
  }
});

export default router;
