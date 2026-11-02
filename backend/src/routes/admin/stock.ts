import {roundOrderFilter} from '../../services/roundOrders.js';
import {Router,Response} from 'express';
import {z} from 'zod';
import {supabaseAdmin} from '../../config/supabase.js';
import {requireAuth,requireAdmin,AuthenticatedRequest} from '../../middlewares/auth.js';
const router=Router();router.use(requireAuth,requireAdmin);
router.get('/:id/stock',async(req:AuthenticatedRequest,res:Response)=>{
 if(!z.string().uuid().safeParse(req.params.id).success){res.status(400).json({error:'รหัสรอบไม่ถูกต้อง'});return;}
 try{
  const orderFilter=await roundOrderFilter(supabaseAdmin,req.params.id as string);
  const[round,items,orders,history]=await Promise.all([
   supabaseAdmin.from('planting_rounds').select('*').eq('id',req.params.id).maybeSingle(),
   supabaseAdmin.from('round_items').select('*,crops(name,slots_per_kg)').eq('round_id',req.params.id),
   supabaseAdmin.from('orders').select('status,order_items(*)').or(orderFilter),
   supabaseAdmin.from('round_stock_additions').select('*').eq('round_id',req.params.id).order('created_at',{ascending:false}).limit(30),
  ]);
  const error=round.error||items.error||orders.error||history.error;
  if(error){res.status(503).json({error:'ไม่สามารถโหลดข้อมูลเพิ่มผลผลิตได้ กรุณาตรวจสอบว่ารัน migration 057 แล้ว และลองใหม่'});return;}
  if(!round.data){res.status(404).json({error:'ไม่พบรอบปลูก'});return;}
  res.json({round:round.data,additions:history.data||[],items:(items.data||[]).map(item=>{let ordered=0,reserved=0,weighed=0,sub=0,delivered=0;
   for(const order of orders.data||[])for(const row of order.order_items||[])if(row.round_item_id===item.id){
    if(order.status!=='cancelled')reserved+=Number(row.qty_kg);
    if(!['cancelled','no_show'].includes(order.status)){ordered+=Number(row.qty_kg);const own=Number(row.own_qty_kg||0),replacement=row.fulfillment_source==='substitute'?Number(row.fulfilled_qty_kg||0):0;weighed+=own;sub+=replacement;if(order.status==='completed')delivered+=own+replacement;}
   }
   const rate=Number(item.planting_plants_per_kg??item.crops?.slots_per_kg);
   const forecast=rate>0&&item.plant_count!=null?Math.floor(Math.max(0,Number(item.plant_count)-Number(item.lost_plant_count||0))/rate):Number(item.estimated_qty_kg||0);
   const additional=Number(item.additional_qty_kg||0),unavailable=Number(item.unavailable_qty_kg||0);
   return{id:item.id,crop_name:item.crops?.name||item.crop_name_snapshot||'ผัก',price_per_kg:Number(item.price_per_kg),plant_count:item.plant_count,estimated_qty_kg:forecast,additional_qty_kg:additional,unavailable_qty_kg:unavailable,ordered_qty_kg:ordered,weighed_own_qty_kg:weighed,substitute_qty_kg:sub,delivered_qty_kg:delivered,available_qty_kg:Math.max(0,Math.round((Math.max(0,forecast+additional-unavailable)-reserved)*100)/100)};
  })});
 }catch{res.status(500).json({error:'ไม่สามารถโหลดน้ำหนักชั่งจริงได้'});}
});
const addStockSchema=z.object({
 request_id:z.string().uuid(),round_item_id:z.string().uuid(),
 previous_additional_kg:z.number().min(0).max(99999999.99),
 added_qty_kg:z.number().positive().max(99999999).refine(value=>Math.abs(value*100-Math.round(value*100))<0.000001,'ทศนิยมต้องไม่เกิน 2 ตำแหน่ง'),
 note:z.string().trim().min(1).max(1000),reopen:z.boolean().default(false),
});
router.post('/:id/stock',async(req:AuthenticatedRequest,res:Response)=>{
 const parsed=addStockSchema.safeParse(req.body);
 if(!z.string().uuid().safeParse(req.params.id).success||!parsed.success){res.status(400).json({error:!parsed.success?parsed.error.errors[0].message:'รหัสรอบไม่ถูกต้อง'});return;}
 const body=parsed.data;
 try{
  const {data,error}=await supabaseAdmin.rpc('add_round_weighed_stock',{
   p_actor_id:req.user!.id,p_round_id:req.params.id,p_item_id:body.round_item_id,p_request_id:body.request_id,
   p_previous_additional_kg:body.previous_additional_kg,p_added_qty_kg:body.added_qty_kg,p_note:body.note,p_reopen:body.reopen,
  });
  if(error){
   const missing=['PGRST202','42883','42P01','42703','42501'].includes(error.code);
   res.status(missing?503:/ข้อมูลล่าสุด|ผู้ใช้อื่น/.test(error.message)?409:400).json({error:missing?'กรุณารัน migration 057 ก่อนเพิ่มผลผลิตสำหรับขาย':error.message});return;
  }
  res.status(201).json({addition:data});
 }catch{res.status(500).json({error:'เพิ่มผลผลิตไม่สำเร็จ กรุณาลองบันทึกอีกครั้ง'});}
});
export default router;
