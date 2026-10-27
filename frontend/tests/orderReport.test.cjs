const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../../backend/node_modules/typescript');
let download;
function load(name){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../src/lib',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{
 exports,Blob,Date,Intl,URL:{createObjectURL(blob){download=blob;return'blob:test';},revokeObjectURL(){}},window:{setTimeout(){}},document:{createElement(){return{click(){},remove(){}};},body:{appendChild(){}}},
 require:n=>n.startsWith('./')&&n.endsWith('.js')?load(n.slice(2,-3)):n==='exceljs'?require('../node_modules/exceljs'):require(n)
 });return exports;}
const {orderMetrics,deliveredItemKg,receiptByItem,itemGrossAmount}=load('orderReport');
const {scopeOrderToRound}=load('pooledBooking');
function order(extra={}){return{id:'o',round_id:'r1',customer_id:'c',status:'completed',payment_status:'paid',total_amount:795,received_amount:795,created_at:'2026-10-27T00:00:00Z',paid_at:'2026-10-27T02:00:00Z',
 order_items:[{id:'a',round_item_id:'ia',qty_kg:10,price_per_kg:50,discount_amount:5,own_qty_kg:10.2,round_items:{round_id:'r1',crops:{id:'oak',name:'Oak'}}},
 {id:'b',round_item_id:'ib',qty_kg:5,price_per_kg:60,own_qty_kg:5.1,round_items:{round_id:'r2',crops:{id:'oak',name:'Oak'}}}],...extra};}
test('booking, delivery and recorded cash use different sources of truth',()=>{
 const row=order(),metrics=orderMetrics([row]);assert.equal(metrics.bookedKg,15);assert.equal(metrics.deliveredKg,15.3);assert.equal(metrics.receivedAmount,795);
 const pending=order({status:'confirmed',payment_status:'unpaid'});assert.equal(orderMetrics([pending]).deliveredKg,0);assert.equal(orderMetrics([pending]).receivedAmount,0);
 const unknown=order({order_items:[{...row.order_items[0],own_qty_kg:null}]});assert.equal(deliveredItemKg(unknown,unknown.order_items[0]),null);assert.equal(orderMetrics([unknown]).unrecordedDeliveryItems,1);assert.equal(orderMetrics([unknown]).deliveredKg,0);
});
test('cancelled paid orders retain their recorded receipt without adding bookings or deliveries',()=>{
 const metrics=orderMetrics([order({status:'cancelled'})]);assert.equal(metrics.bookedKg,0);assert.equal(metrics.deliveredKg,0);assert.equal(metrics.receivedAmount,795);assert.equal(metrics.cancelledReceivedAmount,795);
 assert.equal(orderMetrics([order({total_amount:700})]).receivedAmount,795);
});
test('cross-round receipts and deliveries scope to source items and cent allocations sum exactly',()=>{
 const original=order(),a=scopeOrderToRound(original,'r1'),b=scopeOrderToRound(original,'r2');
 assert.equal(orderMetrics([a]).deliveredKg,10.2);assert.equal(orderMetrics([b]).deliveredKg,5.1);assert.equal(a.received_amount,495);assert.equal(b.received_amount,300);
 const tiny=order({total_amount:0.01,received_amount:0.01,order_items:['a','b','c'].map(id=>({id,qty_kg:1,price_per_kg:1}))});
 assert.equal([...receiptByItem(tiny).values()].reduce((n,v)=>n+v,0),0.01);
 assert.equal(itemGrossAmount({qty_kg:0.5,price_per_kg:50.01}),25.01);
});
test('Excel selected-round summary matches screen metrics and uses the actual source round',async()=>{
 const {exportVegetableReport}=load('exportVegetableReport');
 const original=order(),rounds=['r1','r2'].map((id,index)=>({id,name:id,status:'booking_open',fulfillment_date:'2026-11-01',round_items:[{id:index?'ib':'ia',plant_count:50,crops:{name:'Oak'}}]}));
 await exportVegetableReport({orders:[original],rounds,selectedRoundId:'r2',exportedAt:new Date('2026-10-27T00:00:00Z')});
 const ExcelJS=require('../node_modules/exceljs'),book=new ExcelJS.Workbook();await book.xlsx.load(await download.arrayBuffer());
 const summary=book.getWorksheet('สรุปภาพรวม')||book.worksheets[0];
 const metrics=new Map();summary.eachRow(row=>{metrics.set(row.getCell(1).value,row.getCell(2).value);});
 assert.equal(metrics.get('ส่งมอบจริง'),5.1);assert.equal(metrics.get('เงินรับจริง'),300);
 const items=book.getWorksheet('รายการผัก');assert.equal(items.getRow(7).getCell(2).value,'r2');assert.equal(items.rowCount,7);
 const round=book.getWorksheet('รายรอบ');assert.equal(round.getRow(7).getCell(1).value,'r2');assert.equal(round.rowCount,7);
});

