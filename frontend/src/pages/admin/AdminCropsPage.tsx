import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { Crop } from '../../types/index.js';
import {
  Plus,
  Edit2,
  Trash2,
  Leaf,
  AlertCircle,
  X,
  Image as ImageIcon,
  ImagePlus,
  Layers,
  Sparkles,
  ExternalLink,
} from 'lucide-react';

interface PresetCrop {
  name: string;
  price: number;
  slots: number;
  imageUrl: string;
  description: string;
}

const PRESET_CROPS: PresetCrop[] = [
  {
    name: 'กรีนโอ๊ค (Green Oak)',
    price: 130,
    slots: 4.5,
    imageUrl: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=500&auto=format&fit=crop&q=80',
    description: 'ผักสลัดใบหยัก สีเขียวอ่อน รสชาติหวานกรอบ ไม่มีรสขม ทานง่าย อุดมไปด้วยกากใยและวิตามินซี',
  },
  {
    name: 'เรดโอ๊ค (Red Oak)',
    price: 130,
    slots: 4.5,
    imageUrl: 'https://images.unsplash.com/photo-1508747703725-719777637510?w=500&auto=format&fit=crop&q=80',
    description: 'ผักสลัดใบสีแดงอมม่วง รสชาติหวานนุ่ม ช่วยต้านอนุมูลอิสระด้วยสารแอนโทไซยานิน สีสันสวยงามบนจานสลัด',
  },
  {
    name: 'คอส / โรเมน (Cos / Romaine)',
    price: 140,
    slots: 4.0,
    imageUrl: 'https://images.unsplash.com/photo-1622206151226-18ca2c9ab4a1?w=500&auto=format&fit=crop&q=80',
    description: 'ผักสลัดใบยาว กรอบแน่น ทนความร้อนได้ดี นิยมทานคู่กับน้ำสลัดซีซาร์ มีวิตามินเคและโฟเลตสูง',
  },
  {
    name: 'บัตเตอร์เฮด (Butterhead)',
    price: 150,
    slots: 4.0,
    imageUrl: 'https://images.unsplash.com/photo-1556801712-76c8eb07bbc9?w=500&auto=format&fit=crop&q=80',
    description: 'ใบอ่อนนุ่มซ้อนกันเป็นพุ่มคล้ายดอกกุหลาบ รสสัมผัสนุ่มละมุนคล้ายเนย หวานอร่อย เหมาะกับทุกน้ำสลัด',
  },
  {
    name: 'ฟิลเล่ย์ ไอซ์เบิร์ก (Frillice)',
    price: 150,
    slots: 5.0,
    imageUrl: 'https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?w=500&auto=format&fit=crop&q=80',
    description: 'ใบหยิกหยักเป็นฝอย กรอบมากเป็นพิเศษ เคี้ยวเพลิน รสชาติหวานสดชื่น เหมาะสำหรับเมนูยำและสลัด',
  },
];

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = () => reject(new Error('อ่านไฟล์รูปภาพไม่สำเร็จ'));
  reader.readAsDataURL(file);
});

