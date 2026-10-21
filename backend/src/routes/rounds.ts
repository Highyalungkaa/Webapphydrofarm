import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase.js';

const router = Router();

// Helper to compute booked and remaining quantities for round items
async function enrichRoundItems(roundId: string, limited = false) {
  const { data: items, error: itemsError } = await supabaseAdmin
    .from('round_items')
    .select(`
      *,
      crops (
        id,
        name,
        image_url,
        is_active
      )
    `)
    .eq('round_id', roundId);

  if (itemsError || !items) {
    return [];
  }

  // Get booked amounts for this round's items from active orders
  const { data: bookedData, error: bookedError } = await supabaseAdmin
    .from('order_items')
    .select(`
      round_item_id,
      qty_kg,
      fulfilled_qty_kg,
      fulfillment_source,
      own_qty_kg,
      orders!inner (
        status
      )
    `)
    .in('round_item_id', items.map((i: any) => i.id))
    .neq('orders.status', 'cancelled');

  const bookedMap = new Map<string, number>();
  if (!bookedError && bookedData) {
    for (const row of bookedData) {
      const current = bookedMap.get(row.round_item_id) || 0;
      bookedMap.set(row.round_item_id, current + Number(row.qty_kg));
    }
  }

  return items.map((item: any) => {
    const booked_qty_kg = bookedMap.get(item.id) || 0;
    return {
      id:item.id,round_id:item.round_id,crop_id:item.crop_id,price_per_kg:item.price_per_kg,crops:item.crops,
      crop_name:item.crops?.name || 'ผัก',booked_qty_kg,
      max_qty_per_order_kg:limited ? item.max_qty_per_order_kg : null,
      available_qty_kg:null,is_sold_out:false,
    };
  });
}

// GET /api/rounds/open - List all rounds currently open for booking
router.get('/open', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { data: rounds, error } = await supabaseAdmin
      .from('planting_rounds')
      .select('*')
      .eq('status', 'booking_open')
      .lte('booking_opens_at', new Date().toISOString())
      .order('expected_harvest_date', { ascending: true });

    if (error) {
      res.status(500).json({ error: 'ไม่สามารถดึงข้อมูลรอบการจองได้: ' + error.message });
      return;
    }

    const enrichedRounds = await Promise.all(
      (rounds || []).map(async (round) => {
        const items = await enrichRoundItems(round.id, round.purchase_limit_enabled);
        return {
          ...round,
          items,
          total_bookable_kg: null,
          total_available_kg: null,
          is_all_sold_out: false,
        };
      })
    );

    res.json(enrichedRounds);
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงรอบที่เปิดจอง' });
  }
});

// GET /api/rounds/:id - Get specific round details with crops & availability
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const { data: round, error } = await supabaseAdmin
      .from('planting_rounds')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !round) {
      res.status(404).json({ error: 'ไม่พบข้อมูลรอบการปลูกที่ระบุ' });
      return;
    }

    if (round.status === 'booking_open' && new Date(round.booking_opens_at) > new Date()) {
      res.status(404).json({ error: 'รอบการจองนี้ยังไม่เปิดให้ลูกค้าเข้าชม' });
      return;
    }

    const items = await enrichRoundItems(id, round.purchase_limit_enabled);

    res.json({
      ...round,
      items,
      total_bookable_kg: null,
      total_available_kg: null,
      is_all_sold_out: false,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลรอบ' });
  }
});

export default router;
