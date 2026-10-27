import type { EquipmentTransferAccount,EquipmentProduct } from '../../types/index.js';
import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, LockKeyhole, Minus, Plus, ShoppingCart, Trash2, Truck, UploadCloud } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useEquipmentCart } from '../../context/EquipmentCartContext.js';
import { api } from '../../lib/api.js';
import { CustomerPageHeader } from '../../components/common/CustomerPageHeader.js';

const money = (amount: number) => `฿${Number(amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const EquipmentCheckoutPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { items, totalAmount, setQuantity, remove, clear,syncProducts } = useEquipmentCart();
  const navigate = useNavigate();
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash_on_delivery' | 'transfer'>('cash_on_delivery');
  const [transferAccount, setTransferAccount] = useState<EquipmentTransferAccount | null>(null);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState('');
  const [slipPath, setSlipPath] = useState('');
  const [shippingFee, setShippingFee] = useState<number | null>(null);
  const [productsReady,setProductsReady]=useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const didPrefill = useRef(false);
  const orderRequest=useRef({key:'',id:crypto.randomUUID()});
  useEffect(()=>{let active=true;api.get<EquipmentProduct[]>('/equipment/products').then(products=>{if(active){syncProducts(products);setProductsReady(true);}}).catch(()=>{if(active)setError('ตรวจสอบราคาและสต๊อกล่าสุดไม่สำเร็จ กรุณาโหลดหน้าใหม่ก่อนสั่งซื้อ');});return()=>{active=false;};},[]);

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

  useEffect(() => {
    api.get<EquipmentTransferAccount>('/equipment/payment-settings').then(setTransferAccount).catch(() => setTransferAccount(null));
  }, []);

  useEffect(() => {
    if (!slipFile) { setSlipPreview(''); return; }
    const url = URL.createObjectURL(slipFile);
    setSlipPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [slipFile]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (!user) { setError('กรุณาเข้าสู่ระบบก่อนยืนยันคำสั่งซื้อ'); return; }
    if(!productsReady||shippingFee==null){setError('กรุณารอการตรวจสอบราคา สต๊อก และค่าส่งให้ครบก่อนสั่งซื้อ');return;}
    if(items.some(i=>!i.product.is_active||i.quantity>i.product.stock_quantity)){setError('มีสินค้าปิดขายหรือจำนวนเกินสต๊อกล่าสุด กรุณาลดจำนวนหรือนำสินค้าออก');return;}
    if (!address.trim() || phone.trim().length < 9) { setError('กรุณากรอกที่อยู่จัดส่งและเบอร์โทรศัพท์อย่างน้อย 9 หลัก'); return; }
    if (paymentMethod === 'transfer' && (!transferAccount?.transfer_enabled || !slipFile)) { setError('กรุณาแนบสลิปการโอนเงินก่อนยืนยันคำสั่งซื้อ'); return; }
    try {
      setSubmitting(true);
      let receiptPath = slipPath;
      if (paymentMethod === 'transfer' && slipFile && !receiptPath) {
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = () => reject(new Error('อ่านไฟล์สลิปไม่สำเร็จ'));
          reader.readAsDataURL(slipFile);
        });
        const uploaded = await api.post<{ path: string }>('/equipment/orders/payment-slip', { mime_type: slipFile.type, data });
        receiptPath = uploaded.path; setSlipPath(receiptPath);
      }
      const payload={
        expected_total_amount:Math.round((totalAmount+Number(shippingFee))*100)/100,
        items: items.map(({ product, quantity }) => ({ product_id: product.id, quantity })),
        shipping_address: address.trim(), contact_phone: phone.trim(), payment_method: paymentMethod, payment_slip_path: paymentMethod === 'transfer' ? receiptPath : null, note: note.trim() || null,
      };
      const key=JSON.stringify(payload);
      if(orderRequest.current.key!==key)orderRequest.current={key,id:crypto.randomUUID()};
      const result = await api.post<{ id: string }>('/equipment/orders',{...payload,request_id:orderRequest.current.id});
      clear();
      navigate(`/orders?type=equipment&order=${result.id}`, { replace: true });
    } catch (err: any) { setError(err.message || 'ไม่สามารถยืนยันคำสั่งซื้อได้'); }
    finally { setSubmitting(false); }
  };

  if (items.length === 0) return <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-10 text-center font-sans shadow-sm"><ShoppingCart className="mx-auto h-12 w-12 text-slate-300" /><h1 className="mt-4 text-xl font-extrabold text-slate-900">ตะกร้าอุปกรณ์ยังว่าง</h1><p className="mt-2 text-sm text-slate-500">เลือกอุปกรณ์ปลูกที่ต้องการก่อนดำเนินการสั่งซื้อ</p><Link to="/equipment" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white"><ArrowLeft className="h-4 w-4" />เลือกซื้ออุปกรณ์</Link></div>;

  return <div className="mx-auto max-w-5xl space-y-6 pb-8 font-sans">
    <Link to="/equipment" className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700"><ArrowLeft className="h-4 w-4" />เลือกซื้อสินค้าต่อ</Link>
    <CustomerPageHeader eyebrow="HydroFarm Supply · ตะกร้าอุปกรณ์" title="ตรวจสอบและยืนยันคำสั่งซื้อ" description="ตรวจสินค้า กรอกที่อยู่จัดส่ง แล้วเลือกเก็บเงินปลายทางหรือโอนเงินพร้อมแนบสลิป" icon={<ShoppingCart className="h-8 w-8" />}>
      <span className="rounded-full bg-lime-300 px-3 py-1.5 text-xs font-extrabold text-emerald-950">{items.reduce((sum, item) => sum + item.quantity, 0)} ชิ้นในตะกร้า</span>
    </CustomerPageHeader>
    <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
      <div className="space-y-5">
        <section className="rounded-[1.75rem] border border-emerald-100 bg-white p-5 shadow-sm"><h2 className="text-lg font-black text-slate-950">สินค้าในตะกร้า</h2><div className="mt-4 divide-y divide-slate-100">
          {items.map(({ product, quantity }) => <div key={product.id} className="flex gap-3 py-4 first:pt-0 last:pb-0"><div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-emerald-50">{product.image_url ? <img src={product.image_url} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-emerald-300"><ShoppingCart className="h-7 w-7" /></div>}</div><div className="min-w-0 flex-1"><Link to={`/equipment/${product.id}`} className="font-extrabold text-slate-900 hover:text-emerald-700">{product.name}</Link><p className="mt-1 text-sm font-bold text-emerald-800">{money(product.price)} / ชิ้น</p><div className="mt-2 flex items-center gap-2"><button type="button" onClick={() => setQuantity(product.id, quantity - 1)} className="rounded-lg border border-slate-200 p-1.5"><Minus className="h-3.5 w-3.5" /></button><span className="min-w-7 text-center text-sm font-bold">{quantity}</span><button type="button" onClick={() => setQuantity(product.id, quantity + 1)} className="rounded-lg border border-slate-200 p-1.5" disabled={quantity >= product.stock_quantity}><Plus className="h-3.5 w-3.5" /></button><button type="button" onClick={() => remove(product.id)} className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-rose-600"><Trash2 className="h-4 w-4" /> ลบ</button></div></div><strong className="hidden text-sm text-slate-900 sm:block">{money(Number(product.price) * quantity)}</strong></div>)}
        </div></section>
        <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-extrabold text-slate-900">ข้อมูลจัดส่ง</h2><div><label className="mb-1.5 block text-sm font-bold text-slate-700">ที่อยู่จัดส่ง</label><textarea required value={address} onChange={(e) => setAddress(e.target.value)} rows={3} placeholder="บ้านเลขที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด รหัสไปรษณีย์" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" /></div><div><label className="mb-1.5 block text-sm font-bold text-slate-700">เบอร์โทรศัพท์</label><input required value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" minLength={9} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" /></div><div className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900"><Truck className="mr-2 inline h-4 w-4" />จัดส่งปกติ</div><div><label className="mb-1.5 block text-sm font-bold text-slate-700">หมายเหตุถึงร้าน (ถ้ามี)</label><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" /></div></section>
      </div>
      <aside className="h-fit space-y-5 lg:sticky lg:top-20"><section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-extrabold text-slate-900">วิธีชำระเงิน</h2><div className="space-y-3">
          <label className={paymentMethod === 'cash_on_delivery' ? 'flex cursor-pointer gap-3 rounded-2xl border border-emerald-500 bg-emerald-50 p-4' : 'flex cursor-pointer gap-3 rounded-2xl border border-slate-200 p-4'}><input type="radio" name="equipment-payment" value="cash_on_delivery" checked={paymentMethod === 'cash_on_delivery'} disabled={submitting} onChange={() => { setPaymentMethod('cash_on_delivery'); setError(''); }} className="mt-1 accent-emerald-700" /><span><strong className="block text-sm text-slate-900">เก็บเงินปลายทาง</strong><span className="text-xs text-slate-500">ชำระเงินเมื่อได้รับสินค้า</span></span></label>
          <label className={paymentMethod === 'transfer' ? 'flex cursor-pointer gap-3 rounded-2xl border border-emerald-500 bg-emerald-50 p-4' : 'flex gap-3 rounded-2xl border border-slate-200 p-4'}><input type="radio" name="equipment-payment" value="transfer" checked={paymentMethod === 'transfer'} disabled={submitting || !transferAccount?.transfer_enabled} onChange={() => { setPaymentMethod('transfer'); setError(''); }} className="mt-1 accent-emerald-700" /><span><strong className="block text-sm text-slate-900">โอนเงินและแนบสลิป</strong><span className="text-xs text-slate-500">{transferAccount?.transfer_enabled ? 'โอนตามยอดรวมสุทธิ แล้วแนบสลิปให้ร้านตรวจสอบ' : 'ร้านยังไม่ได้ตั้งค่าบัญชีรับโอน'}</span></span></label>
        </div>
        {paymentMethod === 'transfer' && transferAccount?.transfer_enabled && <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
          <div className="space-y-1 text-sm"><p className="font-bold text-slate-900">สแกน QR Code หรือโอนเงิน</p>{transferAccount.qr_image_url && <img src={transferAccount.qr_image_url} alt="QR Code รับชำระเงินร้านอุปกรณ์" className="mx-auto my-3 max-h-72 w-full max-w-xs rounded-xl border border-slate-200 bg-white p-3 object-contain" />}{transferAccount.bank_name && <p>{transferAccount.bank_name}</p>}{transferAccount.account_name && <p>ชื่อผู้รับเงิน: {transferAccount.account_name}</p>}{transferAccount.account_number && <p>เลขบัญชี / พร้อมเพย์: <strong className="select-all text-lg tracking-wide text-emerald-900">{transferAccount.account_number}</strong></p>}<p className="pt-2 font-bold text-emerald-900">ยอดที่ต้องโอน: {shippingFee === null ? 'กำลังโหลด...' : money(totalAmount + shippingFee)}</p></div>
          <div className="space-y-3 rounded-2xl border-2 border-emerald-300 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-extrabold text-slate-950">แนบสลิปการโอนเงิน</h3><span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700">จำเป็น</span></div>
            <p id="equipment-slip-help" className="text-sm leading-relaxed text-slate-600">เมื่อโอนเงินแล้ว กรุณาแนบรูปสลิปก่อนยืนยันคำสั่งซื้อ</p>
            <label className={`relative flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-emerald-400 bg-emerald-50 px-4 py-5 text-center font-bold text-emerald-900 focus-within:ring-2 focus-within:ring-emerald-600 focus-within:ring-offset-2 ${submitting ? 'cursor-wait opacity-60' : 'cursor-pointer hover:bg-emerald-100'}`}>
              <UploadCloud aria-hidden="true" className="h-8 w-8 text-emerald-700" />
              <span>{slipFile ? 'เปลี่ยนรูปสลิป' : 'กดเพื่อแนบสลิป'}</span>
              <input type="file" aria-label={slipFile ? 'เปลี่ยนรูปสลิปการโอนเงิน' : 'แนบสลิปการโอนเงิน'} aria-describedby="equipment-slip-help equipment-slip-formats" accept="image/jpeg,image/png,image/webp" disabled={submitting} onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setSlipPath(''); setError(''); setSlipFile(null);
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('กรุณาแนบสลิป JPEG, PNG หรือ WebP ขนาดไม่เกิน 5 MB'); event.currentTarget.value = ''; return; }
            setSlipFile(file);
          }} className="sr-only" /></label>
            <div aria-live="polite">{slipFile ? <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"><p className="flex items-center gap-2 font-bold"><CheckCircle2 aria-hidden="true" className="h-5 w-5 shrink-0" />แนบสลิปแล้ว</p><p className="mt-1 break-all text-xs">{slipFile.name}</p></div> : <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">ยังไม่ได้แนบสลิป กรุณาเลือกรูปด้านบน</p>}</div>
            {slipPreview && <img src={slipPreview} alt="ตัวอย่างสลิปที่แนบ" className="max-h-60 w-full rounded-xl border border-slate-200 bg-white object-contain" />}
            <p id="equipment-slip-formats" className="text-xs leading-relaxed text-slate-500">รองรับ JPEG, PNG หรือ WebP ขนาดไม่เกิน 5 MB<br />ร้านจะตรวจสอบสลิปก่อนยืนยันว่าชำระแล้ว</p>
          </div>
        </div>}
        <div className="space-y-2 border-t border-slate-100 pt-4 text-sm"><div className="flex justify-between text-slate-600"><span>{items.reduce((sum, item) => sum + item.quantity, 0)} ชิ้น</span><span>{money(totalAmount)}</span></div><div className="flex justify-between text-slate-600"><span>ค่าจัดส่ง</span><span>{shippingFee === null ? 'กำลังโหลด…' : money(shippingFee)}</span></div><div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-lg font-extrabold text-slate-950"><span>ยอดรวมสุทธิ</span><span>{shippingFee === null ? '—' : money(totalAmount + shippingFee)}</span></div><p className="text-xs text-slate-500">ค่าส่งสำหรับร้านอุปกรณ์ปลูก</p></div>
        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}
        {!user && <p className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800"><LockKeyhole className="h-4 w-4 shrink-0" />เข้าสู่ระบบก่อนยืนยันคำสั่งซื้อ</p>}
        <button disabled={submitting || !user || shippingFee === null||!productsReady} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3.5 font-extrabold text-white shadow-sm hover:bg-emerald-800 disabled:bg-slate-300"><CheckCircle2 className="h-5 w-5" />{submitting ? 'กำลังบันทึกคำสั่งซื้อ...' : !productsReady?'กำลังตรวจสอบราคาล่าสุด...':'ยืนยันคำสั่งซื้อ'}</button>
        {!user && <Link to="/login" state={{ returnTo: '/equipment/checkout' }} className="block text-center text-sm font-bold text-emerald-700">ไปหน้าเข้าสู่ระบบ</Link>}
      </section></aside>
    </form>
  </div>;
};
