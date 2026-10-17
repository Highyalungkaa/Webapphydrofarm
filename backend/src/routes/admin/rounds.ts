import { Router, Response } from 'express';
import { z } from 'zod';
import { getSupabaseClient, supabaseAdmin } from '../../config/supabase.js';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../../middlewares/auth.js';
import { recordAuditLog } from '../../services/audit.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const roundItemInputSchema = z.object({
  id: z.string().uuid().optional(),
  crop_id: z.string().uuid('รหัสชนิดผักไม่ถูกต้อง'),
  estimated_qty_kg: z.number().min(0, 'ประมาณการผลผลิตต้องไม่ต่ำกว่า 0'),
  bookable_qty_kg: z.number().min(0, 'จำนวนที่เปิดให้จองต้องไม่ต่ำกว่า 0'),
  price_per_kg: z.number().min(0, 'ราคาต่อกก. ต้องไม่ต่ำกว่า 0'),
  growing_days: z.number().int().min(1).optional().nullable(),
  max_qty_per_order_kg: z.number().min(0.5, 'เพดานต่อออเดอร์ต้องไม่ต่ำกว่า 0.5 กก.').optional().nullable(),
  plot_ids: z.array(z.string().uuid()).optional().nullable(),
});

const roundSchema = z.object({
  name: z.string().min(1, 'กรุณาระบุชื่อรอบการปลูก'),
  planted_at: z.string().optional(),
  growing_days: z.number().int().min(1, 'ระยะเวลาปลูกต้องมากกว่า 0 วัน').optional(),
  expected_harvest_date: z.string().optional(),
  booking_opens_at: z.string().optional(),
  fulfillment_date: z.string().optional(),
  pickup_start_time: z.string().optional(),
  pickup_end_time: z.string().optional(),
  delivery_start_time: z.string().optional(),
  delivery_end_time: z.string().optional(),
  status: z.enum(['draft', 'growing', 'booking_open', 'booking_closed', 'harvested', 'completed', 'cancelled']).default('draft'),
  current_step: z.number().int().min(1).max(7).optional(),
  seed_date: z.string().optional().nullable(),
  fertilizing_date: z.string().optional().nullable(),
  transplant_date: z.string().optional().nullable(),
  harvest_sale_date: z.string().optional().nullable(),
  sold_out_date: z.string().optional().nullable(),
  completed_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(roundItemInputSchema).optional(),
});

const stepUpdateSchema = z.object({
  step: z.number().int().min(1).max(7),
  date: z.string().min(10, 'กรุณาระบุวันที่'),
  growing_days: z.number().int().min(1).optional(),
  crop_growing_days: z.record(z.string(), z.number()).optional(),
});

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function extractCropGrowingDays(roundNotes: string | null | undefined): Record<string, number> {
  if (!roundNotes) return {};
  try {
    const parsed = JSON.parse(roundNotes);
    if (parsed && typeof parsed.cropGrowingDays === 'object') {
      return parsed.cropGrowingDays;
    }
  } catch {
    // plain text note
  }
  return {};
}

export function extractCropPlotIds(roundNotes: string | null | undefined): Record<string, string[]> {
  if (!roundNotes) return {};
  try {
    const parsed = JSON.parse(roundNotes);
    if (parsed && typeof parsed.cropPlotIds === 'object') {
      return parsed.cropPlotIds;
    }
  } catch {
    // plain text note
  }
  return {};
}

export function isRoundBookingCreated(round: any): boolean {
  if (round.status === 'booking_open' || round.status === 'booking_closed') {
    return true;
  }
  try {
    const parsed = JSON.parse(round.notes || '{}');
    if (parsed && parsed.bookingCreated) {
      return true;
    }
  } catch {}
  return false;
}