test('complete Excel preserves loss reversals, unknown weights, historical allocation and event-specific Thai dates',async()=>{
 const {exportVegetableReport}=load('exportVegetableReport');
 const r={id:'r1',name:'Round 1',status:'completed',fulfillment_date:'2026-11-04',seed_date:'2026-09-01',completed_date:'2026-11-04',closure_reason:'unsold',
  notes:JSON.stringify({cropPlotIds:{oak:['p1','p2']},cropPlotAllocations:{oak:{p1:60,p2:40}}}),round_items:[{id:'ia',crop_id:'oak',plant_count:100,lost_plant_count:10,planting_plants_per_kg:8,crops:{name:'Oak'}}]};
 const base=order({round_id:'r1',created_at:'2026-10-31T17:00:00Z',completed_at:'2026-11-02T01:00:00Z',paid_at:'2026-11-03T01:00:00Z',total_amount:100,received_amount:100,order_items:[{...order().order_items[0],qty_kg:2,own_qty_kg:1.8,discount_amount:0}]});
 const unknown=order({id:'unknown',status:'completed',completed_at:null,payment_status:'unpaid',order_items:[{...base.order_items[0],id:'unknown-item',own_qty_kg:null}],total_amount:100});
 const cancelled=order({id:'cancel',status:'cancelled',total_amount:50,received_amount:50,paid_at:'2026-11-03T02:00:00Z',order_items:[{...base.order_items[0],id:'cancel-item',qty_kg:1}]});
 const operations={orders:[base,unknown,cancelled],rounds:[r],plots:[{id:'p1',name:'Plot 1',zone_name:'A'},{id:'p2',name:'Plot 2',zone_name:'A'}],
  losses:[{id:'l1',round_id:'r1',round_item_id:'ia',plot_id:'p1',plot_name:'Historical Plot 1',loss_date:'2026-11-01',plant_count:10,reason:'Disease',stage:4,recorded_by_email:'admin',created_at:'2026-11-01T10:00:00Z'},
   {id:'l2',round_id:'r1',round_item_id:'ia',plot_id:'p1',plot_name:'Historical Plot 1',loss_date:'2026-11-01',plant_count:20,reason:'Mistake',stage:4,recorded_by_email:'admin',created_at:'2026-11-01T11:00:00Z',voided_at:'2026-11-01T12:00:00Z',void_reason:'Correction'}],
  closures:[{round_id:'r1',closed_date:'2026-11-04',recorded_by_email:'admin',created_at:'2026-11-04T10:00:00Z'}],
  unsoldItems:[{id:'u',round_id:'r1',round_item_id:'ia',crop_name:'Oak',unsold_plant_count:5,unsold_actual_kg:0,unsold_estimated_kg:1,other_sales_kg:0,disposition:'donate'}],
  audits:[{id:'a1',entity_type:'orders',entity_id:'o',action:'update',actor_email:'admin',created_at:'2026-11-01T12:00:00Z',old_data:{order:{total_amount:150},items:[{round_item_id:'ia',qty_kg:3}]},new_data:{total_amount:100,reason:'Customer requested',items:[{round_item_id:'ia',qty_kg:2}]}}],loadedAt:'2026-11-05T00:00:00Z'};
 await exportVegetableReport({orders:operations.orders,rounds:operations.rounds,selectedRoundId:'r1',exportedAt:new Date('2026-11-05T00:00:00Z'),operations,periodStart:'2026-11-01',periodEnd:'2026-11-03'});
 const ExcelJS=require('../node_modules/exceljs'),book=new ExcelJS.Workbook();await book.xlsx.load(await download.arrayBuffer());
 const records=name=>{const sheet=book.getWorksheet(name),keys=sheet.getRow(6).values;return Array.from({length:sheet.rowCount-6},(_,i)=>Object.fromEntries(keys.slice(1).map((key,j)=>[key,sheet.getRow(i+7).getCell(j+1).value])));};
 assert.equal(book.worksheets.length,14);
 for(const sheet of book.worksheets){assert.equal(sheet.getCell('A1').value,sheet.name);assert.match(sheet.getCell('A2').value,/ขอบเขต/);assert.ok(sheet.getCell('B4').value instanceof Date);assert.equal(sheet.views[0].ySplit,6);}
 const plots=records('แปลงที่ปลูก');assert.equal(plots[0]['ต้นจัดลงแปลง'],60);assert.equal(plots[0]['ต้นเสียหายที่ระบุแปลง'],10);assert.equal(plots[0]['ต้นหลังหักเสียหาย'],50);
 const loss=records('ผักเสียหาย');assert.equal(loss.length,2);assert.equal(loss[1]['สถานะบันทึก'],'ยกเลิกการบันทึก');assert.equal(loss[0]['แปลง ณ วันที่บันทึก'],'Historical Plot 1');
 const unsold=records('ผักขายไม่ออก')[0];assert.equal(unsold['น้ำหนักขายไม่ออกชั่งจริง (กก.)'],0);assert.equal(unsold['น้ำหนักขายไม่ออกประมาณเดิม (กก.)'],1);
 const daily=records('สรุปตามวันที่');assert.equal(daily.length,4);assert.equal(daily[0]['วันที่'].toISOString().slice(0,10),'2026-11-01');assert.equal(daily[0]['ต้นเสียหายสุทธิ'],10);assert.equal(daily[1]['ส่งจริงที่ทราบน้ำหนัก (กก.)'],1.8);assert.equal(daily[2]['เงินรับตามวันรับเงิน (บาท)'],150);assert.equal(daily[3]['เงินรับตามวันรับเงิน (บาท)'],150);
 const incomplete=records('คำสั่งจอง').find(row=>row['รหัสออเดอร์']==='unknown');assert.equal(incomplete['ส่งจริง (กก.)'],null);assert.equal(incomplete['ส่งเกิน/ขาดจากจอง (กก.)'],null);assert.equal(incomplete['ยอดค้างรับ (บาท)'],100);
 assert.ok(records('ข้อมูลที่ต้องตรวจสอบ').some(row=>row['ประเภท']==='วันที่ส่งสำเร็จ'));
 assert.equal(records('ประวัติแก้ไข')[0]['เหตุผล'],'Customer requested');
 assert.equal(records('รายชนิดผัก')[0]['ผลผลิตประมาณหลังเสียหาย (กก.)'],11);
 assert.equal(records('ลูกค้า')[0]['เงินรับจริง (บาท)'],150);
 if(process.env.REPORT_SAMPLE_PATH)fs.writeFileSync(process.env.REPORT_SAMPLE_PATH,Buffer.from(await download.arrayBuffer()));
});

