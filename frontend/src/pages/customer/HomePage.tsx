import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../lib/api.js';
import { formatDateDMY, formatDateTimeDMY } from '../../lib/dateFormat.js';
import { PlantingRound } from '../../types/index.js';
import { AlertCircle, ArrowRight, CalendarDays, Clock3, Leaf, ShoppingBasket, Sprout, Store, Truck } from 'lucide-react';

const CropPhoto: React.FC<{ imageUrl?: string | null; name: string }> = ({ imageUrl, name }) => {
  const [failed, setFailed] = useState(false);

  if (!imageUrl || failed) {
    return <div className="grid aspect-[4/3] place-items-center bg-gradient-to-br from-emerald-100 to-lime-50 text-emerald-500"><Leaf className="h-9 w-9" aria-hidden="true" /></div>;
  }

  return <img src={imageUrl} alt={name} loading="lazy" onError={() => setFailed(true)} className="aspect-[4/3] w-full object-cover" />;
};

export const HomePage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rounds, setRounds] = useState<PlantingRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<PlantingRound[]>('/rounds/open').then(setRounds)
      .catch((err) => setError(err.message || 'ไม่สามารถโหลดรอบที่เปิดจองได้'))
      .finally(() => setLoading(false));
  }, []);

  const openRound = (id: string) => {
    if (user) navigate(`/rounds/${id}`);
    else navigate('/login', { state: { returnTo: `/rounds/${id}` } });
  };

  return <div className="space-y-9 pb-8">
    <section className="relative isolate overflow-hidden rounded-[2rem] bg-[#103e31] text-white shadow-[0_20px_60px_-30px_rgba(12,69,48,.65)] sm:rounded-[2.5rem]">
      <div className="pointer-events-none absolute -right-24 -top-32 h-96 w-96 rounded-full border-[55px] border-lime-300/10" />
      <div className="pointer-events-none absolute -bottom-44 right-24 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />
      <div className="relative grid gap-9 p-6 sm:p-10 lg:grid-cols-[1.2fr_.8fr] lg:items-center lg:p-12">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-lime-300/30 bg-lime-300/10 px-3 py-1.5 text-[11px] font-bold tracking-wide text-lime-200"><span className="h-2 w-2 rounded-full bg-lime-300" />HYDROFARM · จากแปลงถึงมือคุณ</span>
          <h1 className="mt-5 text-3xl font-black leading-[1.22] tracking-tight sm:text-5xl">ผักสดจากฟาร์ม<br /><span className="text-lime-300">จองไว้ก่อนเก็บเกี่ยว</span></h1>
          <p className="mt-5 max-w-lg text-sm leading-7 text-emerald-50/80 sm:text-base">เลือกผักจากรอบที่เปิดจอง รอรับผักสดตามวันส่งมอบที่ระบุ และชำระเงินเมื่อได้รับสินค้า</p>
          <div className="mt-7 flex flex-wrap gap-3"><a href="#open-rounds" className="inline-flex items-center gap-2 rounded-xl bg-lime-300 px-5 py-3 text-sm font-extrabold text-emerald-950 shadow-lg shadow-black/10 transition hover:bg-lime-200">ดูรอบที่เปิดจอง <ArrowRight className="h-4 w-4" /></a><span className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-3 text-xs font-bold text-emerald-50"><ShoppingBasket className="h-4 w-4 text-lime-300" />{loading ? 'กำลังตรวจสอบรอบจอง' : `${rounds.length} รอบที่เปิดอยู่`}</span></div>
        </div>
        <div className="relative hidden lg:block"><div className="relative mx-auto max-w-xs rotate-2 rounded-[2rem] border border-white/20 bg-white/10 p-5 shadow-2xl backdrop-blur"><div className="flex items-center justify-between border-b border-white/15 pb-4"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-lime-200">วิธีจองง่าย ๆ</p><p className="mt-1 text-lg font-black">ผักของคุณเริ่มที่นี่</p></div><span className="grid h-12 w-12 place-items-center rounded-2xl bg-lime-300 text-emerald-950"><Sprout className="h-6 w-6" /></span></div><div className="space-y-3 pt-4">{[['01','เลือกรอบและชนิดผัก'],['02','ตรวจสอบจำนวนที่จอง'],['03','รับผักตามวันส่งมอบ']].map(([number,label]) => <div key={number} className="flex items-center gap-3 rounded-xl bg-white/10 p-3"><span className="text-lg font-black text-lime-300">{number}</span><span className="text-sm font-semibold">{label}</span></div>)}</div></div></div>
      </div>
    </section>

    <div className="grid gap-3 sm:grid-cols-3">{[{ icon: Leaf, title: 'เลือกผักที่ต้องการ', detail: 'ดูชนิดผัก ราคา และจำนวนคงเหลือ' }, { icon: Store, title: 'รับเองที่ฟาร์ม', detail: 'รับตามช่วงเวลาของรอบปลูก' }, { icon: Truck, title: 'จัดส่งปกติ', detail: 'เลือกวิธีรับสินค้าเมื่อยืนยันจอง' }].map(({ icon: Icon, title, detail }) => <div key={title} className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Icon className="h-5 w-5" /></span><div><p className="text-sm font-extrabold text-slate-900">{title}</p><p className="mt-0.5 text-[11px] text-slate-500">{detail}</p></div></div>)}</div>

    <section id="open-rounds" className="scroll-mt-24 space-y-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-[.18em] text-emerald-700">Fresh from the farm</p><h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">รอบเปิดจองผัก</h2><p className="mt-1 text-sm text-slate-500">เลือกดูรายละเอียดของแต่ละรอบก่อนจอง</p></div>{!loading && !error && <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-extrabold text-emerald-900">{rounds.length} รอบ</span>}</div>
      {loading ? <div className="grid gap-4 sm:grid-cols-2">{[0,1].map((n) => <div key={n} className="h-72 animate-pulse rounded-3xl bg-slate-200/70" />)}</div> : error ? <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div> : rounds.length === 0 ? <div className="rounded-3xl border border-dashed border-emerald-200 bg-white p-10 text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Sprout className="h-8 w-8" /></span><h3 className="mt-4 text-lg font-black text-slate-900">ผักชุดใหม่กำลังเติบโต</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">ขณะนี้ยังไม่มีรอบที่เปิดจอง กลับมาตรวจสอบอีกครั้งเมื่อฟาร์มเปิดรอบถัดไป</p></div> : <div className="grid gap-5 md:grid-cols-2">{rounds.map((round) => {
        const available = Number(round.total_available_kg || 0);
        const canBook = round.status === 'booking_open' && !round.is_all_sold_out;
        return <article key={round.id} className="group flex flex-col overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:border-emerald-300 hover:shadow-xl hover:shadow-emerald-900/10"><div className="h-1.5 bg-gradient-to-r from-emerald-700 via-lime-500 to-lime-300" /><div className="flex-1 p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-extrabold uppercase tracking-[.15em] text-emerald-700">รอบการปลูก</p><h3 className="mt-1 text-xl font-black leading-snug text-slate-950">{round.name}</h3></div><span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-extrabold ${canBook?'bg-lime-100 text-emerald-900':'bg-slate-100 text-slate-600'}`}>{canBook?'เปิดรับจอง':'จองเต็มแล้ว'}</span></div><div className="mt-5 grid gap-2 sm:grid-cols-2"><div className="rounded-2xl bg-emerald-50 p-3"><p className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700"><CalendarDays className="h-3.5 w-3.5" />วันส่งมอบ</p><p className="mt-1 text-sm font-extrabold text-emerald-950">{formatDateDMY(round.fulfillment_date)}</p></div><div className="rounded-2xl bg-amber-50 p-3"><p className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700"><Clock3 className="h-3.5 w-3.5" />เริ่มเปิดจอง</p><p className="mt-1 text-sm font-extrabold text-amber-950">{formatDateTimeDMY(round.booking_opens_at)}</p></div></div><div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700">ผักในรอบนี้</span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-bold text-emerald-800">{round.items?.length || 0} ชนิด</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {round.items?.map((item) => {
              const cropName = item.crop_name || item.crops?.name || 'ผักสลัด';
              return <div key={item.id} className="min-w-0 overflow-hidden rounded-2xl border border-emerald-100 bg-emerald-50/40">
                <CropPhoto imageUrl={item.crops?.image_url} name={cropName} />
                <div className="px-2.5 py-2">
                  <p className="line-clamp-2 min-h-8 text-xs font-extrabold leading-4 text-slate-800" title={cropName}>{cropName}</p>
                  <p className="mt-0.5 text-[11px] font-bold text-emerald-800">฿{Number(item.price_per_kg).toLocaleString()}/กก.</p>
                </div>
              </div>;
            })}
          </div>
        </div></div><div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 p-4 sm:px-6"><div><p className="text-[10px] font-semibold text-slate-500">คงเหลือรวม</p><p className="text-sm font-black text-slate-900">{available.toFixed(1)} กก.</p></div><button type="button" onClick={() => openRound(round.id)} disabled={!canBook} className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">{canBook?'เลือกผักรอบนี้':'จองเต็มแล้ว'}<ArrowRight className="h-4 w-4" /></button></div></article>;
      })}</div>}
    </section>
  </div>;
};
