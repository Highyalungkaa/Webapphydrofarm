// Rebuild a crop display object from a completed round's saved values.
export function restoreCropSnapshots(value: any): any {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) { value.forEach(restoreCropSnapshots); return value; }
  if (value.crop_name_snapshot && !value.crops) {
    value.crops = {
      id: value.crop_id_snapshot, name: value.crop_name_snapshot,
      image_url: value.crop_image_snapshot,
      slots_per_kg: value.crop_slots_per_kg_snapshot,
      growing_days: value.crop_growing_days_snapshot, is_active: false,
    };
    if (!value.crop_id) value.crop_id = value.crop_id_snapshot;
    if (!value.crop_name) value.crop_name = value.crop_name_snapshot;
  }
  Object.values(value).forEach(restoreCropSnapshots);
  return value;
}
