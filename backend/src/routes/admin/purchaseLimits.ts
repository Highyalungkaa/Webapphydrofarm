import {Router,Response} from 'express';
import {z} from 'zod';
import {supabaseAdmin} from '../../config/supabase.js';
import {requireAuth,requireAdmin,AuthenticatedRequest} from '../../middlewares/auth.js';
const router=Router();router.use(requireAuth,requireAdmin);
const input=z.object({enabled:z.boolean(),items:z.array(z.object({id:z.string().uuid(),max_qty_per_order_kg:z.number().min(0.5).max(99999999)
  .refine(n=>Math.abs(n*100-Math.round(n*100))<0.00001,'จำนวนสูงสุดต้องมีทศนิยมไม่เกิน 2 ตำแหน่ง')})).default([])});
router.patch('/:id/purchase-limits',async(req:AuthenticatedRequest,res:Response)=>{
  const parsed=input.safeParse(req.body);
  if(!parsed.success||!z.string().uuid().safeParse(req.params.id).success){res.status(400).json({error:!parsed.success?parsed.error.errors[0].message:'รหัสรอบไม่ถูกต้อง'});return;}
  try {
  const{data,error}=await supabaseAdmin.rpc('set_round_purchase_limits',{p_actor_id:req.user!.id,p_round_id:req.params.id,p_enabled:parsed.data.enabled,p_items:parsed.data.items});
  if(error){const missing=['42883','PGRST202','42703'].includes(error.code);res.status(missing?503:400).json({error:missing?'กรุณารัน migration 035 ก่อนตั้งค่าจำกัดจำนวนการซื้อ':error.message});return;}
  res.json(data);
  } catch {res.status(500).json({error:'บันทึกการจำกัดจำนวนไม่สำเร็จ กรุณาลองอีกครั้ง'});}
});
router.patch('/:id/order-limit',async(req:AuthenticatedRequest,res:Response)=>{
  const parsed=z.object({remaining:z.number().int().min(0).max(1000000).nullable()}).safeParse(req.body);
  if(!parsed.success||!z.string().uuid().safeParse(req.params.id).success){res.status(400).json({error:'กรุณากรอกจำนวนออเดอร์เป็นจำนวนเต็มตั้งแต่ 0 ถึง 1000000'});return;}
  try {
    const {data,error}=await supabaseAdmin.rpc('set_round_order_limit',{p_actor_id:req.user!.id,p_round_id:req.params.id,p_remaining:parsed.data.remaining});
    if(error){const missing=['42883','PGRST202','42703'].includes(error.code);res.status(missing?503:400).json({error:missing?'กรุณารัน migration 036 ก่อนตั้งค่าจำกัดออเดอร์':error.message});return;}
    res.json(data);
  } catch {res.status(500).json({error:'บันทึกจำนวนออเดอร์ไม่สำเร็จ กรุณาลองอีกครั้ง'});}
});
const cropOrderLimitInput=z.object({items:z.array(z.object({id:z.string().uuid(),remaining:z.number().int().min(0).max(1000000)}))
  .refine(items=>new Set(items.map(item=>item.id)).size===items.length,'เลือกชนิดผักซ้ำกัน')});
router.patch('/:id/crop-order-limits',async(req:AuthenticatedRequest,res:Response)=>{
  const parsed=cropOrderLimitInput.safeParse(req.body);
  if(!parsed.success||!z.string().uuid().safeParse(req.params.id).success){
    res.status(400).json({error:!parsed.success?parsed.error.errors[0].message:'รหัสรอบไม่ถูกต้อง'});return;
  }
  try{
    const {data,error}=await supabaseAdmin.rpc('set_round_item_order_limits',{
      p_actor_id:req.user!.id,p_round_id:req.params.id,p_items:parsed.data.items,
    });
    if(error){
      const missing=['42883','PGRST202','42703'].includes(error.code);
      res.status(missing?503:400).json({error:missing?'กรุณารัน migration 037 ก่อนตั้งโควตาออเดอร์แยกตามผัก':error.message});return;
    }
    res.json(data);
  }catch{res.status(500).json({error:'บันทึกโควตาออเดอร์ของผักไม่สำเร็จ กรุณาลองอีกครั้ง'});}
});
export default router;
