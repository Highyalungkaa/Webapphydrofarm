import {roundOrderFilter,scopeRoundOrders} from '../../services/roundOrders.js';
import {getPlotPlantingAllocations} from '../../services/plotPlantingAllocations.js';
import {allocateRecordedPlotSlots} from '../../services/plantAllocation.js';
import { getPlotCropIds } from '../../services/plotCrops.js';
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
  plant_count: z.number().int().min(1, 'จำนวนต้นต้องเป็นจำนวนเต็มมากกว่า 0').optional().nullable(),
  estimated_qty_kg: z.number().min(0).optional(),
  bookable_qty_kg: z.number().min(0).optional(),
  price_per_kg: z.number().min(0, 'ราคาต่อกก. ต้องไม่ต่ำกว่า 0'),
  growing_days: z.number().int().min(1).optional().nullable(),
  max_qty_per_order_kg: z.number().min(0.5, 'เพดานต่อออเดอร์ต้องไม่ต่ำกว่า 0.5 กก.').optional().nullable(),
  plot_ids: z.array(z.string().uuid()).optional().nullable(),
});

const roundSchema = z.object({
  name: z.string().trim().min(1, 'กรุณาระบุชื่อรอบการปลูก'),
  planted_at: z.string().optional(),
  growing_days: z.number().int().min(1, 'ระยะเวลาปลูกต้องมากกว่า 0 วัน').optional(),
  expected_harvest_date: z.string().optional(),
  booking_opens_at: z.string().optional(),
  fulfillment_date: z.string().optional(),
  delivery_start_time: z.string().optional(),
  delivery_end_time: z.string().optional(),
  status: z.enum(['draft', 'growing', 'booking_open', 'booking_closed', 'harvested', 'completed', 'cancelled']).default('draft'),
  current_step: z.number().int().min(1).max(8).optional(),
  seed_date: z.string().optional().nullable(),
  fertilizing_date: z.string().optional().nullable(),
  planting_start_date: z.string().optional().nullable(),
  transplant_date: z.string().optional().nullable(),
  harvest_sale_date: z.string().optional().nullable(),
  sold_out_date: z.string().optional().nullable(),
  completed_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(roundItemInputSchema).optional(),
  request_id: z.string().uuid().optional(),
});

// The solver uses a single database snapshot. The save RPC locks all allocation
// writers and compares its token again before writing anything.
async function readAllocationState() {
  const {data,error}=await supabaseAdmin.rpc('read_planting_allocation_state');
  if(error||!data)throw Object.assign(new Error('ไม่สามารถตรวจสอบพื้นที่แปลงล่าสุดได้ กรุณาลองใหม่'),{status:500});
  return data;
}

