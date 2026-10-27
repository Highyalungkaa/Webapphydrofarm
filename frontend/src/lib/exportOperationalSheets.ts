import type {Worksheet} from 'exceljs';
import type {Order,PlantingRound} from '../types/index.js';
import type {ReportExportData} from './reportExportData.js';
import {recordedPlantCount} from './reportExportData.js';
import {deliveredItemKg,receiptAmount} from './orderReport.js';

type Column={header:string;key:string;width:number;format?:string};
type SheetFactory=(name:string,subtitle:string,columns:Column[])=>{sheet:Worksheet;finish:()=>void};
type Options={addSheet:SheetFactory;data:ReportExportData;orders:Order[];rounds:PlantingRound[];periodStart:string;periodEnd:string;
  bangkokDate:(value?:string|Date|null)=>Date|null;dateOnly:(value?:string|null)=>Date|null};
const n=(value:unknown)=>Number(value||0);
const sum=<T,>(rows:T[],value:(row:T)=>number)=>rows.reduce((total,row)=>total+value(row),0);
const col=(header:string,key:string,width=25,format?:string):Column=>({header,key,width,format});
const kg='#,##0.00',count='#,##0',date='dd/mm/yyyy',time='dd/mm/yyyy hh:mm';
const day=(value?:string|null)=>{
  if(!value)return null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
  const parsed=new Date(value);return Number.isNaN(parsed.getTime())?null:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(parsed);
};
const actions:Record<string,string>={create:'สร้าง',update:'แก้ไข',cancel:'ยกเลิก',close_with_unsold:'บันทึกผักขายไม่ออกและสิ้นสุดรอบ',delete:'ลบ'};
const statuses:Record<string,string>={pending_confirmation:'รอยืนยัน',confirmed:'ยืนยันแล้ว',ready:'พร้อมรับ/ส่ง',completed:'สำเร็จ',cancelled:'ยกเลิก',no_show:'ไม่มารับ',growing:'กำลังปลูก',booking_open:'เปิดจอง',booking_closed:'ปิดจอง',paid:'ชำระแล้ว',unpaid:'รอชำระ'};

