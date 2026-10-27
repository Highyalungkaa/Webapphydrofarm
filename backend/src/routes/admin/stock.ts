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
  const[round,items,orders]=await Promise.all([supabaseAdmin.from('planting_rounds').select('*').eq('id',req.params.id).maybeSingle(),supabaseAdmin.from('round_items').select('*,crops(name)').eq('round_id',req.params.id),supabaseAdmin.from('orders').select('status,order_items(*)').or(orderFilter)]);
  const error=round.error||items.error||orders.error;if(error){res.status(400).json({error:error.message});return;}if(!round.data){res.status(404).json({error:'ไม่พบรอบปลูก'});return;}
  res.json({round:round.data,items:(items.data||[]).map(item=>{let ordered=0,weighed=0,sub=0,delivered=0;
   for(const order of orders.data||[])if(!['cancelled','no_show'].includes(order.status))for(const row of order.order_items||[])if(row.round_item_id===item.id){ordered+=Number(row.qty_kg);const own=Number(row.own_qty_kg||0),replacement=row.fulfillment_source==='substitute'?Number(row.fulfilled_qty_kg||0):0;weighed+=own;sub+=replacement;if(order.status==='completed')delivered+=own+replacement;}
   return{id:item.id,crop_name:item.crops?.name||'ผัก',plant_count:item.plant_count,ordered_qty_kg:ordered,weighed_own_qty_kg:weighed,substitute_qty_kg:sub,delivered_qty_kg:delivered,available_qty_kg:null};
  })});
 }catch{res.status(500).json({error:'ไม่สามารถโหลดน้ำหนักชั่งจริงได้'});}
});
router.post('/:id/stock',(_req:AuthenticatedRequest,res:Response)=>{res.status(410).json({error:'ระบบไม่ใช้ยอดกิโลคงเหลือแล้ว กรุณาบันทึกน้ำหนักชั่งจริงที่ออเดอร์ หรือตั้งค่าจำกัดจำนวนการซื้อที่รอบปลูก'});});
export default router;
