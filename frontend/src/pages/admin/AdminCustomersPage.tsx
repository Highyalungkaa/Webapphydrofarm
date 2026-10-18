import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatDateDMY } from '../../lib/dateFormat.js';
import { AlertTriangle, Search, X } from 'lucide-react';

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
                  <th className="py-3 px-4">ที่อยู่จัดส่งเริ่มต้น</th>
                  <th className="py-3 px-4">ประวัติไม่มารับ (No-show)</th>
                  <th className="py-3 px-4 text-right">วันที่ลงทะเบียน</th>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
