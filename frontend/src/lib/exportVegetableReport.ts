import { orderCustomerKey } from './orderCustomer.js';
import type { Order, OrderItem, PlantingRound, RoundItem } from '../types/index.js';

type ExportOptions = {
  orders: Order[];
  rounds: PlantingRound[];
  selectedRoundId: string;
  exportedAt: Date;
};

type SheetColumn = { header: string; key: string; width: number; format?: string };

const number = (value: unknown) => Number(value || 0);
const sum = <T,>(rows: T[], getValue: (row: T) => number) => rows.reduce((total, row) => total + getValue(row), 0);
const itemsOf = (order: Order) => order.order_items || [];
const cropName = (item: OrderItem) => item.round_items?.crops?.name || 'ไม่ระบุชนิดผัก';
const gross = (item: OrderItem) => number(item.qty_kg) * number(item.price_per_kg);
const discount = (item: OrderItem) => number(item.discount_amount);
const substituteQty = (item: OrderItem) => item.fulfillment_source === 'substitute' ? number(item.fulfilled_qty_kg) : 0;
const substituteCost = (item: OrderItem) => item.fulfillment_source === 'substitute'
  ? number(item.substitute_total_cost ?? substituteQty(item) * number(item.substitute_cost_per_kg)) : 0;
const orderStatus: Record<string, string> = {
  pending_confirmation: 'รอยืนยัน', confirmed: 'ยืนยันแล้ว', ready: 'พร้อมรับ/ส่ง',
  completed: 'สำเร็จแล้ว', cancelled: 'ยกเลิกแล้ว', no_show: 'ไม่มารับของ',
};
const roundStatus: Record<string, string> = {
  draft: 'ร่าง', growing: 'กำลังปลูก', booking_open: 'เปิดให้จอง',
  booking_closed: 'ปิดรับจอง', harvested: 'เก็บเกี่ยวแล้ว',
  completed: 'จบรอบแล้ว', cancelled: 'ยกเลิกรอบ',
};

// Excel has no timezone. Store Bangkok wall-clock values so dates look the same as the admin UI.
const bangkokDate = (value?: string | Date | null): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value || 0);
  return new Date(Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute')));
};

const dateOnly = (value?: string | null): Date | null => {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : bangkokDate(value);
};

