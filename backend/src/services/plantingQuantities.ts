export function plantCountToKg(plantCount: number, plantsPerKg: number): number {
  if (!Number.isFinite(plantCount) || plantCount <= 0 || !Number.isFinite(plantsPerKg) || plantsPerKg <= 0) return 0;
  // Catalog rates have two decimal places. Integer arithmetic avoids rounding
  // an exact quotient such as 33 / 1.1 down to 29 due to floating-point error.
  return Math.floor((plantCount * 100) / Math.round(plantsPerKg * 100));
}
