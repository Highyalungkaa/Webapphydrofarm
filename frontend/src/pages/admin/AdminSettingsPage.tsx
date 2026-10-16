import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { Settings, Save, CheckCircle, AlertCircle } from 'lucide-react';

export const AdminSettingsPage: React.FC = () => {
  const [deliveryMinTotalKg, setDeliveryMinTotalKg] = useState<number>(0);
  const [largeOrderThresholdKg, setLargeOrderThresholdKg] = useState<number>(10);
  const [cancellationDeadlineHours, setCancellationDeadlineHours] = useState<number>(24);
  const [noShowLimit, setNoShowLimit] = useState<number>(0);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/settings');
      const map = res.map || {};
      if (map.delivery_min_total_kg !== undefined) setDeliveryMinTotalKg(Number(map.delivery_min_total_kg));
      if (map.large_order_threshold_kg !== undefined) setLargeOrderThresholdKg(Number(map.large_order_threshold_kg));
      if (map.cancellation_deadline_hours_before_harvest !== undefined) setCancellationDeadlineHours(Number(map.cancellation_deadline_hours_before_harvest));
      if (map.no_show_limit !== undefined) setNoShowLimit(Number(map.no_show_limit));
    } catch (err: any) {
      console.error(err);
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
      await api.put('/admin/settings', {
        delivery_min_total_kg: Number(deliveryMinTotalKg),
        large_order_threshold_kg: Number(largeOrderThresholdKg),
        cancellation_deadline_hours_before_harvest: Number(cancellationDeadlineHours),
        no_show_limit: Number(noShowLimit),
      });

      setSuccess('บันทึกการตั้งค่าระบบเรียบร้อยแล้ว');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถบันทึกการตั้งค่าได้');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-20 text-center text-slate-500 text-sm">กำลังโหลดการตั้งค่า...</div>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">ตั้งค่าระบบ (App Settings)</h1>
        <p className="text-xs sm:text-sm text-slate-500">
          กำหนดเกณฑ์ธุรกิจ การส่งมอบ ออเดอร์ใหญ่ และเงื่อนไขการยกเลิก
        </p>
      </div>

      {success && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-xs space-y-6">
        {/* Delivery Min Total Kg */}
        <div className="space-y-1.5 border-b border-slate-100 pb-5">
          <label className="font-bold text-sm text-slate-900 block">
            ยอดสั่งซื้อขั้นต่ำสำหรับการจัดส่งฟรีในตัวเมือง (กิโลกรัม)
          </label>
          <p className="text-xs text-slate-500">
            หากออเดอร์ของลูกค้ารวมกันแล้วไม่ถึงจำนวนนี้ จะเลือกได้เฉพาะ "มารับเองที่ฟาร์ม" (ใส่ 0 เพื่อปิดการจำกัด)
          </p>
          <div className="w-40 pt-1">
            <input
              type="number"
              step="0.5"
              min="0"
              value={deliveryMinTotalKg}
              onChange={(e) => setDeliveryMinTotalKg(parseFloat(e.target.value) || 0)}
              className="w-full p-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900"
              required
            />
          </div>
        </div>

        {/* Large Order Threshold */}
        <div className="space-y-1.5 border-b border-slate-100 pb-5">
          <label className="font-bold text-sm text-slate-900 block">
            เกณฑ์ออเดอร์ขนาดใหญ่ที่ต้องรอแอดมินโทรยืนยัน (กิโลกรัม)
          </label>
          <p className="text-xs text-slate-500">
            ออเดอร์ที่มีน้ำหนักรวมตั้งแต่เกณฑ์นี้ขึ้นไป จะเริ่มต้นด้วยสถานะ "รอยืนยัน" (pending_confirmation) เพื่อให้แอดมินโทรคุยก่อนยืนยัน
          </p>
          <div className="w-40 pt-1">
            <input
              type="number"
              step="1"
              min="1"
              value={largeOrderThresholdKg}
              onChange={(e) => setLargeOrderThresholdKg(parseFloat(e.target.value) || 1)}
              className="w-full p-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900"
              required
            />
          </div>
        </div>

        {/* Cancellation Deadline */}
        <div className="space-y-1.5 border-b border-slate-100 pb-5">
          <label className="font-bold text-sm text-slate-900 block">
            เส้นตายเวลายกเลิกออเดอร์ของลูกค้า (ชั่วโมงก่อนถึงกำหนดส่งมอบ)
          </label>
          <p className="text-xs text-slate-500">
            ลูกค้าสามารถกดยกเลิกออเดอร์ได้เองจนถึงเส้นตายนี้ หลังจากนั้นจะมีเพียงแอดมินเท่านั้นที่ยกเลิกได้
          </p>
          <div className="w-40 pt-1">
            <input
              type="number"
              step="1"
              min="0"
              value={cancellationDeadlineHours}
              onChange={(e) => setCancellationDeadlineHours(parseInt(e.target.value, 10) || 0)}
              className="w-full p-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900"
              required
            />
          </div>
        </div>

        {/* No Show Limit */}
        <div className="space-y-1.5">
          <label className="font-bold text-sm text-slate-900 block">
            จำนวนครั้งไม่มารับของสูงสุดก่อนถูกระงับการจอง (No-show limit)
          </label>
          <p className="text-xs text-slate-500">
            หากลูกค้ามีประวัติไม่มารับของสะสมถึงจำนวนนี้ ระบบจะปฏิเสธการจองรอบใหม่ (ใส่ 0 เพื่อปิดการระงับ)
          </p>
          <div className="w-40 pt-1">
            <input
              type="number"
              step="1"
              min="0"
              value={noShowLimit}
              onChange={(e) => setNoShowLimit(parseInt(e.target.value, 10) || 0)}
              className="w-full p-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900"
              required
            />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-sm transition-all flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