test('legacy allocation stays unknown and invalid calendar ranges cannot export',async()=>{
 const {validateExportPeriod}=load('reportExportData');assert.throws(()=>validateExportPeriod('2026-02-30',''),/ถูกต้อง/);assert.throws(()=>validateExportPeriod('2026-11-02','2026-11-01'),/ไม่เกิน/);validateExportPeriod('2026-11-01','2026-11-01');
 const {exportVegetableReport}=load('exportVegetableReport');const round={id:'r1',name:'Legacy',status:'completed',notes:JSON.stringify({cropPlotIds:{oak:['p1']}}),round_items:[{id:'ia',crop_id:'oak',plant_count:100,crops:{name:'Oak'}}]};
 const operations={orders:[],rounds:[round],plots:[{id:'p1',name:'Plot 1',zone_name:'A'}],losses:[],closures:[],unsoldItems:[],audits:[]};
 await exportVegetableReport({orders:[],rounds:[round],selectedRoundId:'',exportedAt:new Date(),operations});
 const ExcelJS=require('../node_modules/exceljs'),book=new ExcelJS.Workbook();await book.xlsx.load(await download.arrayBuffer());
 assert.equal(book.getWorksheet('แปลงที่ปลูก').getRow(7).getCell(7).value,null);assert.match(book.getWorksheet('แปลงที่ปลูก').getRow(7).getCell(10).value,/ยังไม่มี/);
 assert.equal(book.getWorksheet('รายชนิดผัก').getRow(7).getCell(16).value,null);
});
