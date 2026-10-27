import type {Order,OrderItem} from '../types/index.js';
const cents=(n:number)=>Math.round(n*100);
export const itemGrossAmount=(item:OrderItem)=>Math.round(Math.round(Number(item.qty_kg)*100)*Math.round(Number(item.price_per_kg)*100)/100)/100;
export const itemNetAmount=(item:OrderItem)=>Math.max(0,cents(itemGrossAmount(item))-cents(Number(item.discount_amount||0)))/100;
export const receiptAmount=(order:Order)=>order.payment_status==='paid'?Number(order.received_amount??order.total_amount):0;
export function deliveredItemKg(order:Order,item:OrderItem):number|null{
  if(order.status!=='completed')return 0;
  if(item.own_qty_kg==null)return null;
  return Math.round((Number(item.own_qty_kg)+(item.fulfillment_source==='substitute'?Number(item.fulfilled_qty_kg||0):0))*100)/100;
}
/** Allocate a recorded receipt to source lines; cent rounding always sums to the receipt. */
export function receiptByItem(order:Order):Map<string,number>{
  const items=[...(order.order_items||[])].sort((a,b)=>a.id.localeCompare(b.id));
  const net=items.map(i=>cents(itemNetAmount(i))),total=net.reduce((n,v)=>n+v,0);
  const weights=total>0?net:items.map(i=>Math.round(Number(i.qty_kg)*100));
  const weight=weights.reduce((n,v)=>n+v,0),received=cents(receiptAmount(order));
  let accumulated=0,assigned=0;const amounts=new Map<string,number>();
  items.forEach((i,index)=>{accumulated+=weights[index];const next=weight>0?Math.round(received*accumulated/weight):0;amounts.set(i.id,(next-assigned)/100);assigned=next;});
  return amounts;
}
export function orderMetrics(orders:Order[]){
  let bookedKg=0,deliveredKg=0,bookedCents=0,receivedCents=0,outstandingCents=0,unrecordedDeliveryItems=0,cancelledReceiptCents=0;
  for(const order of orders){
    const received=cents(receiptAmount(order));receivedCents+=received;
    if(order.status==='cancelled'){cancelledReceiptCents+=received;continue;}
    bookedCents+=cents(Number(order.total_amount));if(order.status!=='no_show')outstandingCents+=Math.max(0,cents(Number(order.total_amount))-received);
    for(const item of order.order_items||[]){bookedKg+=Number(item.qty_kg);const delivered=deliveredItemKg(order,item);if(delivered===null)unrecordedDeliveryItems++;else deliveredKg+=delivered;}
  }
  return{bookedKg:Math.round(bookedKg*100)/100,deliveredKg:Math.round(deliveredKg*100)/100,bookedAmount:bookedCents/100,
    receivedAmount:receivedCents/100,outstandingAmount:outstandingCents/100,unrecordedDeliveryItems,cancelledReceivedAmount:cancelledReceiptCents/100};
}
