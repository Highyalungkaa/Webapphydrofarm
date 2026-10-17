import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, LockKeyhole, Minus, Plus, ShoppingCart, Trash2, Truck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useEquipmentCart } from '../../context/EquipmentCartContext.js';
import { api } from '../../lib/api.js';

const money = (amount: number) => `฿${Number(amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const EquipmentCheckoutPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { items, totalAmount, setQuantity, remove, clear } = useEquipmentCart();
  const navigate = useNavigate();
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [shippingFee, setShippingFee] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const didPrefill = useRef(false);

  useEffect(() => {
    if (profile && !didPrefill.current) {
      if (profile.address_detail) setAddress(profile.address_detail);
      if (profile.phone) setPhone(profile.phone);
      didPrefill.current = true;
    }
  }, [profile]);

  useEffect(() => {
    api.get<{ shipping_fee: number }>('/equipment/shipping')
      .then((result) => setShippingFee(Number(result.shipping_fee)))
      .catch((err: any) => setError(err.message || 'โหลดค่าส่งไม่สำเร็จ'));
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (!user) { setError('กรุณาเข้าสู่ระบบก่อนยืนยันคำสั่งซื้อ'); return; }
    if (!address.trim() || phone.trim().length < 9) { setError('กรุณากรอกที่อยู่จัดส่งและเบอร์โทรศัพท์อย่างน้อย 9 หลัก'); return; }
    try {
      setSubmitting(true);
      const result = await api.post<{ id: string }>('/equipment/orders', {
        items: items.map(({ product, quantity }) => ({ product_id: product.id, quantity })),
        shipping_address: address.trim(), contact_phone: phone.trim(), payment_method: 'cash_on_delivery', note: note.trim() || null,
      });
      clear();
      navigate(`/orders?type=equipment&order=${result.id}`, { replace: true });
    } catch (err: any) { setError(err.message || 'ไม่สามารถยืนยันคำสั่งซื้อได้'); }
    finally { setSubmitting(false); }
  };

  if (items.length === 0) return <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-10 text-center font-sans shadow-sm"><ShoppingCart className="mx-auto h-12 w-12 text-slate-300" /><h1 className="mt-4 text-xl font-extrabold text-slate-900">ตะกร้าอุปกรณ์ยังว่าง</h1><p className="mt-2 text-sm text-slate-500">เลือกอุปกรณ์ปลูกที่ต้องการก่อนดำเนินการสั่งซื้อ</p><Link to="/equipment" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white"><ArrowLeft className="h-4 w-4" />เลือกซื้ออุปกรณ์</Link></div>;

  return <div className="mx-auto max-w-5xl space-y-6 font-sans">
    <Link to="/equipment" className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700"><ArrowLeft className="h-4 w-4" />เลือกซื้อสินค้าต่อ</Link>
    <div><h1 className="text-2xl font-extrabold text-slate-950 sm:text-3xl">ตะกร้าและยืนยันคำสั่งซื้อ</h1><p className="mt-1 text-sm text-slate-500">ตรวจสอบสินค้า กรอกข้อมูลจัดส่ง และยืนยันการเก็บเงินปลายทาง</p></div>
    <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
      <div className="space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-extrabold text-slate-900">สินค้าในตะกร้า</h2><div className="mt-4 divide-y divide-slate-100">
          {items.map(({ product, quantity }) => <div key={product.id} className="flex gap-3 py-4 first:pt-0 last:pb-0"><div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-emerald-50">{product.image_url ? <img src={product.image_url} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-emerald-300"><ShoppingCart className="h-7 w-7" /></div>}</div><div className="min-w-0 flex-1"><Link to={`/equipment/${product.id}`} className="font-extrabold text-slate-900 hover:text-emerald-700">{product.name}</Link><p className="mt-1 text-sm font-bold text-emerald-800">{money(product.price)} / ชิ้น</p><div className="mt-2 flex items-center gap-2"><button type="button" onClick={() => setQuantity(product.id, quantity - 1)} className="rounded-lg border border-slate-200 p-1.5"><Minus className="h-3.5 w-3.5" /></button><span className="min-w-7 text-center text-sm font-bold">{quantity}</span><button type="button" onClick={() => setQuantity(product.id, quantity + 1)} className="rounded-lg border border-slate-200 p-1.5" disabled={quantity >= product.stock_quantity}><Plus className="h-3.5 w-3.5" /></button><button type="button" onClick={() => remove(product.id)} className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-rose-600"><Trash2 className="h-4 w-4" /> ลบ</button></div></div><strong className="hidden text-sm text-slate-900 sm:block">{money(Number(product.price) * quantity)}</strong></div>)}
        </div></section>
        <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-extrabold text-slate-900">ข้อมูลจัดส่ง</h2><div><label className="mb-1.5 block text-sm font-bold text-slate-700">ที่อยู่จัดส่ง</label><textarea required value={address} onChange={(e) => setAddress(e.target.value)} rows={3} placeholder="บ้านเลขที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด รหัสไปรษณีย์" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" /></div><div><label className="mb-1.5 block text-sm font-bold text-slate-700">เบอร์โทรศัพท์</label><input required value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" minLength={9} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" /></div><div className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900"><Truck className="mr-2 inline h-4 w-4" />จัดส่งปกติ</div><div><label className="mb-1.5 block text-sm font-bold text-slate-700">หมายเหตุถึงร้าน (ถ้ามี)</label><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" /></div></section>
      </div>
      <aside className="h-fit space-y-5 lg:sticky lg:top-20"><section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-extrabold text-slate-900">วิธีชำระเงิน</h2><div className="flex items-start gap-3 rounded-2xl border border-emerald-500 bg-emerald-50 p-4"><span className="mt-0.5 grid h-5 w-5 place-items-center rounded-full border-[6px] border-emerald-700 bg-white" /><span><strong className="block text-sm text-slate-900">เก็บเงินปลายทาง</strong><span className="text-xs text-slate-500">ชำระเงินเมื่อได้รับสินค้า</span></span></div>
        <div className="space-y-2 border-t border-slate-100 pt-4 text-sm"><div className="flex justify-between text-slate-600"><span>{items.reduce((sum, item) => sum + item.quantity, 0)} ชิ้น</span><span>{money(totalAmount)}</span></div><div className="flex justify-between text-slate-600"><span>ค่าจัดส่ง</span><span>{shippingFee === null ? 'กำลังโหลด…' : money(shippingFee)}</span></div><div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-lg font-extrabold text-slate-950"><span>ยอดรวมสุทธิ</span><span>{shippingFee === null ? '—' : money(totalAmount + shippingFee)}</span></div><p className="text-xs text-slate-500">ค่าส่งสำหรับร้านอุปกรณ์ปลูก</p></div>
        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}
        {!user && <p className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800"><LockKeyhole className="h-4 w-4 shrink-0" />เข้าสู่ระบบก่อนยืนยันคำสั่งซื้อ</p>}
        <button disabled={submitting || !user || shippingFee === null} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3.5 font-extrabold text-white shadow-sm hover:bg-emerald-800 disabled:bg-slate-300"><CheckCircle2 className="h-5 w-5" />{submitting ? 'กำลังบันทึกคำสั่งซื้อ...' : 'ยืนยันคำสั่งซื้อ'}</button>
        {!user && <Link to="/login" state={{ returnTo: '/equipment/checkout' }} className="block text-center text-sm font-bold text-emerald-700">ไปหน้าเข้าสู่ระบบ</Link>}
      </section></aside>
    </form>
  </div>;
};
