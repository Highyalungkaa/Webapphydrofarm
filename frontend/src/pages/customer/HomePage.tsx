import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../lib/api.js';
import { formatDateDMY, formatDateTimeDMY } from '../../lib/dateFormat.js';
import { PlantingRound } from '../../types/index.js';
import { Badge } from '../../components/common/Badge.js';
import { Calendar, Clock, Truck, Store, ArrowRight, Sprout, AlertCircle } from 'lucide-react';

export const HomePage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rounds, setRounds] = useState<PlantingRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOpenRounds = async () => {
      try {
        setLoading(true);
        const data = await api.get<PlantingRound[]>('/rounds/open');
        setRounds(data);
      } catch (err: any) {
        setError(err.message || 'ไม่สามารถโหลดรอบที่เปิดจองได้');
      } finally {
        setLoading(false);
      }
    };

    fetchOpenRounds();
  }, []);

  const handleBookRound = (roundId: string) => {
    if (!user) {
      navigate('/login', { state: { returnTo: `/rounds/${roundId}` } });
    } else {
      navigate(`/rounds/${roundId}`);
    }
  };

  const formatDate = formatDateDMY;

  return (
    <div className="space-y-8">
      {/* Hero Banner */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-800 via-farm-700 to-teal-900 text-white p-6 sm:p-10 shadow-xl shadow-farm-900/10">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/20 text-emerald-100 backdrop-blur-md mb-4">
            <Sprout className="w-3.5 h-3.5" />
            ปลูกด้วยระบบไฮโดรโปนิกส์มาตรฐาน
          </span>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight mb-3">
            ผักสลัดสดใหม่จากฟาร์ม จองล่วงหน้าก่อนเก็บเกี่ยว
          </h1>
          <p className="text-emerald-100 text-sm sm:text-base leading-relaxed mb-6 font-light">
            เราเริ่มปลูกและดูแลจนใกล้เก็บเกี่ยว จึงเปิดให้ลูกค้าจองผักสด สะอาด กรอบ หวาน ไร้สารเคมีตกค้าง รับของสดวันต่อวัน จ่ายเงินตอนรับของเท่านั้น
          </p>

          <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-emerald-200">
            <div className="flex items-center gap-1.5">
              <Store className="w-4 h-4 text-emerald-300" />
              <span>รับเองที่ฟาร์ม</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-emerald-300" />
              <span>จัดส่งปกติ</span>
            </div>
            <div className="flex items-center gap-1.5 font-medium text-white">
              <span>💵 ชำระเงินเมื่อได้รับสินค้า</span>
            </div>
          </div>
        </div>

        {/* Decorative background shape */}
        <div className="absolute -right-12 -bottom-12 w-64 h-64 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none"></div>
      </section>

      {/* Open Rounds Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">รอบที่เปิดให้สั่งจองในขณะนี้</h2>
            <p className="text-xs sm:text-sm text-slate-500">เลือกดูรายการผักและสั่งจองก่อนปิดรับตามกำหนดเวลา</p>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-farm-600 mb-2"></div>
            <p className="text-sm text-slate-500">กำลังโหลดรอบการปลูก...</p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : rounds.length === 0 ? (
          <div className="p-10 rounded-2xl bg-white border border-slate-200 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <Calendar className="w-7 h-7" />
            </div>
            <h3 className="font-semibold text-slate-800">ขณะนี้ยังไม่มีรอบเปิดให้จอง</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              ผักชุดใหม่กำลังเติบโตอยู่ในแปลงปลูก ทางฟาร์มจะเปิดระบบให้จองเมื่อใกล้ถึงกำหนดเก็บเกี่ยว กรุณากลับมาตรวจสอบอีกครั้งในเร็วๆ นี้
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {rounds.map((round) => (
              <div
                key={round.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between overflow-hidden"
              >
                <div className="p-5 sm:p-6 space-y-4">
                  {/* Round Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[11px] font-semibold tracking-wider text-farm-600 uppercase block mb-1">
                        รอบการปลูก
                      </span>
                      <h3 className="font-bold text-lg text-slate-900 leading-snug">{round.name}</h3>
                    </div>
                    <Badge status={round.status} type="round" />
                  </div>

                  {/* Harvest and fulfillment dates */}
                  <div className="space-y-2 text-xs sm:text-sm text-slate-600 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span>
                        กำหนดเก็บเกี่ยว & ส่งมอบ: <strong className="text-slate-900">{formatDate(round.fulfillment_date)}</strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <span>
                        เปิดจอง: <strong>{formatDateTimeDMY(round.booking_opens_at)}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Veggie list preview */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                      ผักในรอบนี้ ({round.items?.length || 0} ชนิด)
                    </span>
                    <div className="divide-y divide-slate-100">
                      {round.items?.map((item) => (
                        <div key={item.id} className="py-2 flex items-center justify-between text-xs sm:text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium text-slate-800 truncate">{item.crop_name}</span>
                            <span className="text-slate-500">฿{Number(item.price_per_kg).toFixed(0)}/กก.</span>
                          </div>
                          <div>
                            {item.is_sold_out ? (
                              <span className="text-[11px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                                เต็มแล้ว
                              </span>
                            ) : (
                              <span className="text-slate-600 text-xs">
                                เหลือ <strong className="text-farm-700">{Number(item.available_qty_kg).toFixed(1)}</strong> กก.
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Footer action */}
                <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    คงเหลือรวม {Number(round.total_available_kg || 0).toFixed(1)} กก.
                  </span>
                  <button
                    type="button"
                    onClick={() => handleBookRound(round.id)}
                    disabled={round.is_all_sold_out || round.status !== 'booking_open'}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-sm ${
                      round.status !== 'booking_open' || round.is_all_sold_out
                        ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                        : 'bg-farm-600 text-white hover:bg-farm-700 shadow-farm-600/20 hover:gap-2 cursor-pointer'
                    }`}
                  >
                    <span>
                      {round.status !== 'booking_open'
                        ? 'ปิดรับการจองแล้ว'
                        : round.is_all_sold_out
                        ? 'จองเต็มทุกรายการ'
                        : 'จองผักรอบนี้'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
