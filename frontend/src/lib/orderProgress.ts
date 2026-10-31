import type {OrderStatus} from '../types/index.js';
export const orderProgress:OrderStatus[]=['pending_confirmation','confirmed','ready','completed'];
export function canSelectOrderStep(current:OrderStatus,target:OrderStatus) {
  const index=orderProgress.indexOf(current);
  return index>=0 && (target===current || orderProgress[index+1]===target);
}
export function previousOrderStep(current:OrderStatus):OrderStatus|undefined {
  const index=orderProgress.indexOf(current);
  return index>0?orderProgress[index-1]:undefined;
}
