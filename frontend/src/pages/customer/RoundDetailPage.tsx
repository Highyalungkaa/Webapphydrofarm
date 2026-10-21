import {OrderLimitNotice} from '../../components/common/OrderLimitNotice.js';
import { PurchaseLimitBadge } from '../../components/common/PurchaseLimitBadge.js';
import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { formatDateDMY, formatDateTimeDMY } from '../../lib/dateFormat.js';
import { PlantingRound, RoundItem } from '../../types/index.js';
import { useCart } from '../../context/CartContext.js';
import { useAuth } from '../../context/AuthContext.js';
import { Badge } from '../../components/common/Badge.js';
import { CustomerPageHeader } from '../../components/common/CustomerPageHeader.js';
import { CropPhoto } from '../../components/common/CropPhoto.js';
import { parseBookingQuantity, formatKg } from '../../lib/bookingQuantity.js';
import { Calendar, Clock, Truck, ArrowLeft, Plus, Minus, ShoppingBag, AlertCircle, Sprout } from 'lucide-react';

const getCustomerFarmNote = (notes?: string | null): string => {
  if (!notes) return '';
  try {
    const parsed: unknown = JSON.parse(notes);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const note = (parsed as { note?: unknown }).note;
      return typeof note === 'string' ? note.trim() : '';
    }
    return typeof parsed === 'string' ? parsed.trim() : '';
  } catch {
    // Older rounds may store a plain text note rather than a JSON metadata object.
    return notes.trim();
  }
};