function planRoundAllocation(state:any,items:any[],currentRound?:any) {
  const fail=(message:string):never=>{throw Object.assign(new Error(message),{status:400});};
  const plots:any[]=state.plots||[];
  const existing=getPlotPlantingAllocations(plots,(state.rounds||[]).filter((r:any)=>r.id!==currentRound?.id));
  if(existing.unassignedItems.length)fail('มีรอบเดิมที่ยังจัดพื้นที่แปลงไม่ครบ กรุณาตรวจสอบแปลงของรอบเดิมก่อน');
  for(const round of state.rounds||[]){
    if(round.id===currentRound?.id||['completed','cancelled'].includes(round.status)||round.completed_date||Number(round.current_step)>=8||(round.sold_out_date&&Number(round.current_step)>=7))continue;
    for(const item of round.round_items||[]){
      const needed=item.plant_count??Math.round(Math.max(Number(item.estimated_qty_kg||0),Number(item.bookable_qty_kg||0))*Number(item.crops?.slots_per_kg||4));
      const assigned=existing.allocations.filter(a=>a.round_id===round.id&&a.crop_id===item.crop_id).reduce((sum,a)=>sum+a.plant_count,0);
      if(assigned<needed)fail('มีรอบเดิมที่ยังจัดพื้นที่แปลงไม่ครบ กรุณาตรวจสอบแปลงของรอบเดิมก่อน');
    }
  }
  const occupied:Record<string,number>={};
  for(const allocation of existing.allocations)occupied[allocation.plot_id]=(occupied[allocation.plot_id]||0)+allocation.plant_count;
  let metadata:any={};
  try{metadata=JSON.parse(currentRound?.notes||'{}');}catch{}
  if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))metadata={};
  const oldItems:any[]=currentRound?.round_items||[];
  const fullItems=items.map(item=>{
    const old=oldItems.find(i=>i.id===item.id);
    if(item.id&&!old)fail('ไม่พบรายการผักที่ต้องการแก้ไขในรอบนี้');
    if(!old&&!item.plot_ids?.length)fail('กรุณาเลือกแปลงปลูกให้แต่ละชนิดผัก');
    if(old&&old.crop_id!==item.crop_id)fail('ไม่สามารถเปลี่ยนชนิดผักของรายการเดิมได้');
    const selected=item.plot_ids?.length?item.plot_ids:(metadata.cropPlotIds?.[item.crop_id]?.length?metadata.cropPlotIds[item.crop_id]:(old?.plot_ids?.length?old.plot_ids:plots.filter(p=>getPlotCropIds(p).includes(item.crop_id)).map(p=>p.id)));
    const oldSelected=metadata.cropPlotIds?.[item.crop_id]?.length?metadata.cropPlotIds[item.crop_id]:(old?.plot_ids?.length?old.plot_ids:plots.filter(p=>getPlotCropIds(p).includes(item.crop_id)).map(p=>p.id));
    const unchanged=old&&item.plant_count===old.plant_count&&[...selected].sort().join() === [...oldSelected].sort().join();
    const crop=(state.crops||[]).find((c:any)=>c.id===item.crop_id);
    if(!crop||(!crop.is_active&&!unchanged))fail('มีชนิดผักที่ปิดใช้งานหรือไม่พบในระบบ กรุณาเลือกผักที่เปิดใช้งาน');
    if(item.plant_count==null&&!old)fail('กรุณาระบุจำนวนต้นที่ปลูกให้ครบทุกชนิดผัก');
    if(!selected.length||new Set(selected).size!==selected.length)fail('กรุณาเลือกแปลงปลูกให้แต่ละชนิดผัก และไม่เลือกแปลงซ้ำในรายการเดียวกัน');
    if(!selected.every((id:string)=>plots.some(p=>p.id===id&&(unchanged||p.is_active&&getPlotCropIds(p).includes(item.crop_id)))))fail('เลือกได้เฉพาะแปลงที่เปิดใช้งานและกำหนดไว้สำหรับผักชนิดนั้น');
    return {...item,plot_ids:selected,selected_plot_ids:selected,plant_count:item.plant_count??old?.plant_count??Math.round(Math.max(Number(old?.estimated_qty_kg||0),Number(old?.bookable_qty_kg||0))*Number(crop.slots_per_kg||4))};
  });
  if(new Set(fullItems.map(i=>i.crop_id)).size!==fullItems.length)fail('ชนิดผักในรอบปลูกต้องไม่ซ้ำกัน');
  const selectedPlots=plots.filter(p=>fullItems.some(i=>i.plot_ids.includes(p.id)));
  const plan=allocateRecordedPlotSlots(selectedPlots,fullItems,{},occupied,metadata.cropPlotAllocations||{});
  if(plan.unallocatedByItem.some(n=>n>0))fail('พื้นที่แปลงที่เลือกไม่เพียงพอสำหรับผักทุกชนิด กรุณาปรับจำนวนต้นหรือเลือกแปลงเพิ่ม');
  return {items:fullItems,allocations:Object.fromEntries(fullItems.map((item,index)=>[item.crop_id,plan.allocatedByItem[index]]))};
}

function allocationErrorStatus(error:any) {
  return ['40001','40P01','55P03'].includes(error?.code)?409:400;
}

