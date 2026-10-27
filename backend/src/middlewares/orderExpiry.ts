import type {Request,Response,NextFunction} from 'express';
import {supabaseAdmin} from '../config/supabase.js';

/** Cron performs unattended expiry; this also reconciles stock before a booking/read. */
export async function reconcileOrderExpiry(_req:Request,res:Response,next:NextFunction):Promise<void>{
  try{
    const {error}=await supabaseAdmin.rpc('expire_pending_orders');
    if(error)throw error;
    next();
  }catch(error:any){
    console.error('Order expiry reconciliation failed:',error?.code,error?.message);
    res.status(503).json({error:'ไม่สามารถตรวจสอบเวลารอยืนยันและสต๊อกล่าสุดได้ กรุณาลองใหม่'});
  }
}
