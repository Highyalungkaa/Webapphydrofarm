import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { formatDateDMY, formatDateTimeDMY } from '../../lib/dateFormat.js';
import { PlantingRound, RoundItem } from '../../types/index.js';
import { useCart } from '../../context/CartContext.js';
import { useAuth } from '../../context/AuthContext.js';
import { Badge } from '../../components/common/Badge.js';
import { Calendar, Clock, Store, Truck, ArrowLeft, Plus, Minus, ShoppingBag, AlertCircle } from 'lucide-react';

export const RoundDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [round, setRound] = useState<PlantingRound | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qtyAlert, setQtyAlert] = useState<string | null>(null);

  const { items, setRound: setCartRound, setItemQty, totalKg, totalAmount } = useCart();

  useEffect(() => {
    if (id) {
      setCartRound(id);
      fetchRoundDetails(id);
    }
  }, [id]);

  const fetchRoundDetails = async (roundId: string) => {
    try {
      setLoading(true);
      const data = await api.get<PlantingRound>(`/rounds/${roundId}`);
      setRound(data);
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถโหลดข้อมูลรอบการปลูกได้');
    } finally {
      setLoading(false);
    }
  };

  const handleQtyChange = (item: RoundItem, delta: number) => {
    setQtyAlert(null);
    const existing = items.find((i) => i.round_item_id === item.id);
    const currentQty = existing ? existing.qty_kg : 0;
    const newQty = Math.max(0, Math.round((currentQty + delta) * 10) / 10);

    const result = setItemQty(
      {
        round_item_id: item.id,
        crop_name: item.crop_name || item.crops?.name || 'ผักสลัด',
        price_per_kg: Number(item.price_per_kg),
        max_qty_per_order_kg: item.max_qty_per_order_kg,
        available_qty_kg: Number(item.available_qty_kg || 0),
      },
      newQty
    );

    if (!result.success && result.message) {
      setQtyAlert(result.message);
      setTimeout(() => setQtyAlert(null), 4000);
    }
  };

  const getItemQtyInCart = (roundItemId: string) => {
    const found = items.find((i) => i.round_item_id === roundItemId);
    return found ? found.qty_kg : 0;
  };

  const formatDate = formatDateDMY;

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-farm-600 mb-2"></div>
        <p className="text-sm text-slate-500">กำลังโหลดข้อมูลรอบการปลูก...</p>
      </div>
    );
  }

  if (error || !round) {
    return (
      <div className="p-8 text-center space-y-4">
        <div className="p-4 rounded-xl bg-rose-50 text-rose-700 text-sm max-w-md mx-auto">
          {error || 'ไม่พบข้อมูลรอบการปลูก'}
        </div>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-farm-600 hover:text-farm-700"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>กลับหน้ารอบเปิดจอง</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Back button */}
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>กลับหน้ารายการรอบจอง</span>
        </Link>
      </div>

      {/* Round Header Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <span className="text-xs font-semibold uppercase text-farm-600 tracking-wider">
              เปิดให้สั่งจองล่วงหน้า
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-0.5">{round.name}</h1>
          </div>
          <Badge status={round.status} type="round" />
        </div>

        {/* Schedule grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
          <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-100 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-emerald-950">
              <Calendar className="w-4 h-4 text-emerald-600" />
              <span>กำหนดเก็บเกี่ยว & ส่งมอบ</span>
            </div>
            <p className="text-slate-700 font-medium">{formatDate(round.fulfillment_date)}</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-100 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-amber-950">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>เริ่มเปิดรับจอง</span>
            </div>
            <p className="text-slate-700 font-medium">{formatDateTimeDMY(round.booking_opens_at)}</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
            <div className="flex items-center gap-2 font-medium text-slate-800">
              <Store className="w-4 h-4 text-slate-500" />
              <span>เวลามารับเองที่ฟาร์ม</span>
            </div>
            <p className="text-slate-600">
              {round.pickup_start_time.slice(0, 5)} - {round.pickup_end_time.slice(0, 5)} น.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
            <div className="flex items-center gap-2 font-medium text-slate-800">
              <Truck className="w-4 h-4 text-slate-500" />
              <span>ช่วงเวลาจัดส่งในตัวเมือง</span>
            </div>
            <p className="text-slate-600">
              {round.delivery_start_time.slice(0, 5)} - {round.delivery_end_time.slice(0, 5)} น.
            </p>
          </div>
        </div>

        {round.notes && (
          <p className="text-xs sm:text-sm text-slate-600 italic bg-slate-50 p-3 rounded-xl border border-slate-100">
            🌱 หมายเหตุจากฟาร์ม: {round.notes}
          </p>
        )}

        {(round.status !== 'booking_open' || new Date(round.booking_opens_at) > new Date()) && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm font-semibold flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <span>{round.status === 'booking_open' && new Date(round.booking_opens_at) > new Date()
              ? `รอบนี้จะเริ่มเปิดรับจอง ${formatDateTimeDMY(round.booking_opens_at)}`
              : 'รอบการปลูกนี้ปิดรับการสั่งจองแล้ว ไม่สามารถสั่งจองผลผลิตได้ในขณะนี้'}</span>
          </div>
        )}
      </div>

      {/* Alert toast for limits */}
      {qtyAlert && (
        <div className="sticky top-20 z-30 p-3.5 rounded-xl bg-rose-600 text-white text-xs sm:text-sm font-medium shadow-lg flex items-center gap-2 animate-bounce">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{qtyAlert}</span>
        </div>
      )}

      {/* Vegetable Cards List */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">เลือกผักที่ต้องการจอง</h2>
        <p className="text-xs text-slate-500">
          สามารถระบุจำนวนเป็นกิโลกรัม (ขั้นต่ำ 0.5 กก. ปรับเพิ่ม-ลดทีละ 0.5 กก.)
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {round.items?.map((item) => {
            const inCartQty = getItemQtyInCart(item.id);
            const cropName = item.crop_name || item.crops?.name || 'ผักสลัด';
            const price = Number(item.price_per_kg);
            const available = Number(item.available_qty_kg || 0);
            const isBookingClosed = round.status !== 'booking_open' || new Date(round.booking_opens_at) > new Date();
            const isSoldOut = item.is_sold_out || available <= 0;

            return (
              <div
                key={item.id}
                className={`bg-white rounded-2xl border p-5 flex flex-col justify-between transition-all ${
                  inCartQty > 0
                    ? 'border-farm-500 ring-2 ring-farm-500/20 shadow-sm'
                    : 'border-slate-200/90'
                } ${isSoldOut || isBookingClosed ? 'opacity-70 bg-slate-50/70' : ''}`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-bold text-base text-slate-900 leading-snug">{cropName}</h3>
                    {isBookingClosed ? (
                      <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                        ปิดรับจองแล้ว
                      </span>
                    ) : isSoldOut ? (
                      <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                        เต็มแล้ว
                      </span>
                    ) : (
                      <span className="text-xs text-slate-600">
                        เหลือ <strong className="text-farm-700">{available.toFixed(1)}</strong> กก.
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline gap-1.5 mb-3">
                    <span className="text-xl font-extrabold text-slate-900">฿{price.toFixed(0)}</span>
                    <span className="text-xs text-slate-500 font-normal">/ กิโลกรัม</span>
                  </div>

                  {item.max_qty_per_order_kg && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded inline-block mb-3 border border-amber-200">
                      จำกัดสูงสุด {item.max_qty_per_order_kg} กก./ออเดอร์
                    </p>
                  )}
                </div>

                {/* Quantity Controller */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-600">จำนวนที่เลือก:</span>

                  {isBookingClosed ? (
                    <span className="text-xs text-slate-500 font-medium bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                      ปิดรับการจองแล้ว
                    </span>
                  ) : isSoldOut ? (
                    <span className="text-xs text-slate-400 font-medium">ไม่สามารถจองได้</span>
                  ) : inCartQty === 0 ? (
                    <button
                      onClick={() => handleQtyChange(item, 0.5)}
                      className="px-4 py-2 rounded-xl bg-farm-600 text-white text-xs font-semibold hover:bg-farm-700 active:scale-95 transition-all shadow-sm shadow-farm-600/20"
                    >
                      + เพิ่ม 0.5 กก.
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
                      <button
                        onClick={() => handleQtyChange(item, -0.5)}
                        className="w-8 h-8 rounded-lg bg-white text-slate-700 hover:bg-slate-200 flex items-center justify-center font-bold text-sm shadow-xs transition-colors"
                        title="ลด 0.5 กก."
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-12 text-center font-bold text-sm text-slate-900">
                        {inCartQty.toFixed(1)}
                      </span>
                      <button
                        onClick={() => handleQtyChange(item, 0.5)}
                        className="w-8 h-8 rounded-lg bg-farm-600 text-white hover:bg-farm-700 flex items-center justify-center font-bold text-sm shadow-xs transition-colors"
                        title="เพิ่ม 0.5 กก."
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Floating Bottom Cart Bar */}
      {items.length > 0 && round.status === 'booking_open' && (
        <div className="fixed bottom-14 md:bottom-6 left-0 right-0 z-30 px-4 max-w-lg mx-auto">
          <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4 border border-slate-800 backdrop-blur-md">
            <div>
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-farm-400" />
                <span className="text-xs text-slate-400">ตะกร้าของคุณ ({items.length} ชนิด):</span>
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="font-extrabold text-base text-white">{totalKg.toFixed(1)} กก.</span>
                <span className="text-sm font-semibold text-emerald-400">฿{totalAmount.toLocaleString()}</span>
              </div>
            </div>

            <button
              onClick={() => {
                if (!user) {
                  navigate('/login', { state: { returnTo: '/checkout' } });
                } else {
                  navigate('/checkout');
                }
              }}
              className="px-5 py-2.5 rounded-xl bg-farm-500 hover:bg-farm-600 text-slate-950 font-bold text-xs sm:text-sm transition-all shadow-md active:scale-95 whitespace-nowrap cursor-pointer"
            >
              ดำเนินการสั่งจอง →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
