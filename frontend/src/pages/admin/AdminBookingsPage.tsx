import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { PlantingRound } from '../../types/index.js';
import { Badge } from '../../components/common/Badge.js';
import {
  BookmarkCheck,
  Plus,
  Power,
  Calendar,
  Clock,
  Leaf,
  Layers,
  AlertCircle,
  CheckCircle2,
  X,
  ExternalLink,
  ShoppingBag,
  ArrowRight,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Pencil,
  Save,
} from 'lucide-react';

interface EditableCropItem {
  id: string;
  crop_id: string;
  crop_name: string;
  image_url?: string;
  estimated_qty_kg: number;
  bookable_qty_kg: number;
  price_per_kg: number;
  booked_qty_kg: number;
}

export const AdminBookingsPage: React.FC = () => {
  const [rounds, setRounds] = useState<PlantingRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<'all' | 'open' | 'closed'>('all');

  // Modal State for Opening / Editing Booking Window
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedRoundId, setSelectedRoundId] = useState<string>('');
  const [roundName, setRoundName] = useState('');
  const [bookingOpensAt, setBookingOpensAt] = useState('');
  const [bookingClosesAt, setBookingClosesAt] = useState('');
  const [fulfillmentDate, setFulfillmentDate] = useState('');
  const [pickupStartTime, setPickupStartTime] = useState('09:00');
  const [pickupEndTime, setPickupEndTime] = useState('17:00');
  const [deliveryStartTime, setDeliveryStartTime] = useState('13:00');
  const [deliveryEndTime, setDeliveryEndTime] = useState('16:30');
  const [editableItems, setEditableItems] = useState<EditableCropItem[]>([]);

  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Close Booking Confirmation Modal
  const [closingRound, setClosingRound] = useState<PlantingRound | null>(null);
  const [closingSaving, setClosingSaving] = useState(false);

  useEffect(() => {
    loadRounds();
  }, []);

  const loadRounds = async () => {
    try {
      setLoading(true);
      const data = await api.get<PlantingRound[]>('/admin/rounds');
      setRounds(data || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const mapItemsToEditable = (targetRound: PlantingRound): EditableCropItem[] => {
    return (targetRound.round_items || []).map((it: any) => ({
      id: it.id,
      crop_id: it.crop_id,
      crop_name: it.crop_name || it.crops?.name || 'ผัก',
      image_url: it.crops?.image_url,
      estimated_qty_kg: Number(it.estimated_qty_kg || 0),
      bookable_qty_kg: Number(it.bookable_qty_kg || it.estimated_qty_kg || 0),
      price_per_kg: Number(it.price_per_kg || 0),
      booked_qty_kg: Number(it.booked_qty_kg || 0),
    }));
  };

  const openCreateBookingModal = (presetRoundId?: string) => {
    setModalMode('create');
    const today = new Date();
    const opensAtDefault = new Date(today);
    opensAtDefault.setHours(8, 0, 0, 0);

    const closesAtDefault = new Date(today.getTime() + 7 * 86400000);
    closesAtDefault.setHours(18, 0, 0, 0);

    const activePlantingRounds = rounds.filter(
      (r) => r.status !== 'completed' && r.status !== 'cancelled'
    );

    const targetRound = presetRoundId
      ? activePlantingRounds.find((r) => r.id === presetRoundId)
      : activePlantingRounds.find((r) => r.status === 'growing' || r.status === 'draft') || activePlantingRounds[0];

    if (targetRound) {
      setSelectedRoundId(targetRound.id);
      setRoundName(targetRound.name || '');
      setFulfillmentDate(targetRound.expected_harvest_date || targetRound.fulfillment_date || '');
      setBookingOpensAt(targetRound.booking_opens_at ? targetRound.booking_opens_at.slice(0, 16) : opensAtDefault.toISOString().slice(0, 16));
      setBookingClosesAt(targetRound.booking_closes_at ? targetRound.booking_closes_at.slice(0, 16) : closesAtDefault.toISOString().slice(0, 16));
      setPickupStartTime(targetRound.pickup_start_time ? targetRound.pickup_start_time.slice(0, 5) : '09:00');
      setPickupEndTime(targetRound.pickup_end_time ? targetRound.pickup_end_time.slice(0, 5) : '17:00');
      setDeliveryStartTime(targetRound.delivery_start_time ? targetRound.delivery_start_time.slice(0, 5) : '13:00');
      setDeliveryEndTime(targetRound.delivery_end_time ? targetRound.delivery_end_time.slice(0, 5) : '16:30');
      setEditableItems(mapItemsToEditable(targetRound));
    } else {
      setSelectedRoundId('');
      setRoundName('');
      setFulfillmentDate('');
      setBookingOpensAt(opensAtDefault.toISOString().slice(0, 16));
      setBookingClosesAt(closesAtDefault.toISOString().slice(0, 16));
      setEditableItems([]);
    }

    setModalError(null);
    setIsModalOpen(true);
  };

  const openEditBookingModal = (round: PlantingRound) => {
    setModalMode('edit');
    setSelectedRoundId(round.id);
    setRoundName(round.name || '');
    setFulfillmentDate(round.expected_harvest_date || round.fulfillment_date || '');
    
    const today = new Date();
    const opensAtDefault = new Date(today);
    opensAtDefault.setHours(8, 0, 0, 0);
    const closesAtDefault = new Date(today.getTime() + 7 * 86400000);
    closesAtDefault.setHours(18, 0, 0, 0);

    setBookingOpensAt(round.booking_opens_at ? round.booking_opens_at.slice(0, 16) : opensAtDefault.toISOString().slice(0, 16));
    setBookingClosesAt(round.booking_closes_at ? round.booking_closes_at.slice(0, 16) : closesAtDefault.toISOString().slice(0, 16));
    setPickupStartTime(round.pickup_start_time ? round.pickup_start_time.slice(0, 5) : '09:00');
    setPickupEndTime(round.pickup_end_time ? round.pickup_end_time.slice(0, 5) : '17:00');
    setDeliveryStartTime(round.delivery_start_time ? round.delivery_start_time.slice(0, 5) : '13:00');
    setDeliveryEndTime(round.delivery_end_time ? round.delivery_end_time.slice(0, 5) : '16:30');
    setEditableItems(mapItemsToEditable(round));

    setModalError(null);
    setIsModalOpen(true);
  };

  const handleRoundSelectionChange = (roundId: string) => {
    setSelectedRoundId(roundId);
    const chosen = rounds.find((r) => r.id === roundId);
    if (chosen) {
      setRoundName(chosen.name || '');
      if (chosen.expected_harvest_date || chosen.fulfillment_date) {
        setFulfillmentDate(chosen.expected_harvest_date || chosen.fulfillment_date);
      }
      if (chosen.booking_opens_at) {
        setBookingOpensAt(chosen.booking_opens_at.slice(0, 16));
      }
      if (chosen.booking_closes_at) {
        setBookingClosesAt(chosen.booking_closes_at.slice(0, 16));
      }
      setEditableItems(mapItemsToEditable(chosen));
    } else {
      setEditableItems([]);
    }
  };

  const handleItemFieldChange = (index: number, field: 'bookable_qty_kg' | 'price_per_kg', value: number) => {
    setEditableItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSaveBooking = async (openImmediately: boolean) => {
    setModalError(null);

    if (!selectedRoundId) {
      setModalError('กรุณาเลือกรอบการปลูก');
      return;
    }

    if (!bookingOpensAt || !bookingClosesAt) {
      setModalError('กรุณาระบุวัน-เวลาเปิดจอง และวัน-เวลาปิดจอง');
      return;
    }

    if (new Date(bookingClosesAt) <= new Date(bookingOpensAt)) {
      setModalError('วัน-เวลาปิดจอง ต้องอยู่หลังวัน-เวลาเปิดจอง');
      return;
    }

    try {
      setSaving(true);
      const payload: Record<string, any> = {
        name: roundName,
        booking_opens_at: new Date(bookingOpensAt).toISOString(),
        booking_closes_at: new Date(bookingClosesAt).toISOString(),
        fulfillment_date: fulfillmentDate,
        pickup_start_time: pickupStartTime ? pickupStartTime + ':00' : '09:00:00',
        pickup_end_time: pickupEndTime ? pickupEndTime + ':00' : '17:00:00',
        delivery_start_time: deliveryStartTime ? deliveryStartTime + ':00' : '13:00:00',
        delivery_end_time: deliveryEndTime ? deliveryEndTime + ':00' : '16:30:00',
        items: editableItems.map((it) => ({
          id: it.id,
          bookable_qty_kg: Number(it.bookable_qty_kg),
          price_per_kg: Number(it.price_per_kg),
        })),
      };

      if (openImmediately) {
        payload.status = 'booking_open';
        // If bookingOpensAt was set to a future date, set to now so customers can see it immediately
        if (new Date(bookingOpensAt) > new Date()) {
          payload.booking_opens_at = new Date().toISOString();
        }
      }

      await api.put(`/admin/rounds/${selectedRoundId}/booking`, payload);
      setIsModalOpen(false);

      if (openImmediately) {
        setActionSuccess('เปิดรอบสั่งจองล่วงหน้าสำเร็จ! ลูกค้าสามารถสั่งจองได้แล้ว');
      } else {
        setActionSuccess('บันทึกข้อมูลและกำหนดการรอบจองเรียบร้อยแล้ว (ยังไม่เปิดรับจอง)');
      }

      await loadRounds();
    } catch (err: any) {
      setModalError(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูลรอบจอง');
    } finally {
      setSaving(false);
    }
  };

  const handleCloseBookingConfirm = async () => {
    if (!closingRound) return;

    try {
      setClosingSaving(true);
      await api.post(`/admin/rounds/${closingRound.id}/close-booking`, {});
      setClosingRound(null);
      setActionSuccess(`ปิดการจองรอบ "${closingRound.name}" เรียบร้อยแล้ว`);
      await loadRounds();
    } catch (err: any) {
      alert(err.message || 'ไม่สามารถปิดการจองได้');
    } finally {
      setClosingSaving(false);
    }
  };

  // Selected round inside the modal for previewing vegetables
  const modalTargetRound = rounds.find((r) => r.id === selectedRoundId);

  // Filter only rounds that have an active or created booking window
  const bookingRounds = rounds.filter((r) => {
    return Boolean(r.is_booking_created || r.status === 'booking_open' || r.status === 'booking_closed');
  });

  // Active planting rounds available to be picked for booking (exclude completed / finished rounds)
  const activePlantingRounds = rounds.filter(
    (r) => r.status !== 'completed' && r.status !== 'cancelled'
  );

  // Filtered rounds
  const filteredRounds = bookingRounds.filter((r) => {
    if (filterTab === 'open') return r.status === 'booking_open';
    if (filterTab === 'closed') return r.status === 'booking_closed' || r.status === 'harvested' || r.status === 'completed';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">การเปิดสั่งจองล่วงหน้า</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            จัดการรอบเปิดสั่งจองผักสดก่อนเก็บเกี่ยว กำหนดวันเปิด-ปิดจอง และติดตามปริมาณผักคงเหลือแบบเรียลไทม์
          </p>
        </div>
        <button
          onClick={() => openCreateBookingModal()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-sm transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>สร้างรอบจอง</span>
        </button>
      </div>

      {actionSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-50 text-emerald-800 text-xs sm:text-sm font-semibold flex items-center justify-between border border-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 text-xs font-bold">
        <button
          onClick={() => setFilterTab('all')}
          className={`px-3 py-1.5 rounded-xl transition-colors ${
            filterTab === 'all'
              ? 'bg-slate-900 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          ทั้งหมด ({bookingRounds.length})
        </button>
        <button
          onClick={() => setFilterTab('open')}
          className={`px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 ${
            filterTab === 'open'
              ? 'bg-emerald-600 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>กำลังเปิดรับจอง ({bookingRounds.filter((r) => r.status === 'booking_open').length})</span>
        </button>
        <button
          onClick={() => setFilterTab('closed')}
          className={`px-3 py-1.5 rounded-xl transition-colors ${
            filterTab === 'closed'
              ? 'bg-slate-700 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          ปิดรับจองแล้ว ({bookingRounds.filter((r) => r.status === 'booking_closed' || r.status === 'harvested' || r.status === 'completed').length})
        </button>
      </div>

      {/* Rounds List Cards */}
      {loading ? (
        <div className="py-20 text-center text-slate-500 text-sm">กำลังโหลดข้อมูลรอบการสั่งจอง...</div>
      ) : filteredRounds.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-3xl border border-slate-200 space-y-3">
          <BookmarkCheck className="w-12 h-12 mx-auto text-slate-300" />
          <p className="font-bold text-slate-700">ไม่พบรายการรอบสั่งจองในหมวดนี้</p>
          <p className="text-xs text-slate-400">
            กดปุ่ม "สร้างรอบจอง" ด้านบน เพื่อเลือกรอบการปลูกที่ต้องการเปิดให้ลูกค้าสั่งซื้อ
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {filteredRounds.map((round) => {
            const isBookingOpen = round.status === 'booking_open';
            const isBookingClosed = round.status === 'booking_closed' || round.status === 'harvested' || round.status === 'completed';
            const totalBookable = Number(round.total_bookable_kg || 0);
            const totalBooked = Number(round.total_booked_kg || 0);
            const totalAvailable = Number(round.total_available_kg || Math.max(0, totalBookable - totalBooked));
            const percentBooked = totalBookable > 0 ? Math.min(100, (totalBooked / totalBookable) * 100) : 0;

            return (
              <div
                key={round.id}
                className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden transition-all hover:shadow-sm"
              >
                {/* Card Header */}
                <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-white via-slate-50/40 to-slate-50/80">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                        รอบการสั่งจอง
                      </span>
                      <Badge status={round.status} type="round" />
                    </div>
                    <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                      {round.name}
                    </h2>
                  </div>

                  {/* Actions for this round */}
                  <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                    {isBookingOpen ? (
                      <>
                        <button
                          onClick={() => openEditBookingModal(round)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
                          title="แก้ไขวันปิดจองและข้อมูลรอบนี้"
                        >
                          <Pencil className="w-3.5 h-3.5 text-slate-600" />
                          <span>แก้ไขข้อมูล</span>
                        </button>
                        <button
                          onClick={() => setClosingRound(round)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-xs transition-colors"
                          title="กดปิดการจองรอบนี้ทันที"
                        >
                          <Power className="w-3.5 h-3.5" />
                          <span>กดปิดการจอง</span>
                        </button>
                      </>
                    ) : isBookingClosed ? (
                      <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs border border-slate-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>ปิดรับการจองแล้ว</span>
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() => openEditBookingModal(round)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs shadow-xs transition-colors"
                          title="แก้ไขข้อมูลรอบจอง / วันเวลา / ปริมาณผักก่อนเปิดจอง"
                        >
                          <Pencil className="w-3.5 h-3.5 text-emerald-400" />
                          <span>แก้ไขรอบจอง</span>
                        </button>
                        <button
                          onClick={() => openCreateBookingModal(round.id)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors"
                          title="เปิดรับจองรอบนี้"
                        >
                          <BookmarkCheck className="w-3.5 h-3.5" />
                          <span>เปิดรับจองรอบนี้</span>
                        </button>
                      </>
                    )}

                    <Link
                      to={`/admin/rounds/${round.id}`}
                      className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
                    >
                      ดูรอบปลูก
                    </Link>
                  </div>
                </div>

                {/* Schedule & Window Grid */}
                <div className="p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50/50 border-b border-slate-100 text-xs">
                  {/* Booking Opens At */}
                  <div className="p-3 rounded-2xl bg-white border border-slate-200/80 space-y-1">
                    <span className="text-slate-400 font-medium flex items-center gap-1 text-[11px]">
                      <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                      วันเปิดรอบจอง
                    </span>
                    <p className="font-bold text-slate-900">
                      {round.booking_opens_at ? new Date(round.booking_opens_at).toLocaleString('th-TH') : '-'}
                    </p>
                  </div>

                  {/* Booking Closes At */}
                  <div className="p-3 rounded-2xl bg-white border border-slate-200/80 space-y-1">
                    <span className="text-slate-400 font-medium flex items-center gap-1 text-[11px]">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      วันปิดจอง
                    </span>
                    <p className="font-bold text-slate-900">
                      {round.booking_closes_at ? new Date(round.booking_closes_at).toLocaleString('th-TH') : '-'}
                    </p>
                  </div>

                  {/* Fulfillment Date */}
                  <div className="p-3 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-1">
                    <span className="text-emerald-800 font-medium flex items-center gap-1 text-[11px]">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      วันเก็บเกี่ยว & ส่งมอบผักสด
                    </span>
                    <p className="font-bold text-emerald-950">
                      {round.fulfillment_date || round.expected_harvest_date || '-'}
                    </p>
                  </div>
                </div>

                {/* Overall Vegetable Progress Bar & Numbers */}
                <div className="p-5 sm:p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-emerald-600" />
                        <span>จำนวนผักรวมของรอบนี้ (ทั้งแบบหลอดและตัวเลข):</span>
                      </h3>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-slate-600">
                        จองแล้ว: <strong className="text-emerald-700 font-black">{totalBooked.toFixed(1)} กก.</strong>
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="text-slate-600">
                        คงเหลือ: <strong className="text-sky-700 font-black">{totalAvailable.toFixed(1)} กก.</strong>
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="text-slate-600">
                        ทั้งหมด: <strong className="text-slate-900 font-bold">{totalBookable.toFixed(1)} กก.</strong>
                      </span>
                    </div>
                  </div>

                  {/* Big Total Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-600">ความคืบหน้าการจองในรอบนี้</span>
                      <span className="text-emerald-700">{percentBooked.toFixed(0)}%</span>
                    </div>
                    <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200 p-0.5">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          percentBooked >= 100
                            ? 'bg-rose-500'
                            : percentBooked >= 75
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${percentBooked}%` }}
                      />
                    </div>
                  </div>

                  {/* Individual Vegetables in this Round */}
                  <div className="pt-2">
                    <h4 className="text-xs font-bold text-slate-700 mb-2.5">
                      รายละเอียดผักแต่ละชนิดในรอบนี้:
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {round.round_items?.map((item: any) => {
                        const itBooked = Number(item.booked_qty_kg || 0);
                        const itBookable = Number(item.bookable_qty_kg || 0);
                        const itAvailable = Number(item.available_qty_kg || Math.max(0, itBookable - itBooked));
                        const itPct = itBookable > 0 ? Math.min(100, (itBooked / itBookable) * 100) : 0;

                        return (
                          <div
                            key={item.id}
                            className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5"
                          >
                            <div className="flex items-center gap-2.5">
                              {item.crops?.image_url ? (
                                <img
                                  src={item.crops.image_url}
                                  alt={item.crop_name}
                                  className="w-10 h-10 rounded-xl object-cover border border-slate-200 flex-shrink-0"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                                  <Leaf className="w-5 h-5" />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <h5 className="font-bold text-slate-900 text-xs truncate">
                                  {item.crop_name || item.crops?.name || 'ผัก'}
                                </h5>
                                <span className="text-[11px] text-slate-500 font-semibold">
                                  ฿{Number(item.price_per_kg).toFixed(0)}/กก.
                                </span>
                              </div>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  isBookingClosed
                                    ? 'bg-slate-100 text-slate-600 border border-slate-200'
                                    : itAvailable <= 0
                                    ? 'bg-rose-100 text-rose-700'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {isBookingClosed
                                  ? 'ปิดรับจองแล้ว'
                                  : itAvailable <= 0
                                  ? 'ขายหมดแล้ว'
                                  : 'เปิดให้จอง'}
                              </span>
                            </div>

                            {/* Item Progress Bar & Numbers */}
                            <div className="space-y-1">
                              <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    itPct >= 100 ? 'bg-rose-500' : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${itPct}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-[11px]">
                                <span className="text-slate-600 font-medium">
                                  จองแล้ว: <strong className="text-slate-900">{itBooked.toFixed(1)}</strong> / {itBookable.toFixed(1)} กก.
                                </span>
                                <span className="font-bold text-emerald-700">
                                  เหลือ {itAvailable.toFixed(1)} กก.
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Orders link */}
                  <div className="pt-2 flex items-center justify-between text-xs border-t border-slate-100">
                    <span className="text-slate-500">
                      จัดการคำสั่งจองของลูกค้าในรอบนี้
                    </span>
                    <Link
                      to={`/admin/orders?round_id=${round.id}`}
                      className="text-emerald-600 hover:text-emerald-700 font-bold inline-flex items-center gap-1"
                    >
                      <span>ดูคำสั่งซื้อในรอบนี้</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: สร้างรอบจอง หรือ แก้ไขรอบจอง */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-5 sm:p-7 max-w-2xl w-full shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {modalMode === 'edit' ? 'แก้ไขข้อมูลรอบสั่งจอง' : 'สร้างรอบสั่งจองล่วงหน้า'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {modalMode === 'edit'
                    ? 'แก้ไขชื่อรอบ วัน-เวลาเปิดปิดจอง วันส่งมอบ และปรับจำนวนผัก/ราคาเปิดจอง'
                    : 'เลือกรอบการปลูกที่ต้องการเปิดจอง และกำหนดช่วงเวลาเปิด-ปิดการจอง'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <div className="space-y-4 text-xs sm:text-sm">
              {/* 1. Select Planting Round or Round Name */}
              {modalMode === 'create' ? (
                <div>
                  <label className="font-bold text-slate-800 block mb-1">
                    1. เลือกรอบปลูกจากหน้ารอบการปลูก <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={selectedRoundId}
                    onChange={(e) => handleRoundSelectionChange(e.target.value)}
                    required
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- เลือกรอบการปลูกที่ต้องการเปิดจอง --</option>
                    {activePlantingRounds.length === 0 ? (
                      <option value="" disabled>-- ไม่มีรอบปลูกที่กำลังดำเนินการ (รอบปลูกเสร็จสิ้นไปหมดแล้ว) --</option>
                    ) : (
                      activePlantingRounds.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} (เก็บเกี่ยว {r.expected_harvest_date || r.fulfillment_date || 'ตามกำหนด'} • {r.round_items?.length || 0} ชนิดผัก)
                        </option>
                      ))
                    )}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="font-bold text-slate-800 block mb-1">
                    ชื่อรอบสั่งจอง <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={roundName}
                    onChange={(e) => setRoundName(e.target.value)}
                    required
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}

              {/* 2. Booking Opens At & Closes At */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-800 block mb-1">
                    วัน-เวลาเปิดรอบจอง <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={bookingOpensAt}
                    onChange={(e) => setBookingOpensAt(e.target.value)}
                    required
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">เวลาที่ระบบจะเริ่มแสดงให้ลูกค้ากดจองได้</p>
                </div>

                <div>
                  <label className="font-bold text-slate-800 block mb-1">
                    วัน-เวลาปิดจอง <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={bookingClosesAt}
                    onChange={(e) => setBookingClosesAt(e.target.value)}
                    required
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">เวลาสิ้นสุดการสั่งจองก่อนเริ่มเก็บเกี่ยว</p>
                </div>
              </div>

              {/* 3. Fulfillment Date & Hours */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-800 block mb-1">
                    วันส่งมอบ / วันเก็บเกี่ยว
                  </label>
                  <input
                    type="date"
                    value={fulfillmentDate}
                    onChange={(e) => setFulfillmentDate(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="font-bold text-slate-700 block mb-1 text-[11px]">เวลารับเอง</label>
                    <input
                      type="time"
                      value={pickupStartTime}
                      onChange={(e) => setPickupStartTime(e.target.value)}
                      className="w-full p-2 rounded-xl border border-slate-200 text-xs"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="font-bold text-slate-700 block mb-1 text-[11px]">ถึง</label>
                    <input
                      type="time"
                      value={pickupEndTime}
                      onChange={(e) => setPickupEndTime(e.target.value)}
                      className="w-full p-2 rounded-xl border border-slate-200 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* 4. Editable Vegetables List with Gauges & Numbers */}
              {editableItems.length > 0 && (
                <div className="space-y-3 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      <span>รายการผักในรอบนี้ (ปรับจำนวน กก. ที่เปิดให้จอง และราคาได้):</span>
                    </span>
                    <span className="text-[11px] font-bold text-emerald-800">
                      รวมเปิดจอง: {editableItems.reduce((sum, it) => sum + Number(it.bookable_qty_kg || 0), 0).toFixed(1)} กก.
                    </span>
                  </div>

                  <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                    {editableItems.map((item, idx) => {
                      const est = Number(item.estimated_qty_kg || 0);
                      const bookable = Number(item.bookable_qty_kg || 0);
                      const pct = est > 0 ? Math.min(100, (bookable / est) * 100) : 100;

                      return (
                        <div key={item.id} className="p-3 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-2.5">
                          <div className="flex items-center gap-2.5">
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.crop_name} className="w-9 h-9 rounded-xl object-cover border border-slate-200 flex-shrink-0" />
                            ) : (
                              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                                <Leaf className="w-4 h-4" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <h4 className="font-bold text-slate-900 text-xs truncate">{item.crop_name}</h4>
                              <p className="text-[10px] text-slate-500 font-medium">
                                คาดการณ์ผลผลิต: <strong>{est.toFixed(1)} กก.</strong>
                                {item.booked_qty_kg > 0 && (
                                  <span className="text-emerald-700 ml-1.5 font-bold">
                                    (จองแล้ว {item.booked_qty_kg.toFixed(1)} กก.)
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>

                          {/* Inputs: Bookable Qty & Price */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <label className="text-[11px] font-bold text-slate-700 block mb-0.5">
                                จำนวนเปิดให้จอง (กก.)
                              </label>
                              <input
                                type="number"
                                step="0.1"
                                min={item.booked_qty_kg || 0}
                                value={item.bookable_qty_kg}
                                onChange={(e) => handleItemFieldChange(idx, 'bookable_qty_kg', parseFloat(e.target.value) || 0)}
                                className="w-full p-2 rounded-xl border border-slate-200 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-slate-700 block mb-0.5">
                                ราคาขาย (฿/กก.)
                              </label>
                              <input
                                type="number"
                                step="1"
                                min="0"
                                value={item.price_per_kg}
                                onChange={(e) => handleItemFieldChange(idx, 'price_per_kg', parseFloat(e.target.value) || 0)}
                                className="w-full p-2 rounded-xl border border-slate-200 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>
                          </div>

                          {/* Mini Gauge Bar */}
                          <div className="space-y-1">
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  pct > 100 ? 'bg-amber-500' : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-[10px] text-slate-400">
                              <span>เปิดจอง {pct.toFixed(0)}% ของคาดการณ์</span>
                              <span>เหลือโควตา {Math.max(0, est - bookable).toFixed(1)} กก.</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold text-center"
                >
                  ยกเลิก
                </button>

                {modalTargetRound?.status === 'booking_open' ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSaveBooking(false)}
                    className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-colors disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{saving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleSaveBooking(false)}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold transition-colors disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      <span>{saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล (ยังไม่เปิดจอง)'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleSaveBooking(true)}
                      className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-colors disabled:opacity-50 shadow-sm"
                    >
                      <BookmarkCheck className="w-4 h-4" />
                      <span>{saving ? 'กำลังบันทึก...' : 'บันทึกและเปิดรับจองทันที'}</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: กดปิดการจอง */}
      {closingRound && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-base font-bold text-slate-900">ยืนยันการปิดรับจอง?</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              คุณต้องการปิดรับจองสำหรับรอบ <strong>"{closingRound.name}"</strong> ใช่หรือไม่?
              เมื่อปิดแล้ว ลูกค้าจะไม่สามารถสั่งจองเพิ่มในรอบนี้ได้อีก
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setClosingRound(null)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold text-xs"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleCloseBookingConfirm}
                disabled={closingSaving}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs"
              >
                {closingSaving ? 'กำลังปิด...' : 'ยืนยันปิดการจอง'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default AdminBookingsPage;
