import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatDateDMY } from '../../lib/dateFormat.js';
import { Users, AlertTriangle } from 'lucide-react';

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">รายชื่อลูกค้า (Customers)</h1>
        <p className="text-xs sm:text-sm text-slate-500">
          ตรวจสอบประวัติการสั่งซื้อ ข้อมูลติดต่อ และสถิติไม่มารับของ (No-show)
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-500 text-sm">กำลังโหลดข้อมูลลูกค้า...</div>
        ) : customers.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">ยังไม่มีข้อมูลลูกค้า</div>
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
                {customers.map((c) => (
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