const stepUpdateSchema = z.object({
  step: z.number().int().min(1).max(8),
  date: z.string().min(10, 'กรุณาระบุวันที่'),
  growing_days: z.number().int().min(1).optional(),
  crop_growing_days: z.record(z.string(), z.number()).optional(),
});

async function checkLossBaselines(db: any, roundId: string, items: any[] | undefined): Promise<string | null> {
  const updates = (items || []).filter(item => item.id);
  if (!updates.length) return null;
  const { data, error } = await db.from('round_items').select('*').eq('round_id', roundId).in('id', updates.map(item => item.id));
  if (error) return 'ไม่สามารถตรวจสอบประวัติรายการผักได้: ' + error.message;
  for (const input of updates) {
    const original = (data || []).find((item: any) => item.id === input.id);
    if (!original) return 'ไม่พบรายการผักที่ต้องการแก้ไขในรอบนี้';
    if (original.loss_baseline_plant_count != null && (
      (input.plant_count != null && Number(input.plant_count) !== Number(original.plant_count))
      || (input.estimated_qty_kg !== undefined && Number(input.estimated_qty_kg) !== Number(original.estimated_qty_kg))
      || (input.crop_id !== undefined && input.crop_id !== original.crop_id)
    )) return 'รายการที่มีประวัติสูญเสียแล้วไม่สามารถเปลี่ยนจำนวนปลูกเริ่มต้นหรือประมาณการเดิมได้';
  }
  return null;
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function closesBeforeBookingOpens(opensAt: string | null | undefined, closesAt: string | null | undefined): boolean {
  if (!opensAt || !closesAt) return false;
  const opening = new Date(opensAt).getTime();
  const closing = new Date(closesAt).getTime();
  return Number.isFinite(opening) && Number.isFinite(closing) && closing <= opening;
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
    return 8;
  }
  if (round.sold_out_date && Number(round.current_step) >= 7) {
    return 8;
  }
  if (round.harvest_sale_date && Number(round.current_step) >= 6) {
    return 7;
  }
  if (round.current_step) {
    return Number(round.current_step);
  }
  if (round.transplant_date || round.status === 'growing' || round.status === 'booking_open' || round.status === 'booking_closed') {
    return 5;
  }
  if (round.planting_start_date) {
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
          *,
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
            .select('round_item_id, qty_kg, own_qty_kg, fulfillment_source, fulfilled_qty_kg, orders!inner(status)')
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
            effective_bookable_qty_kg: null,
            available_qty_kg: null,
          };
        });

        const totalBooked = itemsWithBooked.reduce((s: number, i: any) => s + Number(i.booked_qty_kg), 0);

        return {
          ...round,
          current_step: computeCurrentStep(round),
          is_booking_created: isRoundBookingCreated(round),
          round_items: itemsWithBooked,
          total_estimated_kg: null,
          total_bookable_kg: null,
          total_booked_kg: totalBooked,
          total_available_kg: null,
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
          *,
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
    const { data: sourceOrders,error:ordersError } = await db
      .from('orders')
      .select(`
        *,
        profiles (
          id,
          full_name,
          email
        ),
        order_items (
          id,
          round_item_id,
          qty_kg,
          own_qty_kg,
          fulfilled_qty_kg,
          fulfillment_source,
          price_per_kg,
          discount_amount,
          round_items (
            crops (name)
          )
        )
      `)
      .or(await roundOrderFilter(db,id))
      .order('created_at', { ascending: false });

    if(ordersError)throw ordersError;
    const orders=scopeRoundOrders(sourceOrders||[],(round.round_items||[]).map((i:any)=>i.id));

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
            effective_bookable_qty_kg: null,
            available_qty_kg: null,
        plot_ids: assignedPlotIds,
        plots: assignedPlots,
      };
    });

    const totalBooked = items.reduce((s: number, i: any) => s + Number(i.booked_qty_kg), 0);

    res.json({
      ...round,
      current_step: computeCurrentStep(round),
      is_booking_created: isRoundBookingCreated(round),
      round_items: items,
      total_estimated_kg: null,
      total_bookable_kg: null,
      total_booked_kg: totalBooked,
          total_available_kg: null,
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

    const { items, request_id, ...inputRoundData } = parsed.data;
    if(request_id){
      const {data:existing,error}=await supabaseAdmin.rpc('find_planting_round_request',{p_actor_id:req.user!.id,p_request_id:request_id,p_payload:parsed.data});
      if(error){res.status(400).json({error:error.message});return;}
      if(existing){res.status(201).json(existing);return;}
    }
    const state = await readAllocationState();
    if (items?.some(item => item.growing_days == null)) {
      res.status(400).json({error:'กรุณาระบุวันปลูกให้ครบทุกชนิดผัก'}); return;
    }
    const plantingPlan = planRoundAllocation(state, items || []);
    const cropPlotAllocations = plantingPlan.allocations;
    const todayStr = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const initialSeedDate = inputRoundData.seed_date || todayStr;
    const initialGrowingDays = inputRoundData.growing_days || 45;
    const initialHarvestDate = inputRoundData.expected_harvest_date || addDaysToDateStr(initialSeedDate, initialGrowingDays);

    const roundDataToInsert = {
      name: inputRoundData.name.trim(),
      current_step: 1,
      status: 'draft',
      seed_date: initialSeedDate,
      fertilizing_date: null,
      planting_start_date: null,
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
            cropPlotAllocations,
          });
        }
        return inputRoundData.notes?.trim() || null;
      })(),
    };

    const {data: createdRound,error} = await supabaseAdmin.rpc('save_planting_round', {
      p_actor_id:req.user!.id,p_round_id:null,p_round:roundDataToInsert,
      p_items:plantingPlan.items.map(item=>({...item,id:undefined,estimated_qty_kg:0,bookable_qty_kg:0})),
      p_state_token:state.token,p_request_id:request_id||null,p_request_payload:parsed.data,
    });
    if(error){res.status(allocationErrorStatus(error)).json({error:error.message});return;}
    res.status(201).json(createdRound);
  } catch (err: any) {
    res.status(err.status||500).json({ error: err.status?err.message:'เกิดข้อผิดพลาดในการสร้างรอบการปลูก' });
  }
});
router.post('/:id/rollback-step', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const parsed=z.object({expected_updated_at:z.string().datetime({offset:true})}).safeParse(req.body);
  if(!z.string().uuid().safeParse(req.params.id).success || !parsed.success){
    res.status(400).json({error:'ข้อมูลรอบปลูกไม่ถูกต้อง กรุณาโหลดหน้าใหม่'});return;
  }
  try{
    const {data,error}=await supabaseAdmin.rpc('rollback_planting_step',{
      p_actor_id:req.user!.id,p_round_id:req.params.id,p_expected_updated_at:parsed.data.expected_updated_at,
    });
    if(error){const missing=['42883','PGRST202','42703'].includes(error.code);
      res.status(missing?503:409).json({error:missing?'กรุณารัน migration 053 ก่อนใช้การย้อนสถานะรอบปลูก':error.message});return;}
    res.json(data);
  }catch{res.status(500).json({error:'ย้อนสถานะไม่สำเร็จ กรุณาโหลดหน้าใหม่แล้วตรวจสอบสถานะล่าสุด'});}
});