export async function exportVegetableReport({ orders, rounds, selectedRoundId, exportedAt }: ExportOptions): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HydroFarm';
  workbook.created = exportedAt;

  const scopedRounds = selectedRoundId ? rounds.filter((round) => round.id === selectedRoundId) : rounds;
  const scopedOrders = selectedRoundId ? orders.filter((order) => order.round_id === selectedRoundId) : orders;
  const activeOrders = scopedOrders.filter((order) => order.status !== 'cancelled');
  const completedOrders = activeOrders.filter((order) => order.status === 'completed');
  const roundById = new Map(rounds.map((round) => [round.id, round]));
  const selectedName = selectedRoundId ? roundById.get(selectedRoundId)?.name || 'รอบที่เลือก' : 'ทุกรอบปลูก';
  const allItems = activeOrders.flatMap((order) => itemsOf(order));
  const completedItems = completedOrders.flatMap((order) => itemsOf(order));
  const openedKg = sum(activeOrders.flatMap(itemsOf), (item) => number(item.qty_kg));
  const bookedKg = sum(allItems, (item) => number(item.qty_kg));
  const soldKg = sum(completedItems, (item) => number(item.qty_kg));
  const substitutionKg = sum(allItems, substituteQty);
  const substitutionCost = sum(allItems, substituteCost);
  const generated = bangkokDate(exportedAt);

  const addSheet = (name: string, subtitle: string, columns: SheetColumn[]) => {
    const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 5 }] });
    sheet.columns = columns.map(({ header, key, width }) => ({ header, key, width }));
    sheet.spliceRows(1, 0, [name], [`ขอบเขต: ${selectedName}`], [subtitle], ['สร้างเมื่อ (เวลาไทย)', generated], []);
    sheet.mergeCells(1, 1, 1, columns.length);
    sheet.mergeCells(2, 1, 2, columns.length);
    sheet.mergeCells(3, 1, 3, columns.length);
    sheet.getRow(1).height = 30;
    sheet.getCell(1, 1).font = { name: 'Aptos', size: 17, bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF103E31' } };
    sheet.getRow(2).height = 22;
    sheet.getRow(3).height = 26;
    sheet.getCell(2, 1).font = { bold: true, color: { argb: 'FF166534' } };
    sheet.getCell(3, 1).font = { color: { argb: 'FF64748B' } };
    const heading = sheet.getRow(6);
    heading.height = 25;
    heading.eachCell((cell) => {
      cell.font = { name: 'Aptos', bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF176548' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    sheet.views = [{ state: 'frozen', ySplit: 6 }];
    return {
      sheet,
      finish: () => {
        columns.forEach((column, index) => {
          if (!column.format) return;
          sheet.getColumn(index + 1).numFmt = column.format;
        });
        sheet.getCell(4, 2).numFmt = 'dd/mm/yyyy hh:mm';
        if (sheet.rowCount > 6) sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: sheet.rowCount, column: columns.length } };
        for (let row = 7; row <= sheet.rowCount; row += 1) {
          if (row % 2 === 0) sheet.getRow(row).eachCell((cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F8F4' } };
          });
          sheet.getRow(row).alignment = { vertical: 'middle' };
        }
      },
    };
  };

  const countFormat = '#,##0';
  const kgFormat = '#,##0.00';
  const moneyFormat = '#,##0.00';
  const dayFormat = 'dd/mm/yyyy';
  const timeFormat = 'dd/mm/yyyy hh:mm';

  const summary = addSheet('ภาพรวม', 'ไม่รวมคำสั่งจองที่ยกเลิก ยอดขายนับเฉพาะสถานะสำเร็จ', [
    { header: 'ตัวชี้วัด', key: 'metric', width: 43 },
    { header: 'ค่า', key: 'value', width: 22 },
    { header: 'หน่วย', key: 'unit', width: 16 },
    { header: 'หลักเกณฑ์', key: 'definition', width: 68 },
  ]);
  const summaryRows: Array<[string, number, string, string]> = [
    ['รอบปลูกในรายงาน', scopedRounds.length, 'รอบ', 'จำนวนรอบที่อยู่ในขอบเขตที่เลือก'],
    ['คำสั่งจอง', activeOrders.length, 'ออเดอร์', 'ทุกสถานะ ยกเว้นยกเลิก'],
    ['ลูกค้าที่สั่งจอง', new Set(activeOrders.map(orderCustomerKey)).size, 'คน', 'นับลูกค้าไม่ซ้ำกันจากคำสั่งจองที่ไม่ยกเลิก'],
    ['จำนวนต้นที่ปลูก', sum(scopedRounds.flatMap(r=>r.round_items||[]),i=>number(i.plant_count)), 'ต้น', 'จำนวนต้นที่บันทึกตอนสร้างรอบปลูก'],
    ['ปริมาณที่จอง', bookedKg, 'กก.', 'รวมจำนวนผักในคำสั่งจองที่ไม่ยกเลิก'],
    ['ขายสำเร็จ', soldKg, 'กก.', 'รวมจำนวนผักในคำสั่งจองสถานะสำเร็จ'],
    ['อัตราสำเร็จต่อยอดจอง', openedKg > 0 ? soldKg / openedKg : 0, '%', 'ยอดตามออเดอร์สำเร็จ ÷ ยอดสั่งจอง'],
    ['มูลค่าจองสุทธิ', sum(activeOrders, (order) => number(order.total_amount)), 'บาท', 'ยอดสุทธิจากคำสั่งจองที่ไม่ยกเลิก รวมส่วนลดแล้ว'],
    ['ยอดขายสำเร็จสุทธิ', sum(completedOrders, (order) => number(order.total_amount)), 'บาท', 'ยอดสุทธิจากคำสั่งจองสถานะสำเร็จ'],
    ['ผักทดแทน', substitutionKg, 'กก.', 'ปริมาณผักที่ระบุว่าได้จากแหล่งอื่น'],
    ['ต้นทุนผักทดแทน', substitutionCost, 'บาท', 'ต้นทุนซื้อผักทดแทนที่บันทึกในรายการออเดอร์'],
  ];
  summaryRows.forEach(([metric, value, unit, definition]) => {
    const row = summary.sheet.addRow({ metric, value, unit, definition });
    row.getCell(2).numFmt = unit === '%' ? '0.0%' : unit === 'บาท' || unit === 'กก.' ? '#,##0.00' : countFormat;
  });
  summary.finish();

  const roundSheet = addSheet('รายรอบ', 'หนึ่งแถวต่อรอบปลูก จำนวนต้น ยอดสั่งจอง และออเดอร์สำเร็จ', [
    { header: 'รหัสรอบ', key: 'id', width: 38 }, { header: 'ชื่อรอบ', key: 'name', width: 32 },
    { header: 'สถานะรอบ', key: 'status', width: 18 }, { header: 'วันเก็บเกี่ยว/ส่งมอบ', key: 'date', width: 23, format: dayFormat },
    { header: 'จำนวนต้นที่ปลูก', key: 'opened', width: 19, format: countFormat },
    { header: 'จองแล้ว (กก.)', key: 'booked', width: 18, format: kgFormat },
    { header: 'ขายสำเร็จ (กก.)', key: 'sold', width: 20, format: kgFormat },
    { header: 'อัตราสำเร็จต่อยอดจอง', key: 'rate', width: 23, format: '0.0%' },
    { header: 'ออเดอร์', key: 'orders', width: 14, format: countFormat },
    { header: 'ลูกค้า', key: 'customers', width: 14, format: countFormat },
    { header: 'มูลค่าจองสุทธิ (บาท)', key: 'bookedAmount', width: 24, format: moneyFormat },
    { header: 'ยอดขายสำเร็จ (บาท)', key: 'soldAmount', width: 24, format: moneyFormat },
    { header: 'ผักทดแทน (กก.)', key: 'substituteKg', width: 20, format: kgFormat },
    { header: 'ต้นทุนทดแทน (บาท)', key: 'substituteCost', width: 23, format: moneyFormat },
  ]);
  scopedRounds.forEach((round) => {
    const related = activeOrders.filter((order) => order.round_id === round.id);
    const completed = related.filter((order) => order.status === 'completed');
    const opened = sum(round.round_items || [], (item) => number(item.plant_count));
    const sold = sum(completed.flatMap(itemsOf), (item) => number(item.qty_kg));
    const items = related.flatMap(itemsOf);
    roundSheet.sheet.addRow({
      id: round.id, name: round.name, status: roundStatus[round.status] || round.status, date: dateOnly(round.fulfillment_date),
      opened, booked: sum(items, (item) => number(item.qty_kg)), sold, rate: sum(items, i=>number(i.qty_kg)) > 0 ? sold / sum(items, i=>number(i.qty_kg)) : 0,
      orders: related.length, customers: new Set(related.map(orderCustomerKey)).size,
      bookedAmount: sum(related, (order) => number(order.total_amount)),
      soldAmount: sum(completed, (order) => number(order.total_amount)),
      substituteKg: sum(items, substituteQty), substituteCost: sum(items, substituteCost),
    });
  });
  roundSheet.finish();

  const cropSheet = addSheet('รายชนิดผัก', 'หนึ่งแถวต่อชนิดผักในแต่ละรอบ ปริมาณและมูลค่าจองไม่รวมออเดอร์ยกเลิก', [
    { header: 'รหัสรอบ', key: 'roundId', width: 38 }, { header: 'ชื่อรอบ', key: 'roundName', width: 30 },
    { header: 'ชนิดผัก', key: 'crop', width: 25 }, { header: 'จำนวนต้นที่ปลูก', key: 'opened', width: 21, format: countFormat },
    { header: 'จองแล้ว (กก.)', key: 'booked', width: 19, format: kgFormat },
    { header: 'ขายสำเร็จ (กก.)', key: 'sold', width: 21, format: kgFormat },
    { header: 'มูลค่าจองก่อนลด (บาท)', key: 'gross', width: 27, format: moneyFormat },
    { header: 'ส่วนลด (บาท)', key: 'discount', width: 19, format: moneyFormat },
    { header: 'มูลค่าจองหลังลด (บาท)', key: 'net', width: 27, format: moneyFormat },
    { header: 'ผักทดแทน (กก.)', key: 'substituteKg', width: 21, format: kgFormat },
    { header: 'ต้นทุนทดแทน (บาท)', key: 'substituteCost', width: 24, format: moneyFormat },
  ]);
  scopedRounds.forEach((round) => {
    (round.round_items || []).forEach((roundItem: RoundItem) => {
      const matching = activeOrders.flatMap(itemsOf).filter((item) => item.round_item_id === roundItem.id);
      const completed = completedOrders.flatMap(itemsOf).filter((item) => item.round_item_id === roundItem.id);
      const grossAmount = sum(matching, gross);
      const discounts = sum(matching, discount);
      cropSheet.sheet.addRow({
        roundId: round.id, roundName: round.name, crop: roundItem.crops?.name || roundItem.crop_name || 'ไม่ระบุชนิดผัก',
        opened: number(roundItem.plant_count), booked: sum(matching, (item) => number(item.qty_kg)),
        sold: sum(completed, (item) => number(item.qty_kg)), gross: grossAmount, discount: discounts,
        net: grossAmount - discounts, substituteKg: sum(matching, substituteQty),
        substituteCost: sum(matching, substituteCost),
      });
    });
  });
  cropSheet.finish();

  const orderSheet = addSheet('คำสั่งจอง', 'หนึ่งแถวต่อออเดอร์ รวมออเดอร์ยกเลิกเพื่อให้ตรวจสอบประวัติได้', [
    { header: 'รหัสออเดอร์', key: 'id', width: 38 }, { header: 'วันเวลาสั่งจอง', key: 'date', width: 23, format: timeFormat },
    { header: 'รหัสรอบ', key: 'roundId', width: 38 }, { header: 'ชื่อรอบ', key: 'roundName', width: 30 },
    { header: 'รหัสลูกค้า', key: 'customerId', width: 38 }, { header: 'ชื่อลูกค้า', key: 'customerName', width: 26 },
    { header: 'สถานะออเดอร์', key: 'status', width: 21 }, { header: 'สถานะชำระเงิน', key: 'payment', width: 21 },
    { header: 'ช่องทางสั่งจอง', key: 'orderSource', width: 24 },
    { header: 'ลูกค้าสั่งมาจาก', key: 'orderOrigin', width: 25 },
    { header: 'บัญชีที่ติดต่อ', key: 'sourceReference', width: 35 },
    { header: 'วิธีรับสินค้า', key: 'fulfillment', width: 20 },
    { header: 'จำนวนรายการ', key: 'itemCount', width: 17, format: countFormat },
    { header: 'ปริมาณจอง (กก.)', key: 'qty', width: 20, format: kgFormat },
    { header: 'มูลค่าก่อนลด (บาท)', key: 'gross', width: 24, format: moneyFormat },
    { header: 'ส่วนลด (บาท)', key: 'discount', width: 20, format: moneyFormat },
    { header: 'ยอดสุทธิ (บาท)', key: 'total', width: 21, format: moneyFormat },
  ]);
  [...scopedOrders].sort((a, b) => a.created_at.localeCompare(b.created_at)).forEach((order) => {
    const items = itemsOf(order);
    orderSheet.sheet.addRow({
      id: order.id, date: bangkokDate(order.created_at), roundId: order.round_id,
      roundName: roundById.get(order.round_id)?.name || order.planting_rounds?.name || '-',
      customerId: order.customer_id, customerName: order.customer_name || order.profiles?.full_name || '-',
      status: orderStatus[order.status] || order.status,
      payment: order.payment_status === 'paid' ? 'ชำระแล้ว' : 'รอชำระ',
      orderSource: order.order_source === 'facebook_chat' ? 'ออเดอร์นอกระบบ' : 'หน้าเว็บ',
      orderOrigin: order.admin_request_payload?.order_origin || '-',
      sourceReference: order.source_reference || '-',
      fulfillment: order.fulfillment_method === 'pickup' ? 'รับเองที่ฟาร์ม' : 'จัดส่งปกติ',
      itemCount: items.length, qty: sum(items, (item) => number(item.qty_kg)),
      gross: sum(items, gross), discount: sum(items, discount), total: number(order.total_amount),
    });
  });
  orderSheet.finish();

  const itemSheet = addSheet('รายการผัก', 'หนึ่งแถวต่อรายการผัก รวมออเดอร์ยกเลิก ใช้รหัสออเดอร์เชื่อมกับชีตคำสั่งจอง', [
    { header: 'รหัสออเดอร์', key: 'orderId', width: 38 }, { header: 'รหัสรอบ', key: 'roundId', width: 38 },
    { header: 'ชนิดผัก', key: 'crop', width: 27 }, { header: 'สถานะออเดอร์', key: 'status', width: 20 },
    { header: 'จำนวนจอง (กก.)', key: 'qty', width: 19, format: kgFormat },
    { header: 'ราคา/กก. (บาท)', key: 'price', width: 21, format: moneyFormat },
    { header: 'มูลค่าก่อนลด (บาท)', key: 'gross', width: 23, format: moneyFormat },
    { header: 'ส่วนลด (บาท)', key: 'discount', width: 20, format: moneyFormat },
    { header: 'มูลค่าหลังลด (บาท)', key: 'net', width: 23, format: moneyFormat },
    { header: 'ชั่งจัดจริงผักฟาร์ม (กก.)', key: 'ownWeighed', width: 26, format: kgFormat },
    { header: 'ผักทดแทน (กก.)', key: 'fulfilled', width: 21, format: kgFormat },
    { header: 'แหล่งสินค้า', key: 'source', width: 18 },
  ]);
  scopedOrders.forEach((order) => itemsOf(order).forEach((item) => itemSheet.sheet.addRow({
    orderId: order.id, roundId: order.round_id, crop: cropName(item), status: orderStatus[order.status] || order.status,
    qty: number(item.qty_kg), price: number(item.price_per_kg), gross: gross(item),
    discount: discount(item), net: gross(item) - discount(item),
    ownWeighed: item.own_qty_kg == null ? null : number(item.own_qty_kg),
    fulfilled: item.fulfillment_source === 'substitute' ? number(item.fulfilled_qty_kg) : 0,
    source: item.fulfillment_source === 'substitute' ? 'ผักทดแทน' : item.fulfillment_source === 'own' ? 'จากฟาร์ม' : '-',
  })));
  itemSheet.finish();

  const customerSheet = addSheet('ลูกค้า', 'หนึ่งแถวต่อลูกค้าที่มีคำสั่งจองไม่ยกเลิก เรียงตามจำนวนออเดอร์', [
    { header: 'รหัสลูกค้า', key: 'id', width: 38 }, { header: 'ชื่อลูกค้า', key: 'name', width: 27 },
    { header: 'เบอร์ติดต่อ', key: 'phone', width: 20 }, { header: 'จำนวนออเดอร์', key: 'orders', width: 20, format: countFormat },
    { header: 'ปริมาณจอง (กก.)', key: 'qty', width: 22, format: kgFormat },
    { header: 'มูลค่าจองสุทธิ (บาท)', key: 'amount', width: 26, format: moneyFormat },
    { header: 'ออเดอร์สำเร็จ', key: 'completed', width: 21, format: countFormat },
  ]);
  const customers = new Map<string, { id: string; name: string; phone: string; orders: number; qty: number; amount: number; completed: number }>();
  activeOrders.forEach((order) => {
    const row = customers.get(orderCustomerKey(order)) || {
      id: orderCustomerKey(order), name: order.customer_name || order.profiles?.full_name || '-',
      phone: order.contact_phone || order.profiles?.phone || '-', orders: 0, qty: 0, amount: 0, completed: 0,
    };
    row.orders += 1;
    row.qty += sum(itemsOf(order), (item) => number(item.qty_kg));
    row.amount += number(order.total_amount);
    if (order.status === 'completed') row.completed += 1;
    customers.set(orderCustomerKey(order), row);
  });
  [...customers.values()].sort((a, b) => b.orders - a.orders || b.qty - a.qty).forEach((customer) => customerSheet.sheet.addRow(customer));
  customerSheet.finish();

  const substituteSheet = addSheet('ผักทดแทน', 'หนึ่งแถวต่อรายการที่ซื้อจากแหล่งอื่นในออเดอร์ที่ไม่ยกเลิก', [
    { header: 'รหัสออเดอร์', key: 'orderId', width: 38 }, { header: 'ชื่อรอบ', key: 'roundName', width: 29 },
    { header: 'ชนิดผัก', key: 'crop', width: 25 }, { header: 'จำนวนจอง (กก.)', key: 'booked', width: 21, format: kgFormat },
    { header: 'จำนวนทดแทน (กก.)', key: 'qty', width: 23, format: kgFormat },
    { header: 'ต้นทุนรวม (บาท)', key: 'cost', width: 22, format: moneyFormat },
    { header: 'ต้นทุน/กก. (บาท)', key: 'costPerKg', width: 23, format: moneyFormat },
    { header: 'ผู้ขาย/แหล่งที่ซื้อ', key: 'supplier', width: 31 },
    { header: 'หมายเหตุ', key: 'note', width: 35 },
  ]);
  activeOrders.forEach((order) => itemsOf(order).filter((item) => item.fulfillment_source === 'substitute').forEach((item) => {
    const qty = substituteQty(item);
    const cost = substituteCost(item);
    substituteSheet.sheet.addRow({
      orderId: order.id, roundName: roundById.get(order.round_id)?.name || order.planting_rounds?.name || '-',
      crop: cropName(item), booked: number(item.qty_kg), qty, cost,
      costPerKg: qty > 0 ? cost / qty : 0,
      supplier: item.substitute_supplier || '-', note: item.substitute_note || '-',
    });
  }));
  substituteSheet.finish();

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const fileDate = bangkokDate(exportedAt)!;
  const fileStamp = `${fileDate.getUTCFullYear()}${String(fileDate.getUTCMonth() + 1).padStart(2, '0')}${String(fileDate.getUTCDate()).padStart(2, '0')}`;
  const link = document.createElement('a');
  link.href = url;
  link.download = `hydrofarm-vegetable-report-${fileStamp}${selectedRoundId ? `-${selectedRoundId.slice(0, 8)}` : ''}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
