import type { Crop, Plot } from '../types/index.js';

interface SetupIssue {
  kind: string;
  message: string;
  href: string;
  action: string;
}

const names = (items: { name: string }[]) => items.slice(0, 3).map((item) => item.name).join(', ') + (items.length > 3 ? ` และอีก ${items.length - 3} รายการ` : '');

export function getRoundCropAvailability(crops: Crop[], plots: Plot[], selectedCropIds: string[] = []) {
  const activeCrops = crops.filter((crop) => crop.is_active !== false);
  const readyCrops = activeCrops;
  const remainingCrops = readyCrops.filter((crop) => !selectedCropIds.includes(crop.id));
  const issues: SetupIssue[] = [];

  if (crops.length === 0) {
    issues.push({ kind: 'no-crops', message: 'ยังไม่มีชนิดผักในแคตตาล็อก กรุณาเพิ่มชนิดผักและเปิดใช้งานก่อนสร้างรอบปลูก', href: '/admin/crops', action: 'เพิ่มชนิดผักในแคตตาล็อก' });
  } else {
    const disabledCrops = crops.filter(crop => crop.is_active === false);
    if (disabledCrops.length) {
      issues.push({ kind: 'disabled-crops', message: 'ผัก '+names(disabledCrops)+' ถูกปิดใช้งาน จึงยังเลือกปลูกไม่ได้ กรุณาเปิดใช้งานผักในแคตตาล็อกก่อน', href: '/admin/crops', action: 'เปิดใช้งานผักในแคตตาล็อก' });
    }
  }
  if (!plots.length) {
    issues.push({ kind: 'no-plots', message: 'ยังไม่มีแปลงปลูก กรุณาสร้างแปลงและกำหนดจำนวนต้นที่รองรับก่อน', href: '/admin/plots', action: 'สร้างแปลงปลูก' });
  } else if (!plots.some(plot => plot.is_active)) {
    issues.push({ kind: 'inactive-plots', message: 'แปลงทั้งหมดปิดใช้งานอยู่ กรุณาเปิดใช้งานแปลงอย่างน้อย 1 แปลง', href: '/admin/plots', action: 'เปิดใช้งานแปลงปลูก' });
  }

  return { readyCrops, remainingCrops, issues, allAdded: readyCrops.length > 0 && remainingCrops.length === 0 };
}
