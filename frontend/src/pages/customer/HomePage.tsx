import React,{useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {api} from '../../lib/api.js';
import {useAuth} from '../../context/AuthContext.js';
import {CropPhoto} from '../../components/common/CropPhoto.js';
import {PurchaseLimitBadge} from '../../components/common/PurchaseLimitBadge.js';
import {harvestRange,priceLabel} from '../../lib/pooledBooking.js';
import {formatKg} from '../../lib/bookingQuantity.js';
import type {PlantingRound} from '../../types/index.js';
export const HomePage:React.FC=()=>{
 const[catalog,setCatalog]=useState<PlantingRound|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const{user}=useAuth();const navigate=useNavigate();
 useEffect(()=>{api.get<PlantingRound>('/rounds/catalog').then(setCatalog).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
 const open=()=>user?navigate('/rounds/catalog'):navigate('/login',{state:{returnTo:'/rounds/catalog'}});
 return <div className="space-y-8 pb-8">
 <section className="rounded-[2rem] bg-[#103e31] p-7 text-white shadow-lg sm:p-10"><p className="text-xs font-bold tracking-widest text-lime-200">HYDROFARM · จากแปลงถึงมือคุณ</p><h1 className="mt-4 text-3xl font-black leading-tight sm:text-5xl">ผักสดจากฟาร์ม<br/><span className="text-lime-300">เลือกผักและกิโลกรัมที่ต้องการ</span></h1><p className="mt-5 max-w-xl text-sm leading-7 text-emerald-50">รวมผักที่เปิดจองไว้ในที่เดียว เลือกได้หลายชนิดในออเดอร์เดียว</p><a href="#open-rounds" className="mt-6 inline-block rounded-xl bg-lime-300 px-5 py-3 text-sm font-extrabold text-emerald-950">ดูผักที่เปิดจอง →</a></section>
 <section id="open-rounds" className="scroll-mt-24 space-y-4"><div><h2 className="text-2xl font-black text-slate-900">ผักที่เปิดจอง</h2><p className="mt-1 text-sm text-slate-500">เลือกผักและจำนวนที่ต้องการได้ตามยอดคงเหลือ</p></div>
 {loading?<p className="rounded-2xl bg-white p-10 text-center text-slate-500">กำลังโหลดผักเปิดจอง...</p>:error?<p role="alert" className="rounded-2xl bg-rose-50 p-5 text-rose-800">{error}</p>:!catalog?.items?.length?<div className="rounded-3xl border border-dashed border-emerald-200 bg-white p-10 text-center"><h3 className="font-bold text-slate-900">ผักชุดใหม่กำลังเติบโต</h3><p className="mt-2 text-sm text-slate-500">ขณะนี้ยังไม่มีผักเปิดจอง กรุณากลับมาตรวจสอบอีกครั้ง</p></div>:<article className="overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm">
 <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-emerald-50/60 px-4 py-3"><div><p className="text-xs font-semibold text-emerald-800">วันที่เก็บ</p><p className="mt-1 font-black text-slate-900">{harvestRange(catalog.harvest_start_date,catalog.harvest_end_date)}</p></div>{catalog.purchase_limit_enabled&&<PurchaseLimitBadge/>}</div>
 <div className="grid grid-cols-2 gap-3 p-3 sm:p-4 lg:grid-cols-4">{catalog.items.map(item=><div key={item.id} className="overflow-hidden rounded-2xl border border-slate-100"><CropPhoto imageUrl={item.crops?.image_url} name={item.crop_name||'ผัก'}/><div className="space-y-1.5 p-3"><h3 className="min-h-10 text-sm font-black leading-5 text-slate-950">{item.crop_name}</h3><p className="text-sm font-bold text-emerald-800">{priceLabel(item.price_per_kg,item.price_tiers)} <span className="text-xs font-normal text-slate-500">/ กก.</span></p><p className={`inline-block rounded-lg px-2 py-1 text-xs font-extrabold ${item.is_sold_out?'bg-slate-100 text-slate-500':'bg-emerald-50 text-emerald-800'}`}>{item.is_sold_out?'จองเต็มแล้ว':`คงเหลือ ${formatKg(Number(item.available_qty_kg))} กก.`}</p><p className="text-xs text-slate-500">ผลผลิตประมาณ {formatKg(item.estimated_qty_kg)} กก.</p></div></div>)}</div>
 <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3"><p className="text-xs text-slate-500">ฟาร์มจัดผักจากชุดที่เก็บเกี่ยวก่อนตามลำดับ</p><button onClick={open} disabled={catalog.is_all_sold_out} className="w-full rounded-xl bg-emerald-800 px-5 py-2.5 sm:w-auto text-sm font-extrabold text-white hover:bg-emerald-900 disabled:opacity-50">{catalog.is_all_sold_out?'จองเต็มแล้ว':'เลือกผักที่ต้องการจอง →'}</button></div></article>}
 </section></div>;
};
