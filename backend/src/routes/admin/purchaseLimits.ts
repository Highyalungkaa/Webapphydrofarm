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
export default router;
