import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, PackageCheck, Search, ShoppingBasket, ShoppingCart, SlidersHorizontal, Truck, Wrench, X } from 'lucide-react';
import { api } from '../../lib/api.js';
import { EquipmentProduct } from '../../types/index.js';
import { useEquipmentCart } from '../../context/EquipmentCartContext.js';
import { useAuth } from '../../context/AuthContext.js';

const money = (amount: number) => `฿${Number(amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
type SortMode = 'recommended' | 'price-low' | 'price-high' | 'name';

export const EquipmentShopPage: React.FC = () => {
  const { id } = useParams();
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { items, itemCount, totalAmount, add } = useEquipmentCart();
  const [products, setProducts] = useState<EquipmentProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ทั้งหมด');
  const [sortMode, setSortMode] = useState<SortMode>('recommended');
  const [addedProduct, setAddedProduct] = useState<string | null>(null);

  useEffect(() => {
    api.get<EquipmentProduct[]>('/equipment/products').then(setProducts)
      .catch((err) => setError(err.message || 'โหลดสินค้าไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }, []);

  const selected = id ? products.find((product) => product.id === id) : undefined;
  const categories = useMemo(() => ['ทั้งหมด', ...Array.from(new Set(products.map((product) => product.category))).sort()], [products]);
  const categoryCount = (name: string) => name === 'ทั้งหมด' ? products.length : products.filter((product) => product.category === name).length;
  const filtered = useMemo(() => {
    const matches = products.filter((product) => (category === 'ทั้งหมด' || product.category === category) && `${product.name} ${product.sku} ${product.description || ''}`.toLowerCase().includes(search.trim().toLowerCase()));
    return matches.sort((a, b) => {
      if (sortMode === 'price-low') return Number(a.price) - Number(b.price);
      if (sortMode === 'price-high') return Number(b.price) - Number(a.price);
      if (sortMode === 'name') return a.name.localeCompare(b.name, 'th');
      return Number(b.stock_quantity > 0) - Number(a.stock_quantity > 0) || a.name.localeCompare(b.name, 'th');
    });
  }, [category, products, search, sortMode]);

  const cartQuantityFor = (productId: string) => items.find((item) => item.product.id === productId)?.quantity || 0;
  const addProduct = (product: EquipmentProduct) => {
    if (product.stock_quantity < 1 || cartQuantityFor(product.id) >= product.stock_quantity) return;
    if (isLoading) return;
    if (!user) {
      navigate('/login', { state: { returnTo: `${location.pathname}${location.search}` } });
      return;
    }
    add(product);
    setAddedProduct(product.id);
    window.setTimeout(() => setAddedProduct((current) => current === product.id ? null : current), 3500);
  };

  if (id) return <div className="space-y-5 pb-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><Link to="/equipment" className="inline-flex items-center gap-2 text-sm font-bold text-emerald-800 hover:text-emerald-950"><ArrowLeft className="h-4 w-4" />กลับไปเลือกสินค้า</Link><CartLink count={itemCount} amount={totalAmount} compact /></div>
    {loading ? <div className="h-96 animate-pulse rounded-3xl bg-slate-200/70" /> : !selected ? <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-600">{error || 'ไม่พบสินค้านี้'}<div><Link to="/equipment" className="mt-4 inline-flex text-sm font-bold text-emerald-700">กลับไปหน้าร้าน</Link></div></div> : <article className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-emerald-900/5"><div className="grid md:grid-cols-2"><div className="relative aspect-square overflow-hidden bg-gradient-to-br from-[#eef7e8] via-white to-emerald-100 md:aspect-auto md:min-h-[460px]">{selected.image_url ? <img src={selected.image_url} alt={selected.name} className="absolute inset-0 h-full w-full object-contain p-7" /> : <div className="grid h-full min-h-72 place-items-center text-emerald-300"><Wrench className="h-24 w-24" /></div>}<span className="absolute left-5 top-5 rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-xs font-extrabold text-emerald-900 shadow-sm">{selected.category}</span></div><div className="flex flex-col justify-center p-6 sm:p-9"><p className="text-xs font-extrabold uppercase tracking-[.17em] text-emerald-700">HydroFarm Supply / รายละเอียดสินค้า</p><h1 className="mt-3 text-3xl font-black leading-tight text-slate-950">{selected.name}</h1><p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-600">{selected.description || 'อุปกรณ์สำหรับการปลูกและดูแลพืชของคุณ'}</p><div className="mt-8 flex flex-wrap items-end justify-between gap-3 border-y border-slate-100 py-5"><div><p className="text-xs font-bold text-slate-500">ราคาต่อชิ้น</p><p className="mt-1 text-3xl font-black text-emerald-800">{money(selected.price)}</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${selected.stock_quantity < 1 ? 'bg-slate-100 text-slate-500' : selected.stock_quantity <= selected.low_stock_threshold ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>{selected.stock_quantity < 1 ? 'สินค้าหมด' : selected.stock_quantity <= selected.low_stock_threshold ? `เหลือ ${selected.stock_quantity} ชิ้น` : 'พร้อมสั่งซื้อ'}</span></div>{cartQuantityFor(selected.id) > 0 && <p className="mt-4 text-xs font-semibold text-slate-500">ในตะกร้ามีสินค้านี้ {cartQuantityFor(selected.id)} ชิ้น</p>}<button onClick={() => addProduct(selected)} disabled={selected.stock_quantity < 1 || cartQuantityFor(selected.id) >= selected.stock_quantity} className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-800 px-5 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-slate-300"><ShoppingCart className="h-5 w-5" />{selected.stock_quantity < 1 ? 'สินค้าหมดชั่วคราว' : cartQuantityFor(selected.id) >= selected.stock_quantity ? 'เพิ่มได้สูงสุดตามสต็อกแล้ว' : 'เพิ่มลงตะกร้า'}</button><div className="mt-5 flex items-center gap-2 text-xs text-slate-500"><Truck className="h-4 w-4 text-emerald-700" />จัดส่งปกติ · ชำระเงินปลายทาง</div></div></div></article>}
    {addedProduct && <AddedNotice productName={products.find((product) => product.id === addedProduct)?.name || ''} />}
  </div>;

  return <div className="space-y-7 pb-8">
    <section className="relative isolate overflow-hidden rounded-[2rem] bg-[#123c33] text-white shadow-[0_20px_60px_-30px_rgba(12,69,48,.65)] sm:rounded-[2.5rem]"><div className="pointer-events-none absolute -right-12 -top-24 h-80 w-80 rounded-full border-[45px] border-lime-300/10" /><div className="relative grid gap-6 p-6 sm:p-9 lg:grid-cols-[1.2fr_.8fr] lg:items-center lg:p-11"><div><span className="inline-flex items-center gap-2 rounded-full border border-lime-300/30 bg-lime-300/10 px-3 py-1.5 text-[11px] font-bold text-lime-200"><Wrench className="h-3.5 w-3.5" />HYDROFARM SUPPLY</span><h1 className="mt-5 text-3xl font-black leading-tight sm:text-4xl">อุปกรณ์ปลูกที่คุณต้องใช้<br /><span className="text-lime-300">เลือกได้ในที่เดียว</span></h1><p className="mt-4 max-w-lg text-sm leading-7 text-emerald-50/80">ค้นหาสินค้า ดูรายละเอียดและจำนวนคงเหลือ แล้วสั่งซื้อเพื่อจัดส่งถึงคุณ</p><div className="mt-6 flex flex-wrap items-center gap-3"><a href="#catalog" className="inline-flex items-center gap-2 rounded-xl bg-lime-300 px-5 py-3 text-sm font-extrabold text-emerald-950 transition hover:bg-lime-200">เลือกดูสินค้า <ArrowRight className="h-4 w-4" /></a><span className="rounded-xl border border-white/20 px-4 py-3 text-xs font-bold">{loading ? 'กำลังโหลดสินค้า' : `${products.length} รายการในร้าน`}</span></div></div><div className="hidden lg:block"><div className="relative mx-auto grid h-64 w-64 place-items-center rounded-[3rem] border border-white/15 bg-white/10 shadow-2xl backdrop-blur"><ShoppingBasket className="h-28 w-28 text-lime-300" /><span className="absolute -bottom-4 -left-6 rounded-2xl bg-white px-4 py-3 text-xs font-extrabold text-emerald-900 shadow-lg"><PackageCheck className="mr-1 inline h-4 w-4" />เลือกง่าย · สั่งได้ทันที</span></div></div></div></section>

    <section id="catalog" className="scroll-mt-24 space-y-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-[.18em] text-emerald-700">Explore the collection</p><h2 className="mt-1 text-2xl font-black text-slate-950 sm:text-3xl">เลือกซื้ออุปกรณ์ปลูก</h2><p className="mt-1 text-sm text-slate-500">{loading ? 'กำลังโหลดรายการ...' : `แสดง ${filtered.length} จาก ${products.length} รายการ`}</p></div><CartLink count={itemCount} amount={totalAmount} /></div>
      <div className="rounded-3xl border border-emerald-100 bg-white p-4 shadow-sm sm:p-5"><div className="grid gap-3 sm:grid-cols-[1fr_auto]"><label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาสินค้าที่ต้องการ" className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-10 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100" />{search && <button type="button" onClick={() => setSearch('')} aria-label="ล้างคำค้นหา" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>}</label><label className="relative"><SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} aria-label="เรียงสินค้า" className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-3 pl-9 pr-8 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500 sm:w-52"><option value="recommended">แนะนำ</option><option value="price-low">ราคา: ต่ำไปสูง</option><option value="price-high">ราคา: สูงไปต่ำ</option><option value="name">ชื่อสินค้า: ก-ฮ</option></select></label></div><div className="mt-4 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="หมวดหมู่สินค้า">{categories.map((item) => <button key={item} onClick={() => setCategory(item)} aria-pressed={category === item} className={`shrink-0 rounded-full px-4 py-2 text-xs font-extrabold transition ${category === item ? 'bg-emerald-800 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-800'}`}>{item}<span className={`ml-1.5 ${category === item ? 'text-emerald-100' : 'text-slate-400'}`}>{categoryCount(item)}</span></button>)}</div></div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}<button onClick={() => window.location.reload()} className="ml-2 font-bold underline">ลองอีกครั้ง</button></div>}
      {loading ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{[0,1,2,3].map((n) => <div key={n} className="h-72 animate-pulse rounded-3xl bg-slate-200/70" />)}</div> : filtered.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center"><Search className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 font-bold text-slate-700">ไม่พบสินค้าที่ตรงกับตัวกรอง</p><button onClick={() => { setSearch(''); setCategory('ทั้งหมด'); }} className="mt-3 text-sm font-extrabold text-emerald-700 hover:underline">ล้างตัวกรอง</button></div> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">{filtered.map((product) => {
        const quantityInCart = cartQuantityFor(product.id);
        const unavailable = product.stock_quantity < 1;
        const atStockLimit = quantityInCart >= product.stock_quantity;
        return <article key={product.id} className="group flex min-w-0 flex-col overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:border-emerald-300 hover:shadow-xl hover:shadow-emerald-900/10"><Link to={`/equipment/${product.id}`} className="block"><div className="relative aspect-square overflow-hidden bg-gradient-to-br from-[#eef7e8] via-white to-emerald-100">{product.image_url ? <img src={product.image_url} alt={product.name} loading="lazy" className="h-full w-full object-contain p-4 transition duration-300 group-hover:scale-105" /> : <div className="grid h-full place-items-center text-emerald-300"><Wrench className="h-12 w-12" /></div>}<span className={`absolute left-2 top-2 max-w-[85%] truncate rounded-full px-2.5 py-1 text-[10px] font-extrabold shadow-sm ${unavailable ? 'bg-slate-100 text-slate-600' : product.stock_quantity <= product.low_stock_threshold ? 'bg-amber-100 text-amber-900' : 'bg-white/95 text-emerald-900'}`}>{unavailable ? 'สินค้าหมด' : product.stock_quantity <= product.low_stock_threshold ? `เหลือ ${product.stock_quantity} ชิ้น` : product.category}</span></div><div className="p-3 sm:p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">{product.category}</p><h3 className="mt-1 line-clamp-2 min-h-10 text-sm font-extrabold leading-5 text-slate-900 sm:text-base">{product.name}</h3><p className="mt-3 text-lg font-black text-emerald-800">{money(product.price)}</p>{quantityInCart > 0 && <p className="mt-1 text-[11px] font-semibold text-slate-500">ในตะกร้า {quantityInCart} ชิ้น</p>}</div></Link><div className="mt-auto px-3 pb-3 sm:px-4 sm:pb-4"><button onClick={() => addProduct(product)} disabled={unavailable || atStockLimit} className={`flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-extrabold transition sm:text-sm ${unavailable || atStockLimit ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'bg-emerald-800 text-white hover:bg-emerald-900'}`}><ShoppingCart className="h-3.5 w-3.5" />{unavailable ? 'สินค้าหมด' : atStockLimit ? 'ครบจำนวนในสต็อก' : quantityInCart > 0 ? 'เพิ่มอีกชิ้น' : 'เพิ่มลงตะกร้า'}</button></div></article>;
      })}</div>}
    </section>
    {addedProduct && <AddedNotice productName={products.find((product) => product.id === addedProduct)?.name || ''} />}
  </div>;
};

const CartLink: React.FC<{ count: number; amount: number; compact?: boolean }> = ({ count, amount, compact }) => <Link to="/equipment/checkout" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-900"><ShoppingCart className="h-4 w-4" />ตะกร้า <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{count}</span>{!compact && <span className="hidden border-l border-white/25 pl-2 sm:inline">{money(amount)}</span>}</Link>;
const AddedNotice: React.FC<{ productName: string }> = ({ productName }) => <div className="fixed bottom-20 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-2xl bg-slate-950 px-4 py-3 text-sm text-white shadow-xl md:bottom-5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-500"><Check className="h-4 w-4" /></span><span className="min-w-0 flex-1 truncate"><strong>เพิ่มลงตะกร้าแล้ว</strong><span className="ml-1 text-slate-300">{productName}</span></span><Link to="/equipment/checkout" className="shrink-0 rounded-lg bg-white px-3 py-2 text-xs font-extrabold text-slate-900">ไปตะกร้า <ArrowRight className="ml-1 inline h-3.5 w-3.5" /></Link></div>;
