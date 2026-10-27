import {Router,Response} from 'express';
import {supabaseAdmin} from '../../config/supabase.js';
import {requireAuth,requireAdmin,AuthenticatedRequest} from '../../middlewares/auth.js';
import {reconcileOrderExpiry} from '../../middlewares/orderExpiry.js';

const router=Router();
router.use(requireAuth,requireAdmin,reconcileOrderExpiry);

// Page every source explicitly: PostgREST otherwise silently caps exports at 1,000 rows.
export async function readAllRows(makeQuery:()=>any):Promise<any[]>{
  const all:any[]=[];
  for(let offset=0;;offset+=500){
    const {data,error}=await makeQuery().range(offset,offset+499);
    if(error)throw error;
    all.push(...(data||[]));
    if((data||[]).length<500)return all;
  }
}

router.get('/export-data',async(_req:AuthenticatedRequest,res:Response)=>{
  try{
    const [orders,rounds,plots,losses,closures,unsoldItems,audits]=await Promise.all([
      readAllRows(()=>supabaseAdmin.from('orders').select(`*,
        planting_rounds:planting_rounds!orders_round_id_fkey(id,name,fulfillment_date),
        profiles(id,full_name,phone),districts(id,name),
        order_items(*,round_items(id,round_id,crop_id,crops(id,name)))`).order('id')),
      readAllRows(()=>supabaseAdmin.from('planting_rounds').select('*,round_items(*,crops(id,name))').order('id')),
      readAllRows(()=>supabaseAdmin.from('plots').select('id,name,zone_name').order('id')),
      readAllRows(()=>supabaseAdmin.from('plant_losses').select('id,round_id,round_item_id,plot_id,plot_name,loss_date,plant_count,reason,note,stage,plants_per_kg,estimated_loss_kg,recorded_by_email,created_at,voided_at,void_reason').order('id')),
      readAllRows(()=>supabaseAdmin.from('round_unsold_closures').select('round_id,closed_date,note,recorded_by_email,created_at').order('round_id')),
      readAllRows(()=>supabaseAdmin.from('round_unsold_items').select('*').order('id')),
      readAllRows(()=>supabaseAdmin.from('audit_logs').select('id,entity_type,entity_id,action,actor_email,old_data,new_data,created_at').in('entity_type',['orders','planting_rounds']).order('id')),
    ]);
    res.json({orders,rounds,plots,losses,closures,unsoldItems,audits,loadedAt:new Date().toISOString()});
  }catch(error:any){
    console.error('Report export data failed:',error?.code,error?.message);
    res.status(500).json({error:'รวบรวมข้อมูลรายงานไม่ครบ จึงยังไม่สร้างไฟล์ กรุณาลองใหม่'});
  }
});
export default router;
