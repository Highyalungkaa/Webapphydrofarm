import { formatKg } from '../../lib/bookingQuantity.js';
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { formatDateDMY, formatDateTimeDMY } from '../../lib/dateFormat.js';
import { Order } from '../../types/index.js';
import { Badge } from '../../components/common/Badge.js';
import { CustomerPageHeader } from '../../components/common/CustomerPageHeader.js';
import {
  Calendar,
  Clock,
  Store,
  Truck,
  ArrowLeft,
  AlertTriangle,
  Phone,
  Ban,
  CheckCircle,
  ShoppingBag,
} from 'lucide-react';

export const OrderDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cancellation state
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState(false);
  const [farmContactPhone, setFarmContactPhone] = useState<string | null>(null);
  const [cancellationDeadlineHours, setCancellationDeadlineHours] = useState(24);

  useEffect(() => {
    if (id) fetchOrderDetail(id);
  }, [id]);

  useEffect(() => {
    void api.get<{ phone: string | null; cancellation_deadline_hours: number }>('/settings/contact')
      .then((contact) => {
        setFarmContactPhone(contact.phone);
        setCancellationDeadlineHours(contact.cancellation_deadline_hours);
      })
      .catch(() => setFarmContactPhone(null));
  }, []);

  const fetchOrderDetail = async (orderId: string) => {
    try {
      setLoading(true);
      const data = await api.get<Order>(`/orders/${orderId}`);
      setOrder(data);
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถโหลดข้อมูลคำสั่งจองได้');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!order) return;
    setCancelError(null);

    try {
      setIsCancelling(true);
      await api.post(`/orders/${order.id}/cancel`, {
        reason: cancelReason.trim() || undefined,
      });
      setCancelSuccess(true);
      setIsCancelModalOpen(false);
      await fetchOrderDetail(order.id);
    } catch (err: any) {
      setCancelError(err.message || 'ไม่สามารถยกเลิกคำสั่งจองได้');
    } finally {
      setIsCancelling(false);
    }
  };

  const formatDate = formatDateDMY;

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-farm-600 mb-2"></div>
        <p className="text-sm text-slate-500">กำลังโหลดรายละเอียดออเดอร์...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="p-8 text-center space-y-4">
        <div className="p-4 rounded-xl bg-rose-50 text-rose-700 text-sm max-w-md mx-auto">
          {error || 'ไม่พบคำสั่งจองที่ระบุ'}
        </div>
        <Link
          to="/orders"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-farm-600 hover:text-farm-700"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>กลับหน้ารายการออเดอร์</span>
        </Link>
      </div>
    );
  }

  const canCancel = order.status !== 'cancelled' && order.status !== 'completed';
  const farmPhoneHref = farmContactPhone ? `tel:${farmContactPhone.replace(/[^+\d]/g, '')}` : null;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-8">
      <Link
        to="/orders"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>กลับหน้ารายการออเดอร์</span>
      </Link>

      <CustomerPageHeader
        eyebrow={`คำสั่งจอง #${order.id.slice(0, 8)}`}
        title={order.planting_rounds?.name || 'รายละเอียดคำสั่งจองผัก'}
        description="ติดตามสถานะ รายการผัก และกำหนดรับสินค้าของคำสั่งจองนี้"
        icon={<ShoppingBag className="h-7 w-7" />}
      >
        <div className="flex flex-wrap gap-2"><Badge status={order.status} type="order" /><Badge status={order.payment_status} type="payment" /></div>
      </CustomerPageHeader>

      {/* Success banner if just cancelled */}
      {cancelSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex items-center gap-2">
          <CheckCircle className="w-5 h-5 flex-shrink-0 text-emerald-600" />
          <span>ยกเลิกคำสั่งจองเรียบร้อยแล้ว</span>
        </div>
      )}

      {/* Reschedule banner for customer (Rule 4.7) */}
      {order.needs_customer_notice && order.status !== 'cancelled' && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs sm:text-sm space-y-1.5">
          <div className="flex items-center gap-2 font-bold text-amber-950">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <span>แจ้งเตือนการเปลี่ยนแปลงกำหนดเวลาส่งมอบ</span>
          </div>
          <p className="text-amber-800">
            ทางฟาร์มได้มีการปรับเปลี่ยนวันเก็บเกี่ยวหรือเวลาส่งมอบสำหรับรอบนี้ หากท่านไม่สะดวกรับของในกำหนดเวลาใหม่ ท่านสามารถกดยกเลิกคำสั่งจองได้ทันทีโดยไม่มีเงื่อนไขและไม่กระทบประวัติของท่าน
          </p>
        </div>
      )}

      {/* Main Order Card */}
      <div className="bg-white rounded-[1.75rem] p-6 sm:p-8 border border-emerald-100 shadow-sm space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              สรุปคำสั่งจอง
            </span>
            <h2 className="text-xl font-bold text-slate-900 mt-0.5">
              {order.planting_rounds?.name || 'รอบการปลูก'}
            </h2>
            <span className="text-xs text-slate-500">สั่งเมื่อ: {formatDate(order.created_at)}</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge status={order.status} type="order" />
            <Badge status={order.payment_status} type="payment" />
          </div>
        </div>

        {/* Cancellation Notice if cancelled */}
        {order.status === 'cancelled' && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <Ban className="w-4 h-4 text-rose-600" />
              <span>คำสั่งจองนี้ถูกยกเลิกแล้ว</span>
            </p>
            <p>เวลายกเลิก: {formatDate(order.cancelled_at)}</p>
            {order.cancel_reason && <p>เหตุผล: {order.cancel_reason}</p>}
          </div>
        )}

        {/* Fulfillment Information */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            ข้อมูลการรับสินค้าและการติดต่อ
          </h2>
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-3 text-xs sm:text-sm">
            <div className="flex items-center gap-2">
              <Badge status={order.fulfillment_method} type="fulfillment" />
              <span className="font-semibold text-slate-900">
                {order.fulfillment_method === 'pickup' ? 'มารับเองที่ฟาร์ม' : 'จัดส่งในตัวเมือง'}
              </span>
            </div>

            <div className="flex items-center gap-2 text-slate-700">
              <Calendar className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>
                วันส่งมอบ: <strong>{formatDateDMY(order.planting_rounds?.fulfillment_date)}</strong>
              </span>
            </div>

            {order.fulfillment_method === 'delivery' && (
              <div className="flex items-center gap-2 text-slate-700">
                <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span>
                  ช่วงเวลาจัดส่ง: {order.planting_rounds?.delivery_start_time?.slice(0, 5)} - {order.planting_rounds?.delivery_end_time?.slice(0, 5)} น.
                </span>
              </div>
            )}

            {order.fulfillment_method === 'delivery' && (
              <div className="flex items-start gap-2 text-slate-700 pt-1 border-t border-slate-200">
                <Truck className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-slate-900">
                    ที่อยู่จัดส่ง:
                  </p>
                  <p className="text-slate-600 whitespace-pre-line leading-relaxed">{order.delivery_address || '-'}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 text-slate-700 pt-1 border-t border-slate-200">
              <Phone className="w-4 h-4 text-slate-500 flex-shrink-0" />
              <span>เบอร์ติดต่อที่บันทึกไว้: <strong>{order.contact_phone}</strong></span>
            </div>

            {order.note && (
              <p className="text-xs text-slate-600 italic bg-white p-2.5 rounded-lg border border-slate-200">
                หมายเหตุถึงฟาร์ม: {order.note}
              </p>
            )}
          </div>
        </div>

        {/* Veggie Items Breakdown */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            รายการผักในออเดอร์
          </h2>
          <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
            {order.order_items?.map((item) => (
              <div key={item.id} className="p-3.5 flex items-center justify-between text-xs sm:text-sm">
                <div>
                  <h4 className="font-semibold text-slate-900">
                    {item.round_items?.crops?.name || 'ผักสลัด'}
                  </h4>
                  <p className="text-slate-500 text-xs">
                    ฿{Number(item.price_per_kg).toFixed(0)} × {formatKg(Number(item.qty_kg))} กก.
                  </p>
                </div>
                <div className="text-right">
                  {Number(item.discount_amount || 0) > 0 && <p className="text-[11px] text-slate-400 line-through">฿{(Number(item.qty_kg) * Number(item.price_per_kg)).toLocaleString()}</p>}
                  {Number(item.discount_amount || 0) > 0 && <p className="text-[11px] font-semibold text-emerald-700">ส่วนลด −฿{Number(item.discount_amount).toLocaleString()}</p>}
                  <span className="font-bold text-slate-900">
                    ฿{Math.max(0, Number(item.qty_kg) * Number(item.price_per_kg) - Number(item.discount_amount || 0)).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}

            <div className="p-4 bg-slate-50 flex items-center justify-between font-extrabold text-sm sm:text-base">
              <span className="text-slate-800">ยอดรวมทั้งสิ้น (ชำระตอนรับของ)</span>
              <span className="text-farm-700">฿{Number(order.total_amount).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Cancellation action button */}
        {canCancel && (
          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              onClick={() => setIsCancelModalOpen(true)}
              className="px-4 py-2 rounded-xl text-rose-600 border border-rose-200 hover:bg-rose-50 text-xs font-semibold transition-colors"
            >
              ขอยกเลิกคำสั่งจองนี้
            </button>
          </div>
        )}
      </div>

      {/* Cancellation Modal Dialog */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-bold text-base text-slate-900">ยืนยันการยกเลิกคำสั่งจอง</h3>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              {order.needs_customer_notice
                ? 'เนื่องจากรอบนี้มีการปรับเปลี่ยนวัน/เวลา ท่านสามารถยกเลิกได้โดยไม่มีค่าธรรมเนียมและไม่นับเป็นประวัติไม่มารับของ'
                : `คุณสามารถยกเลิกได้ก่อนถึงกำหนดเวลาส่งมอบอย่างน้อย ${cancellationDeadlineHours} ชั่วโมง กรุณาระบุเหตุผลการยกเลิก:`}
            </p>

            <textarea
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="ระบุเหตุผล เช่น ติดธุระด่วนในวันส่งมอบ..."
              className="w-full p-3 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
            />

            {cancelError && (
              <div role="alert" className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
                <p>{cancelError}</p>
                {cancelError.includes('เลยกำหนดเวลายกเลิก') && farmContactPhone && farmPhoneHref && (
                  <a href={farmPhoneHref} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-2 font-bold text-white hover:bg-rose-800">
                    <Phone className="h-3.5 w-3.5" />โทรหาแอดมินฟาร์ม: {farmContactPhone}
                  </a>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                disabled={isCancelling}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                ปิดหน้าต่าง
              </button>
              <button
                type="button"
                onClick={handleCancelOrder}
                disabled={isCancelling}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-sm"
              >
                {isCancelling ? 'กำลังดำเนินการ...' : 'ยืนยันยกเลิกออเดอร์'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
