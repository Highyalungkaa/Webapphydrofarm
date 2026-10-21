import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase.js';

const router = Router();

// Helper to compute booked and remaining quantities for round items
async function enrichRoundItems(roundId: string) {
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
    const effectiveBookable = Math.min(Number(item.bookable_qty_kg), Number(item.remaining_estimated_qty_kg ?? item.bookable_qty_kg));
    const available_qty_kg = Math.max(0, effectiveBookable - booked_qty_kg);
    return {
      ...item,
      bookable_qty_kg: effectiveBookable,
      crop_name: item.crops?.name || 'ผักสลัด',
      booked_qty_kg,
      available_qty_kg,
      is_sold_out: available_qty_kg <= 0,
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
        const items = await enrichRoundItems(round.id);
        const totalBookable = items.reduce((sum, item) => sum + Number(item.bookable_qty_kg), 0);
        const totalAvailable = items.reduce((sum, item) => sum + Number(item.available_qty_kg), 0);
        return {
          ...round,
          items,
          total_bookable_kg: totalBookable,
          total_available_kg: totalAvailable,
          is_all_sold_out: totalAvailable <= 0 && items.length > 0,
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

    const items = await enrichRoundItems(id);
    const totalBookable = items.reduce((sum, item) => sum + Number(item.bookable_qty_kg), 0);
    const totalAvailable = items.reduce((sum, item) => sum + Number(item.available_qty_kg), 0);

    res.json({
      ...round,
      items,
      total_bookable_kg: totalBookable,
      total_available_kg: totalAvailable,
      is_all_sold_out: totalAvailable <= 0 && items.length > 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลรอบ' });
  }
});

export default router;
