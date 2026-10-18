import type { EquipmentOrder, EquipmentOrderItem, EquipmentProduct } from '../types/index.js';

export type EquipmentReportPeriod = '7' | '30' | '90' | 'all';

type ExportOrder = EquipmentOrder & {
  paid_at?: string | null;
  shipped_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
};

type StockTransaction = {
  id: string;
  product_id: string;
  order_id?: string | null;
  transaction_type: string;
  quantity_change: number;
  stock_after: number;
  note?: string | null;
  created_at: string;
};

export type EquipmentExportData = {
  orders: ExportOrder[];
  products: EquipmentProduct[];
  transactions: StockTransaction[];
};

type Column = { header: string; key: string; width: number; format?: string };
const number = (value: unknown) => Number(value || 0);
const sum = <T,>(rows: T[], select: (row: T) => number) => rows.reduce((total, row) => total + select(row), 0);
const orderItems = (order: ExportOrder) => order.equipment_order_items || [];
const lineAmount = (item: EquipmentOrderItem) => number(item.quantity) * number(item.unit_price);
const statusLabels: Record<string, string> = {
  pending_confirmation: 'รอยืนยัน', confirmed: 'ยืนยันแล้ว', processing: 'กำลังจัดเตรียม',
  shipped: 'จัดส่งแล้ว', completed: 'สำเร็จ', cancelled: 'ยกเลิก',
};
const movementLabels: Record<string, string> = {
  restock: 'รับเข้า', adjustment: 'ปรับยอด', sale: 'ตัดขาย', cancellation: 'คืนจากยกเลิก',
};

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

