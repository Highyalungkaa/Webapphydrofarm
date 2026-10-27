import type {CartItem,EquipmentProduct} from '../types/index.js';
type StorageKind='localStorage'|'sessionStorage';
export function readCartValue(kind:StorageKind,key:string):string|null{
  try{return window[kind].getItem(key);}catch{return null;}
}
export function persistCartValue(kind:StorageKind,key:string,value:string|null){
  try{if(value==null)window[kind].removeItem(key);else window[kind].setItem(key,value);}catch{/* Cart still works in memory when storage is unavailable. */}
}
const finite=(value:unknown)=>typeof value==='number'&&Number.isFinite(value);
export function restoreVegetableCart(value:string|null):CartItem[]{
  try{const rows=JSON.parse(value||'[]');return Array.isArray(rows)?rows.filter(i=>i&&typeof i.round_item_id==='string'&&i.round_item_id.length>0&&typeof i.crop_name==='string'
    &&finite(i.qty_kg)&&i.qty_kg>=0.5&&Math.abs(i.qty_kg*100-Math.round(i.qty_kg*100))<0.000001&&finite(i.price_per_kg)&&i.price_per_kg>=0
    &&(i.price_tiers==null||Array.isArray(i.price_tiers)&&i.price_tiers.every((t:any)=>t&&finite(t.available_qty_kg)&&t.available_qty_kg>=0&&finite(t.price_per_kg)&&t.price_per_kg>=0))):[];}catch{return [];}
}
export function restoreEquipmentCart(value:string|null):{product:EquipmentProduct;quantity:number}[]{
  try{const rows=JSON.parse(value||'[]');return Array.isArray(rows)?rows.filter(i=>i&&i.product&&typeof i.product.id==='string'&&typeof i.product.name==='string'
    &&finite(i.product.price)&&i.product.price>=0&&Number.isInteger(i.product.stock_quantity)&&i.product.stock_quantity>=0&&Number.isInteger(i.quantity)&&i.quantity>0):[];}catch{return [];}
}
