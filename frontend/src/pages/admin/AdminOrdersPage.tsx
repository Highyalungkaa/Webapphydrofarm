import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { Order, PlantingRound, OrderStatus, PaymentStatus, PaymentMethod } from '../../types/index.js';
import { Badge } from '../../components/common/Badge.js';
import {
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  AlertTriangle,
  UserX,
  CreditCard,
  X,
} from 'lucide-react';

export const AdminOrdersPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [rounds, setRounds] = useState<PlantingRound[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedRound, setSelectedRound] = useState(searchParams.get('round_id') || '');
  const [selectedStatus, setSelectedStatus] = useState(searchParams.get('status') || '');
  const [selectedFulfillment, setSelectedFulfillment] = useState('');
  const [selectedPayment, setSelectedPayment] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected order for detail & actions modal
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [modalStatus, setModalStatus] = useState<OrderStatus>('confirmed');
  const [modalPaymentStatus, setModalPaymentStatus] = useState<PaymentStatus>('unpaid');
  const [modalPaymentMethod, setModalPaymentMethod] = useState<PaymentMethod>('cash');
  const [modalCancelReason, setModalCancelReason] = useState('');

  useEffect(() => {
    api.get<PlantingRound[]>('/admin/rounds').then(setRounds).catch(console.error);
    loadOrders();
  }, [selectedRound, selectedStatus, selectedFulfillment, selectedPayment]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedRound) params.append('round_id', selectedRound);
      if (selectedStatus) params.append('status', selectedStatus);
      if (selectedFulfillment) params.append('fulfillment_method', selectedFulfillment);
      if (selectedPayment) params.append('payment_status', selectedPayment);
      if (searchQuery) params.append('search', searchQuery);

      const data = await api.get<Order[]>(`/admin/orders?${params.toString()}`);
      setOrders(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDetailModal = (order: Order) => {
    setSelectedOrder(order);
    setModalStatus(order.status);
    setModalPaymentStatus(order.payment_status);
    setModalPaymentMethod(order.payment_method || 'cash');
    setModalCancelReason(order.cancel_reason || '');
  };

  const handleUpdateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;

    try {
      setIsUpdating(true);
      await api.patch(`/admin/orders/${selectedOrder.id}`, {
        status: modalStatus,
        payment_status: modalPaymentStatus,
        payment_method: modalPaymentStatus === 'paid' ? modalPaymentMethod : null,
        cancel_reason: modalStatus === 'cancelled' ? modalCancelReason : null,
      });

      setSelectedOrder(null);
      await loadOrders();
    } catch (err: any) {
      alert(err.message || 'เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleQuickConfirm = async (orderId: string) => {
    try {
      await api.patch(`/admin/orders/${orderId}`, { status: 'confirmed' });
      await loadOrders();
    } catch (err: any) {
      alert(err.message || 'ไม่สามารถยืนยันได้');
    }
  };

  const handleQuickMarkPaid = async (orderId: string, method: PaymentMethod) => {
    try {
      await api.patch(`/admin/orders/${orderId}`, {
        payment_status: 'paid',
        payment_method: method,
      });
      await loadOrders();
    } catch (err: any) {
      alert(err.message || 'ไม่สามารถบันทึกการชำระเงินได้');
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('th-TH', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">จัดการคำสั่งจอง</h1>
        <p className="text-xs sm:text-sm text-slate-500">
          ตรวจสอบคำสั่งจอง กรองสถานะ ยืนยันออเดอร์ใหญ่ และบันทึกการชำระเงิน
        </p>
      </div>

      {/* Filter Controls Card */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {/* Round Filter */}
          <div>
            <label className="font-bold text-slate-700 block mb-1">รอบการปลูก</label>
            <select
              value={selectedRound}
              onChange={(e) => setSelectedRound(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-slate-200 bg-white"
            >
              <option value="">-- ทุกรอบการปลูก --</option>
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="font-bold text-slate-700 block mb-1">สถานะออเดอร์</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-slate-200 bg-white"
            >
              <option value="">-- ทุกสถานะ --</option>
              <option value="pending_confirmation">รอยืนยัน (ออเดอร์ใหญ่)</option>
              <option value="confirmed">ยืนยันแล้ว</option>
              <option value="ready">พร้อมรับ/ส่ง</option>
              <option value="completed">สำเร็จแล้ว</option>
              <option value="cancelled">ยกเลิกแล้ว</option>
              <option value="no_show">ไม่มารับของ</option>
            </select>
          </div>

          {/* Fulfillment Method */}
          <div>
            <label className="font-bold text-slate-700 block mb-1">วิธีรับสินค้า</label>
            <select
              value={selectedFulfillment}
              onChange={(e) => setSelectedFulfillment(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-slate-200 bg-white"
            >
              <option value="">-- ทุกวิธี --</option>
              <option value="pickup">มารับเองที่ฟาร์ม</option>
              <option value="delivery">จัดส่งในตัวเมือง</option>
            </select>
          </div>

          {/* Payment Status */}
          <div>
            <label className="font-bold text-slate-700 block mb-1">สถานะชำระเงิน</label>
            <select
              value={selectedPayment}
              onChange={(e) => setSelectedPayment(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-slate-200 bg-white"
            >
              <option value="">-- ทั้งหมด --</option>
              <option value="unpaid">รอชำระเงิน</option>
              <option value="paid">ชำระแล้ว</option>
            </select>
          </div>

          {/* Search bar */}
          <div>
            <label className="font-bold text-slate-700 block mb-1">ค้นหา</label>
            <div className="flex gap-1.5">
              <input
                type="text"
                placeholder="ชื่อ / เบอร์ / รหัส..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadOrders()}
                className="w-full p-2.5 rounded-xl border border-slate-200"
              />
              <button
                type="button"
                onClick={loadOrders}
                className="p-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-500 text-sm">กำลังโหลดข้อมูลคำสั่งจอง...</div>
        ) : orders.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">ไม่พบคำสั่งจองตามเงื่อนไขที่เลือก</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 uppercase text-[11px] font-semibold">
                  <th className="py-3 px-4">รหัส / วันที่</th>
                  <th className="py-3 px-4">ลูกค้า / เบอร์ติดต่อ</th>
                  <th className="py-3 px-4">รอบการปลูก</th>
                  <th className="py-3 px-4">วิธีรับ / ที่อยู่</th>
                  <th className="py-3 px-4">ยอดรวม</th>
                  <th className="py-3 px-4">สถานะออเดอร์</th>
                  <th className="py-3 px-4">การชำระเงิน</th>
                  <th className="py-3 px-4 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((order) => {
                  const totalKg = (order.order_items || []).reduce((sum, oi) => sum + Number(oi.qty_kg), 0);

                  return (
                    <tr key={order.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-900 block">#{order.id.slice(0, 8)}</span>
                        <span className="text-[11px] text-slate-400">{formatDate(order.created_at)}</span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">
                          {order.profiles?.full_name || 'ลูกค้า'}
                        </div>
                        <span className="text-[11px] text-slate-500">{order.contact_phone}</span>
                        {(order.profiles?.no_show_count ?? 0) > 0 && (
                          <span className="block text-[10px] text-rose-600 font-semibold">
                            ⚠️ no-show: {order.profiles?.no_show_count} ครั้ง
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-slate-700">
                        <div className="font-medium truncate max-w-[150px]">
                          {order.planting_rounds?.name || '-'}
                        </div>
                        <span className="text-[11px] text-slate-400">
                          ส่ง: {order.planting_rounds?.fulfillment_date || '-'}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <Badge status={order.fulfillment_method} type="fulfillment" />
                        {order.fulfillment_method === 'delivery' && (
                          <span className="block text-[11px] text-slate-500 truncate max-w-[140px] mt-0.5">
                            {order.districts?.name}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-extrabold text-slate-900">
                          ฿{Number(order.total_amount).toLocaleString()}
                        </span>
                        <span className="block text-[11px] text-slate-400">
                          ({totalKg.toFixed(1)} กก.)
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <Badge status={order.status} type="order" />
                        {order.status === 'pending_confirmation' && (
                          <button
                            onClick={() => handleQuickConfirm(order.id)}
                            className="block mt-1 px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-semibold"
                          >
                            ✓ ยืนยันแล้ว
                          </button>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <Badge status={order.payment_status} type="payment" />
                        {order.payment_status === 'paid' && order.payment_method && (
                          <span className="block text-[10px] text-slate-400">
                            ({order.payment_method === 'cash' ? 'เงินสด' : 'โอนเงิน'})
                          </span>
                        )}
                        {order.payment_status === 'unpaid' && order.status !== 'cancelled' && (
                          <div className="flex gap-1 mt-1">
                            <button
                              onClick={() => handleQuickMarkPaid(order.id, 'cash')}
                              className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px]"
                              title="บันทึกว่าจ่ายเงินสดแล้ว"
                            >
                              สด
                            </button>
                            <button
                              onClick={() => handleQuickMarkPaid(order.id, 'transfer')}
                              className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px]"
                              title="บันทึกว่าโอนเงินแล้ว"
                            >
                              โอน
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleOpenDetailModal(order)}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors"
                        >
                          จัดการ
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Order Detail & Action Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[11px] uppercase font-bold text-slate-400">
                  ออเดอร์ #{selectedOrder.id.slice(0, 8)}
                </span>
                <h2 className="text-lg font-bold text-slate-900">
                  รายละเอียดและปรับสถานะคำสั่งจอง
                </h2>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Customer & Fulfillment Info */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block font-medium">ลูกค้า</span>
                <p className="font-bold text-slate-900">{selectedOrder.profiles?.full_name}</p>
                <p className="text-slate-500">{selectedOrder.profiles?.email}</p>
                <p className="text-slate-700 mt-1">โทร: {selectedOrder.contact_phone}</p>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">วิธีรับและสถานที่</span>
                <p className="font-bold text-slate-900">
                  {selectedOrder.fulfillment_method === 'pickup' ? 'มารับเองที่ฟาร์ม' : 'จัดส่งในตัวเมือง'}
                </p>
                {selectedOrder.fulfillment_method === 'delivery' && (
                  <p className="text-slate-600 mt-1">
                    {selectedOrder.districts?.name}: {selectedOrder.delivery_address}
                  </p>
                )}
                {selectedOrder.note && (
                  <p className="text-amber-800 italic mt-1">โน้ต: {selectedOrder.note}</p>
                )}
              </div>
            </div>

            {/* Veggie Items */}
            <div className="space-y-2">
              <h3 className="font-bold text-xs uppercase text-slate-400">รายการผักในออเดอร์</h3>
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl p-3 text-xs">
                {selectedOrder.order_items?.map((it) => (
                  <div key={it.id} className="py-2 flex items-center justify-between">
                    <span>
                      {it.round_items?.crops?.name || 'ผัก'} × {Number(it.qty_kg).toFixed(1)} กก.
                    </span>
                    <span className="font-bold">
                      ฿{(Number(it.qty_kg) * Number(it.price_per_kg)).toLocaleString()}
                    </span>
                  </div>
                ))}
                <div className="pt-2 flex justify-between font-extrabold text-sm border-t border-slate-200">
                  <span>ยอดรวมทั้งสิ้น</span>
                  <span className="text-emerald-700">฿{Number(selectedOrder.total_amount).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Update Form */}
            <form onSubmit={handleUpdateOrder} className="space-y-4 pt-2 border-t border-slate-100 text-xs sm:text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Order Status */}
                <div>
                  <label className="font-bold text-slate-700 block mb-1">ปรับสถานะออเดอร์</label>
                  <select
                    value={modalStatus}
                    onChange={(e) => setModalStatus(e.target.value as OrderStatus)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white"
                  >
                    <option value="pending_confirmation">รอยืนยัน (ออเดอร์ใหญ่)</option>
                    <option value="confirmed">ยืนยันแล้ว</option>
                    <option value="ready">พร้อมรับ/ส่ง</option>
                    <option value="completed">สำเร็จแล้ว (รับของเรียบร้อย)</option>
                    <option value="cancelled">ยกเลิกออเดอร์</option>
                    <option value="no_show">ไม่มารับของ (No-show)</option>
                  </select>
                </div>

                {/* Payment Status */}
                <div>
                  <label className="font-bold text-slate-700 block mb-1">สถานะการชำระเงิน</label>
                  <select
                    value={modalPaymentStatus}
                    onChange={(e) => setModalPaymentStatus(e.target.value as PaymentStatus)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white"
                  >
                    <option value="unpaid">รอชำระเงิน</option>
                    <option value="paid">ชำระเงินแล้ว</option>
                  </select>
                </div>
              </div>

              {/* Payment Method (if paid) */}
              {modalPaymentStatus === 'paid' && (
                <div>
                  <label className="font-bold text-slate-700 block mb-1">ช่องทางการชำระ</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={modalPaymentMethod === 'cash'}
                        onChange={() => setModalPaymentMethod('cash')}
                      />
                      <span>เงินสด (Cash)</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={modalPaymentMethod === 'transfer'}
                        onChange={() => setModalPaymentMethod('transfer')}
                      />
                      <span>โอนเงินผ่านบัญชี/พร้อมเพย์ (Transfer)</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Cancel reason if cancelled */}
              {modalStatus === 'cancelled' && (
                <div>
                  <label className="font-bold text-slate-700 block mb-1">เหตุผลการยกเลิก</label>
                  <input
                    type="text"
                    value={modalCancelReason}
                    onChange={(e) => setModalCancelReason(e.target.value)}
                    placeholder="เช่น ลูกค้าแจ้งยกเลิกทางโทรศัพท์..."
                    className="w-full p-2.5 rounded-xl border border-slate-200"
                  />
                </div>
              )}

              {/* No-show warning */}
              {modalStatus === 'no_show' && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                  ⚠️ การเลือก "ไม่มารับของ" จะเพิ่มตัวนับ no_show_count ในโปรไฟล์ของลูกค้ารายนี้โดยอัตโนมัติ
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  {isUpdating ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