export const AdminCropsPage: React.FC = () => {
  const [crops, setCrops] = useState<Crop[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [defaultPrice, setDefaultPrice] = useState<number | string>(120);
  const [slotsPerKg, setSlotsPerKg] = useState<number | string>(4.0);
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCrops();
  }, []);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview('');
      return;
    }
    const previewUrl = URL.createObjectURL(imageFile);
    setImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [imageFile]);

  const loadCrops = async () => {
    try {
      setLoading(true);
      const data = await api.get<Crop[]>('/admin/crops');
      setCrops(data || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'โหลดข้อมูลผักไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingId(null);
    setName('');
    setDefaultPrice(120);
    setSlotsPerKg(4.0);
    setImageUrl('');
    setImageFile(null);
    setDescription('');
    setIsActive(true);
    setError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (crop: Crop) => {
    setEditingId(crop.id);
    setName(crop.name);
    setDefaultPrice(Number(crop.default_price_per_kg));
    setSlotsPerKg(crop.slots_per_kg ? Number(crop.slots_per_kg) : 4.0);
    setImageUrl(crop.image_url || '');
    setImageFile(null);
    setDescription(crop.description || '');
    setIsActive(crop.is_active);
    setError(null);
    setIsModalOpen(true);
  };

  const handleApplyPreset = (preset: PresetCrop) => {
    setName(preset.name);
    setDefaultPrice(preset.price);
    setSlotsPerKg(preset.slots);
    setImageUrl(preset.imageUrl);
    setImageFile(null);
    setDescription(preset.description);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const priceNum = Number(defaultPrice);
    const slotsNum = Number(slotsPerKg);

    if (isNaN(priceNum) || priceNum < 0) {
      setError('ราคาต่อ กก. ต้องเป็นตัวเลขและไม่ติดลบ');
      return;
    }

    if (isNaN(slotsNum) || slotsNum <= 0) {
      setError('จำนวนต้น ต่อ 1 กก. ต้องมากกว่า 0');
      return;
    }

    try {
      setSaving(true);
      let savedImageUrl = imageUrl.trim();
      if (imageFile) {
        const uploaded = await api.post<{ image_url: string }>('/admin/crops/image', {
          mime_type: imageFile.type,
          data: await fileToBase64(imageFile),
        });
        savedImageUrl = uploaded.image_url;
      }
      const payload = {
        name: name.trim(),
        default_price_per_kg: priceNum,
        slots_per_kg: slotsNum,
        image_url: savedImageUrl || null,
        description: description.trim() || null,
        is_active: isActive,
      };

      if (editingId) {
        await api.put(`/admin/crops/${editingId}`, payload);
      } else {
        await api.post('/admin/crops', payload);
      }

      setIsModalOpen(false);
      await loadCrops();
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูลผัก');
    } finally {
      setSaving(false);
    }
  };

  const toggleCropStatus = async (crop: Crop) => {
    try {
      await api.put(`/admin/crops/${crop.id}`, {
        name: crop.name,
        default_price_per_kg: Number(crop.default_price_per_kg),
        slots_per_kg: crop.slots_per_kg ? Number(crop.slots_per_kg) : 4.0,
        image_url: crop.image_url || null,
        description: crop.description || null,
        is_active: !crop.is_active,
      });
      await loadCrops();
    } catch (err: any) {
      alert(err.message || 'ไม่สามารถเปลี่ยนสถานะได้');
    }
  };

  const handleDelete = async (crop: Crop) => {
    if (!window.confirm(`ยืนยันการลบชนิดผัก "${crop.name}"? \n(หากมีรอบปลูกหรือแปลงที่ใช้ผักนี้อยู่ ระบบจะแนะนำให้ปิดใช้งานแทน)`)) {
      return;
    }

    try {
      setDeletingId(crop.id);
      await api.delete(`/admin/crops/${crop.id}`);
      await loadCrops();
    } catch (err: any) {
      alert(err.message || 'ไม่สามารถลบชนิดผักนี้ได้');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">แคตตาล็อกชนิดผัก</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            จัดการรายการผักไฮโดรโปนิกส์ ราคาเริ่มต้น จำนวนต้นต่อกิโลกรัม (ต้น/กก.) รูปภาพ และรายละเอียดสินค้า
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-sm transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>เพิ่มชนิดผัก</span>
        </button>
      </div>

      {/* Crops Table */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-500 text-sm">กำลังโหลดข้อมูลผัก...</div>
        ) : crops.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">
            <Leaf className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-slate-700">ยังไม่มีรายการผักในระบบ</p>
            <p className="text-xs text-slate-400 mt-1">กดปุ่ม "เพิ่มชนิดผัก" เพื่อเริ่มสร้างรายการแรก</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold tracking-wider">
                  <th className="py-3.5 px-4">รูปภาพ / ชนิดผัก</th>
                  <th className="py-3.5 px-4">ราคาตั้งต้น / กก.</th>
                  <th className="py-3.5 px-4">จำนวนต้น / กก.</th>
                  <th className="py-3.5 px-4 hidden md:table-cell">รายละเอียดสินค้า</th>
                  <th className="py-3.5 px-4 text-center">สถานะ</th>
                  <th className="py-3.5 px-4 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {crops.map((crop) => (
                  <tr key={crop.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Image & Name */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        {crop.image_url ? (
                          <img
                            src={crop.image_url}
                            alt={crop.name}
                            className="w-12 h-12 rounded-xl object-cover border border-slate-200 flex-shrink-0 bg-slate-100"
                            onError={(e) => {
                              // Fallback on broken image link
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center flex-shrink-0">
                            <Leaf className="w-6 h-6" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">{crop.name}</p>
                          <p className="text-[11px] text-slate-400 md:hidden line-clamp-1 mt-0.5">
                            {crop.description || 'ไม่มีรายละเอียด'}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Price */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="font-bold text-slate-900 text-sm">
                        ฿{Number(crop.default_price_per_kg).toFixed(2)}
                      </span>
                      <span className="text-[11px] text-slate-400 ml-1">/กก.</span>
                    </td>

                    {/* Slots per kg */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 font-semibold text-xs border border-sky-100">
                        <Layers className="w-3.5 h-3.5" />
                        <span>{crop.slots_per_kg ? Number(crop.slots_per_kg) : 4} ต้น / กก.</span>
                      </div>
                    </td>

                    {/* Description (desktop) */}
                    <td className="py-3.5 px-4 hidden md:table-cell max-w-xs">
                      {crop.description ? (
                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                          {crop.description}
                        </p>
                      ) : (
                        <span className="text-xs text-slate-300 italic">- ไม่ได้ระบุ -</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <button
                        onClick={() => toggleCropStatus(crop)}
                        title="คลิกเพื่อสลับสถานะ"
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                          crop.is_active
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${crop.is_active ? 'bg-emerald-600' : 'bg-slate-400'}`} />
                        <span>{crop.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</span>
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => openEditModal(crop)}
                          className="p-2 rounded-xl text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                          title="แก้ไขชนิดผัก"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(crop)}
                          disabled={deletingId === crop.id}
                          className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="ลบชนิดผัก"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Add / Edit Crop */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-5 sm:p-7 max-w-lg w-full shadow-2xl space-y-4 my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <Leaf className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    {editingId ? 'แก้ไขข้อมูลชนิดผัก' : 'เพิ่มชนิดผักใหม่'}
                  </h2>
                  <p className="text-[11px] text-slate-400">กรอกข้อมูลผักไฮโดรโปนิกส์สำหรับฟาร์ม</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Quick Presets (Only when adding new or optional) */}
            {!editingId && (
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>เลือกเทมเพลตผักยอดนิยม (กรอกข้อมูลอัตโนมัติ):</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_CROPS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => handleApplyPreset(preset)}
                      className="px-2.5 py-1 text-[11px] font-semibold bg-white border border-slate-200 rounded-lg hover:border-emerald-500 hover:text-emerald-700 hover:bg-emerald-50/50 transition-colors"
                    >
                      {preset.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs sm:text-sm">
              {/* 1. Crop Name */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  1. ชื่อผัก <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="เช่น กรีนโอ๊ค (Green Oak)"
                  required
                  className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                />
              </div>

              {/* 2. Price and 3. Slots per Kg Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Price per Kg */}
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    2. ราคา ต่อ 1 กก. (฿) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400 font-bold">฿</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={defaultPrice}
                      onChange={(e) => setDefaultPrice(e.target.value)}
                      required
                      className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">ราคาตั้งต้นที่จะใช้อ้างอิงตอนเปิดรอบ</p>
                </div>

                {/* Slots per Kg */}
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    3. จำนวนต้น ต่อ 1 กก. <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={slotsPerKg}
                      onChange={(e) => setSlotsPerKg(e.target.value)}
                      required
                      placeholder="เช่น 4.0 หรือ 5.0"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    เช่น ผัก 4 ต้น = ผลผลิตประมาณ 1 กก.
                  </p>
                </div>
              </div>

              {/* 4. Crop image */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  4. รูปภาพชนิดผัก
                </label>
                <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/60 p-3 sm:flex-row sm:items-center">
                  <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 font-bold text-white hover:bg-emerald-900">
                    <ImagePlus className="h-4 w-4" />
                    เลือกรูปจากอุปกรณ์
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
                          setError('กรุณาเลือกรูปภาพ JPEG, PNG, WebP หรือ GIF');
                          e.currentTarget.value = '';
                          return;
                        }
                        if (file.size > 5 * 1024 * 1024) {
                          setError('ขนาดรูปภาพต้องไม่เกิน 5 MB');
                          e.currentTarget.value = '';
                          return;
                        }
                        setError(null);
                        setImageFile(file);
                        setImageUrl('');
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-700">{imageFile?.name || (imageUrl ? 'กำลังใช้รูปจากลิงก์' : 'เลือกจากคอมพิวเตอร์หรือโทรศัพท์')}</p>
                    <p className="text-[11px] text-slate-500">JPEG, PNG, WebP หรือ GIF · ไม่เกิน 5 MB</p>
                  </div>
                  {(imageFile || imageUrl) && (
                    <button type="button" onClick={() => { setImageFile(null); setImageUrl(''); }} className="font-bold text-rose-600 hover:text-rose-700">
                      นำรูปออก
                    </button>
                  )}
                </div>
                <p className="mb-1 mt-3 text-[11px] font-semibold text-slate-500">หรือใส่ลิงก์รูปภาพ</p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-2.5 text-slate-400">
                      <ImageIcon className="w-4 h-4" />
                    </span>
                    <input
                      type="url"
                      value={imageUrl}
                      onChange={(e) => { setImageFile(null); setImageUrl(e.target.value); }}
                      placeholder="https://example.com/salad-image.jpg"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs"
                    />
                  </div>
                  {imageUrl && (
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="px-2.5 py-2 rounded-xl text-slate-400 hover:text-slate-600 border border-slate-200 text-xs"
                      title="ล้างรูป"
                    >
                      ล้าง
                    </button>
                  )}
                </div>

                {/* Image Preview Box */}
                {imagePreview || imageUrl ? (
                  <div className="mt-2.5 p-2 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                    <img
                      src={imagePreview || imageUrl}
                      alt="ตัวอย่างรูปภาพ"
                      className="w-16 h-16 rounded-xl object-cover border border-slate-200 bg-white"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://placehold.co/100x100?text=Invalid+URL';
                      }}
                    />
                    <div className="text-xs text-slate-500 flex-1 min-w-0">
                      <p className="font-semibold text-slate-700">ตัวอย่างรูปภาพที่จะแสดงผล</p>
                      {imageFile ? (
                        <p className="mt-0.5 truncate text-[11px]">{imageFile.name}</p>
                      ) : (
                        <a href={imageUrl} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline flex items-center gap-1 mt-0.5 text-[11px] truncate">
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{imageUrl}</span>
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 mt-1">
                    สามารถเลือกรูปจากอุปกรณ์ ใส่ลิงก์ หรือเลือกเทมเพลตผักด้านบนได้
                  </p>
                )}
              </div>

              {/* 5. Product Description */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  5. รายละเอียดสินค้า (Description)
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="เช่น รสชาติหวานกรอบ ใบหยัก เหมาะสำหรับทำสลัดและทานสด อุดมด้วยวิตามินซี..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed"
                />
              </div>

              {/* Status Checkbox */}
              <div className="pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="font-bold text-slate-800">เปิดใช้งานชนิดผักนี้</span>
                    <p className="text-[11px] text-slate-400">
                      เมื่อเปิดใช้งาน จะสามารถเลือกผักนี้ในแปลงปลูกและรอบการเปิดจองได้
                    </p>
                  </div>
                </label>
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-colors disabled:opacity-50"
                >
                  {saving ? 'กำลังบันทึก...' : editingId ? 'บันทึกการแก้ไข' : 'บันทึกชนิดผัก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default AdminCropsPage;
