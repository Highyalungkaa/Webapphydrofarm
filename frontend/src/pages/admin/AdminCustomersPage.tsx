import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatDateDMY } from '../../lib/dateFormat.js';
import { AlertTriangle, ChevronRight, History, Search, X } from 'lucide-react';
import type {Order} from '../../types/index.js';
import {Badge} from '../../components/common/Badge.js';
import {OrderHistoryDialog} from '../../components/admin/OrderHistoryDialog.js';
import {orderMetrics,orderDiscountAmount} from '../../lib/orderReport.js';

interface CustomerItem {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  address_detail?: string;
  no_show_count: number;
  created_at: string;
  districts?: {
    id: string;
    name: string;
  };
}

export const AdminCustomersPage: React.FC = () => {
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [historyCustomer,setHistoryCustomer]=useState<CustomerItem|null>(null);
  const [historyOrders,setHistoryOrders]=useState<Order[]>([]);
  const [historyLoading,setHistoryLoading]=useState(false);
  const [historyError,setHistoryError]=useState('');
  const historyDialog=useRef<HTMLDialogElement>(null);
  const [selectedHistoryOrder,setSelectedHistoryOrder]=useState<Order|null>(null);

  useEffect(()=>{
    setSelectedHistoryOrder(null);
    if(!historyCustomer)return;
    let active=true;
    const dialog=historyDialog.current;
    if(dialog&&!dialog.open)dialog.showModal();
    setHistoryOrders([]);setHistoryError('');setHistoryLoading(true);
    const load=async()=>{
      try{
        const all:Order[]=[];
        for(let offset=0;;offset+=500){
          const page=await api.get<Order[]>(`/admin/orders?customer_id=${encodeURIComponent(historyCustomer.id)}&offset=${offset}&limit=500`);
          if(!active)return;
          all.push(...page);
          if(page.length<500)break;
        }
        if(active)setHistoryOrders(all);
      }catch(err:any){if(active)setHistoryError(err.message||'โหลดประวัติการสั่งซื้อไม่สำเร็จ');}
      finally{if(active)setHistoryLoading(false);}
    };
    void load();
    return()=>{active=false;dialog?.close();};
  },[historyCustomer?.id]);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const data = await api.get<CustomerItem[]>('/admin/customers');
      setCustomers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = formatDateDMY;
  const query = searchQuery.trim().toLocaleLowerCase('th');
  const filteredCustomers = customers.filter((customer) =>
    !query || [customer.full_name, customer.email, customer.phone, customer.address_detail, customer.districts?.name]
      .some((value) => value?.toLocaleLowerCase('th').includes(query))
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">รายชื่อลูกค้า (Customers)</h1>
        <p className="text-xs sm:text-sm text-slate-500">
          ตรวจสอบประวัติการสั่งซื้อ ข้อมูลติดต่อ และสถิติไม่มารับของ (No-show)
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-md">
          <span className="sr-only">ค้นหารายชื่อลูกค้า</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="ค้นหาชื่อ อีเมล เบอร์โทร หรือที่อยู่"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
          />
        </label>
        <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
          <span>แสดง {filteredCustomers.length} จาก {customers.length} รายชื่อ</span>
          {searchQuery && <button type="button" onClick={() => setSearchQuery('')} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-emerald-700 hover:bg-emerald-50"><X className="h-3.5 w-3.5" />ล้างคำค้น</button>}
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-500 text-sm">กำลังโหลดข้อมูลลูกค้า...</div>
        ) : customers.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">ยังไม่มีข้อมูลลูกค้า</div>
        ) : filteredCustomers.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm"><Search className="mx-auto mb-3 h-9 w-9 text-slate-300" /><p className="font-bold text-slate-700">ไม่พบลูกค้าที่ตรงกับคำค้น</p><p className="mt-1 text-xs">ลองค้นหาด้วยชื่อ อีเมล หรือเบอร์โทรอื่น</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 uppercase text-[11px] font-semibold">
                  <th className="py-3 px-4">ชื่อลูกค้า / อีเมล</th>
                  <th className="py-3 px-4">เบอร์โทรศัพท์</th>
                  <th className="py-3 px-4">ที่อยู่ลูกค้า</th>
                  <th className="py-3 px-4">ประวัติไม่มารับ (No-show)</th>
                  <th className="py-3 px-4 text-right">วันที่ลงทะเบียน</th>
                  <th className="py-3 px-4 text-right">คำสั่งซื้อ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60">
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      <div>{c.full_name || 'ไม่ระบุชื่อ'}</div>
                      <span className="text-[11px] font-normal text-slate-400">{c.email}</span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700">{c.phone || '-'}</td>
                    <td className="py-3.5 px-4 text-slate-600 max-w-[200px] truncate" title={c.address_detail || ''}>
                      {c.address_detail || c.districts?.name || '-'}
                    </td>
                    <td className="py-3.5 px-4">
                      {c.no_show_count > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                          <span>{c.no_show_count} ครั้ง</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 font-medium text-xs">0 ครั้ง (ปกติ)</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right text-slate-400 text-xs">
                      {formatDate(c.created_at)}
                    </td>
                    <td className="px-4 py-3.5 text-right"><button type="button" onClick={()=>setHistoryCustomer(c)} className="inline-flex whitespace-nowrap items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100"><History className="h-4 w-4"/>ดูประวัติและส่วนลด</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {historyCustomer&&<dialog ref={historyDialog} aria-labelledby="customer-order-history-title" onCancel={()=>setHistoryCustomer(null)} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-3xl overflow-y-auto rounded-3xl border border-slate-200 bg-slate-50 p-0 shadow-2xl backdrop:bg-slate-900/50">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-5">
          <div><h2 id="customer-order-history-title" className="font-extrabold text-slate-900">ประวัติการสั่งซื้อผัก</h2><p className="mt-1 text-sm text-slate-600">{historyCustomer.full_name||historyCustomer.email}</p><p className="mt-1 text-xs text-slate-500">แสดงทุกสถานะ รวมออเดอร์ที่ยกเลิกและไม่มารับ</p></div>
          <button type="button" autoFocus aria-label="ปิดประวัติการสั่งซื้อ" onClick={()=>setHistoryCustomer(null)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5"/></button>
        </header>
        <div className="space-y-4 p-4 sm:p-5">
          {historyLoading?<p className="py-10 text-center text-sm text-slate-500">กำลังโหลดประวัติการสั่งซื้อ...</p>:historyError?<p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{historyError}</p>:historyOrders.length===0?<p className="py-10 text-center text-sm text-slate-500">ลูกค้ารายนี้ยังไม่มีคำสั่งซื้อผัก</p>:<>
            <p className="rounded-xl border border-orange-100 bg-orange-50 p-4 text-sm text-orange-900">ทั้งหมด <strong>{historyOrders.length}</strong> ออเดอร์ · ส่วนลดรวมในประวัติ <strong>฿{orderMetrics(historyOrders).discountAmount.toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><span className="mt-1 block text-xs">รวมส่วนลดที่บันทึกในออเดอร์ยกเลิกด้วย</span></p>
            {historyOrders.map(order=><article key={order.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-bold text-slate-900">ออเดอร์ #{order.id.slice(0,8)}</h3><p className="mt-1 text-xs text-slate-500">สั่งเมื่อ {formatDate(order.created_at)} · {order.planting_rounds?.name||'ไม่ระบุรอบ'}</p></div><Badge status={order.status} type="order"/></div>
              <div className="flex flex-wrap justify-between gap-2 text-sm"><span className="font-semibold text-orange-700">ส่วนลด ฿{orderDiscountAmount(order).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})}</span><span className="font-bold text-emerald-800">ยอดสุทธิ ฿{Number(order.total_amount).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
              <button type="button" onClick={()=>setSelectedHistoryOrder(order)} className="flex w-full items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-bold text-emerald-800 hover:bg-emerald-100">ดูรายละเอียดออเดอร์<ChevronRight className="h-4 w-4"/></button>
            </article>)}
          </>}
        </div>
      </dialog>}
      {selectedHistoryOrder&&<OrderHistoryDialog order={selectedHistoryOrder} onClose={()=>setSelectedHistoryOrder(null)}/>}
    </div>
  );
};
