import type { EquipmentTransferAccount } from '../../types/index.js';
import React, { useEffect, useState } from 'react';
import { Check, Package, Settings2, Truck } from 'lucide-react';
import { api } from '../../lib/api.js';

export const AdminEquipmentShippingPage: React.FC = () => {
  const [fee, setFee] = useState('0');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [account, setAccount] = useState({ bank_name: '', account_name: '', account_number: '', qr_image_url: '' });
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreview, setQrPreview] = useState('');
  const [accountLoading, setAccountLoading] = useState(true);
  const [accountSaving, setAccountSaving] = useState(false);

  useEffect(() => {
    api.get<{ shipping_fee: number }>('/equipment/admin/settings/shipping')
      .then((result) => setFee(String(result.shipping_fee)))
      .catch((err: any) => setError(err.message || 'โหลดค่าจัดส่งไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api.get<EquipmentTransferAccount>('/equipment/payment-settings')
      .then(({ bank_name, account_name, account_number, qr_image_url }) => setAccount({ bank_name, account_name, account_number, qr_image_url }))
      .catch((err: any) => setError(err.message || 'โหลดบัญชีรับโอนไม่สำเร็จ'))
      .finally(() => setAccountLoading(false));
  }, []);

  useEffect(() => {
    if (!qrFile) { setQrPreview(''); return; }
    const url = URL.createObjectURL(qrFile); setQrPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [qrFile]);

  const saveAccount = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setMessage(''); setAccountSaving(true);
    try {
      let imageUrl = account.qr_image_url;
      if (qrFile) {
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = () => reject(new Error('อ่านรูป QR Code ไม่สำเร็จ')); reader.readAsDataURL(qrFile);
        });
        const uploaded = await api.post<{ image_url: string }>('/equipment/admin/settings/payment/qr', { mime_type: qrFile.type, data });
        imageUrl = uploaded.image_url;
      }
      await api.put('/equipment/admin/settings/payment', { ...account, qr_image_url: imageUrl });
      setAccount((previous) => ({ ...previous, qr_image_url: imageUrl })); setQrFile(null);
      setMessage('บันทึกบัญชีรับโอนเรียบร้อยแล้ว');
    } catch (err: any) { setError(err.message || 'บันทึกบัญชีรับโอนไม่สำเร็จ'); }
    finally { setAccountSaving(false); }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setMessage(''); setSaving(true);
    try {
      const result = await api.put<{ shipping_fee: number }>('/equipment/admin/settings/shipping', { shipping_fee: Number(fee) });
      setFee(String(result.shipping_fee)); setMessage('บันทึกค่าส่งเรียบร้อยแล้ว');
    } catch (err: any) { setError(err.message || 'บันทึกค่าส่งไม่สำเร็จ'); }
    finally { setSaving(false); }
  };

  return <div className="mx-auto max-w-3xl space-y-6">
    <div><p className="text-xs font-black uppercase tracking-[.18em] text-emerald-700">HydroFarm Supply</p><h1 className="mt-1 text-2xl font-black text-slate-950">ค่าจัดส่งและการชำระเงิน</h1><p className="mt-1 text-sm text-slate-500">กำหนดค่าส่งสำหรับร้านอุปกรณ์ปลูกโดยเฉพาะ</p></div>
    {error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}
    {message && <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</p>}
    <form onSubmit={save} className="overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-sm">
      <div className="flex items-center gap-4 bg-gradient-to-r from-emerald-950 to-teal-700 p-6 text-white"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15"><Truck className="h-6 w-6" /></span><div><h2 className="text-lg font-black">ค่าจัดส่งอุปกรณ์</h2><p className="mt-1 text-sm text-emerald-50/80">จำนวนนี้จะบวกกับยอดสินค้าเมื่อยืนยันออเดอร์</p></div></div>
      <div className="space-y-5 p-6 sm:p-8">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4"><div className="flex gap-3"><Package className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><p className="text-sm leading-6 text-emerald-950">ค่าส่งนี้ใช้เฉพาะคำสั่งซื้อจากร้านอุปกรณ์ปลูกเท่านั้น ไม่กระทบการจองผักหรือยอดคำสั่งซื้อผัก</p></div></div>
        <label className="block text-sm font-extrabold text-slate-800">ค่าจัดส่งต่อคำสั่งซื้อ (บาท)<div className="mt-2 flex max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-100"><span className="grid place-items-center border-r border-slate-200 px-4 font-black text-emerald-800">฿</span><input required type="number" min="0" max="100000" step="0.01" value={fee} disabled={loading} onChange={(event) => setFee(event.target.value)} className="min-w-0 flex-1 bg-transparent px-4 py-3 text-lg font-black outline-none" /></div><span className="mt-2 block text-xs font-medium text-slate-500">ใส่ 0 หากไม่มีค่าจัดส่งเพิ่มเติม</span></label>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4"><span className="flex items-center gap-2 text-sm font-bold text-slate-700"><Settings2 className="h-4 w-4 text-slate-500" />วิธีชำระเงินของร้านนี้</span><span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-extrabold text-emerald-800">เก็บเงินปลายทาง / โอนเงินแนบสลิป</span></div>
        <button disabled={loading || saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-6 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-900 disabled:bg-slate-300"><Check className="h-4 w-4" />{saving ? 'กำลังบันทึก...' : 'บันทึกค่าจัดส่ง'}</button>
      </div>
    </form>
    <form onSubmit={saveAccount} className="space-y-4 rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
      <div><h2 className="text-lg font-black text-slate-900">รับโอนเงิน / พร้อมเพย์</h2><p className="mt-1 text-xs leading-relaxed text-slate-500">อัปโหลด QR Code หรือกรอกเลขบัญชี / เบอร์พร้อมเพย์ เพื่อให้ลูกค้าเลือกโอนเงินและแนบสลิปได้</p></div>
      <div className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
        <label className="block text-sm font-bold text-slate-700">รูป QR Code รับเงิน<input type="file" accept="image/jpeg,image/png,image/webp" disabled={accountLoading || accountSaving} onChange={(event) => {
          const file = event.target.files?.[0]; if (!file) return;
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('กรุณาเลือกรูป QR Code แบบ JPEG, PNG หรือ WebP ขนาดไม่เกิน 5 MB'); event.currentTarget.value = ''; return; }
          setError(''); setQrFile(file);
        }} className="mt-2 block w-full text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-emerald-100 file:px-3 file:py-2 file:font-bold file:text-emerald-900" /></label>
        {(qrPreview || account.qr_image_url) && <><img src={qrPreview || account.qr_image_url} alt="QR Code รับชำระเงินร้านอุปกรณ์" className="mx-auto max-h-72 w-full max-w-xs rounded-xl border border-slate-200 bg-white p-3 object-contain" /><button type="button" disabled={accountSaving} onClick={() => { setQrFile(null); setAccount((previous) => ({ ...previous, qr_image_url: '' })); }} className="text-xs font-bold text-rose-700 underline">นำรูป QR Code ออก</button></>}
        <p className="text-[11px] text-slate-500">JPEG, PNG หรือ WebP · ไม่เกิน 5 MB · รูปนี้จะแสดงให้ลูกค้าสแกนตอนเลือกโอนเงิน</p>
      </div>
      {([{ key: 'bank_name', label: 'ธนาคาร (ถ้ามี)' }, { key: 'account_name', label: 'ชื่อบัญชี / ชื่อผู้รับเงิน (ถ้ามี)' }, { key: 'account_number', label: 'เลขบัญชี หรือเบอร์พร้อมเพย์' }] as const).map(({ key, label }) => <label key={key} className="block text-sm font-bold text-slate-700">{label}<input value={account[key]} disabled={accountLoading || accountSaving} maxLength={key === 'account_number' ? 50 : key === 'bank_name' ? 100 : 160} onChange={(event) => setAccount((previous) => ({ ...previous, [key]: event.target.value }))} className="mt-1.5 block w-full rounded-xl border border-slate-200 px-3 py-2.5 font-medium outline-none focus:border-emerald-500" /></label>)}
      <button disabled={accountLoading || accountSaving} className="rounded-xl bg-emerald-800 px-5 py-3 text-sm font-bold text-white disabled:bg-slate-300">{accountSaving ? 'กำลังบันทึก...' : 'บันทึกบัญชีรับโอน'}</button>
    </form>
  </div>;
};
