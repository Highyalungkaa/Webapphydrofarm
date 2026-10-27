const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../../backend/node_modules/typescript');
let download;
function load(name){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../src/lib',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{
 exports,Blob,URL:{createObjectURL(blob){download=blob;return'blob:test';},revokeObjectURL(){}},window:{setTimeout(){}},document:{createElement(){return{click(){},remove(){}};},body:{appendChild(){}}},
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
