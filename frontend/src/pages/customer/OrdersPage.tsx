import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { Order } from '../../types/index.js';
import { Badge } from '../../components/common/Badge.js';
import { Calendar, ShoppingBag, ArrowRight, AlertTriangle } from 'lucide-react';

export const OrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const data = await api.get<Order[]>('/orders/mine');
      setOrders(data);
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถโหลดรายการคำสั่งจองได้');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-farm-600 mb-2"></div>
        <p className="text-sm text-slate-500">กำลังโหลดคำสั่งจองของคุณ...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ประวัติการสั่งจองของฉัน</h1>
        <p className="text-xs sm:text-sm text-slate-500">ติดตามสถานะและตรวจสอบรายละเอียดการรับผักสด</p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          {error}
        </div>
      )}

      {orders.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
            <ShoppingBag className="w-8 h-8" />
          </div>
          <h2 className="font-bold text-slate-800 text-lg">ยังไม่มีรายการสั่งจอง</h2>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            คุณยังไม่ได้สั่งจองผักในรอบใดๆ เริ่มต้นสั่งจองผักสลัดสดใหม่จากฟาร์มได้เลย
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-farm-600 text-white text-xs sm:text-sm font-semibold hover:bg-farm-700 transition-colors shadow-sm shadow-farm-600/20"
          >
            <span>ดูรอบเปิดจองล่าสุด</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const totalKg = (order.order_items || []).reduce((sum, item) => sum + Number(item.qty_kg), 0);

            return (
              <div
                key={order.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 hover:border-slate-300 transition-all space-y-4"
              >
                {/* Notice banner if round was rescheduled */}
                {order.needs_customer_notice && order.status !== 'cancelled' && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span>
                      รอบนี้มีการปรับเปลี่ยนวันส่งมอบ คุณสามารถกดยกเลิกได้โดยไม่มีเงื่อนไข
                    </span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      ออเดอร์ #{order.id.slice(0, 8)} • วันที่สั่ง {formatDate(order.created_at)}
                    </span>
                    <h3 className="font-bold text-base text-slate-900 mt-0.5">
                      {order.planting_rounds?.name || 'รอบการปลูก'}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge status={order.fulfillment_method} type="fulfillment" />
                    <Badge status={order.status} type="order" />
                    <Badge status={order.payment_status} type="payment" />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs sm:text-sm">
                  <div className="space-y-1 text-slate-600">
                    <div className="flex items-center gap-1.5 font-medium text-slate-800">
                      <Calendar className="w-4 h-4 text-emerald-600" />
                      <span>
                        วันส่งมอบ: {order.planting_rounds?.fulfillment_date ? formatDate(order.planting_rounds.fulfillment_date) : '-'}
                      </span>
                    </div>
                    <p className="text-slate-500">
                      รายการ: {(order.order_items || []).map((oi) => oi.round_items?.crops?.name || 'ผัก').join(', ')} ({totalKg.toFixed(1)} กก.)
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <div className="text-right">
                      <span className="text-[11px] text-slate-400 block">ยอดรวมชำระตอนรับของ</span>
                      <span className="text-base font-extrabold text-slate-900">
                        ฿{Number(order.total_amount).toLocaleString()}
                      </span>
                    </div>

                    <Link
                      to={`/orders/${order.id}`}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-colors flex items-center gap-1"
                    >
                      <span>รายละเอียด</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
