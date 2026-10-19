import { formatKg } from '../../lib/bookingQuantity.js';
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { useCart } from '../../context/CartContext.js';
import { api } from '../../lib/api.js';
import { FulfillmentMethod } from '../../types/index.js';
import { Store, Truck, ShoppingBag, ArrowLeft, CheckCircle2, AlertCircle, LogIn, MapPin } from 'lucide-react';
import { CustomerPageHeader } from '../../components/common/CustomerPageHeader.js';

export const CheckoutPage: React.FC = () => {
  const { user, profile, refreshProfile, signInWithGoogle } = useAuth();
  const { items, roundId, totalKg, totalAmount, clearCart } = useCart();
  const navigate = useNavigate();

  const [fulfillmentMethod, setFulfillmentMethod] = useState<FulfillmentMethod>('pickup');
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');
  const [saveAddressToProfile, setSaveAddressToProfile] = useState<boolean>(true);
  const [contactPhone, setContactPhone] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [acceptedTerms, setAcceptedTerms] = useState<boolean>(false);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Pre-fill profile info if available
  useEffect(() => {
    if (profile) {
      if (profile.phone && !contactPhone) setContactPhone(profile.phone);
      if (profile.address_detail && !deliveryAddress) setDeliveryAddress(profile.address_detail);
    }
  }, [profile]);

  if (items.length === 0 || !roundId) {
    return (
      <div className="py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
          <ShoppingBag className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">ไม่มีรายการผักในตะกร้า</h2>
        <p className="text-sm text-slate-500 max-w-sm mx-auto">
          กรุณาเลือกรอบการปลูกและระบุผักที่ต้องการจองก่อนทำรายการ
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-farm-600 text-white text-sm font-semibold hover:bg-farm-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>เลือกรอบเปิดจอง</span>
        </Link>
      </div>
    );
  }

  const isLargeOrder = totalKg >= 10;

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!user) {
      setErrorMessage('กรุณาเข้าสู่ระบบด้วย Google ก่อนบันทึกการจอง');
      return;
    }

    if (!contactPhone.trim() || contactPhone.trim().length < 9) {
      setErrorMessage('กรุณาระบุเบอร์โทรศัพท์ที่ติดต่อได้ (อย่างน้อย 9 หลัก)');
      return;
    }

    if (fulfillmentMethod === 'delivery') {
      const finalAddr = deliveryAddress.trim() || profile?.address_detail?.trim() || '';
      if (!finalAddr) {
        setErrorMessage('กรุณาระบุที่อยู่สำหรับการจัดส่ง หรือกรอกที่อยู่ในหน้าข้อมูลส่วนตัว');
        return;
      }
    }

    if (!acceptedTerms) {
      setErrorMessage('กรุณาทำเครื่องหมายยอมรับเงื่อนไขการทดแทนผักกรณีผลผลิตไม่เพียงพอก่อนยืนยัน');
      return;
    }

    try {
      setIsSubmitting(true);
      const trimmedAddress = deliveryAddress.trim();

      // If user wants to save/update this address to profile
      if (
        fulfillmentMethod === 'delivery' &&
        saveAddressToProfile &&
        trimmedAddress &&
        trimmedAddress !== profile?.address_detail
      ) {
        try {
          await api.put('/profile', {
            full_name: profile?.full_name || user?.email?.split('@')[0] || 'ลูกค้า',
            phone: contactPhone.trim(),
            address_detail: trimmedAddress,
          });
        } catch (e) {
          console.warn('Could not auto-save address to profile:', e);
        }
      }

      const payload = {
        round_id: roundId,
        items: items.map((i) => ({
          round_item_id: i.round_item_id,
          qty_kg: i.qty_kg,
        })),
        fulfillment_method: fulfillmentMethod,
        delivery_address: fulfillmentMethod === 'delivery' ? (trimmedAddress || profile?.address_detail || null) : null,
        district_id: null,
        contact_phone: contactPhone.trim(),
        note: note.trim() || null,
        accepted_substitution_terms: acceptedTerms,
      };

      const res = await api.post('/orders', payload);
      clearCart();
      await refreshProfile();

      const orderId = res.data?.order_id;
      if (orderId) {
        navigate(`/orders/${orderId}`, { replace: true });
      } else {
        navigate('/orders', { replace: true });
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'เกิดข้อผิดพลาดในการบันทึกคำสั่งจอง');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-8">
      <Link
        to={roundId ? `/rounds/${roundId}` : '/'}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>แก้ไขรายการในตะกร้า</span>
      </Link>

      <CustomerPageHeader eyebrow="ขั้นตอนสุดท้าย · ผักสดจากฟาร์ม" title="ยืนยันการสั่งจองผัก" description="ตรวจสอบรายการ เลือกวิธีรับสินค้า และกรอกข้อมูลติดต่อก่อนยืนยัน" icon={<ShoppingBag className="h-8 w-8" />}>
        <span className="rounded-full bg-lime-300 px-3 py-1.5 text-xs font-extrabold text-emerald-950">{items.length} ชนิด · {formatKg(totalKg)} กก.</span>
        <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold">ชำระเงินเมื่อรับผัก</span>
      </CustomerPageHeader>

      <div className="space-y-6 rounded-[1.75rem] border border-emerald-100 bg-white p-5 shadow-sm sm:p-8">

        {/* Not Logged In Warning */}
        {!user && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="font-semibold">เข้าสู่ระบบเพื่อดำเนินการต่อ</p>
              <p className="text-amber-700">ต้องเข้าสู่ระบบด้วย Google เพื่อบันทึกคำสั่งจองและติดตามสถานะ</p>
            </div>
            <button
              onClick={() => signInWithGoogle()}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white font-semibold text-xs flex items-center gap-1.5 hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <LogIn className="w-4 h-4" />
              <span>เข้าสู่ระบบด้วย Google</span>
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Items Summary Table */}
        <div className="space-y-3">
          <h2 className="text-sm font-black uppercase tracking-wider text-emerald-800">
            รายการผักที่เลือก ({items.length} รายการ)
          </h2>
          <div className="divide-y divide-slate-100 rounded-2xl border border-emerald-100 bg-[#f8faf6] p-3">
            {items.map((i) => (
              <div key={i.round_item_id} className="py-2.5 flex items-center justify-between text-xs sm:text-sm">
                <div>
                  <span className="font-semibold text-slate-800">{i.crop_name}</span>
                  <div className="text-slate-500 text-xs">
                    ฿{i.price_per_kg.toFixed(0)} × {formatKg(i.qty_kg)} กก.
                  </div>
                </div>
                <span className="font-bold text-slate-900">
                  ฿{(i.qty_kg * i.price_per_kg).toLocaleString()}
                </span>
              </div>
            ))}

            <div className="pt-3 flex items-center justify-between text-sm sm:text-base font-extrabold border-t border-slate-200">
              <span className="text-slate-700">รวมทั้งหมด ({formatKg(totalKg)} กก.)</span>
              <span className="text-emerald-800">฿{totalAmount.toLocaleString()}</span>
            </div>
          </div>

          {/* Large order badge */}
          {isLargeOrder && (
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <span>📦 คำสั่งจองขนาดใหญ่ (ตั้งแต่ 10 กก. ขึ้นไป)</span>
              </p>
              <p className="text-blue-700">
                เนื่องจากเป็นออเดอร์ปริมาณมาก ทางฟาร์มจะติดต่อทางโทรศัพท์เพื่อยืนยันรายการก่อนเริ่มเก็บเกี่ยว
              </p>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmitOrder} className="space-y-6">
          {/* Fulfillment Method Selection */}
          <div className="space-y-3">
            <label className="text-sm font-bold text-slate-900 block">วิธีรับสินค้า</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFulfillmentMethod('pickup')}
                className={`p-4 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                  fulfillmentMethod === 'pickup'
                    ? 'border-farm-600 bg-farm-50/50 ring-2 ring-farm-600/20'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <Store className={`w-5 h-5 mb-2 ${fulfillmentMethod === 'pickup' ? 'text-farm-600' : 'text-slate-400'}`} />
                <div>
                  <span className="font-bold text-xs sm:text-sm text-slate-900 block">มารับเองที่ฟาร์ม</span>
                  <span className="text-[11px] text-slate-500">รับตามวันและช่วงเวลาที่ระบุ</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFulfillmentMethod('delivery')}
                className={`p-4 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                  fulfillmentMethod === 'delivery'
                    ? 'border-farm-600 bg-farm-50/50 ring-2 ring-farm-600/20'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <Truck className={`w-5 h-5 mb-2 ${fulfillmentMethod === 'delivery' ? 'text-farm-600' : 'text-slate-400'}`} />
                <div>
                  <span className="font-bold text-xs sm:text-sm text-slate-900 block">จัดส่งสินค้า</span>
                  <span className="text-[11px] text-emerald-600 font-medium">ส่งตามที่อยู่ที่ระบุในโปรไฟล์</span>
                </div>
              </button>
            </div>
          </div>

          {/* Delivery Fields if delivery selected */}
          {fulfillmentMethod === 'delivery' && (
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xs sm:text-sm text-slate-900">ที่อยู่สำหรับจัดส่ง</h3>
                    <p className="text-[11px] text-slate-500">
                      {profile?.address_detail
                        ? 'ดึงข้อมูลจากหน้าโปรไฟล์ของคุณโดยอัตโนมัติ'
                        : 'ยังไม่พบที่อยู่ในโปรไฟล์ กรุณาระบุที่อยู่จัดส่งด้านล่าง'}
                    </p>
                  </div>
                </div>

                <Link
                  to="/profile"
                  target="_blank"
                  className="text-xs text-farm-600 hover:text-farm-700 font-semibold underline flex-shrink-0"
                >
                  แก้ไขในข้อมูลส่วนตัว
                </Link>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  ที่อยู่จัดส่ง (บ้านเลขที่, ถนน, ซอย, ตำบล, อำเภอ, จังหวัด, รหัสไปรษณีย์) *
                </label>
                <textarea
                  rows={3}
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="เช่น 123/45 หมู่ 6 ถ.มิตรภาพ ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000 (จุดสังเกต: รั้วสีเขียวติดร้านกาแฟ)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-farm-500 leading-relaxed shadow-xs"
                  required
                />
              </div>

              <div className="pt-1">
                <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={saveAddressToProfile}
                    onChange={(e) => setSaveAddressToProfile(e.target.checked)}
                    className="w-4 h-4 text-farm-600 rounded border-slate-300 focus:ring-farm-500"
                  />
                  <span>บันทึก/อัปเดตที่อยู่นี้ลงในหน้าข้อมูลส่วนตัวสำหรับรอบการจองถัดไป</span>
                </label>
              </div>
            </div>
          )}

          {/* Contact phone */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              เบอร์โทรศัพท์สำหรับติดต่อ *
            </label>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="08X-XXX-XXXX"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-farm-500"
              required
            />
          </div>

          {/* Note to farm */}
          <div>
            <label className="text-xs font-medium text-slate-700 block mb-1">
              หมายเหตุเพิ่มเติมถึงฟาร์ม (ถ้ามี)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น ฝากไว้หน้าบ้าน หรือขอผักเน้นใบเขียว"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-farm-500"
            />
          </div>

          {/* Payment info reminder */}
          <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-700 space-y-1">
            <span className="font-bold text-slate-900 block">การชำระเงิน:</span>
            <p>
              ทางฟาร์มไม่มีการเรียกเก็บเงินออนไลน์ ลูกค้าสามารถชำระด้วย <strong>เงินสด</strong> หรือ <strong>โอนเงินผ่านพร้อมเพย์/คิวอาร์โค้ด</strong> ณ ตอนได้รับผักสดเท่านั้น
            </p>
          </div>

          {/* Mandatory substitution checkbox (Rule 4.8) */}
          <div className="pt-2">
            <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200 cursor-pointer hover:bg-amber-50 transition-colors">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-farm-600 rounded border-slate-300 focus:ring-farm-500"
                required
              />
              <span className="text-xs text-slate-800 leading-relaxed font-medium">
                ฉันเข้าใจและยอมรับเงื่อนไขว่า หากผลผลิตจริงของฟาร์มในรอบนี้ไม่เพียงพอ ทางฟาร์มอาจจัดหาผักคุณภาพเทียบเท่าจากแหล่งปลูกอื่นที่ได้มาตรฐานมาส่งมอบทดแทนให้ตามจำนวนที่จองไว้
              </span>
            </label>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={isSubmitting || !user}
            className={`w-full py-3.5 rounded-2xl text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 ${
              isSubmitting || !user
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-emerald-800 hover:bg-emerald-900 active:scale-98 shadow-emerald-800/20'
            }`}
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                <span>กำลังบันทึกคำสั่งจอง...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                <span>ยืนยันการสั่งจอง (ชำระ ฿{totalAmount.toLocaleString()} ตอนรับของ)</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
