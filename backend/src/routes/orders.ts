import { Router, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase.js';
import { requireAuth, AuthenticatedRequest } from '../middlewares/auth.js';
import { orderCreationLimiter } from '../middlewares/rateLimiter.js';

const router = Router();

const pooledOrderSchema=z.object({
  request_id:z.string().uuid(),
  items:z.array(z.object({crop_id:z.string().uuid(),qty_kg:z.number().min(0.5).max(99999999).refine(n=>Math.abs(n*100-Math.round(n*100))<0.000001)})).min(1).max(100),
  fulfillment_method:z.enum(['pickup','delivery']),delivery_address:z.string().max(4000).nullable().optional(),
  contact_phone:z.string().trim().min(9).max(30),note:z.string().max(4000).nullable().optional(),
  accepted_substitution_terms:z.literal(true),
});
router.post('/pooled',requireAuth,orderCreationLimiter,async(req:AuthenticatedRequest,res:Response):Promise<void>=>{
  const parsed=pooledOrderSchema.safeParse(req.body);
  if(!parsed.success){res.status(400).json({error:'กรุณาตรวจสอบรายการผัก จำนวน และข้อมูลติดต่อให้ครบถ้วน'});return;}
  const {request_id,...payload}=parsed.data;
  try {
    const {data,error}=await supabaseAdmin.rpc('create_pooled_order',{p_customer_id:req.user!.id,p_request_id:request_id,p_payload:payload});
    if(error){res.status(400).json({error:error.message});return;}
    res.status(201).json({message:'บันทึกการจองสำเร็จ',data});
  }catch(error:any){res.status(500).json({error:'ไม่สามารถบันทึกการจองได้ กรุณาลองใหม่'});}
});

const createOrderSchema = z.object({
  round_id: z.string().uuid('รหัสรอบการปลูกไม่ถูกต้อง'),
  items: z.array(
    z.object({
      round_item_id: z.string().uuid('รหัสรายการผักไม่ถูกต้อง'),
      qty_kg: z.number().min(0.5, 'จำนวนผักต้องไม่ต่ำกว่า 0.5 กก.').max(99999999).refine(n=>Math.abs(n*100-Math.round(n*100))<0.000001,'จำนวนผักมีทศนิยมได้ไม่เกิน 2 ตำแหน่ง'),
    })
  ).min(1, 'กรุณาเลือกผักอย่างน้อย 1 ชนิด').superRefine((items, ctx) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item.round_item_id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'round_item_id'], message: 'รายการผักในออเดอร์ต้องไม่ซ้ำกัน' });
      }
      seen.add(item.round_item_id);
    });
  }),
  fulfillment_method: z.enum(['pickup', 'delivery'], {
    errorMap: () => ({ message: 'กรุณาเลือกวิธีรับของ (มารับเอง หรือ จัดส่ง)' }),
  }),
  delivery_address: z.string().optional().nullable(),
  contact_phone: z.string().min(9, 'กรุณาระบุเบอร์โทรศัพท์ติดต่ออย่างน้อย 9 หลัก'),
  note: z.string().optional().nullable(),
  accepted_substitution_terms: z.boolean().refine((val) => val === true, {
    message: 'กรุณายอมรับเงื่อนไขการทดแทนผักกรณีผลผลิตไม่เพียงพอก่อนทำการจอง',
  }),
});

// POST /api/orders - Create an order using PostgreSQL atomic transaction RPC
router.post('/', requireAuth, orderCreationLimiter, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parseResult = createOrderSchema.safeParse(req.body);

    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message || 'ข้อมูลการสั่งจองไม่ถูกต้อง';
      res.status(400).json({ error: firstError });
      return;
    }

    const {
      round_id,
      items,
      fulfillment_method,
      delivery_address,
      contact_phone,
      note,
      accepted_substitution_terms,
    } = parseResult.data;

    let finalDeliveryAddress = delivery_address;
    if (fulfillment_method === 'delivery' && (!finalDeliveryAddress || !finalDeliveryAddress.trim())) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('address_detail')
        .eq('id', req.user!.id)
        .maybeSingle();
      if (profile?.address_detail) {
        finalDeliveryAddress = profile.address_detail;
      }
    }

    // Call stored procedure create_order in Supabase
    const { data: result, error } = await supabaseAdmin.rpc('create_order', {
      p_round_id: round_id,
      p_customer_id: req.user!.id,
      p_items: items,
      p_fulfillment_method: fulfillment_method,
      p_delivery_address: finalDeliveryAddress || null,
      p_contact_phone: contact_phone,
      p_note: note || null,
      p_accepted_terms: accepted_substitution_terms,
    });

    if (error) {
      console.error('Create Order RPC Error:', error);
      res.status(400).json({ error: error.message });
      return;
    }

    // Read the persisted status after database triggers have applied the
    // admin-confirmation workflow, so the API response matches the order.
    const orderId = result?.order_id;
    const { data: createdOrder } = orderId
      ? await supabaseAdmin.from('orders').select('status, requires_confirmation').eq('id', orderId).maybeSingle()
      : { data: null };

    // Also update phone in profile if not already set
    await supabaseAdmin
      .from('profiles')
      .update({ phone: contact_phone, updated_at: new Date().toISOString() })
      .eq('id', req.user!.id)
      .is('phone', null);

    res.status(201).json({
      message: 'บันทึกการจองสำเร็จ',
      data: createdOrder ? { ...result, ...createdOrder } : result,
    });
  } catch (err: any) {
    console.error('Create Order Exception:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างคำสั่งจอง: ' + (err.message || '') });
  }
});

// GET /api/orders/mine - Get orders of the logged-in customer
router.get('/mine', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const { data: orders, error } = await supabaseAdmin
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
        order_items (
          id,
          round_item_id,
          qty_kg,
          price_per_kg,
          discount_amount,
          round_items (
            *,
            crops (
              id,
              name
            )
          )
        )
      `)
      .eq('customer_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: 'ไม่สามารถดึงข้อมูลออเดอร์ได้: ' + error.message });
      return;
    }

    res.json(orders || []);
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงรายการคำสั่งจอง' });
  }
});

// GET /api/orders/:id - Get single order detail
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
        order_items (
          id,
          round_item_id,
          qty_kg,
          price_per_kg,
          discount_amount,
          own_qty_kg,
          fulfilled_qty_kg,
          fulfillment_source,
          round_items (
            *,
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
      console.error('Read customer order failed:', error.code, error.message);
      res.status(500).json({ error: 'ไม่สามารถโหลดข้อมูลคำสั่งจองได้ กรุณาลองใหม่' });
      return;
    }
    if (!order) {
      res.status(404).json({ error: 'ไม่พบข้อมูลคำสั่งจองที่ระบุ' });
      return;
    }

    // Only owner or admin can view
    if (order.customer_id !== req.user!.id && !req.user!.isAdmin) {
      res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าดูคำสั่งจองนี้' });
      return;
    }

    res.json(order);
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลคำสั่งจอง' });
  }
});

// POST /api/orders/:id/cancel - Cancel order
router.post('/:id/cancel', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const reason = req.body.reason || 'ลูกค้ายกเลิกผ่านระบบ';

    const { data: result, error } = await supabaseAdmin.rpc('cancel_order', {
      p_order_id: id,
      p_actor_id: req.user!.id,
      p_reason: reason,
    });

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({
      message: 'ยกเลิกคำสั่งจองเรียบร้อยแล้ว',
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการยกเลิกคำสั่งจอง' });
  }
});

export default router;
