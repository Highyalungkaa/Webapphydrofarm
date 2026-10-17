import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { formatDateDMY, formatDateTimeDMY } from '../../lib/dateFormat.js';
import { Order, PlantingRound, OrderStatus, PaymentStatus, PaymentMethod } from '../../types/index.js';
import { Badge } from '../../components/common/Badge.js';
import {
  Search,
  Eye,
  X,
  Clock3,
  BadgeCheck,
  PackageCheck,
  CheckCircle2,
  Ban,
  UserRoundX,
  Banknote,
  CreditCard,
  History,
} from 'lucide-react';

export const AdminOrdersPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [rounds, setRounds] = useState<PlantingRound[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedRound, setSelectedRound] = useState(searchParams.get('round_id') || '');
  const [selectedStatus, setSelectedStatus] = useState(() => {
    const status = searchParams.get('status') || '';
    return ['completed', 'cancelled', 'no_show'].includes(status) ? '' : status;
  });
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
  const [substituteInputs, setSubstituteInputs] = useState<Record<string, { qtyKg: string; totalCost: string }>>({});

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
      setOrders(data.filter((order) => !['completed', 'cancelled', 'no_show'].includes(order.status)));
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
    setSubstituteInputs(Object.fromEntries((order.order_items || []).map((item) => {
      const qtyKg = item.fulfillment_source === 'substitute' ? Number(item.fulfilled_qty_kg || 0) : 0;
      const totalCost = Number(item.substitute_total_cost ?? (qtyKg * Number(item.substitute_cost_per_kg || 0)));
      return [item.id, { qtyKg: qtyKg ? String(qtyKg) : '', totalCost: totalCost ? String(Number(totalCost.toFixed(2))) : '' }];
    })));
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
        substitute_items: (selectedOrder.order_items || [])
          .filter((item) => Number(substituteInputs[item.id]?.qtyKg || 0) > 0 || item.fulfillment_source === 'substitute')
          .map((item) => ({
            id: item.id,
            qty_kg: Number(substituteInputs[item.id]?.qtyKg || 0),
            total_cost: Number(substituteInputs[item.id]?.totalCost || 0),
          })),
      });

      setSelectedOrder(null);
      await loadOrders();
    } catch (err: any) {
      alert(err.message || 'เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setIsUpdating(false);
    }
  };

  const formatDate = formatDateTimeDMY;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">จัดการคำสั่งจอง</h1>
        <p className="text-xs sm:text-sm text-slate-500">
          ตรวจสอบคำสั่งจอง กรองสถานะ ยืนยันออเดอร์ใหญ่ และบันทึกการชำระเงิน
        </p>
        </div>
        <Link to="/admin/rounds/history" className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition-colors hover:border-emerald-300 hover:text-emerald-800">
          <History className="h-4 w-4" /> ประวัติออเดอร์และรอบปลูก
        </Link>
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
              <option value="delivery">จัดส่งปกติ</option>
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
        <div className="flex flex-col gap-1 border-b border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-xs font-bold text-slate-700">รายการคำสั่งจอง <span className="font-medium text-slate-500">({orders.length} รายการ)</span></p>
          <p className="text-[11px] text-slate-500">เปิดรายละเอียดออเดอร์เพื่อยืนยันหรือแก้ไขสถานะ</p>
        </div>
        {loading ? (
          <div className="py-16 text-center text-slate-500 text-sm">กำลังโหลดข้อมูลคำสั่งจอง...</div>
        ) : orders.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">ไม่พบคำสั่งจองตามเงื่อนไขที่เลือก</div>
        ) : (
          <>
          <div className="grid gap-3 p-3 sm:grid-cols-2 lg:hidden">
            {orders.map((order) => {
              const totalKg = (order.order_items || []).reduce((sum, oi) => sum + Number(oi.qty_kg), 0);
              return (
                <article key={order.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <p className="font-black text-slate-900">ออเดอร์ #{order.id.slice(0, 8)}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{formatDate(order.created_at)}</p>
                    </div>
                    <Badge status={order.status} type="order" />
                  </div>
                  <div className="grid grid-cols-2 gap-3 py-3 text-xs">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-slate-400">ลูกค้า</p>
                      <p className="truncate font-bold text-slate-800">{order.profiles?.full_name || 'ลูกค้า'}</p>
                      <p className="text-slate-500">{order.contact_phone}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-slate-400">รอบปลูก / วันส่งมอบ</p>
                      <p className="truncate font-semibold text-slate-800">{order.planting_rounds?.name || '-'}</p>
                      <p className="text-slate-500">{formatDateDMY(order.planting_rounds?.fulfillment_date)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400">รับสินค้า</p>
                      <Badge status={order.fulfillment_method} type="fulfillment" />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400">ชำระเงิน</p>
                      <Badge status={order.payment_status} type="payment" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                    <div>
                      <p className="font-black text-slate-900">฿{Number(order.total_amount).toLocaleString()}</p>
                      <p className="text-[11px] text-slate-500">{totalKg.toFixed(1)} กก.</p>
                    </div>
                    <button
                      onClick={() => handleOpenDetailModal(order)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-800"
                    >
                      <Eye className="h-3.5 w-3.5" />จัดการออเดอร์
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto lg:block">
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
                          ส่ง: {formatDateDMY(order.planting_rounds?.fulfillment_date)}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <Badge status={order.fulfillment_method} type="fulfillment" />
                        {order.fulfillment_method === 'delivery' && (
                          <span
                            className="block text-[11px] text-slate-500 truncate max-w-[150px] mt-0.5"
                            title={order.delivery_address || ''}
                          >
                            {order.delivery_address || order.districts?.name || 'จัดส่งถึงที่อยู่'}
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
                          <span className="mt-1 block text-[10px] font-medium text-amber-700">ต้องตรวจรายละเอียดก่อนยืนยัน</span>
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
                          <span className="mt-1 block text-[10px] font-medium text-slate-400">บันทึกในรายละเอียดออเดอร์</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleOpenDetailModal(order)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition-colors shadow-sm whitespace-nowrap"
                        >
                          <Eye className="h-3.5 w-3.5" />จัดการออเดอร์
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
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
                  <p className="text-slate-600 mt-1 whitespace-pre-line leading-relaxed">
                    <span className="font-semibold text-slate-700">ที่อยู่จัดส่ง:</span>{' '}
                    {selectedOrder.delivery_address || selectedOrder.districts?.name || '-'}
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

            <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5 space-y-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">ผักทดแทนจากแหล่งอื่น</h3>
                  <p className="text-xs text-slate-600 mt-1">กรอกเฉพาะรายการที่ซื้อมาแทนผักที่ขาด ระบบจะบันทึกยอดเงินรวมและคำนวณต้นทุนต่อกิโลกรัมให้</p>
              </div>
              {(selectedOrder.order_items || []).map((item) => {
                const input = substituteInputs[item.id] || { qtyKg: '', totalCost: '' };
                const qty = Number(input.qtyKg || 0);
                const orderQty = Number(item.qty_kg);
                const qtyTooHigh = qty > orderQty;
                return (
                  <div key={item.id} className="rounded-xl border border-amber-100 bg-white p-3 sm:p-4">
                    <div className="flex flex-wrap justify-between gap-2 mb-3">
                      <span className="font-bold text-slate-800">{item.round_items?.crops?.name || 'ผัก'}</span>
                      <span className="text-slate-500">ลูกค้าสั่ง {orderQty.toFixed(1)} กก.</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="block">
                        <span className="text-xs font-semibold text-slate-600">ปริมาณที่ซื้อมาแทน (กก.)</span>
                        <input type="number" min="0" max={orderQty} step="0.1" value={input.qtyKg}
                          onChange={(e) => setSubstituteInputs((prev) => ({ ...prev, [item.id]: { ...input, qtyKg: e.target.value } }))}
                          placeholder="0" className={`mt-1 w-full rounded-xl border px-3 py-2.5 text-sm ${qtyTooHigh ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-white'}`} />
                        {qtyTooHigh && <span className="mt-1 block text-[11px] text-rose-600">จำนวนทดแทนต้องไม่เกิน {orderQty.toFixed(1)} กก.</span>}
                      </label>
                      <label className="block">
                        <span className="text-xs font-semibold text-slate-600">เงินที่จ่ายซื้อมาแทน (บาท)</span>
                        <div className="relative mt-1">
                          <input type="number" min="0" step="0.01" value={input.totalCost}
                            onChange={(e) => setSubstituteInputs((prev) => ({ ...prev, [item.id]: { ...input, totalCost: e.target.value } }))}
                            placeholder="0.00" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-12 text-sm" />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">บาท</span>
                        </div>
                      </label>
                    </div>
                  </div>
                );
              })}
            </section>

            {/* Update Form */}
            <form onSubmit={handleUpdateOrder} className="space-y-5 pt-5 border-t border-slate-100 text-xs sm:text-sm">
              <section className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div>
                    <p className="font-extrabold text-slate-900 text-sm sm:text-base">อัปเดตความคืบหน้าออเดอร์</p>
                    <p className="text-slate-500 mt-1">เลือกขั้นตอนที่ต้องการ แล้วบันทึกจากรายการนี้</p>
                  </div>
                  <div className="rounded-full bg-white border border-slate-200 px-3 py-1.5 flex items-center gap-2 shadow-sm">
                    <span className="text-slate-500">ปัจจุบัน</span>
                    <Badge status={selectedOrder.status} type="order" />
                  </div>
                </div>
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
                  {([
                    { value: 'pending_confirmation', title: 'รอยืนยัน', note: 'ตรวจสอบคำสั่งจอง', Icon: Clock3, color: 'amber' },
                    { value: 'confirmed', title: 'ยืนยันแล้ว', note: 'รับออเดอร์เข้าระบบ', Icon: BadgeCheck, color: 'blue' },
                    { value: 'ready', title: 'พร้อมรับ / ส่ง', note: 'เตรียมสินค้าเรียบร้อย', Icon: PackageCheck, color: 'violet' },
                    { value: 'completed', title: 'สำเร็จแล้ว', note: 'ลูกค้าได้รับสินค้า', Icon: CheckCircle2, color: 'emerald' },
                  ] as const).map(({ value, title, note, Icon, color }) => {
                    const active = modalStatus === value;
                    const colors: Record<string, string> = {
                      amber: active ? 'border-amber-500 bg-amber-50 text-amber-800 ring-2 ring-amber-100' : 'border-slate-200 bg-white hover:border-amber-300',
                      blue: active ? 'border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-300',
                      violet: active ? 'border-violet-500 bg-violet-50 text-violet-800 ring-2 ring-violet-100' : 'border-slate-200 bg-white hover:border-violet-300',
                      emerald: active ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-100' : 'border-slate-200 bg-white hover:border-emerald-300',
                    };
                    return (
                      <button key={value} type="button" aria-pressed={active} onClick={() => setModalStatus(value)}
                        className={`min-h-[98px] rounded-xl border p-3 text-left transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400 ${colors[color]} ${active ? 'shadow-sm' : 'text-slate-700'}`}>
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-extrabold">{title}</span>
                          <Icon size={18} className={active ? '' : 'text-slate-400'} />
                        </span>
                        <span className={`mt-2 block text-[11px] leading-4 ${active ? 'opacity-80' : 'text-slate-500'}`}>{note}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 border-t border-slate-200/80 pt-4">
                  <p className="font-bold text-slate-700 mb-2">การจัดการกรณีพิเศษ</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {([
                      { value: 'cancelled', title: 'ยกเลิกออเดอร์', note: 'หยุดดำเนินการคำสั่งจองนี้', Icon: Ban },
                      { value: 'no_show', title: 'ลูกค้าไม่มารับสินค้า', note: 'บันทึกประวัติไม่มารับของ', Icon: UserRoundX },
                    ] as const).map(({ value, title, note, Icon }) => {
                      const active = modalStatus === value;
                      return <button key={value} type="button" aria-pressed={active} onClick={() => setModalStatus(value)}
                        className={`rounded-xl border p-3 text-left flex items-center gap-3 transition-all focus:outline-none focus:ring-2 focus:ring-rose-300 ${active ? 'border-rose-500 bg-rose-50 text-rose-800 ring-2 ring-rose-100' : 'border-slate-200 bg-white hover:border-rose-300 text-slate-700'}`}>
                        <span className={`w-9 h-9 rounded-lg grid place-items-center ${active ? 'bg-rose-100' : 'bg-slate-100 text-slate-500'}`}><Icon size={18} /></span>
                        <span><span className="block font-bold">{title}</span><span className="block text-[11px] text-slate-500 mt-0.5">{note}</span></span>
                      </button>;
                    })}
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <div className="mb-3">
                  <p className="font-extrabold text-slate-900 text-sm sm:text-base">สถานะการชำระเงิน</p>
                  <p className="text-slate-500 mt-1">บันทึกการรับชำระแยกจากความคืบหน้าของออเดอร์</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {([
                    { value: 'unpaid', title: 'รอชำระเงิน', note: 'ยังไม่ได้รับยอดชำระ', Icon: Clock3 },
                    { value: 'paid', title: 'ชำระเงินแล้ว', note: 'ได้รับยอดชำระครบแล้ว', Icon: Banknote },
                  ] as const).map(({ value, title, note, Icon }) => {
                    const active = modalPaymentStatus === value;
                    return <button key={value} type="button" aria-pressed={active} onClick={() => setModalPaymentStatus(value)}
                      className={`rounded-xl border p-3 text-left flex items-center gap-3 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-300 ${active ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-100' : 'border-slate-200 bg-slate-50/60 hover:border-emerald-300 text-slate-700'}`}>
                      <span className={`w-9 h-9 rounded-lg grid place-items-center ${active ? 'bg-emerald-100' : 'bg-white text-slate-400'}`}><Icon size={18} /></span>
                      <span><span className="block font-bold">{title}</span><span className="block text-[11px] text-slate-500 mt-0.5">{note}</span></span>
                    </button>;
                  })}
                </div>
              </section>

              {/* Payment Method (if paid) */}
              {modalPaymentStatus === 'paid' && (
                <div>
                  <label className="font-bold text-slate-700 block mb-2">ช่องทางการชำระ</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {([{ value: 'cash', title: 'เงินสด', note: 'รับชำระที่ฟาร์มหรือปลายทาง', Icon: Banknote }, { value: 'transfer', title: 'โอนเงิน', note: 'บัญชีธนาคาร / พร้อมเพย์', Icon: CreditCard }] as const).map(({ value, title, note, Icon }) => {
                      const active = modalPaymentMethod === value;
                      return <button key={value} type="button" aria-pressed={active} onClick={() => setModalPaymentMethod(value)} className={`rounded-xl border p-3 text-left flex items-center gap-3 transition-all ${active ? 'border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-300 text-slate-700'}`}>
                        <Icon size={19} /><span><span className="block font-bold">{title}</span><span className="block text-[11px] text-slate-500 mt-0.5">{note}</span></span>
                      </button>;
                    })}
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
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
                  <p className="font-extrabold">ยืนยันบันทึกประวัติไม่มารับสินค้า</p>
                  <p className="mt-1 text-xs leading-5 text-rose-800">
                    เมื่อกด “ยืนยันและบันทึก” ระบบจะเพิ่มประวัติไม่มารับของให้ลูกค้า 1 ครั้ง
                    {selectedOrder.status === 'no_show' ? ' (ออเดอร์นี้ถูกบันทึกเป็นไม่มารับแล้ว จะไม่เพิ่มซ้ำ)' : ''}
                  </p>
                </div>
              )}

              {modalStatus !== selectedOrder.status && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-blue-900 flex flex-wrap items-center gap-2">
                  <span className="font-bold">กำลังเปลี่ยนสถานะ:</span><Badge status={selectedOrder.status} type="order" /><span aria-hidden="true">→</span><Badge status={modalStatus} type="order" />
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
                  disabled={isUpdating || (selectedOrder.order_items || []).some((item) => {
                    const input = substituteInputs[item.id];
                    return Number(input?.qtyKg || 0) > Number(item.qty_kg) || (Number(input?.qtyKg || 0) === 0 && Number(input?.totalCost || 0) > 0);
                  })}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  {isUpdating ? 'กำลังบันทึก...' : 'ยืนยันและบันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
