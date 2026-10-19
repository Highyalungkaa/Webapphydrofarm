import { EquipmentPaymentSlip, EquipmentPaymentBadge } from '../../components/common/EquipmentPaymentSlip.js';
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, Check, Clock3, ImagePlus, MapPin, PackageCheck, Search, Truck, X } from 'lucide-react';
import { api } from '../../lib/api.js';
import { EquipmentOrder, EquipmentOrderStatus } from '../../types/index.js';
import { Badge } from '../../components/common/Badge.js';

const money = (n: number) => `฿${Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
const bangkokDate = (value: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
const statusNames: Record<EquipmentOrderStatus, string> = { pending_confirmation: 'รอตรวจสอบ', confirmed: 'ยืนยันแล้ว', processing: 'กำลังจัดเตรียม', shipped: 'จัดส่งแล้ว', completed: 'สำเร็จ', cancelled: 'ยกเลิก' };
const nextStatuses: Record<EquipmentOrderStatus, EquipmentOrderStatus[]> = { pending_confirmation: ['confirmed','cancelled'], confirmed: ['processing','cancelled'], processing: ['shipped','cancelled'], shipped: ['completed'], completed: [], cancelled: [] };
const statusStyle = (status: EquipmentOrderStatus) => status === 'completed' ? 'bg-emerald-100 text-emerald-800' : status === 'cancelled' ? 'bg-rose-100 text-rose-800' : status === 'shipped' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-900';
type Draft = { status: EquipmentOrderStatus; payment_status: 'paid'|'unpaid'; tracking_number: string };
const draftFrom = (order: EquipmentOrder): Draft => ({ status: order.status, payment_status: order.payment_status, tracking_number: order.tracking_number || '' });
const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = () => reject(new Error('อ่านไฟล์รูปภาพไม่สำเร็จ'));
  reader.readAsDataURL(file);
});

export const AdminEquipmentOrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<EquipmentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [shipmentMessage, setShipmentMessage] = useState('');
  const [shipmentImageFile, setShipmentImageFile] = useState<File | null>(null);
  const [shipmentImagePreview, setShipmentImagePreview] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setOrders(await api.get<EquipmentOrder[]>('/equipment/admin/orders')); }
    catch (err: any) { setError(err.message || 'โหลดคำสั่งซื้อไม่สำเร็จ'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const selectedOrder = orders.find((order) => order.id === selectedId) || null;
  const filtered = useMemo(() => orders.filter((order) => {
    const orderDate = bangkokDate(order.created_at);
    return (statusFilter === 'all' || order.status === statusFilter)
      && (!dateFrom || orderDate >= dateFrom)
      && (!dateTo || orderDate <= dateTo)
      && `${order.id} ${order.profiles?.full_name || ''} ${order.profiles?.email || ''} ${order.contact_phone}`.toLowerCase().includes(query.toLowerCase());
  }), [orders, statusFilter, dateFrom, dateTo, query]);

  const openOrder = (order: EquipmentOrder) => { setSelectedId(order.id); setDraft(draftFrom(order)); setShipmentMessage(order.delivery_update_message || ''); setShipmentImageFile(null); setShipmentImagePreview(''); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const save = async () => {
    if (!selectedOrder || !draft) return;
    if (draft.status === 'shipped' && selectedOrder.status !== 'shipped' && !shipmentImageFile && !selectedOrder.delivery_update_image_url) { setError('กรุณาแนบรูปก่อนยืนยันว่าจัดส่งแล้ว'); return; }
    if (draft.status === 'shipped' && selectedOrder.status !== 'shipped' && !shipmentMessage.trim()) { setError('กรุณาเขียนข้อความแจ้งลูกค้าก่อนยืนยันว่าจัดส่งแล้ว'); return; }
    setError(''); setSaving(true);
    try {
      let imageUrl = selectedOrder.delivery_update_image_url || null;
      const savingShipmentUpdate = draft.status === 'shipped' || selectedOrder.status === 'shipped';
      if (savingShipmentUpdate && shipmentImageFile) {
        const uploaded = await api.post<{ image_url: string }>(`/equipment/admin/orders/${selectedOrder.id}/shipping-image`, { mime_type: shipmentImageFile.type, data: await fileToBase64(shipmentImageFile) });
        imageUrl = uploaded.image_url;
      }
      await api.patch(`/equipment/admin/orders/${selectedOrder.id}`, { ...draft, ...(savingShipmentUpdate ? { delivery_update_image_url: imageUrl, delivery_update_message: shipmentMessage.trim() || null } : {}) });
      await load();
      setDraft(draft);
      if (savingShipmentUpdate) { setShipmentImageFile(null); setShipmentImagePreview(''); }
    } catch (err: any) { setError(err.message || 'อัปเดตออเดอร์ไม่สำเร็จ'); }
    finally { setSaving(false); }
  };

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[.18em] text-emerald-700">HydroFarm Supply</p><h1 className="mt-1 text-2xl font-black text-slate-950">คำสั่งซื้ออุปกรณ์</h1><p className="mt-1 text-sm text-slate-500">ดูรายการทั้งหมดก่อน แล้วเลือกออเดอร์เพื่อจัดการรายละเอียด</p></div><div className="rounded-2xl bg-emerald-100 px-4 py-3 text-sm font-extrabold text-emerald-900">ทั้งหมด {orders.length} ออเดอร์</div></div>
    {error && <div className="flex items-start justify-between gap-3 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700"><span>{error}</span><button onClick={() => setError('')} className="shrink-0">ปิด</button></div>}

    {selectedOrder && draft ? <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4 sm:px-6"><div className="flex items-center gap-3"><button onClick={() => { setSelectedId(null); setDraft(null); setError(''); }} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-100" title="กลับไปรายการ"><ArrowLeft className="h-4 w-4" /></button><div><p className="text-[11px] font-bold text-slate-400">ออเดอร์ #{selectedOrder.id.slice(0,8)} · {new Date(selectedOrder.created_at).toLocaleString('th-TH')}</p><h2 className="mt-0.5 font-black text-slate-900">{selectedOrder.profiles?.full_name || selectedOrder.profiles?.email || 'ลูกค้า'}</h2><p className="text-xs text-slate-500">{selectedOrder.contact_phone}</p></div></div><div className="text-right"><span className={`rounded-full px-3 py-1 text-xs font-black ${statusStyle(selectedOrder.status)}`}>{statusNames[selectedOrder.status]}</span><p className="mt-2 text-lg font-black text-emerald-800">{money(selectedOrder.total_amount)}</p></div></header>
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.1fr_.9fr]">
        <div className="space-y-5"><section><h3 className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">สินค้าในออเดอร์</h3><div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 px-4">{(selectedOrder.equipment_order_items || []).map((item) => <div key={item.id} className="flex justify-between gap-3 py-3 text-sm"><div><p className="font-extrabold text-slate-900">{item.product_name}</p><p className="mt-0.5 text-xs text-slate-500">{item.sku} · {money(Number(item.unit_price))} × {item.quantity}</p></div><span className="shrink-0 font-bold">{money(Number(item.unit_price) * item.quantity)}</span></div>)}</div><div className="mt-3 space-y-1 px-1 text-sm"><div className="flex justify-between text-slate-500"><span>ค่าจัดส่ง</span><span>{money(Number(selectedOrder.shipping_fee || 0))}</span></div><div className="flex justify-between border-t border-slate-100 pt-2 font-black text-slate-900"><span>ยอดรวมสุทธิ</span><span>{money(selectedOrder.total_amount)}</span></div></div></section>
          <EquipmentPaymentSlip order={selectedOrder} admin />
          <section className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700"><h3 className="mb-2 font-black text-slate-900">ข้อมูลจัดส่ง</h3><p><MapPin className="mr-1 inline h-4 w-4 text-emerald-700" />{selectedOrder.shipping_address}</p><p className="mt-1"><Truck className="mr-1 inline h-4 w-4 text-emerald-700" />จัดส่งปกติ · {selectedOrder.contact_phone}</p><p className="mt-1">ชำระ: {selectedOrder.payment_method === 'transfer' ? 'โอนเงิน' : 'เก็บเงินปลายทาง'}</p>{selectedOrder.note && <p className="mt-1">หมายเหตุ: {selectedOrder.note}</p>}{selectedOrder.tracking_number && <p className="mt-2 rounded-lg bg-sky-100 px-3 py-2 font-extrabold text-sky-900">เลขพัสดุ: {selectedOrder.tracking_number}</p>}{selectedOrder.delivery_update_message && <div className="mt-3 rounded-xl border border-sky-200 bg-white p-3"><p className="font-extrabold text-sky-950">ข้อความแจ้งลูกค้า</p><p className="mt-1 whitespace-pre-wrap text-slate-700">{selectedOrder.delivery_update_message}</p>{selectedOrder.delivery_update_image_url && <img src={selectedOrder.delivery_update_image_url} alt="รูปอัปเดตการจัดส่ง" className="mt-3 max-h-72 w-full rounded-lg bg-slate-100 object-contain" />}</div>}</section>
        </div>
        <section className="h-fit space-y-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 sm:p-5"><div><h3 className="flex items-center gap-2 font-black text-slate-900"><PackageCheck className="h-5 w-5 text-emerald-700" />จัดการออเดอร์นี้</h3><p className="mt-1 text-xs text-slate-500">การเปลี่ยนแปลงจะมีผลกับออเดอร์ #{selectedOrder.id.slice(0,8)} เท่านั้น</p></div><label className="block text-xs font-bold text-slate-600">สถานะ<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as EquipmentOrderStatus })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">{[selectedOrder.status, ...nextStatuses[selectedOrder.status]].map((status) => <option key={status} value={status}>{statusNames[status]}</option>)}</select></label><label className="block text-xs font-bold text-slate-600">การชำระเงิน<select value={draft.payment_status} onChange={(e) => setDraft({ ...draft, payment_status: e.target.value as Draft['payment_status'] })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="unpaid">ยังไม่ชำระ</option><option value="paid">ชำระแล้ว</option></select></label><label className="block text-xs font-bold text-slate-600"><Truck className="mr-1 inline h-3.5 w-3.5" />เลขพัสดุ<input value={draft.tracking_number} onChange={(e) => setDraft({ ...draft, tracking_number: e.target.value })} placeholder="กรอกเลขพัสดุเมื่อจัดส่ง" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" /></label>
          {draft.status === 'shipped' && <div className="space-y-3 rounded-xl border border-sky-200 bg-white p-3"><div><h4 className="text-sm font-black text-slate-900">อัปเดตให้ผู้สั่งซื้อ</h4><p className="mt-0.5 text-xs text-slate-500">แนบรูปตอนส่งมอบให้ขนส่ง พร้อมข้อความแจ้งลูกค้า</p></div><label className="block text-xs font-bold text-slate-600">ข้อความถึงลูกค้า{selectedOrder.status !== 'shipped' && <span className="ml-1 text-rose-600">*</span>}<textarea value={shipmentMessage} onChange={(e) => setShipmentMessage(e.target.value)} rows={3} maxLength={1000} placeholder="เช่น ส่งมอบพัสดุให้ขนส่งแล้ว เลขติดตามจะแจ้งเมื่อระบบอัปเดต" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-sky-500" /></label><label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-sky-300 bg-sky-50 px-3 py-3 text-sm font-extrabold text-sky-900 hover:bg-sky-100"><ImagePlus className="h-4 w-4" />{shipmentImageFile ? 'เปลี่ยนรูปภาพ' : selectedOrder.delivery_update_image_url ? 'เปลี่ยนรูปแนบ' : 'แนบรูปภาพ'}{selectedOrder.status !== 'shipped' && <span className="text-rose-600">*</span>}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 5 * 1024 * 1024) { setError('ขนาดรูปภาพต้องไม่เกิน 5 MB'); e.currentTarget.value = ''; return; } setError(''); setShipmentImageFile(file); setShipmentImagePreview(URL.createObjectURL(file)); }} /></label>{(shipmentImagePreview || selectedOrder.delivery_update_image_url) && <img src={shipmentImagePreview || selectedOrder.delivery_update_image_url || ''} alt="ตัวอย่างรูปอัปเดตการจัดส่ง" className="max-h-56 w-full rounded-xl bg-slate-50 object-contain" />}<p className="text-[11px] text-slate-500">JPEG, PNG, WebP หรือ GIF · ไม่เกิน 5 MB</p></div>}
          <button disabled={saving} onClick={() => void save()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 py-3 text-sm font-extrabold text-white transition hover:bg-emerald-900 disabled:bg-slate-300"><Check className="h-4 w-4" />{saving ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}</button></section>
      </div>
    </section> : <>
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาเลขออเดอร์ ชื่อลูกค้า เบอร์โทร" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm" /></label><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold"><option value="all">ทุกสถานะ</option>{Object.entries(statusNames).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end"><div className="flex items-center gap-2 text-xs font-extrabold text-slate-600"><CalendarDays className="h-4 w-4 text-emerald-700" />วันที่สั่งซื้อ</div><label className="flex-1 text-[11px] font-bold text-slate-500">ตั้งแต่<input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800" /></label><label className="flex-1 text-[11px] font-bold text-slate-500">ถึง<input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800" /></label>{(dateFrom || dateTo) && <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); }} className="inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800"><X className="h-3.5 w-3.5" />ล้างวันที่</button>}</div>
        <p className="text-[11px] text-slate-400">แสดง {filtered.length} จาก {orders.length} ออเดอร์ · วันที่อิงเขตเวลาไทย</p>
      </div>
      {loading ? <div className="rounded-2xl bg-white p-12 text-center text-slate-500">กำลังโหลดคำสั่งซื้อ...</div> : filtered.length === 0 ? <div className="rounded-2xl bg-white p-12 text-center text-slate-500">ไม่มีคำสั่งซื้อที่ตรงกับเงื่อนไข</div> : <div className="space-y-3">{filtered.map((order) => <article key={order.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md sm:flex-row sm:items-center sm:justify-between sm:p-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-black text-slate-900">#{order.id.slice(0,8)}</span><span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${statusStyle(order.status)}`}>{statusNames[order.status]}</span><EquipmentPaymentBadge order={order} /></div><p className="mt-1 truncate text-sm font-bold text-slate-800">{order.profiles?.full_name || order.profiles?.email || 'ลูกค้า'} <span className="font-normal text-slate-500">· {order.contact_phone}</span></p><p className="mt-1 flex items-center gap-1 text-xs text-slate-400"><Clock3 className="h-3.5 w-3.5" />{new Date(order.created_at).toLocaleString('th-TH')} · {(order.equipment_order_items || []).reduce((sum, item) => sum + item.quantity, 0)} ชิ้น · {order.payment_method === 'transfer' ? 'โอนเงิน' : 'เก็บเงินปลายทาง'}</p></div><div className="flex items-center justify-between gap-3 sm:justify-end"><span className="text-lg font-black text-emerald-800">{money(order.total_amount)}</span><button onClick={() => openOrder(order)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-emerald-900"><PackageCheck className="h-4 w-4" />จัดการออเดอร์</button></div></article>)}</div>}
    </>}
  </div>;
};
