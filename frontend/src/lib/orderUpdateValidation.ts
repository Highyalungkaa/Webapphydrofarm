import type {OrderItem,OrderStatus,PaymentStatus} from '../types/index.js';

export function orderUpdateIssues(status:OrderStatus,payment:PaymentStatus,items:OrderItem[],own:Record<string,string>,
  substitute:Record<string,{qtyKg:string;totalCost:string}>,discount:Record<string,string>) {
  const issues:string[]=[];
  if(status==='completed'&&payment!=='paid')issues.push('กรุณาบันทึกว่าชำระเงินแล้ว ก่อนเปลี่ยนออเดอร์เป็นสำเร็จ');
  for(const item of items){
    const name=item.round_items?.crops?.name||'ผักในออเดอร์';
    const text=own[item.id]??'',weight=Number(text||0),sub=Number(substitute[item.id]?.qtyKg||0),cost=Number(substitute[item.id]?.totalCost||0);
    const ordered=Number(item.qty_kg),reduction=Number(discount[item.id]||0),gross=ordered*Number(item.price_per_kg);
    if(!Number.isFinite(weight)||weight<0)issues.push(`${name}: น้ำหนักที่ชั่งจริงต้องไม่ติดลบ`);
    else if(['ready','completed'].includes(status)&&(weight+sub<ordered-0.000001||(text.trim()===''&&sub<ordered)))
      issues.push(`${name}: กรุณากรอกน้ำหนักที่ชั่งจริง หรือผักทดแทน ให้รวมอย่างน้อย ${ordered.toLocaleString('th-TH')} กก. ก่อนเปลี่ยนเป็นพร้อมรับ / ส่ง`);
    if(!Number.isFinite(sub)||sub<0||sub>ordered)issues.push(`${name}: ผักทดแทนต้องไม่เกินจำนวนที่สั่ง`);
    if(!Number.isFinite(cost)||cost<0||(sub===0&&cost>0))issues.push(`${name}: กรุณาตรวจสอบจำนวนและต้นทุนผักทดแทน`);
    if(!Number.isFinite(reduction)||reduction<0||reduction>gross)issues.push(`${name}: ส่วนลดต้องไม่เกินยอดของรายการ`);
  }
  return issues;
}
export function ownWeightForSave(text:string|undefined,substituteKg:number,orderedKg:number,status:OrderStatus):number|null {
  if(text?.trim())return Number(text);
  return ['ready','completed'].includes(status)&&substituteKg>=orderedKg?0:null;
}
