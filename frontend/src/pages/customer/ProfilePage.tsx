import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../lib/api.js';
import { User, Phone, MapPin, CheckCircle, AlertCircle, LogOut } from 'lucide-react';

export const ProfilePage: React.FC = () => {
  const { user, profile, refreshProfile, signOut } = useAuth();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [addressDetail, setAddressDetail] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setPhone(profile.phone || '');
      setAddressDetail(profile.address_detail || '');
    }
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      setIsSaving(true);
      await api.put('/profile', {
        full_name: fullName.trim(),
        phone: phone.trim(),
        address_detail: addressDetail.trim() || null,
      });

      await refreshProfile();
      setSuccessMessage('บันทึกข้อมูลส่วนตัวเรียบร้อยแล้ว');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'ไม่สามารถบันทึกข้อมูลได้');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ข้อมูลส่วนตัว</h1>
        <p className="text-xs sm:text-sm text-slate-500">จัดการข้อมูลติดต่อและที่อยู่เริ่มต้นสำหรับการสั่งจอง</p>
      </div>

      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-6">
        {/* Account Info */}
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-100">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-lg">
            {fullName ? fullName[0].toUpperCase() : 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-slate-900 truncate">{fullName || 'ผู้ใช้งาน'}</h2>
            <p className="text-xs text-slate-500 truncate">{user?.email}</p>
          </div>
          {profile?.is_admin && (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
              ผู้ดูแลระบบ
            </span>
          )}
        </div>

        {/* No show counter warning if > 0 */}
        {(profile?.no_show_count ?? 0) > 0 && (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
            ⚠️ ประวัติไม่มารับของ: <strong>{profile?.no_show_count} ครั้ง</strong> (กรุณามารับของตามนัดหมายเสมอ)
          </div>
        )}

        {successMessage && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Edit Form */}
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              ชื่อ-นามสกุล (สำหรับติดต่อ) *
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="ชื่อและนามสกุล"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-farm-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              เบอร์โทรศัพท์มือถือ *
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="08X-XXX-XXXX"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-farm-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              ที่อยู่จัดส่งสินค้า (สำหรับนำไปใช้จัดส่งเมื่อสั่งจอง)
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <textarea
                rows={3}
                value={addressDetail}
                onChange={(e) => setAddressDetail(e.target.value)}
                placeholder="บ้านเลขที่, ถนน, ซอย, ตำบล/แขวง, อำเภอ/เขต, จังหวัด, รหัสไปรษณีย์ หรือจุดสังเกต..."
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-farm-500 leading-relaxed"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              💡 เมื่อคุณเลือกวิธีรับของแบบ "จัดส่งสินค้า" ในการสั่งจอง ระบบจะใช้ที่อยู่นี้เป็นค่าเริ่มต้นโดยอัตโนมัติ
            </p>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-3 rounded-xl bg-farm-600 hover:bg-farm-700 text-white font-bold text-xs sm:text-sm shadow-sm transition-all"
            >
              {isSaving ? 'กำลังบันทึก...' : 'บันทึกข้อมูลส่วนตัว'}
            </button>
          </div>
        </form>

        <div className="pt-4 border-t border-slate-100 flex justify-center">
          <button
            onClick={() => signOut()}
            className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1.5 p-2 rounded-lg hover:bg-rose-50 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </div>
    </div>
  );
};
