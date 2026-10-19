import type { Crop, Plot } from '../types/index.js';
import { getPlotCropIds, plotSupportsCrop } from './plotCrops.js';

interface SetupIssue {
  kind: string;
  message: string;
  href: string;
  action: string;
}

const names = (items: { name: string }[]) => items.slice(0, 3).map((item) => item.name).join(', ') + (items.length > 3 ? ` และอีก ${items.length - 3} รายการ` : '');

export function getRoundCropAvailability(crops: Crop[], plots: Plot[], selectedCropIds: string[] = []) {
  const activeCrops = crops.filter((crop) => crop.is_active !== false);
  const readyCrops = activeCrops.filter((crop) => plots.some((plot) => plot.is_active && plotSupportsCrop(plot, crop.id)));
  const remainingCrops = readyCrops.filter((crop) => !selectedCropIds.includes(crop.id));
  const issues: SetupIssue[] = [];

  if (crops.length === 0) {
    issues.push({ kind: 'no-crops', message: 'ยังไม่มีชนิดผักในแคตตาล็อก กรุณาเพิ่มชนิดผักและเปิดใช้งานก่อนนำไปกำหนดให้แปลงปลูก', href: '/admin/crops', action: 'เพิ่มชนิดผักในแคตตาล็อก' });
  } else {
    const disabledCrops = crops.filter((crop) => crop.is_active === false && (activeCrops.length === 0 || plots.some((plot) => plotSupportsCrop(plot, crop.id))));
    if (disabledCrops.length) {
      issues.push({ kind: 'disabled-crops', message: `ผัก ${names(disabledCrops)} ถูกปิดใช้งาน จึงยังเลือกปลูกไม่ได้ กรุณาเปิดใช้งานผักในแคตตาล็อกก่อน`, href: '/admin/crops', action: 'เปิดใช้งานผักในแคตตาล็อก' });
    }
    const unassigned = activeCrops.filter((crop) => !plots.some((plot) => plotSupportsCrop(plot, crop.id)));
    if (unassigned.length) {
      issues.push({ kind: 'unassigned-crops', message: `ผัก ${names(unassigned)} เปิดใช้งานแล้ว แต่ยังไม่มีแปลงที่กำหนดให้ปลูกผักเหล่านี้ กรุณา${plots.length ? 'เพิ่มผักให้แปลง' : 'สร้างแปลงและเลือกชนิดผัก'} พร้อมเปิดใช้งานแปลง`, href: '/admin/plots', action: plots.length ? 'กำหนดผักให้แปลงปลูก' : 'สร้างแปลงปลูก' });
    }
    const inactivePlots = activeCrops.filter((crop) => {
      const assigned = plots.filter((plot) => plotSupportsCrop(plot, crop.id));
      return assigned.length > 0 && assigned.every((plot) => !plot.is_active);
    });
    if (inactivePlots.length) {
      issues.push({ kind: 'inactive-plots', message: `ผัก ${names(inactivePlots)} เปิดใช้งานแล้ว แต่แปลงที่กำหนดไว้ถูกปิดใช้งานทั้งหมด กรุณาเปิดใช้งานแปลงอย่างน้อย 1 แปลง`, href: '/admin/plots', action: 'เปิดใช้งานแปลงปลูก' });
    }
    const knownIds = new Set(crops.map((crop) => crop.id));
    const missingCatalog = plots.filter((plot) => getPlotCropIds(plot).some((id) => !knownIds.has(id)));
    if (missingCatalog.length) {
      issues.push({ kind: 'missing-catalog-crops', message: `แปลง ${names(missingCatalog)} กำหนดชนิดผักที่ไม่พบในแคตตาล็อก กรุณาตรวจสอบชนิดผักแล้วกำหนดผักให้แปลงใหม่`, href: '/admin/crops', action: 'ตรวจสอบแคตตาล็อกผัก' });
    }
  }

  return { readyCrops, remainingCrops, issues, allAdded: readyCrops.length > 0 && remainingCrops.length === 0 };
}