export const RoundDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [round, setRound] = useState<PlantingRound | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qtyAlert, setQtyAlert] = useState<string | null>(null);
  const [qtySteps, setQtySteps] = useState<Record<string, 0.5 | 1>>({});
  const [qtyInputs, setQtyInputs] = useState<Record<string, string | undefined>>({});
  const [qtyInputErrors, setQtyInputErrors] = useState<Record<string, string | undefined>>({});

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
    const requestedQty = currentQty + delta;
    const maxAllowed = Math.min(
      item.available_qty_kg == null ? Infinity : Number(item.available_qty_kg),
      item.max_qty_per_order_kg ? Number(item.max_qty_per_order_kg) : Number.POSITIVE_INFINITY,
    );
    const newQty = Math.max(0, Math.round((currentQty === 0 && delta > 0 ? Math.min(delta, maxAllowed) : requestedQty) * 100) / 100);

    const result = setItemQty(
      {
        round_item_id: item.id,
        crop_name: item.crop_name || item.crops?.name || 'ผักสลัด',
        price_per_kg: Number(item.price_per_kg),
        max_qty_per_order_kg: item.max_qty_per_order_kg,
        available_qty_kg: item.available_qty_kg ?? null,
      },
      newQty
    );

    if (!result.success && result.message) {
      setQtyAlert(result.message);
      setTimeout(() => setQtyAlert(null), 4000);
    } else if (result.success) {
      setQtyInputs((previous) => ({ ...previous, [item.id]: undefined }));
      setQtyInputErrors((previous) => ({ ...previous, [item.id]: undefined }));
    }
  };

  const handleCustomQty = (item: RoundItem) => {
    const currentQty = items.find((entry) => entry.round_item_id === item.id)?.qty_kg || 0;
    const parsed = parseBookingQuantity(qtyInputs[item.id] ?? (currentQty > 0 ? String(currentQty) : ''));
    if (parsed.qty === undefined) {
      setQtyInputErrors((previous) => ({ ...previous, [item.id]: parsed.error }));
      return;
    }
    const result = setItemQty({
      round_item_id: item.id,
      crop_name: item.crop_name || item.crops?.name || 'ผักสลัด',
      price_per_kg: Number(item.price_per_kg),
      max_qty_per_order_kg: item.max_qty_per_order_kg,
      available_qty_kg: item.available_qty_kg ?? null,
    }, parsed.qty);
    setQtyInputErrors((previous) => ({ ...previous, [item.id]: result.success ? undefined : result.message }));
    if (result.success) {
      setQtyInputs((previous) => ({ ...previous, [item.id]: undefined }));
      setQtyAlert(null);
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

  const farmNote = getCustomerFarmNote(round.notes);

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

      <OrderLimitNotice remaining={round.order_limit_remaining}/>
      <CustomerPageHeader eyebrow="รอบเปิดจอง · ผักสดจากฟาร์ม" title={round.name} description="ดูชนิดผักที่พร้อมจอง เลือกจำนวน แล้วตรวจสอบรายการก่อนยืนยัน" icon={<Sprout className="h-8 w-8" />}>
        <span className="rounded-full bg-lime-300 px-3 py-1.5 text-xs font-extrabold text-emerald-950">{round.status === 'booking_open' ? 'เปิดรับจอง' : 'ปิดรับจอง'}</span>
        {(round.purchase_limit_enabled||round.order_limit_remaining!=null) && <PurchaseLimitBadge/>}
        <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-white">{round.items?.length || 0} ชนิดผัก</span>
      </CustomerPageHeader>

      {/* Round schedule */}
      <div className="space-y-5 rounded-[1.75rem] border border-emerald-100 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div><p className="text-[11px] font-extrabold uppercase tracking-[.15em] text-emerald-700">รายละเอียดรอบ</p><h2 className="mt-1 text-lg font-black text-slate-950">กำหนดการและการรับสินค้า</h2></div>
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
              <Truck className="w-4 h-4 text-slate-500" />
              <span>ช่วงเวลาจัดส่งในตัวเมือง</span>
            </div>
            <p className="text-slate-600">
              {round.delivery_start_time.slice(0, 5)} - {round.delivery_end_time.slice(0, 5)} น.
            </p>
          </div>
        </div>

        {farmNote && (
          <p className="text-xs sm:text-sm text-slate-600 italic bg-slate-50 p-3 rounded-xl border border-slate-100">
            🌱 หมายเหตุจากฟาร์ม: {farmNote}
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
      <section className="space-y-4">
        <div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-emerald-700">Choose your greens</p><h2 className="mt-1 text-2xl font-black text-slate-950">เลือกผักที่ต้องการจอง</h2><p className="mt-1 text-xs text-slate-500">กดเพิ่ม–ลด หรือกรอกจำนวนกิโลกรัมเองได้ ขั้นต่ำ 0.5 กก.</p></div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {round.items?.map((item) => {
            const inCartQty = getItemQtyInCart(item.id);
            const qtyStep = qtySteps[item.id] || 0.5;
            const cropName = item.crop_name || item.crops?.name || 'ผักสลัด';
            const price = Number(item.price_per_kg);
            const available = item.available_qty_kg == null ? Infinity : Number(item.available_qty_kg);
            const isBookingClosed = round.order_limit_remaining===0 || round.status !== 'booking_open' || new Date(round.booking_opens_at) > new Date();
            const isSoldOut = false;

            return (
              <div
                key={item.id}
                className={`flex flex-col justify-between rounded-[1.5rem] border bg-white p-5 shadow-sm transition-all hover:shadow-lg hover:shadow-emerald-900/5 ${
                  inCartQty > 0
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                    : 'border-slate-200/90 hover:border-emerald-300'
                } ${isSoldOut || isBookingClosed ? 'opacity-70 bg-slate-50/70' : ''}`}
              >
                <div>
                  <div className="-mx-5 -mt-5 mb-4 overflow-hidden rounded-t-[1.5rem]">
                    <CropPhoto imageUrl={item.crops?.image_url} name={cropName} />
                  </div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-lg font-black leading-snug text-slate-950">{cropName}</h3>
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
                        เปิดรับจอง
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline gap-1.5 mb-3">
                    <span className="text-2xl font-black text-emerald-800">฿{price.toFixed(0)}</span>
                    <span className="text-xs text-slate-500 font-normal">/ กิโลกรัม</span>
                  </div>

                  {item.max_qty_per_order_kg && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded inline-block mb-3 border border-amber-200">
                      จำกัดสูงสุด {item.max_qty_per_order_kg} กก./ออเดอร์
                    </p>
                  )}
                </div>

                {/* Per-crop quantity step and controller */}
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-600">ปรับจำนวนครั้งละ</span>
                    <div className="flex rounded-lg border border-emerald-100 bg-emerald-50 p-0.5">
                      {([0.5, 1] as const).map((step) => (
                        <button
                          key={step}
                          type="button"
                          onClick={() => setQtySteps((previous) => ({ ...previous, [item.id]: step }))}
                          aria-pressed={qtyStep === step}
                          className={`rounded-md px-2.5 py-1.5 text-[11px] font-bold transition ${qtyStep === step ? 'bg-emerald-700 text-white shadow-sm' : 'text-emerald-800 hover:bg-white'}`}
                        >
                          {step} กก.
                        </button>
                      ))}
                    </div>
                  </div>

                  {!isBookingClosed && !isSoldOut && (
                    <div className="space-y-1.5">
                      <label htmlFor={`custom-qty-${item.id}`} className="block text-xs font-semibold text-slate-700">กรอกจำนวนเอง (กก.)</label>
                      <div className="flex gap-2">
                        <input
                          id={`custom-qty-${item.id}`}
                          type="number"
                          inputMode="decimal"
                          min="0.5"
                          step="0.01"
                          max={item.max_qty_per_order_kg ?? undefined}
                          placeholder="เช่น 2.5"
                          value={qtyInputs[item.id] ?? (inCartQty > 0 ? String(inCartQty) : '')}
                          onChange={(event) => {
                            setQtyInputs((previous) => ({ ...previous, [item.id]: event.target.value }));
                            setQtyInputErrors((previous) => ({ ...previous, [item.id]: undefined }));
                          }}
                          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); handleCustomQty(item); } }}
                          aria-label={`จำนวนกิโลกรัมของ${cropName}`}
                          aria-invalid={!!qtyInputErrors[item.id]}
                          aria-describedby={`custom-qty-help-${item.id}`}
                          className={`min-w-0 flex-1 rounded-xl border bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 ${qtyInputErrors[item.id] ? 'border-rose-300 focus:ring-rose-200' : 'border-slate-200 focus:ring-emerald-200'}`}
                        />
                        <button type="button" onClick={() => handleCustomQty(item)} className="shrink-0 rounded-xl bg-emerald-700 px-3 py-2.5 text-xs font-bold text-white hover:bg-emerald-800">{inCartQty > 0 ? 'อัปเดตจำนวน' : 'เพิ่มลงตะกร้า'}</button>
                      </div>
                      <p id={`custom-qty-help-${item.id}`} role={qtyInputErrors[item.id] ? 'alert' : undefined} className={`text-[11px] ${qtyInputErrors[item.id] ? 'font-semibold text-rose-700' : 'text-slate-500'}`}>{qtyInputErrors[item.id] || 'ขั้นต่ำ 0.5 กก. · กรอกทศนิยมได้ 2 ตำแหน่ง แล้วกดปุ่มยืนยันจำนวน'}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-600">จำนวนที่เลือก:</span>

                  {isBookingClosed ? (
                    <span className="text-xs text-slate-500 font-medium bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                      ปิดรับการจองแล้ว
                    </span>
                  ) : isSoldOut ? (
                    <span className="text-xs text-slate-400 font-medium">ไม่สามารถจองได้</span>
                  ) : inCartQty === 0 ? (
                    <button
                      onClick={() => handleQtyChange(item, qtyStep)}
                      className="px-4 py-2 rounded-xl bg-farm-600 text-white text-xs font-semibold hover:bg-farm-700 active:scale-95 transition-all shadow-sm shadow-farm-600/20"
                    >
                      + เพิ่ม {qtyStep} กก.
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
                      <button
                        onClick={() => handleQtyChange(item, -qtyStep)}
                        className="w-8 h-8 rounded-lg bg-white text-slate-700 hover:bg-slate-200 flex items-center justify-center font-bold text-sm shadow-xs transition-colors"
                        title={`ลด ${qtyStep} กก.`}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-12 text-center font-bold text-sm text-slate-900">
                        {formatKg(inCartQty)}
                      </span>
                      <button
                        onClick={() => handleQtyChange(item, qtyStep)}
                        className="w-8 h-8 rounded-lg bg-farm-600 text-white hover:bg-farm-700 flex items-center justify-center font-bold text-sm shadow-xs transition-colors"
                        title={`เพิ่ม ${qtyStep} กก.`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Floating Bottom Cart Bar */}
      {items.length > 0 && round.status === 'booking_open' && round.order_limit_remaining!==0 && (
        <div className="fixed bottom-14 md:bottom-6 left-0 right-0 z-30 px-4 max-w-lg mx-auto">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-800 bg-emerald-950 p-4 text-white shadow-2xl backdrop-blur-md">
            <div>
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-farm-400" />
                <span className="text-xs text-slate-400">ตะกร้าของคุณ ({items.length} ชนิด):</span>
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="font-extrabold text-base text-white">{formatKg(totalKg)} กก.</span>
                <span className="text-sm font-semibold text-emerald-400">฿{totalAmount.toLocaleString()}</span>
              </div>
            </div>

            <button
              onClick={() => {
                if (!user) {
                  navigate('/login', { state: { returnTo: '/checkout' } });
                } else {
                  navigate('/booking-review');
                }
              }}
              className="px-5 py-2.5 rounded-xl bg-farm-500 hover:bg-farm-600 text-slate-950 font-bold text-xs sm:text-sm transition-all shadow-md active:scale-95 whitespace-nowrap cursor-pointer"
            >
              ตรวจสอบรายการจอง →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