// PATCH /api/admin/rounds/:id/step - Stepper Lifecycle Progression (8 Steps)
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
    if (step > currentStep && !(step === 8 && currentStep === 7)) {
      res.status(400).json({ error: 'กรุณายืนยันสถานะก่อนหน้าให้ครบก่อนจึงจะไปสถานะถัดไปได้' });
      return;
    }
    if (step === 5 && (
      !['booking_open', 'booking_closed'].includes(currentRound.status)
      || !currentRound.booking_opens_at
    )) {
      res.status(400).json({ error: 'กรุณาเปิดรอบจองก่อนยืนยันไปสถานะถัดไป' });
      return;
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (crop_growing_days && Object.keys(crop_growing_days).length > 0) {
      const existingMap = extractCropGrowingDays(currentRound.notes);
      const mergedMap = { ...existingMap, ...crop_growing_days };
      let userNote = '';
      let preservedNotes: Record<string, any> = {};
      try {
        const parsedNotes = JSON.parse(currentRound.notes);
        if (parsedNotes && typeof parsedNotes === 'object' && !Array.isArray(parsedNotes)) preservedNotes = parsedNotes;
        userNote = parsedNotes.note || '';
      } catch {
        userNote = currentRound.notes || '';
      }
      updatePayload.notes = JSON.stringify({
        ...preservedNotes,
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
        // Step 2: วันใส่ปุ๋ย ➔ ไปสถานะถัดไป (เริ่มปลูก)
        updatePayload.fertilizing_date = date;
        updatePayload.current_step = 3;
        updatePayload.status = 'draft';
        break;
      }
      case 3: {
        updatePayload.planting_start_date = date;
        updatePayload.current_step = 4;
        updatePayload.status = 'draft';
        break;
      }
      case 4: {
        // Step 4: วันปลูกจริง ➔ ระบบคำนวณวันเก็บเกี่ยวตามเวลาปลูกผัก ➔ ไปสถานะถัดไป (เปิดสั่งจองล่วงหน้า)
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
        updatePayload.current_step = currentRound.sold_out_date ? 7 : Math.max(5, Number(currentRound.current_step || 5));
        if (currentRound.sold_out_date) updatePayload.sold_out_date = null;
        updatePayload.status = 'growing';
        break;
      }
      case 5: {
        // The booking page owns the opening schedule; this confirmation advances after booking is live.
        updatePayload.current_step = 6;
        break;
      }
      case 6: {
        // Step 6: วันที่พร้อมเก็บและขาย ➔ ไปสถานะถัดไป (วันที่ขายหมด)
        updatePayload.harvest_sale_date = date;
        updatePayload.current_step = 7;
        break;
      }
      case 7: {
        // Step 7: วันที่ขายหมด ➔ ปิดรับจอง ➔ ไปสถานะถัดไป (สิ้นสุดรอบ)
        updatePayload.sold_out_date = date;
        const closedAt = new Date().toISOString();
        updatePayload.booking_closes_at = closesBeforeBookingOpens(currentRound.booking_opens_at, closedAt) ? null : closedAt;
        updatePayload.current_step = 7;
        updatePayload.status = 'booking_closed';
        break;
      }
      case 8: {
        // Step 8: สถานะสิ้นสุด ➔ ปิดรอบสมบูรณ์
        // Older closed rounds may have a close time before their scheduled opening.
        // The database only permits that combination while status is booking_closed.
        if (closesBeforeBookingOpens(currentRound.booking_opens_at, currentRound.booking_closes_at)) {
          updatePayload.booking_closes_at = null;
        }
        updatePayload.completed_date = date;
        updatePayload.current_step = 8;
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
    const id=req.params.id as string;
    const parsed=roundSchema.omit({request_id:true}).partial().safeParse(req.body);
    if(!parsed.success){res.status(400).json({error:parsed.error.errors[0]?.message||'ข้อมูลไม่ถูกต้อง'});return;}
    const {items,...roundData}=parsed.data;
    const state=await readAllocationState();
    const currentRound=state.rounds.find((r:any)=>r.id===id);
    if(!currentRound){res.status(404).json({error:'ไม่พบรอบการปลูกที่ระบุ'});return;}
    if(['completed','cancelled'].includes(currentRound.status)){res.status(400).json({error:'รอบนี้สิ้นสุดแล้ว ไม่สามารถเปลี่ยนรายการปลูกได้'});return;}
    const mergedItems:any[]=(currentRound.round_items||[]).map((old:any)=>({...old,...items?.find(item=>item.id===old.id)}));
    for(const item of items||[]){
      if(item.id&&!currentRound.round_items.some((old:any)=>old.id===item.id)){res.status(400).json({error:'ไม่พบรายการผักที่ต้องการแก้ไขในรอบนี้'});return;}
      if(!item.id)mergedItems.push(item);
    }
    const plantingPlan=planRoundAllocation(state,mergedItems,currentRound);
    let metadata:any={};
    try{metadata=JSON.parse(currentRound.notes||'{}');}catch{metadata={note:currentRound.notes||''};}
    if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))metadata={note:currentRound.notes||''};
    if(roundData.notes!==undefined){
      try{const supplied=JSON.parse(roundData.notes||'{}');metadata.note=supplied&&typeof supplied==='object'?supplied.note||'':roundData.notes||'';}
      catch{metadata.note=roundData.notes||'';}
    }
    metadata.cropPlotIds=Object.fromEntries(plantingPlan.items.map(item=>[item.crop_id,item.plot_ids]));
    metadata.cropPlotAllocations=plantingPlan.allocations;
    metadata.cropGrowingDays={...metadata.cropGrowingDays,...Object.fromEntries((items||[]).filter(i=>i.growing_days!=null).map(i=>[i.crop_id,i.growing_days]))};
    const {data,error}=await supabaseAdmin.rpc('save_planting_round',{
      p_actor_id:req.user!.id,p_round_id:id,p_round:{...roundData,notes:JSON.stringify(metadata)},
      p_items:plantingPlan.items.map(item=>({...item,plant_count:currentRound.round_items.find((old:any)=>old.id===item.id)?.plant_count==null&&!(items||[]).some(i=>i.id===item.id&&i.plant_count!=null)?null:item.plant_count})),
      p_state_token:state.token,
    });
    if(error){res.status(allocationErrorStatus(error)).json({error:error.message});return;}
    res.json(data);
  }catch(err:any){res.status(err.status||500).json({error:err.status?err.message:'เกิดข้อผิดพลาดในการแก้ไขรอบการปลูก'});}
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

    const { data: orders, error: ordersError } = await db.from('orders').select('id').or(await roundOrderFilter(db,id));
    if (ordersError) { res.status(500).json({ error: 'ตรวจสอบคำสั่งจองไม่สำเร็จ กรุณาลองใหม่' }); return; }
    if (orders && orders.length > 0) {
      res.status(400).json({ error: 'ไม่สามารถลบรอบการปลูกนี้ได้ เนื่องจากมีคำสั่งจองของลูกค้าแล้ว' });
      return;
    }

    const { data: oldRound } = await db.from('planting_rounds').select('*').eq('id', id).single();
    const { error } = await db.from('planting_rounds').delete().eq('id', id);

    if (error) {
      res.status(error.code === '23503' ? 409 : 400).json({ error: error.code === '23503'
        ? 'รอบนี้มีประวัติการใช้งาน เช่น บันทึกผักเสียหายหรือคำสั่งจอง จึงลบถาวรไม่ได้ กรุณาจัดการรอบให้เสร็จและดูย้อนหลังในหน้าประวัติ โดยไม่ต้องลบประวัติเดิม'
        : 'ลบรอบปลูกไม่สำเร็จ กรุณาโหลดรายการใหม่แล้วลองอีกครั้ง' });
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
      current_step: currentRound.current_step || 5,
      booking_opens_at: opensAt.toISOString(),
      booking_closes_at: null,
      updated_at: new Date().toISOString(),
    };

    if (fulfillment_date) updatePayload.fulfillment_date = fulfillment_date;
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

    if (['completed','cancelled'].includes(currentRound.status)) {res.status(400).json({error:'รอบนี้สิ้นสุดแล้ว ไม่สามารถเปิดรับจองหรือแก้รอบจองได้'});return;}
    const baselineError = await checkLossBaselines(db, id, Array.isArray(items) ? items : undefined);
    if (baselineError) { res.status(400).json({ error: baselineError }); return; }
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
        updatePayload.current_step = 5;
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
          if (item.price_per_kg !== undefined) itemUpdate.price_per_kg = Number(item.price_per_kg);

          if (Object.keys(itemUpdate).length > 0) {
            const { error: itemError } = await db.from('round_items').update(itemUpdate).eq('id', item.id).eq('round_id', id);
            if (itemError) { res.status(400).json({ error: itemError.message }); return; }
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