export function computeCurrentStep(round: any): number {
  if (round.status === 'completed' || round.completed_date) {
    return 7;
  }
  if (round.sold_out_date && Number(round.current_step) >= 6) {
    return 7;
  }
  if (round.harvest_sale_date && Number(round.current_step) >= 5) {
    return 6;
  }
  if (round.current_step) {
    return Number(round.current_step);
  }
  if (round.transplant_date || round.status === 'growing' || round.status === 'booking_open' || round.status === 'booking_closed') {
    return 4;
  }
  if (round.fertilizing_date) {
    return 3;
  }
  if (round.seed_date) {
    return 2;
  }
  return 1;
}

// GET /api/admin/rounds - List all rounds with summary counts
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const db = getSupabaseClient(req);
    const { status } = req.query;

    let query = db
      .from('planting_rounds')
      .select(`
        *,
        round_items (
          id,
          crop_id,
          estimated_qty_kg,
          bookable_qty_kg,
          actual_qty_kg,
          price_per_kg,
          max_qty_per_order_kg,
          crops (
            id,
            name,
            image_url,
            slots_per_kg,
            growing_days
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (status === 'active') {
      query = query.neq('status', 'completed');
    } else if (status === 'completed') {
      query = query.eq('status', 'completed');
    } else if (typeof status === 'string' && status) {
      query = query.eq('status', status);
    }

    const { data: rounds, error } = await query;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    // Enrich with booked totals
    const enriched = await Promise.all(
      (rounds || []).map(async (round: any) => {
        const itemIds = (round.round_items || []).map((i: any) => i.id);
        let bookedMap: Record<string, number> = {};

        if (itemIds.length > 0) {
          const { data: booked } = await db
            .from('order_items')
            .select('round_item_id, qty_kg, orders!inner(status)')
            .in('round_item_id', itemIds)
            .neq('orders.status', 'cancelled');

          if (booked) {
            for (const b of booked) {
              bookedMap[b.round_item_id] = (bookedMap[b.round_item_id] || 0) + Number(b.qty_kg);
            }
          }
        }

        const cropDaysMap = extractCropGrowingDays(round.notes);
        const itemsWithBooked = (round.round_items || []).map((item: any) => {
          const bookedKg = bookedMap[item.id] || 0;
          const itemDays = cropDaysMap[item.crop_id] || item.crops?.growing_days || round.growing_days || 45;
          return {
            ...item,
            crop_name: item.crops?.name,
            growing_days: itemDays,
            booked_qty_kg: bookedKg,
            available_qty_kg: Math.max(0, Number(item.bookable_qty_kg) - bookedKg),
          };
        });

        const totalEstimated = itemsWithBooked.reduce((s: number, i: any) => s + Number(i.estimated_qty_kg), 0);
        const totalBookable = itemsWithBooked.reduce((s: number, i: any) => s + Number(i.bookable_qty_kg), 0);
        const totalBooked = itemsWithBooked.reduce((s: number, i: any) => s + Number(i.booked_qty_kg), 0);

        return {
          ...round,
          current_step: computeCurrentStep(round),
          is_booking_created: isRoundBookingCreated(round),
          round_items: itemsWithBooked,
          total_estimated_kg: totalEstimated,
          total_bookable_kg: totalBookable,
          total_booked_kg: totalBooked,
          total_available_kg: Math.max(0, totalBookable - totalBooked),
        };
      })
    );

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงรอบการปลูก' });
  }
});

// GET /api/admin/rounds/:id - Get single round overview with items and orders
router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const db = getSupabaseClient(req);

    const { data: round, error } = await db
      .from('planting_rounds')
      .select(`
        *,
        round_items (
          id,
          crop_id,
          estimated_qty_kg,
          bookable_qty_kg,
          actual_qty_kg,
          price_per_kg,
          max_qty_per_order_kg,
          crops (
            id,
            name,
            image_url,
            slots_per_kg,
            growing_days,
            description
          )
        )
      `)
      .eq('id', id)
      .maybeSingle();

    if (error || !round) {
      res.status(404).json({ error: 'ไม่พบรอบการปลูกที่ระบุ' });
      return;
    }

    // Get orders for this round
    const { data: orders } = await db
      .from('orders')
      .select(`
        id,
        customer_id,
        status,
        fulfillment_method,
        contact_phone,
        total_amount,
        payment_status,
        created_at,
        profiles (
          id,
          full_name,
          email
        ),
        order_items (
          id,
          round_item_id,
          qty_kg,
          price_per_kg,
          round_items (
            crops (name)
          )
        )
      `)
      .eq('round_id', id)
      .order('created_at', { ascending: false });

    // Calculate booked qty per round item
    const bookedMap: Record<string, number> = {};
    for (const ord of orders || []) {
      if (ord.status !== 'cancelled') {
        for (const oi of ord.order_items || []) {
          bookedMap[oi.round_item_id] = (bookedMap[oi.round_item_id] || 0) + Number(oi.qty_kg);
        }
      }
    }

    // Fetch all plots to enrich round items with plot details
    const { data: allPlots } = await db
      .from('plots')
      .select('id, name, zone_name, slot_capacity, is_active, crop_id');
    const plotMap = new Map((allPlots || []).map((p: any) => [p.id, p]));

    const cropDaysMap = extractCropGrowingDays(round.notes);
    const cropPlotIdsMap = extractCropPlotIds(round.notes);
    const items = (round.round_items || []).map((it: any) => {
      const bookedKg = bookedMap[it.id] || 0;
      const itemDays = cropDaysMap[it.crop_id] || it.crops?.growing_days || round.growing_days || 45;
      const assignedPlotIds = cropPlotIdsMap[it.crop_id] || (Array.isArray(it.plot_ids) ? it.plot_ids : []);
      const assignedPlots = assignedPlotIds.map((pid: string) => plotMap.get(pid)).filter(Boolean);
      return {
        ...it,
        crop_name: it.crops?.name,
        growing_days: itemDays,
        booked_qty_kg: bookedKg,
        available_qty_kg: Math.max(0, Number(it.bookable_qty_kg) - bookedKg),
        plot_ids: assignedPlotIds,
        plots: assignedPlots,
      };
    });

    const totalEstimated = items.reduce((s: number, i: any) => s + Number(i.estimated_qty_kg), 0);
    const totalBookable = items.reduce((s: number, i: any) => s + Number(i.bookable_qty_kg), 0);
    const totalBooked = items.reduce((s: number, i: any) => s + Number(i.booked_qty_kg), 0);

    res.json({
      ...round,
      current_step: computeCurrentStep(round),
      is_booking_created: isRoundBookingCreated(round),
      round_items: items,
      total_estimated_kg: totalEstimated,
      total_bookable_kg: totalBookable,
      total_booked_kg: totalBooked,
      total_available_kg: Math.max(0, totalBookable - totalBooked),
      orders: orders || [],
    });
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลรอบ' });
  }
});

// POST /api/admin/rounds - Create new planting round (Step 1 creation)
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parsed = roundSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message || 'ข้อมูลไม่ถูกต้อง' });
      return;
    }

    const { items, ...inputRoundData } = parsed.data;
    const db = getSupabaseClient(req);

    if (items?.length) {
      const cropIds = [...new Set(items.map((item) => item.crop_id))];
      const { data: activeCropRows, error: cropError } = await db
        .from('crops')
        .select('id')
        .in('id', cropIds)
        .eq('is_active', true);
      if (cropError || (activeCropRows || []).length !== cropIds.length) {
        res.status(400).json({ error: 'มีชนิดผักที่ปิดใช้งานหรือไม่พบในระบบ กรุณาเลือกเฉพาะผักที่เปิดใช้งาน' });
        return;
      }
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const initialSeedDate = inputRoundData.seed_date || todayStr;
    const initialGrowingDays = inputRoundData.growing_days || 45;
    const initialHarvestDate = inputRoundData.expected_harvest_date || addDaysToDateStr(initialSeedDate, initialGrowingDays);

    const roundDataToInsert = {
      name: inputRoundData.name.trim(),
      current_step: 1,
      status: 'draft',
      seed_date: initialSeedDate,
      fertilizing_date: null,
      transplant_date: null,
      harvest_sale_date: null,
      sold_out_date: null,
      completed_date: null,
      planted_at: inputRoundData.planted_at || initialSeedDate,
      growing_days: initialGrowingDays,
      expected_harvest_date: initialHarvestDate,
      booking_opens_at: inputRoundData.booking_opens_at || new Date().toISOString(),
      booking_closes_at: null,
      fulfillment_date: inputRoundData.fulfillment_date || initialHarvestDate,
      pickup_start_time: inputRoundData.pickup_start_time || '09:00:00',
      pickup_end_time: inputRoundData.pickup_end_time || '17:00:00',
      delivery_start_time: inputRoundData.delivery_start_time || '13:00:00',
      delivery_end_time: inputRoundData.delivery_end_time || '16:30:00',
      notes: (() => {
        const cropGrowingDaysMap: Record<string, number> = {};
        const cropPlotIdsMap: Record<string, string[]> = {};
        if (items && items.length > 0) {
          for (const it of items) {
            if (it.growing_days) {
              cropGrowingDaysMap[it.crop_id] = it.growing_days;
            }
            if (it.plot_ids && it.plot_ids.length > 0) {
              cropPlotIdsMap[it.crop_id] = it.plot_ids;
            }
          }
        }
        if (Object.keys(cropGrowingDaysMap).length > 0 || Object.keys(cropPlotIdsMap).length > 0) {
          return JSON.stringify({
            note: inputRoundData.notes?.trim() || '',
            cropGrowingDays: cropGrowingDaysMap,
            cropPlotIds: cropPlotIdsMap,
          });
        }
        return inputRoundData.notes?.trim() || null;
      })(),
    };

    const { data: createdRound, error: roundError } = await db
      .from('planting_rounds')
      .insert(roundDataToInsert)
      .select()
      .single();

    if (roundError) {
      res.status(400).json({ error: 'ไม่สามารถสร้างรอบการปลูกได้: ' + roundError.message });
      return;
    }

    // Insert items
    let createdItems: any[] = [];
    if (items && items.length > 0) {
      const itemsToInsert = items.map((i) => ({
        round_id: createdRound.id,
        crop_id: i.crop_id,
        estimated_qty_kg: i.estimated_qty_kg || i.bookable_qty_kg,
        bookable_qty_kg: i.bookable_qty_kg,
        price_per_kg: i.price_per_kg,
        max_qty_per_order_kg: i.max_qty_per_order_kg || null,
      }));

      const { data: inserted, error: itemsError } = await db
        .from('round_items')
        .insert(itemsToInsert)
        .select();

      if (itemsError) {
        res.status(400).json({ error: 'สร้างรายการผักไม่สำเร็จ: ' + itemsError.message });
        return;
      }
      createdItems = inserted || [];
    }

    await recordAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      entityType: 'planting_rounds',
      entityId: createdRound.id,
      action: 'create',
      newData: { ...createdRound, items: createdItems },
    });

    res.status(201).json({
      ...createdRound,
      round_items: createdItems,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างรอบการปลูก' });
  }
});

// PATCH /api/admin/rounds/:id/step - Stepper Lifecycle Progression (6 Steps)
router.patch('/:id/step', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const parsed = stepUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message || 'ข้อมูลไม่ถูกต้อง' });
      return;
    }

    const { step, date, growing_days, crop_growing_days } = parsed.data;
    const db = getSupabaseClient(req);

    const { data: currentRound, error: fetchErr } = await db
      .from('planting_rounds')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !currentRound) {
      res.status(404).json({ error: 'ไม่พบรอบการปลูก' });
      return;
    }

    const currentStep = Number(currentRound.current_step || 1);
    if (step > currentStep && !(step === 7 && currentStep === 6)) {
      res.status(400).json({ error: 'กรุณายืนยันสถานะก่อนหน้าให้ครบก่อนจึงจะไปสถานะถัดไปได้' });
      return;
    }
    if (step === 4 && (
      currentRound.status !== 'booking_open'
      || !currentRound.booking_opens_at
      || new Date(currentRound.booking_opens_at).getTime() > Date.now()
      || !!currentRound.booking_closes_at
    )) {
      res.status(400).json({ error: 'กรุณาเปิดรับจองก่อน และรอจนถึงเวลาเปิดจริงก่อนยืนยันไปสถานะถัดไป' });
      return;
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (crop_growing_days && Object.keys(crop_growing_days).length > 0) {
      const existingMap = extractCropGrowingDays(currentRound.notes);
      const mergedMap = { ...existingMap, ...crop_growing_days };
      let userNote = '';
      try {
        const parsedNotes = JSON.parse(currentRound.notes);
        userNote = parsedNotes.note || '';
      } catch {
        userNote = currentRound.notes || '';
      }
      updatePayload.notes = JSON.stringify({
        note: userNote,
        cropGrowingDays: mergedMap,
      });
    }

    switch (step) {
      case 1: {
        // Step 1: วันที่ปักเม็ด ➔ ไปสถานะถัดไป (ใส่ปุ๋ย)
        updatePayload.seed_date = date;
        updatePayload.current_step = 2;
        updatePayload.status = 'draft';
        break;
      }
      case 2: {
        // Step 2: วันใส่ปุ๋ย ➔ ไปสถานะถัดไป (ปลูกจริง)
        updatePayload.fertilizing_date = date;
        updatePayload.current_step = 3;
        updatePayload.status = 'draft';
        break;
      }
      case 3: {
        // Step 3: วันปลูกจริง ➔ ระบบคำนวณวันเก็บเกี่ยวตามเวลาปลูกผัก ➔ ไปสถานะถัดไป (เปิดสั่งจองล่วงหน้า)
        let days = growing_days || currentRound.growing_days || 45;
        if (crop_growing_days && Object.keys(crop_growing_days).length > 0) {
          const maxDays = Math.max(...Object.values(crop_growing_days));
          if (maxDays > 0) days = maxDays;
        }
        const calculatedHarvest = addDaysToDateStr(date, days);

        updatePayload.transplant_date = date;
        updatePayload.planted_at = date;
        updatePayload.growing_days = days;
        updatePayload.expected_harvest_date = calculatedHarvest;
        updatePayload.fulfillment_date = calculatedHarvest;
        updatePayload.current_step = 4;
        updatePayload.status = 'growing';
        break;
      }
      case 4: {
        // The booking page owns the opening schedule; this confirmation advances after booking is live.
        updatePayload.current_step = 5;
        break;
      }
      case 5: {
        // Step 5: วันที่พร้อมเก็บและขาย ➔ ไปสถานะถัดไป (วันที่ขายหมด)
        updatePayload.harvest_sale_date = date;
        updatePayload.current_step = 6;
        break;
      }
      case 6: {
        // Step 6: วันที่ขายหมด ➔ ปิดรับจอง ➔ ไปสถานะถัดไป (สิ้นสุดรอบ)
        updatePayload.sold_out_date = date;
        updatePayload.booking_closes_at = new Date().toISOString();
        updatePayload.current_step = 6;
        updatePayload.status = 'booking_closed';
        break;
      }
      case 7: {
        // Step 7: สถานะสิ้นสุด ➔ ปิดรอบสมบูรณ์
        updatePayload.completed_date = date;
        updatePayload.current_step = 7;
        updatePayload.status = 'completed';
        break;
      }
      default:
        res.status(400).json({ error: 'หมายเลข Step ไม่ถูกต้อง' });
        return;
    }

    const { data: updatedRound, error: updateErr } = await db
      .from('planting_rounds')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      res.status(400).json({ error: 'ไม่สามารถอัปเดตสเต็ปได้: ' + updateErr.message });
      return;
    }

    await recordAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      entityType: 'planting_rounds',
      entityId: id,
      action: 'status_change',
      oldData: { current_step: currentRound.current_step, status: currentRound.status },
      newData: { current_step: updatedRound.current_step, status: updatedRound.status, step, date },
    });

    res.json({
      ...updatedRound,
      current_step: computeCurrentStep(updatedRound),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัปเดตสเต็ปการปลูก' });
  }
});

// PUT /api/admin/rounds/:id - Update round details and items
router.put('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const parsed = roundSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message || 'ข้อมูลไม่ถูกต้อง' });
      return;
    }

    const { items, ...roundData } = parsed.data;
    const db = getSupabaseClient(req);

    const { data: currentRound } = await db
      .from('planting_rounds')
      .select('*')
      .eq('id', id)
      .single();

    if (!currentRound) {
      res.status(404).json({ error: 'ไม่พบรอบการปลูกที่ระบุ' });
      return;
    }

    // Update notes with cropPlotIds if items are provided
    let finalNotes = roundData.notes;
    if (items && items.length > 0) {
      let notesJson: any = {};
      try {
        notesJson = JSON.parse(roundData.notes || currentRound.notes || '{}');
      } catch {
        notesJson = { note: roundData.notes || currentRound.notes || '' };
      }
      const cropPlotIdsMap: Record<string, string[]> = notesJson.cropPlotIds || {};
      for (const it of items) {
        if (it.plot_ids && it.plot_ids.length > 0) {
          cropPlotIdsMap[it.crop_id] = it.plot_ids;
        }
      }
      if (Object.keys(cropPlotIdsMap).length > 0) {
        notesJson.cropPlotIds = cropPlotIdsMap;
        finalNotes = JSON.stringify(notesJson);
      }
    }

    const { data: updatedRound, error: updateError } = await db
      .from('planting_rounds')
      .update({
        ...roundData,
        notes: finalNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      res.status(400).json({ error: updateError.message });
      return;
    }

    // Upsert items
    if (items) {
      for (const item of items) {
        if (item.id) {
          await db
            .from('round_items')
            .update({
              estimated_qty_kg: item.estimated_qty_kg,
              bookable_qty_kg: item.bookable_qty_kg,
              price_per_kg: item.price_per_kg,
              max_qty_per_order_kg: item.max_qty_per_order_kg || null,
            })
            .eq('id', item.id);
        } else {
          await db
            .from('round_items')
            .insert({
              round_id: id,
              crop_id: item.crop_id,
              estimated_qty_kg: item.estimated_qty_kg,
              bookable_qty_kg: item.bookable_qty_kg,
              price_per_kg: item.price_per_kg,
              max_qty_per_order_kg: item.max_qty_per_order_kg || null,
            });
        }
      }
    }

    await recordAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      entityType: 'planting_rounds',
      entityId: id,
      action: 'update',
      oldData: currentRound,
      newData: updatedRound,
    });

    res.json(updatedRound);
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการแก้ไขรอบการปลูก' });
  }
});

// PATCH /api/admin/rounds/:id/status - Update round status manually
router.patch('/:id/status', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { status } = req.body;
    const db = getSupabaseClient(req);

    const validStatuses = ['draft', 'growing', 'booking_open', 'booking_closed', 'harvested', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
      return;
    }

    const { data: oldRound } = await db.from('planting_rounds').select('*').eq('id', id).single();

    const { data, error } = await db
      .from('planting_rounds')
      .update({ status, updated_at: new Date().toISOString() })
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
      entityType: 'planting_rounds',
      entityId: id,
      action: 'status_change',
      oldData: { status: oldRound?.status },
      newData: { status },
    });

    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเปลี่ยนสถานะรอบ' });
  }
});

// DELETE /api/admin/rounds/:id - Delete round if no orders
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const db = getSupabaseClient(req);

    const { data: orders } = await db.from('orders').select('id').eq('round_id', id);
    if (orders && orders.length > 0) {
      res.status(400).json({ error: 'ไม่สามารถลบรอบการปลูกนี้ได้ เนื่องจากมีคำสั่งจองของลูกค้าแล้ว' });
      return;
    }

    const { data: oldRound } = await db.from('planting_rounds').select('*').eq('id', id).single();
    const { error } = await db.from('planting_rounds').delete().eq('id', id);

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    await recordAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      entityType: 'planting_rounds',
      entityId: id,
      action: 'delete',
      oldData: oldRound,
    });

    res.json({ message: 'ลบรอบการปลูกเรียบร้อยแล้ว' });
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบรอบการปลูก' });
  }
});

// POST /api/admin/rounds/:id/open-booking - Open pre-order booking window
router.post('/:id/open-booking', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const {
      booking_opens_at,
      fulfillment_date,
      pickup_start_time,
      pickup_end_time,
      delivery_start_time,
      delivery_end_time,
    } = req.body;

    const opensAt = new Date(booking_opens_at);
    if (!booking_opens_at || Number.isNaN(opensAt.getTime())) {
      res.status(400).json({ error: 'กรุณาระบุวัน-เวลาเปิดจองให้ถูกต้อง' });
      return;
    }

    const db = getSupabaseClient(req);
    const { data: currentRound } = await db.from('planting_rounds').select('*').eq('id', id).single();
    if (!currentRound) {
      res.status(404).json({ error: 'ไม่พบรอบการปลูกที่ระบุ' });
      return;
    }

    const updatePayload: Record<string, any> = {
      status: 'booking_open',
      current_step: currentRound.current_step || 4,
      booking_opens_at: opensAt.toISOString(),
      booking_closes_at: null,
      updated_at: new Date().toISOString(),
    };

    if (fulfillment_date) updatePayload.fulfillment_date = fulfillment_date;
    if (pickup_start_time) updatePayload.pickup_start_time = pickup_start_time;
    if (pickup_end_time) updatePayload.pickup_end_time = pickup_end_time;
    if (delivery_start_time) updatePayload.delivery_start_time = delivery_start_time;
    if (delivery_end_time) updatePayload.delivery_end_time = delivery_end_time;

    const { data: updatedRound, error: updateErr } = await db
      .from('planting_rounds')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      res.status(400).json({ error: 'เปิดรอบจองไม่สำเร็จ: ' + updateErr.message });
      return;
    }

    await recordAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      entityType: 'planting_rounds',
      entityId: id,
      action: 'status_change',
      oldData: { status: currentRound.status, booking_opens_at: currentRound.booking_opens_at },
      newData: { status: 'booking_open', booking_opens_at: updatePayload.booking_opens_at, booking_closes_at: null },
    });

    res.json(updatedRound);
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเปิดรอบจอง' });
  }
});

// POST /api/admin/rounds/:id/close-booking - Close pre-order booking window
router.post('/:id/close-booking', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const closeDate = new Date(req.body?.booking_closes_at);
    if (!req.body?.booking_closes_at || Number.isNaN(closeDate.getTime())) {
      res.status(400).json({ error: 'กรุณาระบุวัน-เวลาปิดจองให้ถูกต้อง' });
      return;
    }
    if (closeDate.getTime() > Date.now()) {
      res.status(400).json({ error: 'วัน-เวลาปิดจองต้องไม่เป็นเวลาในอนาคต' });
      return;
    }

    const db = getSupabaseClient(req);
    const { data: currentRound } = await db.from('planting_rounds').select('*').eq('id', id).single();
    if (!currentRound) {
      res.status(404).json({ error: 'ไม่พบรอบการปลูกที่ระบุ' });
      return;
    }
    if (currentRound.status !== 'booking_open') {
      res.status(400).json({ error: 'รอบนี้ไม่ได้อยู่ในสถานะเปิดรับจอง' });
      return;
    }

    const updatePayload = {
      status: 'booking_closed',
      booking_closes_at: closeDate.toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: updatedRound, error: updateErr } = await db
      .from('planting_rounds')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      res.status(400).json({ error: 'ปิดการจองไม่สำเร็จ: ' + updateErr.message });
      return;
    }

    await recordAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      entityType: 'planting_rounds',
      entityId: id,
      action: 'status_change',
      oldData: { status: currentRound.status },
      newData: { status: 'booking_closed', booking_closes_at: updatePayload.booking_closes_at },
    });

    res.json(updatedRound);
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการปิดรอบจอง' });
  }
});

// PUT /api/admin/rounds/:id/booking - Update booking settings (dates, slots, items) before or during booking
router.put('/:id/booking', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const {
      name,
      booking_opens_at,
      fulfillment_date,
      pickup_start_time,
      pickup_end_time,
      delivery_start_time,
      delivery_end_time,
      status,
      items,
    } = req.body;

    const db = getSupabaseClient(req);
    const { data: currentRound } = await db.from('planting_rounds').select('*').eq('id', id).single();
    if (!currentRound) {
      res.status(404).json({ error: 'ไม่พบรอบการปลูกที่ระบุ' });
      return;
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updatePayload.name = name;
    if (booking_opens_at !== undefined) {
      const opensAt = new Date(booking_opens_at);
      if (!booking_opens_at || Number.isNaN(opensAt.getTime())) {
        res.status(400).json({ error: 'กรุณาระบุวัน-เวลาเปิดจองให้ถูกต้อง' });
        return;
      }
      updatePayload.booking_opens_at = opensAt.toISOString();
    }
    if (fulfillment_date !== undefined) updatePayload.fulfillment_date = fulfillment_date;
    if (pickup_start_time !== undefined) updatePayload.pickup_start_time = pickup_start_time;
    if (pickup_end_time !== undefined) updatePayload.pickup_end_time = pickup_end_time;
    if (delivery_start_time !== undefined) updatePayload.delivery_start_time = delivery_start_time;
    if (delivery_end_time !== undefined) updatePayload.delivery_end_time = delivery_end_time;

    let notesObj: any = {};
    try {
      notesObj = JSON.parse(currentRound.notes || '{}');
    } catch {
      notesObj = { note: currentRound.notes || '' };
    }
    notesObj.bookingCreated = true;
    updatePayload.notes = JSON.stringify(notesObj);

    if (status) {
      updatePayload.status = status;
      if (status === 'booking_open') {
        updatePayload.current_step = 4;
      }
    }

    const effectiveStatus = updatePayload.status || currentRound.status;
    if (effectiveStatus === 'booking_open') updatePayload.booking_closes_at = null;

    const { data: updatedRound, error: updateErr } = await db
      .from('planting_rounds')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      res.status(400).json({ error: 'บันทึกข้อมูลไม่สำเร็จ: ' + updateErr.message });
      return;
    }

    // Update items if provided (bookable_qty_kg, price_per_kg)
    if (Array.isArray(items)) {
      for (const item of items) {
        if (item.id) {
          const itemUpdate: Record<string, any> = {};
          if (item.bookable_qty_kg !== undefined) itemUpdate.bookable_qty_kg = Number(item.bookable_qty_kg);
          if (item.price_per_kg !== undefined) itemUpdate.price_per_kg = Number(item.price_per_kg);
          if (item.estimated_qty_kg !== undefined) itemUpdate.estimated_qty_kg = Number(item.estimated_qty_kg);

          if (Object.keys(itemUpdate).length > 0) {
            await db.from('round_items').update(itemUpdate).eq('id', item.id);
          }
        }
      }
    }

    await recordAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      entityType: 'planting_rounds',
      entityId: id,
      action: 'update',
      oldData: currentRound,
      newData: { ...updatedRound, items },
    });

    res.json(updatedRound);
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูลรอบจอง' });
  }
});

export default router;