export function appendOperationalSheets({addSheet,data,orders,rounds,periodStart,periodEnd,bangkokDate,dateOnly}:Options){
  const roundIds=new Set(rounds.map(r=>r.id)),orderIds=new Set(orders.map(o=>o.id));
  const roundById=new Map(rounds.map(r=>[r.id,r]));
  const itemById=new Map(rounds.flatMap(r=>(r.round_items||[]).map(i=>[i.id,i] as const)));
  const plotById=new Map(data.plots.map(p=>[p.id,p]));
  const losses=data.losses.filter(l=>roundIds.has(l.round_id));
  const closures=new Map(data.closures.filter(c=>roundIds.has(c.round_id)).map(c=>[c.round_id,c]));
  const unsold=data.unsoldItems.filter(i=>roundIds.has(i.round_id));
  const issues:{type:string;id:string;round:string;detail:string}[]=[];
  const issue=(type:string,id:string,round:string,detail:string)=>issues.push({type,id,round,detail});

  const plots=addSheet('แปลงที่ปลูก','ใช้จำนวนจัดลงแปลงที่บันทึกในรอบเท่านั้น ไม่จัดสรรประวัติใหม่จากความจุแปลงปัจจุบัน ชื่อแปลงและโซนเป็นข้อมูลปัจจุบัน',[
    col('รหัสรอบ','roundId',38),col('ชื่อรอบ','round',30),col('ชนิดผัก','crop'),col('รหัสแปลง','plotId',38),col('ชื่อแปลงปัจจุบัน','plot'),col('โซนปัจจุบัน','zone'),
    col('ต้นจัดลงแปลง','planted',22,count),col('ต้นเสียหายที่ระบุแปลง','lost',27,count),col('ต้นหลังหักเสียหาย','remaining',25,count),col('ความครบถ้วนของข้อมูล','coverage',48),
  ]);
  for(const r of rounds){
    let notes:any={};try{notes=JSON.parse(r.notes||'{}');}catch{}
    for(const item of r.round_items||[]){
      const allocation=notes?.cropPlotAllocations?.[item.crop_id];
      const entries=allocation&&typeof allocation==='object'?Object.entries(allocation).filter(([,value])=>Number.isInteger(Number(value))&&Number(value)>0):[];
      const known=entries.length>0&&sum(entries,e=>Number(e[1]))===n(recordedPlantCount(item));
      const ids=entries.length?entries.map(e=>e[0]):Array.isArray(notes?.cropPlotIds?.[item.crop_id])?notes.cropPlotIds[item.crop_id]:item.plot_ids||[];
      const unlocatedLoss=losses.some(l=>l.round_item_id===item.id&&!l.voided_at&&!l.plot_id);
      if(!known)issue('การจัดแปลง',item.id,r.name,'ไม่มีจำนวนจัดลงแปลงย้อนหลังที่ครบถ้วน จึงไม่ประมาณจำนวนต้นต่อแปลง');
      for(const id of (ids.length?ids:[null])){
        const plot=id?plotById.get(id):undefined;
        const planted=known?Number((allocation as Record<string,number>)[id]):null;
        const lost=sum(losses.filter(l=>!l.voided_at&&l.round_item_id===item.id&&l.plot_id===id),l=>n(l.plant_count));
        const coverage=!known?'ยังไม่มีจำนวนต้นจัดลงแปลงครบ':unlocatedLoss?'มีรายการเสียหายที่ไม่ระบุแปลง':!plot?'ไม่พบชื่อแปลงปัจจุบัน':lost>n(planted)?'เสียหายเกินจำนวนที่จัดลงแปลง':'มีจำนวนต้นจัดลงแปลงและยอดเสียหายที่ระบุแปลง';
        plots.sheet.addRow({roundId:r.id,round:r.name,crop:item.crops?.name||item.crop_name||'-',plotId:id,plot:plot?.name||'ไม่พบข้อมูลแปลง',zone:plot?.zone_name||'-',
          planted,lost,remaining:planted==null||unlocatedLoss||lost>planted?null:planted-lost,coverage});
      }
      if(recordedPlantCount(item)==null)issue('จำนวนต้น',item.id,r.name,'ยังไม่มีจำนวนต้นที่ปลูก');
      if(!(n(item.planting_plants_per_kg)>0))issue('ผลผลิตประมาณ',item.id,r.name,'ไม่มีอัตราต้น/กก. ที่บันทึกในรอบ ไม่ใช้อัตราปัจจุบันคำนวณย้อนหลัง');
    }
  }
  plots.finish();

  const lossSheet=addSheet('ผักเสียหาย','รวมประวัติที่ยกเลิกการบันทึกเพื่อการตรวจสอบ ยอดเสียหายสุทธิไม่นับรายการที่ยกเลิก น้ำหนักเสียหายเป็นค่าประมาณเมื่อมีบันทึก',[
    col('รหัสบันทึก','id',38),col('รหัสรอบ','roundId',38),col('ชื่อรอบ','round',30),col('ชนิดผัก','crop'),col('แปลง ณ วันที่บันทึก','plot',30),
    col('วันที่พบ','date',20,date),col('จำนวนเสียหาย (ต้น)','plants',24,count),col('สาเหตุ','reason',35),col('ขั้นตอนที่บันทึก','stage',22,count),
    col('น้ำหนักเสียหายประมาณ (กก.)','estimate',32,kg),col('ผู้บันทึก','actor',35),col('วันเวลาบันทึก','created',25,time),col('สถานะบันทึก','status'),col('วันเวลายกเลิกบันทึก','voided',25,time),col('เหตุผลยกเลิกบันทึก','voidReason',40),col('หมายเหตุ','note',45),
  ]);
  for(const l of losses){
    lossSheet.sheet.addRow({id:l.id,roundId:l.round_id,round:roundById.get(l.round_id)?.name,crop:itemById.get(l.round_item_id)?.crops?.name||'-',plot:l.plot_name||'ยังไม่บันทึกชื่อแปลง',
      date:dateOnly(l.loss_date),plants:n(l.plant_count),reason:l.reason,stage:l.stage,estimate:l.estimated_loss_kg??null,actor:l.recorded_by_email,
      created:bangkokDate(l.created_at),status:l.voided_at?'ยกเลิกการบันทึก':'มีผล',voided:bangkokDate(l.voided_at),voidReason:l.void_reason||'-',note:l.note||'-'});
    if(!l.voided_at&&!l.plot_id)issue('ผักเสียหาย',l.id,roundById.get(l.round_id)?.name||'-','ไม่ระบุแปลง ไม่กระจายยอดเสียหายลงแปลงเอง');
  }
  lossSheet.finish();

  const disposition:Record<string,string>={discard:'ทิ้ง',donate:'บริจาค',consume:'บริโภคเอง',process:'แปรรูป',other:'อื่น ๆ'};
  const unsoldSheet=addSheet('ผักขายไม่ออก','แยกต้นขายไม่ออก น้ำหนักชั่งจริง และน้ำหนักประมาณเดิม ช่องว่างหมายถึงไม่มีข้อมูล ไม่ใช่ศูนย์',[
    col('รหัสรอบ','roundId',38),col('ชื่อรอบ','round',30),col('ชนิดผัก','crop'),col('วันที่ปิดรอบ','date',22,date),col('ผักขายไม่ออก (ต้น)','plants',24,count),
    col('น้ำหนักขายไม่ออกชั่งจริง (กก.)','actual',33,kg),col('น้ำหนักขายไม่ออกประมาณเดิม (กก.)','estimate',36,kg),col('ขายช่องทางอื่นที่บันทึก (กก.)','other',32,kg),
    col('การจัดการผัก','disposition'),col('ผู้บันทึก','actor',35),col('วันเวลาบันทึก','created',25,time),col('หมายเหตุปิดรอบ','closureNote',45),col('หมายเหตุรายการ','note',45),
  ]);
  for(const i of unsold){const c=closures.get(i.round_id);unsoldSheet.sheet.addRow({roundId:i.round_id,round:roundById.get(i.round_id)?.name,crop:i.crop_name,date:dateOnly(c?.closed_date),plants:n(i.unsold_plant_count),actual:i.unsold_actual_kg??null,estimate:i.unsold_estimated_kg??null,other:n(i.other_sales_kg),disposition:disposition[i.disposition||'']||'-',actor:c?.recorded_by_email||'-',created:bangkokDate(c?.created_at),closureNote:c?.note||'-',note:i.note||'-'});}
  unsoldSheet.finish();

  const audits=data.audits.filter(a=>a.entity_type==='orders'?orderIds.has(a.entity_id):roundIds.has(a.entity_id));
  const auditSheet=addSheet('ประวัติแก้ไข','ประวัติตามที่ระบบเคยบันทึก ไม่สร้างเหตุการณ์ย้อนหลัง รายการผักแสดงรหัสรายการเพื่อเชื่อมตรวจสอบต้นทาง',[
    col('รหัสเหตุการณ์','id',38),col('วันเวลา','date',25,time),col('ประเภทข้อมูล','entity'),col('รหัสอ้างอิง','entityId',38),col('การดำเนินการ','action',35),col('ผู้ดำเนินการ','actor',35),
    col('เหตุผล','reason',45),col('สถานะก่อน','beforeStatus',24),col('สถานะหลัง','afterStatus',24),col('ยอดก่อน (บาท)','beforeTotal',22,kg),col('ยอดหลัง (บาท)','afterTotal',22,kg),
    col('รายการผักก่อนแก้','beforeItems',70),col('รายการผักหลังแก้','afterItems',70),
  ]);
  const describe=(items:any)=>Array.isArray(items)?items.map((i:any)=>`${i.crop_name||itemById.get(i.round_item_id)?.crops?.name||i.round_item_id||i.id||'ผัก'}: ${i.qty_kg??'-'} กก.${i.price_per_kg!=null?` @ ${i.price_per_kg} บาท/กก.`:''}`).join('\n'):'-';
  for(const a of audits){const old=a.old_data?.order||a.old_data||{},next=a.new_data||{};
    auditSheet.sheet.addRow({id:a.id,date:bangkokDate(a.created_at),entity:a.entity_type==='orders'?'ออเดอร์':'รอบปลูก',entityId:a.entity_id,action:actions[a.action]||a.action,actor:a.actor_email||'-',
      reason:next.reason||next.cancel_reason||next.closure_reason||'-',beforeStatus:statuses[old.status]||old.status||'-',afterStatus:statuses[next.status]||next.status||'-',
      beforeTotal:next.previous_total_amount??old.total_amount??null,afterTotal:next.total_amount??null,beforeItems:describe(a.old_data?.items||old.order_items),afterItems:describe(next.items||next.order_items)});
  }
  auditSheet.finish();

  type Activity={date:string;bookedKg:number;bookedAmount:number;deliveredKg:number;received:number;lossPlants:number;unsoldPlants:number;unknown:number};
  const days=new Map<string,Activity>();
  const activity=(value?:string|null)=>{const key=day(value);if(!key||(periodStart&&key<periodStart)||(periodEnd&&key>periodEnd))return null;
    if(!days.has(key))days.set(key,{date:key,bookedKg:0,bookedAmount:0,deliveredKg:0,received:0,lossPlants:0,unsoldPlants:0,unknown:0});return days.get(key)!;};
  for(const o of orders){
    if(o.status!=='cancelled'){const row=activity(o.created_at);if(row){row.bookedKg+=sum(o.order_items||[],i=>n(i.qty_kg));row.bookedAmount+=n(o.total_amount);}}
    if(o.status==='completed'){
      const row=activity(o.completed_at);if(row)for(const i of o.order_items||[]){const actual=deliveredItemKg(o,i);if(actual==null)row.unknown++;else row.deliveredKg+=actual;}
      if(!o.completed_at)issue('วันที่ส่งสำเร็จ',o.id,'-','ไม่มีวันที่ส่งมอบสำเร็จ จึงไม่รวมยอดส่งจริงของออเดอร์นี้ในสรุปตามวันที่');
      if((o.order_items||[]).some(i=>i.own_qty_kg==null))issue('น้ำหนักส่งจริง',o.id,'-','ไม่มีน้ำหนักชั่งจริงครบ ช่องส่งจริงรวมของออเดอร์เว้นว่าง ยอดสรุปรวมเฉพาะรายการที่มีข้อมูล');
    }
    if(o.payment_status==='paid'){const row=activity(o.paid_at);if(row)row.received+=receiptAmount(o);if(!o.paid_at)issue('วันที่รับเงิน',o.id,'-','มีเงินรับตามบันทึกแต่ไม่มีวันรับเงิน จึงไม่รวมเงินนี้ในสรุปตามวันที่');}
  }
  for(const l of losses)if(!l.voided_at){const row=activity(l.loss_date);if(row)row.lossPlants+=n(l.plant_count);}
  for(const i of unsold){const row=activity(closures.get(i.round_id)?.closed_date);if(row)row.unsoldPlants+=n(i.unsold_plant_count);}
  const daily=addSheet('สรุปตามวันที่',`ช่วงวันที่ ${periodStart||'ทั้งหมด'} ถึง ${periodEnd||'ทั้งหมด'} (เวลาไทย) ยอดจองปัจจุบันลงวันสั่ง ส่งจริงลงวันสำเร็จ เงินรับลงวันรับเงิน ชีตอื่นเป็นภาพข้อมูลปัจจุบันของรอบที่เลือก`,[
    col('วันที่','date',22,date),col('ยอดจองปัจจุบัน (กก.)','bookedKg',27,kg),col('มูลค่าจองปัจจุบัน (บาท)','bookedAmount',30,kg),col('ส่งจริงที่ทราบน้ำหนัก (กก.)','deliveredKg',30,kg),
    col('เงินรับตามวันรับเงิน (บาท)','received',30,kg),col('ต้นเสียหายสุทธิ','lossPlants',23,count),col('ต้นขายไม่ออก','unsoldPlants',23,count),col('รายการส่งที่ไม่ทราบน้ำหนัก','unknown',30,count),
  ]);
  const dailyRows=[...days.values()].sort((a,b)=>a.date.localeCompare(b.date));
  for(const row of dailyRows)daily.sheet.addRow({...row,date:dateOnly(row.date)});
  const totals=daily.sheet.addRow({date:'รวมช่วงวันที่',...Object.fromEntries(['bookedKg','bookedAmount','deliveredKg','received','lossPlants','unsoldPlants','unknown'].map(key=>[key,sum(dailyRows,row=>n(row[key as keyof Activity]))]))});
  totals.font={bold:true};
  daily.finish();
  if(dailyRows.length)daily.sheet.autoFilter={from:{row:6,column:1},to:{row:6+dailyRows.length,column:9}};

  const check=addSheet('ข้อมูลที่ต้องตรวจสอบ','แสดงช่องข้อมูลที่ขาดเพื่อให้แก้ในระบบ ไม่แทนข้อมูลที่ไม่ทราบด้วยค่าประมาณ หากไม่มีแถวแปลว่าไม่พบเงื่อนไขที่ตรวจในรายงานนี้',[
    col('ประเภท','type',26),col('รหัสอ้างอิง','id',38),col('ชื่อรอบ','round',30),col('รายละเอียด','detail',100),
  ]);
  issues.forEach(row=>check.sheet.addRow(row));check.finish();
  const guide=addSheet('คำอธิบายรายงาน','อ่านหลักเกณฑ์ก่อนรวมยอดข้ามชีต โดยเฉพาะออเดอร์ที่มีผักจากหลายรอบ',[
    col('หัวข้อ','topic',38),col('คำอธิบาย','detail',110),
  ]);
  [
    ['เวลารวบรวมข้อมูล',data.loadedAt?bangkokDate(data.loadedAt)?.toISOString().slice(0,16).replace('T',' ')+' เวลาไทย':'ไม่ระบุ'],
    ['ขอบเขตรายละเอียด','ชีตรายละเอียดเป็นข้อมูลปัจจุบันของรอบที่เลือก ช่วงวันที่ใช้กับชีตสรุปตามวันที่เท่านั้น ไม่ใช่ภาพสถานะย้อนหลัง ณ วันสิ้นช่วง'],
    ['ผลผลิตประมาณ','ใช้จำนวนต้นและอัตราต้น/กก. ที่บันทึกในรอบ ปัดลงเป็นกิโลกรัมเต็ม ไม่ใช่น้ำหนักเก็บเกี่ยวจริงทั้งหมด'],
    ['ต้นคงเหลือหลังเสียหาย','จำนวนต้นปลูกลบต้นเสียหายสุทธิ ยังไม่ได้หักต้นที่เก็บขาย เพราะระบบไม่ได้บันทึกจำนวนต้นเก็บขายต่อแปลง'],
    ['ส่งจริง','เฉพาะออเดอร์สำเร็จ น้ำหนักฟาร์มที่ชั่งบวกผักทดแทน ช่องว่างหมายถึงยังไม่มีข้อมูล ไม่ใช่ศูนย์'],
    ['ส่วนต่างส่งจริงกับจอง','ส่งจริงลบยอดจอง ค่าบวกคือส่งเกิน ค่าลบคือส่งขาด แสดงเมื่อส่งสำเร็จและมีน้ำหนักครบเท่านั้น'],
    ['เงินรับจริง','ยอดที่บันทึกชำระแล้ว ไม่ใช่การตรวจยอดจากธนาคาร รวมเงินรับในออเดอร์ยกเลิก ยังไม่มีบัญชีคืนเงินหรือรับชำระบางส่วน'],
    ['เงินรับแยกผักและรอบ','จัดสรรตามสัดส่วนมูลค่ารายการหลังส่วนลด ปัดเศษสตางค์ให้รวมตรงกับยอดรับของออเดอร์ ไม่ใช่รายการโอนแยกจริง'],
    ['ออเดอร์หลายรอบ','นับออเดอร์ได้ในแต่ละรอบที่มีผัก จึงห้ามบวกจำนวนออเดอร์รายรอบเพื่อแทนจำนวนออเดอร์ไม่ซ้ำทั้งหมด'],
    ['ผักขายไม่ออก','แยกน้ำหนักชั่งจริงจากน้ำหนักประมาณเดิม ไม่รวมสองค่านี้เข้าด้วยกัน'],
    ['ข้อมูลประวัติ','แสดงเฉพาะประวัติที่เคยบันทึกไว้ ไม่สร้างวันส่งสำเร็จ ผู้แก้ หรือการจัดแปลงย้อนหลังจากข้อมูลปัจจุบัน'],
    ['ต้นทุนและกำไร','ต้นทุนผักทดแทนยังไม่ใช่ต้นทุนทั้งหมดของฟาร์ม รายงานนี้จึงไม่คำนวณกำไรสุทธิ'],
  ].forEach(([topic,detail])=>guide.sheet.addRow({topic,detail}));guide.finish();
}
