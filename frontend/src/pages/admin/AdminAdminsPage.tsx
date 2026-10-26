import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatDateDMY } from '../../lib/dateFormat.js';
import { ShieldAlert, Trash2 } from 'lucide-react';

interface AdminUser {
  id: string;
  email: string;
  created_at: string;
}

export const AdminAdminsPage: React.FC = () => {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAdmins();
  }, []);

  const loadAdmins = async () => {
    try {
      setLoading(true);
      const data = await api.get<AdminUser[]>('/admin/admins');
      setAdmins(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAdmin = async (id: string, adminEmail: string) => {
    if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบสิทธิ์แอดมินของ ${adminEmail}?`)) return;

    try {
      await api.delete(`/admin/admins/${id}`);
      await loadAdmins();
    } catch (err: any) {
      alert(err.message || 'ไม่สามารถลบสิทธิ์แอดมินได้');
    }
  };

  const formatDate = formatDateDMY;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">ผู้ดูแลระบบ (Admin Users)</h1>
          <p className="text-xs sm:text-sm text-slate-500">
            รายชื่ออีเมล Google ที่ได้รับสิทธิ์เข้าใช้งานระบบหลังบ้าน เพิ่มผู้ดูแลระบบผ่านฐานข้อมูลเท่านั้น
          </p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-500 text-sm">กำลังโหลดข้อมูลแอดมิน...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 uppercase text-[11px] font-semibold">
                  <th className="py-3 px-4">อีเมลผู้ดูแลระบบ</th>
                  <th className="py-3 px-4">วันที่เพิ่มสิทธิ์</th>
                  <th className="py-3 px-4 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {admins.map((adm) => (
                  <tr key={adm.id} className="hover:bg-slate-50/60">
                    <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <ShieldAlert className="w-4 h-4" />
                      </div>
                      <span>{adm.email}</span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">{formatDate(adm.created_at)}</td>
                    <td className="py-3.5 px-4 text-right">
                      {admins.length > 1 && (
                        <button
                          onClick={() => handleDeleteAdmin(adm.id, adm.email)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100"
                          title="ลบสิทธิ์แอดมิน"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
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
