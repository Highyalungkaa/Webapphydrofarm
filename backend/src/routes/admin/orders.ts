import { Router, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase.js';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../../middlewares/auth.js';
import { recordAuditLog } from '../../services/audit.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const updateOrderSchema = z.object({
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
        planting_rounds (
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
          qty_kg,
          price_per_kg,
          discount_amount,
          fulfilled_qty_kg,
          fulfillment_source,
          substitute_supplier,
          substitute_cost_per_kg,
          substitute_total_cost,
          substitute_note,
          round_items (
            id,
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
      query = query.eq('round_id', round_id);
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
        planting_rounds (
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
          qty_kg,
          price_per_kg,
          discount_amount,
          fulfilled_qty_kg,
          fulfillment_source,
          substitute_supplier,
          substitute_cost_per_kg,
          substitute_total_cost,
          substitute_note,
          round_items (
            id,
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

    if (error || !order) {
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

    const { data: currentOrder } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

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

    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (parsed.data.status) {
      updates.status = parsed.data.status;
      if (parsed.data.status === 'confirmed' && currentOrder.status === 'pending_confirmation') {
        updates.confirmed_at = new Date().toISOString();
      }
      if (parsed.data.status === 'cancelled') {
        updates.cancelled_at = new Date().toISOString();
        if (parsed.data.cancel_reason) {
          updates.cancel_reason = parsed.data.cancel_reason;
        }
      }
      // Rule 4.5: If marked no_show, increment no_show_count on customer profile
      if (parsed.data.status === 'no_show' && currentOrder.status !== 'no_show' && currentOrder.customer_id) {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('no_show_count')
          .eq('id', currentOrder.customer_id)
          .single();

        const currentNoShow = profile?.no_show_count || 0;
        await supabaseAdmin
          .from('profiles')
          .update({
            no_show_count: currentNoShow + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', currentOrder.customer_id);
      }
    }

    if (parsed.data.payment_status) {
      updates.payment_status = parsed.data.payment_status;
      if (parsed.data.payment_status === 'paid') {
        updates.paid_at = new Date().toISOString();
        if (parsed.data.payment_method) {
          updates.payment_method = parsed.data.payment_method;
        }
      } else {
        updates.paid_at = null;
        updates.payment_method = null;
      }
    }

    if (parsed.data.note !== undefined) {
      updates.note = parsed.data.note;
    }

    const { data: updated, error } = await supabaseAdmin
      .from('orders')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    if (parsed.data.substitute_items) {
      for (const substitute of parsed.data.substitute_items) {
        const item = substituteItemsById!.get(substitute.id)!;
        const hasSubstitute = substitute.qty_kg > 0;
        const { error: substituteError } = await supabaseAdmin
          .from('order_items')
          .update({
            fulfilled_qty_kg: hasSubstitute ? substitute.qty_kg : null,
            fulfillment_source: hasSubstitute ? 'substitute' : null,
            substitute_cost_per_kg: hasSubstitute ? Number((substitute.total_cost / substitute.qty_kg).toFixed(2)) : null,
            substitute_total_cost: hasSubstitute ? Number(substitute.total_cost.toFixed(2)) : null,
          })
          .eq('id', item.id)
          .eq('order_id', id);

        if (substituteError) {
          res.status(400).json({ error: substituteError.message });
          return;
        }
      }
    }

    if (parsed.data.item_discounts) {
      const { error: discountError } = await supabaseAdmin.rpc('apply_order_item_discounts', {
        p_order_id: id,
        p_discounts: parsed.data.item_discounts,
      });
      if (discountError) {
        res.status(400).json({ error: discountError.message });
        return;
      }
    }

    await recordAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      entityType: 'orders',
      entityId: id,
      action: parsed.data.payment_status ? 'payment_update' : 'status_change',
      oldData: currentOrder,
      newData: updated,
    });

    res.json({
      message: 'อัปเดตคำสั่งจองเรียบร้อยแล้ว',
      order: updated,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัปเดตคำสั่งจอง' });
  }
});

export default router;
