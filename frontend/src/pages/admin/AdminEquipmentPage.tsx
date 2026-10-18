import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Edit3, ImagePlus, Package, PackagePlus, Plus, RefreshCw, Search, X } from 'lucide-react';
import { api } from '../../lib/api.js';
import { EquipmentProduct } from '../../types/index.js';

type ProductForm = { name: string; category: string; image_url: string; description: string; price: string; stock_quantity: string; low_stock_threshold: string; is_active: boolean };
const emptyForm: ProductForm = { name: '', category: '', image_url: '', description: '', price: '', stock_quantity: '0', low_stock_threshold: '5', is_active: true };
const money = (price: number) => `฿${Number(price).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = () => reject(new Error('อ่านไฟล์รูปภาพไม่สำเร็จ'));
  reader.readAsDataURL(file);
});

export const AdminEquipmentPage: React.FC = () => {
  const [products, setProducts] = useState<EquipmentProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [stockProduct, setStockProduct] = useState<EquipmentProduct | null>(null);
  const [stockChange, setStockChange] = useState('');
  const [stockType, setStockType] = useState<'restock' | 'adjustment'>('restock');
  const [stockNote, setStockNote] = useState('');
  const [history, setHistory] = useState<any[] | null>(null);

  const load = async () => { setLoading(true); try { setProducts(await api.get<EquipmentProduct[]>('/equipment/admin/products')); } catch (err: any) { setError(err.message); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  useEffect(() => () => { if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview); }, [imagePreview]);
  const setField = (key: keyof ProductForm, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const edit = (product: EquipmentProduct) => { setEditing(product.id); setFormOpen(true); setImageFile(null); setImagePreview(''); setForm({ name: product.name, category: product.category, image_url: product.image_url || '', description: product.description || '', price: String(product.price), stock_quantity: String(product.stock_quantity), low_stock_threshold: String(product.low_stock_threshold), is_active: product.is_active }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const closeForm = () => { setFormOpen(false); setEditing(null); setForm(emptyForm); setImageFile(null); setImagePreview(''); setError(''); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setMessage(''); setSaving(true);
    try {
      let imageUrl = form.image_url.trim();
      if (imageFile) {
        const uploaded = await api.post<{ image_url: string }>('/equipment/admin/products/image', { file_name: imageFile.name, mime_type: imageFile.type, data: await fileToBase64(imageFile) });
        imageUrl = uploaded.image_url;
      }
      const payload = { ...form, price: Number(form.price), stock_quantity: Number(form.stock_quantity), low_stock_threshold: Number(form.low_stock_threshold), image_url: imageUrl || null };
      if (editing) {
        await api.put(`/equipment/admin/products/${editing}`, payload);
      } else await api.post('/equipment/admin/products', payload);
      setMessage(editing ? 'บันทึกการแก้ไขสินค้าแล้ว' : 'เพิ่มสินค้าแล้ว'); closeForm(); await load();
    } catch (err: any) { setError(err.message || 'บันทึกสินค้าไม่สำเร็จ'); } finally { setSaving(false); }
  };
  const saveStock = async (event: React.FormEvent) => {
    event.preventDefault(); if (!stockProduct) return;
    try { await api.post(`/equipment/admin/products/${stockProduct.id}/stock`, { quantity_change: Number(stockChange), transaction_type: stockType, note: stockNote }); setStockProduct(null); setStockChange(''); setStockNote(''); await load(); }
    catch (err: any) { setError(err.message || 'ปรับสต็อกไม่สำเร็จ'); }
  };
  const showHistory = async (product: EquipmentProduct) => { setStockProduct(product); setHistory([]); try { setHistory(await api.get<any[]>(`/equipment/admin/products/${product.id}/stock-history`)); } catch (err: any) { setError(err.message || 'โหลดประวัติสต็อกไม่สำเร็จ'); } };
  const filtered = products.filter((product) => `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(query.toLowerCase()));
  const lowCount = products.filter((product) => product.stock_quantity <= product.low_stock_threshold).length;

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[.18em] text-emerald-700">HydroFarm Supply</p><h1 className="mt-1 text-2xl font-black text-slate-950">แคตตาล็อกและสต็อกอุปกรณ์</h1><p className="mt-1 text-sm text-slate-500">จัดการสินค้า ราคา จำนวนคงเหลือ และประวัติรับเข้า</p></div><div className="flex flex-wrap items-center gap-2"><div className={`rounded-2xl px-4 py-3 text-sm font-extrabold ${lowCount ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}><AlertTriangle className="mr-2 inline h-4 w-4" />สินค้าใกล้หมด {lowCount} รายการ</div><button type="button" onClick={() => { if (formOpen && !editing) closeForm(); else { setForm(emptyForm); setImageFile(null); setImagePreview(''); setEditing(null); setError(''); setFormOpen(true); window.scrollTo({ top: 0, behavior: 'smooth' }); } }} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-800 px-5 py-3 text-sm font-extrabold text-white shadow-md shadow-emerald-900/15 transition hover:bg-emerald-900">{formOpen && !editing ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{formOpen && !editing ? 'ซ่อนฟอร์ม' : 'เพิ่มสินค้า'}</button></div></div>
    {error && <div className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}<button onClick={() => setError('')} className="float-right">ปิด</button></div>}{message && <div className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</div>}
    {formOpen && <form onSubmit={save} className="overflow-hidden rounded-[2rem] border border-emerald-200 bg-white shadow-[0_18px_55px_-35px_rgba(5,150,105,.45)]">
      <div className="relative overflow-hidden bg-gradient-to-r from-emerald-950 via-emerald-800 to-teal-700 px-6 py-6 text-white sm:px-8">
        <div className="absolute -right-12 -top-24 h-64 w-64 rounded-full border-[28px] border-white/5" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4"><div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20"><PackagePlus className="h-7 w-7" /></div><div><p className="text-xs font-extrabold uppercase tracking-[.2em] text-emerald-100">Product workspace</p><h2 className="mt-1 text-2xl font-black">{editing ? 'แก้ไขรายละเอียดสินค้า' : 'เพิ่มสินค้าใหม่'}</h2><p className="mt-1 text-sm text-emerald-50/80">จัดข้อมูลสินค้า ราคา และสต็อกให้พร้อมสำหรับหน้าร้าน</p></div></div>
          <div className={`w-fit rounded-full px-3.5 py-2 text-xs font-extrabold ${form.is_active ? 'bg-white text-emerald-900' : 'bg-slate-900/30 text-white ring-1 ring-white/20'}`}><span className={`mr-2 inline-block h-2 w-2 rounded-full ${form.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />{form.is_active ? 'พร้อมแสดงในร้าน' : 'บันทึกเป็นฉบับซ่อน'}</div>
        </div>
      </div>
      <div className="grid gap-7 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_290px] lg:p-8">
        <div className="space-y-7">
          <section><div className="mb-4 flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-100 text-sm font-black text-emerald-800">1</span><div><h3 className="font-black text-slate-900">ข้อมูลสินค้า</h3><p className="text-xs text-slate-500">ชื่อ หมวดหมู่ และรายละเอียดที่ลูกค้าจะเห็น</p></div></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-extrabold text-slate-700 sm:col-span-2">ชื่อสินค้า <span className="text-rose-500">*</span><input required value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="เช่น ชุดปลูกผักไฮโดรโปนิกส์" className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100" /></label>
              <label className="text-xs font-extrabold text-slate-700">หมวดหมู่ <span className="text-rose-500">*</span><input required value={form.category} onChange={(e) => setField('category', e.target.value)} placeholder="เช่น อุปกรณ์ปลูก" className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100" /></label>
              <label className="text-xs font-extrabold text-slate-700 sm:col-span-2">คำอธิบายสินค้า<textarea value={form.description} onChange={(e) => setField('description', e.target.value)} rows={3} placeholder="รายละเอียด จุดเด่น หรือข้อมูลเพิ่มเติมสำหรับลูกค้า" className="mt-2 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100" /></label>
              <div className="sm:col-span-2">
                <span className="text-xs font-extrabold text-slate-700"><ImagePlus className="mr-1 inline h-4 w-4 text-emerald-700" />รูปภาพสินค้า <span className="font-medium text-slate-400">(ไม่บังคับ)</span></span>
                <div className="mt-2 flex flex-col gap-3 rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/60 p-4 sm:flex-row sm:items-center">
                  <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-900">
                    <ImagePlus className="h-4 w-4" />เลือกจากอุปกรณ์
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 5 * 1024 * 1024) { setError('ขนาดรูปภาพต้องไม่เกิน 5 MB'); e.currentTarget.value = ''; return; }
                      setError('');
                      setImageFile(file);
                      setImagePreview(URL.createObjectURL(file));
                      setField('image_url', '');
                      e.currentTarget.value = '';
                    }} />
                  </label>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-700">{imageFile?.name || (form.image_url ? 'กำลังใช้รูปจากลิงก์' : 'เลือกภาพจากคอมหรือโทรศัพท์')}</p>
                    <p className="mt-0.5 text-xs text-slate-500">JPEG, PNG, WebP หรือ GIF · ขนาดไม่เกิน 5 MB</p>
                  </div>
                  {(imagePreview || form.image_url) && <button type="button" onClick={() => { setImageFile(null); setImagePreview(''); setField('image_url', ''); }} className="text-xs font-extrabold text-rose-600 hover:text-rose-700">นำรูปออก</button>}
                </div>
                <label className="mt-3 block text-xs font-extrabold text-slate-700">
                  หรือเพิ่มรูปจากลิงก์
                  <input
                    type="url"
                    value={form.image_url}
                    onChange={(e) => { setImageFile(null); setImagePreview(''); setField('image_url', e.target.value); }}
                    placeholder="https://example.com/product-image.jpg"
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                  />
                </label>
                <p className="mt-1.5 text-xs text-slate-500">วางลิงก์รูปภาพโดยตรง ระบบจะแสดงตัวอย่างทางขวาก่อนบันทึก</p>
              </div>
            </div>
          </section>
          <section><div className="mb-4 flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-100 text-sm font-black text-amber-800">2</span><div><h3 className="font-black text-slate-900">ราคาและสต็อก</h3><p className="text-xs text-slate-500">ตั้งราคาขายและเกณฑ์แจ้งเตือนสินค้าใกล้หมด</p></div></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-extrabold text-slate-700">ราคาขาย (บาท) <span className="text-rose-500">*</span><div className="mt-2 flex overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 focus-within:border-emerald-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-emerald-100"><span className="grid place-items-center border-r border-slate-200 px-4 font-black text-emerald-800">฿</span><input required type="number" min="0" step="0.01" value={form.price} onChange={(e) => setField('price', e.target.value)} placeholder="0.00" className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm font-bold outline-none" /></div></label>
              {!editing && <label className="text-xs font-extrabold text-slate-700">จำนวนเริ่มต้น (ชิ้น) <span className="text-rose-500">*</span><input required type="number" min="0" step="1" value={form.stock_quantity} onChange={(e) => setField('stock_quantity', e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100" /></label>}
              <label className="text-xs font-extrabold text-slate-700 sm:col-span-2">แจ้งเตือนเมื่อสินค้าเหลือน้อยกว่า (ชิ้น)<input required type="number" min="0" step="1" value={form.low_stock_threshold} onChange={(e) => setField('low_stock_threshold', e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100 sm:max-w-xs" /></label>
            </div>
          </section>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 transition hover:bg-emerald-50"><input type="checkbox" checked={form.is_active} onChange={(e) => setField('is_active', e.target.checked)} className="mt-0.5 h-5 w-5 accent-emerald-700" /><span><span className="block text-sm font-extrabold text-slate-900">เปิดแสดงสินค้าในหน้าร้าน</span><span className="mt-0.5 block text-xs text-slate-600">ลูกค้าจะค้นหาและสั่งซื้อสินค้านี้ได้เมื่อเปิดใช้งาน</span></span></label>
        </div>
        <aside className="lg:sticky lg:top-6 lg:self-start"><div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-slate-50 shadow-sm"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div className="flex items-center gap-2 text-xs font-extrabold text-slate-700"><Package className="h-4 w-4 text-emerald-700" />ตัวอย่างสินค้า</div><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-500">PREVIEW</span></div><div className="p-4"><div className="mb-4 grid aspect-[4/3] place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-3">{imagePreview || form.image_url ? <img src={imagePreview || form.image_url.trim()} alt="ตัวอย่างสินค้า" className="h-full w-full object-contain" /> : <div className="text-center text-slate-300"><ImagePlus className="mx-auto h-10 w-10" /><p className="mt-2 text-xs font-bold">เลือกรูปหรือวางลิงก์เพื่อแสดงตัวอย่าง</p></div>}</div><div className="flex items-center justify-between gap-2"><span className="truncate rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-extrabold text-emerald-800">{form.category || 'หมวดหมู่สินค้า'}</span></div><h3 className="mt-3 min-h-12 text-base font-black text-slate-900">{form.name || 'ชื่อสินค้าจะแสดงที่นี่'}</h3><p className="mt-1 line-clamp-3 min-h-12 text-xs leading-5 text-slate-500">{form.description || 'รายละเอียดสินค้าจะแสดงให้ลูกค้าเห็นในหน้าร้าน'}</p><div className="mt-4 flex items-end justify-between border-t border-slate-200 pt-4"><div><p className="text-[10px] font-bold text-slate-400">ราคาขาย</p><p className="text-xl font-black text-emerald-800">{form.price ? money(Number(form.price)) : '฿0.00'}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${form.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>{form.is_active ? 'พร้อมขาย' : 'ซ่อนอยู่'}</span></div></div></div><p className="mt-3 px-1 text-center text-xs leading-5 text-slate-500">ตัวอย่างนี้ช่วยให้ตรวจดูข้อมูลก่อนบันทึกสินค้า</p></aside>
      </div>
      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8"><p className="text-xs text-slate-500"><span className="text-rose-500">*</span> จำเป็นต้องกรอก</p><div className="flex flex-col-reverse gap-2 sm:flex-row"><button type="button" onClick={closeForm} className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-extrabold text-slate-600 transition hover:bg-slate-100">ยกเลิก</button><button disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-900 disabled:bg-slate-300">{editing ? <Edit3 className="h-4 w-4" /> : <Check className="h-4 w-4" />}{saving ? 'กำลังบันทึก...' : editing ? 'บันทึกการแก้ไข' : 'บันทึกสินค้าใหม่'}</button></div></div>
    </form>}
    <section className="space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-xl font-black text-slate-900">สินค้าในระบบ <span className="text-sm text-slate-500">({products.length})</span></h2><label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาสินค้า" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm sm:w-72" /></label></div>
      {loading ? <div className="rounded-2xl bg-white p-10 text-center text-slate-500">กำลังโหลดสินค้า...</div> : filtered.length === 0 ? <div className="rounded-2xl bg-white p-10 text-center text-slate-500">ยังไม่มีสินค้า</div> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{filtered.map((product) => <article key={product.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex gap-3 p-4"><div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-emerald-50 p-1">{product.image_url && <img src={product.image_url} alt="" className="h-full w-full object-contain" />}</div><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><h3 className="truncate font-extrabold text-slate-900">{product.name}</h3><button onClick={() => edit(product)} title="แก้ไขสินค้า" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-emerald-700"><Edit3 className="h-4 w-4" /></button></div><p className="text-xs text-slate-500">{product.category} · {product.sku}</p><p className="mt-1 font-black text-emerald-800">{money(product.price)}</p></div></div><div className="flex items-center justify-between border-t border-slate-100 px-4 py-3"><div><p className="text-[10px] font-bold uppercase text-slate-400">คงเหลือ</p><p className={`text-xl font-black ${product.stock_quantity <= product.low_stock_threshold ? 'text-amber-700' : 'text-slate-900'}`}>{product.stock_quantity} <span className="text-xs font-semibold">ชิ้น</span></p>{product.stock_quantity <= product.low_stock_threshold && <p className="text-[10px] font-bold text-amber-700">ใกล้หมด</p>}</div><div className="flex gap-2"><button onClick={() => { setStockProduct(product); setHistory(null); }} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white"><PackagePlus className="h-3.5 w-3.5" />รับเข้า/ปรับ</button><button onClick={() => void showHistory(product)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">ประวัติ</button></div></div></article>)}</div>}
    </section>
    {stockProduct && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" onClick={() => { setStockProduct(null); setHistory(null); }}><div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-3xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold text-emerald-700">{history ? 'ประวัติสต็อก' : 'จัดการสต็อก'}</p><h3 className="text-lg font-black">{stockProduct.name}</h3></div><button onClick={() => { setStockProduct(null); setHistory(null); }}><X /></button></div>{history ? <div className="space-y-2">{history.length === 0 ? <p className="text-sm text-slate-500">ยังไม่มีประวัติสต็อก</p> : history.map((item) => <div key={item.id} className="flex justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm"><div><strong>{item.transaction_type === 'restock' ? 'รับสินค้าเข้า' : item.transaction_type === 'sale' ? 'ขายสินค้า' : item.transaction_type === 'cancellation' ? 'คืนสต็อกจากการยกเลิก' : 'ปรับยอด'}</strong><p className="text-xs text-slate-500">{item.note || '—'} · {new Date(item.created_at).toLocaleString('th-TH')}</p></div><span className={`font-black ${item.quantity_change > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{item.quantity_change > 0 ? '+' : ''}{item.quantity_change} → {item.stock_after}</span></div>)}</div> : <form onSubmit={saveStock} className="space-y-3"><div className="flex rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => setStockType('restock')} className={`flex-1 rounded-lg py-2 text-sm font-bold ${stockType === 'restock' ? 'bg-white shadow text-emerald-800' : 'text-slate-500'}`}>รับของเข้า</button><button type="button" onClick={() => setStockType('adjustment')} className={`flex-1 rounded-lg py-2 text-sm font-bold ${stockType === 'adjustment' ? 'bg-white shadow text-emerald-800' : 'text-slate-500'}`}>ปรับยอด</button></div><label className="block text-sm font-bold">จำนวนชิ้น {stockType === 'adjustment' && '(ใส่จำนวนติดลบเมื่อลดยอด)'}<input required type="number" step="1" min={stockType === 'restock' ? '1' : undefined} value={stockChange} onChange={(e) => setStockChange(e.target.value)} placeholder={stockType === 'restock' ? 'เช่น 20' : 'เช่น -2 หรือ 5'} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label><label className="block text-sm font-bold">หมายเหตุ<input required value={stockNote} onChange={(e) => setStockNote(e.target.value)} placeholder="เช่น รับสินค้าจากผู้จำหน่าย" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label><button className="w-full rounded-xl bg-emerald-700 py-3 font-extrabold text-white"><RefreshCw className="mr-2 inline h-4 w-4" />บันทึกสต็อก</button></form>}</div></div>}
  </div>;
};
