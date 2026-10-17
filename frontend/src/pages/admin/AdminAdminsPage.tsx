import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatDateDMY } from '../../lib/dateFormat.js';
import { ShieldAlert, Plus, Trash2, AlertCircle, X } from 'lucide-react';

interface AdminUser {
  id: string;
  email: string;
  created_at: string;
}

export const AdminAdminsPage: React.FC = () => {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      setSaving(true);
      await api.post('/admin/admins', { email: email.trim() });
      setIsModalOpen(false);
      setEmail('');
      await loadAdmins();
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถเพิ่มแอดมินได้');
    } finally {
      setSaving(false);
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
            จัดการอีเมล Google ที่ได้รับสิทธิ์เข้าใช้งานระบบหลังบ้าน
          </p>
        </div>
        <button
          onClick={() => {
            setEmail('');
            setError(null);
            setIsModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-sm transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>เพิ่มอีเมลแอดมิน</span>
        </button>
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

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-lg font-bold text-slate-900">เพิ่มอีเมลผู้ดูแลระบบ</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleAddAdmin} className="space-y-4 text-xs sm:text-sm">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  อีเมล Google ของแอดมิน *
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  เมื่อผู้ใช้ล็อกอินด้วยอีเมลนี้ ระบบจะอนุญาตให้เข้าใช้งานหน้า /admin ได้ทันที
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  {saving ? 'กำลังเพิ่ม...' : 'เพิ่มสิทธิ์แอดมิน'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
