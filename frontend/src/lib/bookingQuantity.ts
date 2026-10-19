export function parseBookingQuantity(value: string): { qty: number; error?: never } | { qty?: never; error: string } {
  if (!value.trim()) return { error: 'กรุณากรอกจำนวนกิโลกรัมที่ต้องการ' };
  const qty = Number(value);
  if (!Number.isFinite(qty) || qty < 0.5) return { error: 'จำนวนสั่งขั้นต่ำคือ 0.5 กก.' };
  if (Math.abs(qty * 100 - Math.round(qty * 100)) > 0.000001) return { error: 'กรอกจำนวนได้ไม่เกิน 2 ตำแหน่งทศนิยม' };
  return { qty: Math.round(qty * 100) / 100 };
}

export function formatKg(qty: number): string {
  return qty.toLocaleString('th-TH', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}
