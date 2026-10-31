import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { buildPooledCatalog } from '../services/pooledCatalog.js';

const router = Router();

router.get('/catalog', async (_req: Request,res: Response): Promise<void> => {
  try {
    const {data,error}=await supabaseAdmin.from('booking_sources').select('*');
    if(error) throw error;
    res.json(buildPooledCatalog(data||[]));
  } catch(error:any) { res.status(503).json({error:'ไม่สามารถโหลดสต๊อกผักได้ กรุณาลองใหม่: '+error.message}); }
});

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
        is_active,
        slots_per_kg
      )
    `)
    .eq('round_id', roundId);

  if (itemsError || !items) {
    throw itemsError||new Error('ไม่สามารถอ่านรายการผักได้');
  }
  if(!items.length)return [];

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
  if(bookedError)throw bookedError;
  if (!bookedError && bookedData) {
    for (const row of bookedData) {
      const current = bookedMap.get(row.round_item_id) || 0;
      bookedMap.set(row.round_item_id, current + Number(row.qty_kg));
    }
  }

  return items.map((item: any) => {
    const booked_qty_kg = bookedMap.get(item.id) || 0;
    const rate=Number(item.planting_plants_per_kg??item.crops?.slots_per_kg);
    const estimated=rate>0&&item.plant_count!=null?Math.floor(Math.max(0,Number(item.plant_count)-Number(item.lost_plant_count||0))/rate):Number(item.estimated_qty_kg||0);
    const available=Math.max(0,Math.round((estimated-booked_qty_kg)*100)/100);
    return {
      id:item.id,round_id:item.round_id,crop_id:item.crop_id,price_per_kg:item.price_per_kg,crops:item.crops,
      crop_id_snapshot:item.crop_id_snapshot,crop_name_snapshot:item.crop_name_snapshot,
      crop_image_snapshot:item.crop_image_snapshot,crop_slots_per_kg_snapshot:item.crop_slots_per_kg_snapshot,
      crop_growing_days_snapshot:item.crop_growing_days_snapshot,
      crop_name:item.crops?.name || item.crop_name_snapshot || 'ผัก',booked_qty_kg,
      plant_count:item.plant_count,lost_plant_count:item.lost_plant_count,planting_plants_per_kg:item.planting_plants_per_kg,
      estimated_qty_kg:item.planting_plants_per_kg!=null?item.estimated_qty_kg:null,
      max_qty_per_order_kg:limited ? item.max_qty_per_order_kg : null,
      order_limit_remaining:item.order_limit_remaining,
      available_qty_kg:available,is_sold_out:available<0.5,
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
          total_bookable_kg: items.reduce((n,i)=>n+Number(i.estimated_qty_kg||0),0),
          total_available_kg: items.reduce((n,i)=>n+i.available_qty_kg,0),
          is_all_sold_out: items.every(i=>i.is_sold_out),
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

    if (round.status==='draft'||(round.status === 'booking_open' && new Date(round.booking_opens_at) > new Date())) {
      res.status(404).json({ error: 'รอบการจองนี้ยังไม่เปิดให้ลูกค้าเข้าชม' });
      return;
    }

    const items = await enrichRoundItems(id, round.purchase_limit_enabled);

    res.json({
      ...round,
      items,
      total_bookable_kg: items.reduce((n,i)=>n+Number(i.estimated_qty_kg||0),0),
      total_available_kg: items.reduce((n,i)=>n+i.available_qty_kg,0),
      is_all_sold_out: items.every(i=>i.is_sold_out),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลรอบ' });
  }
});

export default router;
