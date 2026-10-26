import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { FarmMetrics } from '../../types/index.js';
import {
  Sprout,
  Save,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  PieChart,
  LayoutGrid,
  CheckCircle2,
  Clock,
  Wrench,
} from 'lucide-react';

export const AdminFarmPage: React.FC = () => {
  const [metrics, setMetrics] = useState<FarmMetrics | null>(null);
  const [farmTotalSlots, setFarmTotalSlots] = useState(5000);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFarmSettings();
  }, []);

  const loadFarmSettings = async () => {
    try {
      setLoading(true);
      const data = await api.get<FarmMetrics>('/admin/farm');
      setMetrics(data);
      setFarmTotalSlots(data.farm_total_slots || 5000);
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถโหลดข้อมูลฟาร์มได้');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(null);
    setError(null);

    try {
      setSaving(true);
      await api.put('/admin/farm', {
        farm_total_slots: Number(farmTotalSlots),
      });

      setSuccess('บันทึกการตั้งค่าฟาร์มเรียบร้อยแล้ว');
      await loadFarmSettings();
      setTimeout(() => setSuccess(null), 3500);
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-20 text-center text-slate-500 text-sm">กำลังโหลดข้อมูลตั้งค่าฟาร์ม...</div>;
  }

  const allocated = metrics?.total_allocated_slots || 0;
  const total = metrics?.farm_total_slots || farmTotalSlots;
  const available = Math.max(0, total - allocated);
  const percent = total > 0 ? Math.min(100, Math.round((allocated / total) * 100)) : 0;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">ตั้งค่าฟาร์มและกำลังการผลิต</h1>
          <p className="text-xs sm:text-sm text-slate-500">
            กำหนดจำนวนต้นสูงสุดที่ฟาร์มรองรับได้ เพื่อใช้จัดสรรจำนวนต้นให้แต่ละแปลงปลูก
          </p>
        </div>
        <Link
          to="/admin/plots"
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-sm transition-colors self-start sm:self-auto"
        >
          <LayoutGrid className="w-4 h-4" />
          <span>จัดการแปลงปลูกทั้งหมด</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {success && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Capacity Overview Statistics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-xs font-semibold text-slate-500">จำนวนต้นสูงสุดที่ฟาร์มรองรับ</span>
          <p className="text-2xl font-black text-slate-900">{total.toLocaleString()} <span className="text-xs font-normal text-slate-500">ต้น</span></p>
          <span className="text-[11px] text-slate-400 block">ความจุรวมของฟาร์ม</span>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-xs font-semibold text-emerald-700">จำนวนต้นที่จัดสรรให้แปลงแล้ว</span>
          <p className="text-2xl font-black text-emerald-600">{allocated.toLocaleString()} <span className="text-xs font-normal text-slate-500">ต้น</span></p>
          <span className="text-[11px] text-emerald-600 font-medium">{percent}% ของความจุฟาร์ม</span>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-xs font-semibold text-amber-700">จำนวนต้นที่ยังจัดสรรได้</span>
          <p className="text-2xl font-black text-amber-600">{available.toLocaleString()} <span className="text-xs font-normal text-slate-500">ต้น</span></p>
          <span className="text-[11px] text-slate-400 block">สำหรับเพิ่มความจุให้แปลงปลูก</span>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-xs font-semibold text-slate-500">จำนวนแปลงทั้งหมด</span>
          <p className="text-2xl font-black text-slate-900">{metrics?.total_plots || 0} <span className="text-xs font-normal text-slate-500">แปลง</span></p>
          <span className="text-[11px] text-slate-400 block">{metrics?.zones.length || 0} โซนในฟาร์ม</span>
        </div>
      </div>

      {/* Visual Capacity Bar */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs space-y-3">
        <div className="flex items-center justify-between text-xs sm:text-sm font-semibold">
          <span className="text-slate-800">
            สัดส่วนจำนวนต้นที่จัดสรรให้แปลงปลูก: {allocated.toLocaleString()} / {total.toLocaleString()} ต้น
          </span>
          <span className="text-emerald-700 font-extrabold">{percent}%</span>
        </div>

        <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
          <div
            className={`h-full rounded-full transition-all ${
              percent >= 100
                ? 'bg-rose-500'
                : percent >= 80
                ? 'bg-amber-500'
                : 'bg-gradient-to-r from-emerald-500 to-farm-600'
            }`}
            style={{ width: `${percent}%` }}
          ></div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>0 ต้น</span>
          <span>50%</span>
          <span>{total.toLocaleString()} ต้น (เต็มความจุ)</span>
        </div>
      </div>

      {/* Farm Settings Form */}
      <form onSubmit={handleSave} className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-xs space-y-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900">แก้ไขข้อมูลและการตั้งค่าฟาร์ม</h2>
          <p className="text-xs text-slate-500">
            จำนวนต้นสูงสุดที่ฟาร์มรองรับได้จะใช้ตรวจสอบความจุเมื่อสร้างหรือแก้ไขแปลงปลูก
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="font-bold text-xs sm:text-sm text-slate-800 block mb-1">
              จำนวนต้นสูงสุดที่ฟาร์มรองรับได้ *
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={farmTotalSlots}
              onChange={(e) => setFarmTotalSlots(parseInt(e.target.value, 10) || 0)}
              required
              className="w-full sm:w-64 px-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-bold text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <span className="text-[11px] text-slate-500 mt-1 block">
              * ต้องไม่น้อยกว่าจำนวนต้นที่จัดสรรให้แปลงปลูกแล้ว ({allocated.toLocaleString()} ต้น)
            </span>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-sm transition-all flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่าฟาร์ม'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