const bangkokDay = (value: string) => {
  const date = bangkokDate(value);
  return date ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}` : '';
};

export async function exportEquipmentReport(data: EquipmentExportData, period: EquipmentReportPeriod, exportedAt: Date): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HydroFarm Supply';
  workbook.created = exportedAt;

  const scope = period === 'all' ? 'ทั้งหมด' : `ย้อนหลัง ${period} วัน`;
  const orders = [...data.orders].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const saleOrders = orders.filter((order) => order.status === 'shipped' || order.status === 'completed');
  const activeOrders = orders.filter((order) => order.status !== 'cancelled');
  const saleItems = saleOrders.flatMap(orderItems);
  const productById = new Map(data.products.map((product) => [product.id, product]));
  const productBySku = new Map(data.products.map((product) => [product.sku, product]));
  const moneyFormat = '#,##0.00';
  const countFormat = '#,##0';
  const timeFormat = 'dd/mm/yyyy hh:mm';

  const addSheet = (name: string, subtitle: string, columns: Column[]) => {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = columns.map(({ header, key, width }) => ({ header, key, width }));
    sheet.spliceRows(1, 0, [name], [`ช่วงข้อมูล: ${scope}`], [subtitle], ['สร้างเมื่อ (เวลาไทย)', bangkokDate(exportedAt)], []);
    sheet.mergeCells(1, 1, 1, columns.length);
    sheet.mergeCells(2, 1, 2, columns.length);
    sheet.mergeCells(3, 1, 3, columns.length);
    sheet.getRow(1).height = 30;
    sheet.getCell(1, 1).font = { name: 'Aptos', size: 17, bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF103E31' } };
    sheet.getCell(2, 1).font = { bold: true, color: { argb: 'FF166534' } };
    sheet.getCell(3, 1).font = { color: { argb: 'FF64748B' } };
    sheet.getRow(2).height = 22;
    sheet.getRow(3).height = 26;
    const heading = sheet.getRow(6);
    heading.height = 25;
    heading.eachCell((cell) => {
      cell.font = { name: 'Aptos', bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF176548' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    sheet.views = [{ state: 'frozen', ySplit: 6 }];
    const finish = () => {
      columns.forEach((column, index) => { if (column.format) sheet.getColumn(index + 1).numFmt = column.format; });
      sheet.getCell(4, 2).numFmt = timeFormat;
      if (sheet.rowCount > 6) sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: sheet.rowCount, column: columns.length } };
      for (let row = 7; row <= sheet.rowCount; row += 1) {
        if (row % 2 === 0) sheet.getRow(row).eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F8F4' } };
        });
        sheet.getRow(row).alignment = { vertical: 'middle' };
      }
    };
    return { sheet, finish };
  };

  const summary = addSheet('ภาพรวม', 'ยอดขายนับออเดอร์จัดส่งแล้วหรือสำเร็จ สต็อกเป็นยอดคงเหลือ ณ เวลาส่งออก', [
    { header: 'ตัวชี้วัด', key: 'metric', width: 42 }, { header: 'ค่า', key: 'value', width: 22 },
    { header: 'หน่วย', key: 'unit', width: 15 }, { header: 'หลักเกณฑ์', key: 'definition', width: 73 },
  ]);
  const saleProductsAmount = sum(saleItems, lineAmount);
  const saleShipping = sum(saleOrders, (order) => number(order.shipping_fee));
  const summaryRows: Array<[string, number, string, string]> = [
    ['คำสั่งซื้อทั้งหมด', orders.length, 'ออเดอร์', 'รวมทุกสถานะในช่วงวันที่เลือก'],
    ['ออเดอร์จัดส่งแล้ว/สำเร็จ', saleOrders.length, 'ออเดอร์', 'ใช้คำนวณยอดขายและจำนวนชิ้นที่ขายได้'],
    ['ออเดอร์ยกเลิก', orders.filter((order) => order.status === 'cancelled').length, 'ออเดอร์', 'รวมออเดอร์สถานะยกเลิก'],
    ['ออเดอร์รอยืนยัน', orders.filter((order) => order.status === 'pending_confirmation').length, 'ออเดอร์', 'ออเดอร์ที่ผู้ดูแลยังไม่ยืนยัน'],
    ['ออเดอร์ชำระแล้ว', orders.filter((order) => order.payment_status === 'paid').length, 'ออเดอร์', 'นับตามสถานะชำระเงิน ไม่ใช่การรับเงินสดจริง'],
    ['ออเดอร์ยังไม่ชำระ', activeOrders.filter((order) => order.payment_status !== 'paid').length, 'ออเดอร์', 'ไม่นับออเดอร์ยกเลิก'],
    ['สินค้าที่ขายได้', sum(saleItems, (item) => number(item.quantity)), 'ชิ้น', 'จำนวนชิ้นในออเดอร์จัดส่งแล้วหรือสำเร็จ'],
    ['ยอดขายสินค้า', saleProductsAmount, 'บาท', 'รวมจำนวนชิ้น × ราคาต่อชิ้น เฉพาะออเดอร์จัดส่งแล้วหรือสำเร็จ'],
    ['ค่าจัดส่งจากออเดอร์ขาย', saleShipping, 'บาท', 'รวมค่าส่งของออเดอร์จัดส่งแล้วหรือสำเร็จ'],
    ['ยอดขายรวมค่าส่ง', sum(saleOrders, (order) => number(order.total_amount)), 'บาท', 'ยอดรวมออเดอร์จัดส่งแล้วหรือสำเร็จ อาจยังไม่ชำระเงิน'],
    ['สินค้าใกล้หมด', data.products.filter((product) => number(product.stock_quantity) <= number(product.low_stock_threshold)).length, 'รายการ', 'สต็อกปัจจุบันเท่ากับหรือต่ำกว่าจุดแจ้งเตือน'],
  ];
  summaryRows.forEach(([metric, value, unit, definition]) => {
    const row = summary.sheet.addRow({ metric, value, unit, definition });
    row.getCell(2).numFmt = unit === 'บาท' ? moneyFormat : countFormat;
  });
  summary.finish();

  const daily = addSheet('ยอดขายรายวัน', 'จัดกลุ่มตามวันสั่งซื้อของออเดอร์ที่จัดส่งแล้วหรือสำเร็จ ไม่ใช่วันที่รับชำระ', [
    { header: 'วันสั่งซื้อ', key: 'date', width: 20, format: 'dd/mm/yyyy' },
    { header: 'จำนวนออเดอร์', key: 'orders', width: 19, format: countFormat },
    { header: 'จำนวนชิ้น', key: 'units', width: 18, format: countFormat },
    { header: 'ยอดสินค้า (บาท)', key: 'productsAmount', width: 22, format: moneyFormat },
    { header: 'ค่าจัดส่ง (บาท)', key: 'shippingAmount', width: 22, format: moneyFormat },
    { header: 'ยอดรวม (บาท)', key: 'total', width: 22, format: moneyFormat },
  ]);
  const byDay = new Map<string, { date: Date | null; orders: number; units: number; productsAmount: number; shippingAmount: number; total: number }>();
  saleOrders.forEach((order) => {
    const key = bangkokDay(order.created_at);
    const [year, month, day] = key.split('-').map(Number);
    const row = byDay.get(key) || { date: new Date(Date.UTC(year, month - 1, day)), orders: 0, units: 0, productsAmount: 0, shippingAmount: 0, total: 0 };
    row.orders += 1;
    row.units += sum(orderItems(order), (item) => number(item.quantity));
    row.productsAmount += sum(orderItems(order), lineAmount);
    row.shippingAmount += number(order.shipping_fee);
    row.total += number(order.total_amount);
    byDay.set(key, row);
  });
  [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([, row]) => daily.sheet.addRow(row));
  daily.finish();

  const soldBySku = new Map<string, { units: number; revenue: number }>();
  saleItems.forEach((item) => {
    const row = soldBySku.get(item.sku) || { units: 0, revenue: 0 };
    row.units += number(item.quantity);
    row.revenue += lineAmount(item);
    soldBySku.set(item.sku, row);
  });
  const products = addSheet('สินค้าและสต็อก', 'สต็อกเป็นยอดปัจจุบัน ส่วนจำนวนขายและยอดขายอิงช่วงวันที่เลือก', [
    { header: 'รหัสสินค้า', key: 'sku', width: 20 }, { header: 'ชื่อสินค้า', key: 'name', width: 33 },
    { header: 'หมวดหมู่', key: 'category', width: 24 }, { header: 'แสดงในร้าน', key: 'active', width: 17 },
    { header: 'ราคาปัจจุบัน (บาท)', key: 'price', width: 24, format: moneyFormat },
    { header: 'สต็อกคงเหลือ (ชิ้น)', key: 'stock', width: 24, format: countFormat },
    { header: 'จุดแจ้งเตือน (ชิ้น)', key: 'threshold', width: 24, format: countFormat },
    { header: 'สถานะสต็อก', key: 'stockStatus', width: 19 },
    { header: 'ขายได้ (ชิ้น)', key: 'sold', width: 19, format: countFormat },
    { header: 'ยอดขายสินค้า (บาท)', key: 'revenue', width: 25, format: moneyFormat },
  ]);
  data.products.forEach((product) => {
    const sold = soldBySku.get(product.sku);
    products.sheet.addRow({
      sku: product.sku, name: product.name, category: product.category,
      active: product.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน', price: number(product.price),
      stock: number(product.stock_quantity), threshold: number(product.low_stock_threshold),
      stockStatus: number(product.stock_quantity) <= number(product.low_stock_threshold) ? 'ควรเติมสต็อก' : 'เพียงพอ',
      sold: sold?.units || 0, revenue: sold?.revenue || 0,
    });
  });
  products.finish();

  const orderSheet = addSheet('คำสั่งซื้อ', 'หนึ่งแถวต่อออเดอร์ รวมออเดอร์ยกเลิกเพื่อให้ตรวจสอบประวัติได้', [
    { header: 'รหัสออเดอร์', key: 'id', width: 38 }, { header: 'วันเวลาสั่งซื้อ', key: 'created', width: 23, format: timeFormat },
    { header: 'รหัสลูกค้า', key: 'customerId', width: 38 }, { header: 'ชื่อลูกค้า', key: 'customer', width: 27 },
    { header: 'เบอร์ติดต่อ', key: 'phone', width: 20 }, { header: 'สถานะออเดอร์', key: 'status', width: 23 },
    { header: 'สถานะชำระเงิน', key: 'payment', width: 22 }, { header: 'วิธีชำระเงิน', key: 'paymentMethod', width: 24 },
    { header: 'จำนวนชิ้น', key: 'units', width: 17, format: countFormat },
    { header: 'ยอดสินค้า (บาท)', key: 'productsAmount', width: 22, format: moneyFormat },
    { header: 'ค่าจัดส่ง (บาท)', key: 'shipping', width: 21, format: moneyFormat },
    { header: 'ยอดรวม (บาท)', key: 'total', width: 21, format: moneyFormat },
    { header: 'เลขพัสดุ', key: 'tracking', width: 25 }, { header: 'ที่อยู่จัดส่ง', key: 'address', width: 48 },
    { header: 'วันที่ชำระ', key: 'paid', width: 23, format: timeFormat },
    { header: 'วันที่จัดส่ง', key: 'shipped', width: 23, format: timeFormat },
    { header: 'วันที่สำเร็จ', key: 'completed', width: 23, format: timeFormat },
    { header: 'วันที่ยกเลิก', key: 'cancelled', width: 23, format: timeFormat },
  ]);
  orders.forEach((order) => orderSheet.sheet.addRow({
    id: order.id, created: bangkokDate(order.created_at), customerId: order.customer_id,
    customer: order.profiles?.full_name || '-', phone: order.contact_phone || order.profiles?.phone || '-',
    status: statusLabels[order.status] || order.status,
    payment: order.payment_status === 'paid' ? 'ชำระแล้ว' : 'รอชำระ',
    paymentMethod: order.payment_method === 'cash_on_delivery' ? 'เก็บเงินปลายทาง' : 'โอนเงิน (ออเดอร์เดิม)',
    units: sum(orderItems(order), (item) => number(item.quantity)),
    productsAmount: sum(orderItems(order), lineAmount), shipping: number(order.shipping_fee),
    total: number(order.total_amount), tracking: order.tracking_number || '-',
    address: order.shipping_address, paid: bangkokDate(order.paid_at),
    shipped: bangkokDate(order.shipped_at), completed: bangkokDate(order.completed_at),
    cancelled: bangkokDate(order.cancelled_at),
  }));
  orderSheet.finish();

  const items = addSheet('รายการสินค้า', 'หนึ่งแถวต่อสินค้าในออเดอร์ รวมออเดอร์ยกเลิก ใช้รหัสออเดอร์เชื่อมกับชีตคำสั่งซื้อ', [
    { header: 'รหัสออเดอร์', key: 'orderId', width: 38 }, { header: 'วันเวลาสั่งซื้อ', key: 'created', width: 23, format: timeFormat },
    { header: 'รหัสสินค้า', key: 'sku', width: 20 }, { header: 'ชื่อสินค้า ณ วันที่ขาย', key: 'name', width: 35 },
    { header: 'หมวดหมู่ปัจจุบัน', key: 'category', width: 25 }, { header: 'สถานะออเดอร์', key: 'status', width: 23 },
    { header: 'จำนวนชิ้น', key: 'quantity', width: 19, format: countFormat },
    { header: 'ราคาต่อชิ้น (บาท)', key: 'unitPrice', width: 24, format: moneyFormat },
    { header: 'มูลค่ารายการ (บาท)', key: 'amount', width: 24, format: moneyFormat },
  ]);
  orders.forEach((order) => orderItems(order).forEach((item) => {
    const product = (item.product_id && productById.get(item.product_id)) || productBySku.get(item.sku);
    items.sheet.addRow({
      orderId: order.id, created: bangkokDate(order.created_at), sku: item.sku,
      name: item.product_name, category: product?.category || '-',
      status: statusLabels[order.status] || order.status,
      quantity: number(item.quantity), unitPrice: number(item.unit_price), amount: lineAmount(item),
    });
  }));
  items.finish();

  const customerSheet = addSheet('ลูกค้า', 'หนึ่งแถวต่อลูกค้าที่มีคำสั่งซื้อไม่ยกเลิกในช่วงวันที่เลือก', [
    { header: 'รหัสลูกค้า', key: 'id', width: 38 }, { header: 'ชื่อลูกค้า', key: 'name', width: 27 },
    { header: 'เบอร์ติดต่อ', key: 'phone', width: 21 }, { header: 'จำนวนออเดอร์', key: 'orders', width: 20, format: countFormat },
    { header: 'จำนวนชิ้นที่สั่ง', key: 'units', width: 22, format: countFormat },
    { header: 'มูลค่าสั่งซื้อรวม (บาท)', key: 'booked', width: 27, format: moneyFormat },
    { header: 'ออเดอร์จัดส่งแล้ว/สำเร็จ', key: 'soldOrders', width: 28, format: countFormat },
    { header: 'ยอดออเดอร์จัดส่งแล้ว/สำเร็จ (บาท)', key: 'soldAmount', width: 36, format: moneyFormat },
  ]);
  const byCustomer = new Map<string, { id: string; name: string; phone: string; orders: number; units: number; booked: number; soldOrders: number; soldAmount: number }>();
  activeOrders.forEach((order) => {
    const row = byCustomer.get(order.customer_id) || {
      id: order.customer_id, name: order.profiles?.full_name || '-', phone: order.contact_phone || order.profiles?.phone || '-',
      orders: 0, units: 0, booked: 0, soldOrders: 0, soldAmount: 0,
    };
    row.orders += 1;
    row.units += sum(orderItems(order), (item) => number(item.quantity));
    row.booked += number(order.total_amount);
    if (order.status === 'shipped' || order.status === 'completed') {
      row.soldOrders += 1;
      row.soldAmount += number(order.total_amount);
    }
    byCustomer.set(order.customer_id, row);
  });
  [...byCustomer.values()].sort((a, b) => b.orders - a.orders || b.booked - a.booked).forEach((row) => customerSheet.sheet.addRow(row));
  customerSheet.finish();

  const stock = addSheet('ประวัติสต็อก', 'รายการเคลื่อนไหวสต็อกในช่วงวันที่เลือก ค่าเปลี่ยนแปลงติดลบคือสต็อกลด', [
    { header: 'วันเวลา (เวลาไทย)', key: 'date', width: 24, format: timeFormat },
    { header: 'รหัสสินค้า', key: 'sku', width: 20 }, { header: 'ชื่อสินค้า', key: 'product', width: 34 },
    { header: 'ประเภท', key: 'type', width: 23 }, { header: 'เปลี่ยนแปลง (ชิ้น)', key: 'change', width: 23, format: '+#,##0;-#,##0;0' },
    { header: 'คงเหลือหลังรายการ (ชิ้น)', key: 'after', width: 29, format: countFormat },
    { header: 'รหัสออเดอร์ที่เกี่ยวข้อง', key: 'orderId', width: 38 },
    { header: 'หมายเหตุ', key: 'note', width: 48 },
  ]);
  [...data.transactions].sort((a, b) => a.created_at.localeCompare(b.created_at)).forEach((transaction) => {
    const product = productById.get(transaction.product_id);
    stock.sheet.addRow({
      date: bangkokDate(transaction.created_at), sku: product?.sku || '-', product: product?.name || '-',
      type: movementLabels[transaction.transaction_type] || transaction.transaction_type,
      change: number(transaction.quantity_change), after: number(transaction.stock_after),
      orderId: transaction.order_id || '-', note: transaction.note || '-',
    });
  });
  stock.finish();

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const fileDate = bangkokDate(exportedAt)!;
  const stamp = `${fileDate.getUTCFullYear()}${String(fileDate.getUTCMonth() + 1).padStart(2, '0')}${String(fileDate.getUTCDate()).padStart(2, '0')}`;
  const link = document.createElement('a');
  link.href = url;
  link.download = `hydrofarm-equipment-report-${stamp}-${period === 'all' ? 'all' : `${period}d`}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
