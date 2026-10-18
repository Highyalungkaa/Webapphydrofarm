export type RoundStatus =
  | 'draft'
  | 'growing'
  | 'booking_open'
  | 'booking_closed'
  | 'harvested'
  | 'completed'
  | 'cancelled';

export type OrderStatus =
  | 'pending_confirmation'
  | 'confirmed'
  | 'ready'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type FulfillmentMethod = 'pickup' | 'delivery';
export type PaymentStatus = 'unpaid' | 'paid';
export type PaymentMethod = 'cash' | 'transfer';

export interface Plot {
  id: string;
  name: string;
  zone_name: string;
  slot_capacity: number;
  crop_id?: string | null;
  is_active: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  crops?: Crop | null;
}

export interface FarmMetrics {
  farm_name: string;
  farm_total_slots: number;
  total_allocated_slots: number;
  available_slots: number;
  usage_percent: number;
  total_plots: number;
  active_plots: number;
  inactive_plots: number;
  zones: string[];
}

export interface District {
  id: string;
  name: string;
  is_active: boolean;
}

export interface Crop {
  id: string;
  name: string;
  default_price_per_kg: number;
  slots_per_kg?: number;
  growing_days?: number;
  image_url?: string | null;
  description?: string | null;
  is_active: boolean;
  created_at?: string;
}

export interface RoundItem {
  id: string;
  round_id: string;
  crop_id: string;
  crop_name?: string;
  estimated_qty_kg: number;
  bookable_qty_kg: number;
  actual_qty_kg?: number | null;
  price_per_kg: number;
  growing_days?: number;
  max_qty_per_order_kg?: number | null;
  booked_qty_kg?: number;
  available_qty_kg?: number;
  is_sold_out?: boolean;
  plot_ids?: string[];
  plots?: Plot[];
  crops?: Crop;
}

export interface PlantingRound {
  id: string;
  name: string;
  planted_at: string;
  growing_days: number;
  expected_harvest_date: string;
  booking_opens_at: string;
  booking_closes_at: string | null;
  fulfillment_date: string;
  pickup_start_time: string;
  pickup_end_time: string;
  delivery_start_time: string;
  delivery_end_time: string;
  status: RoundStatus;
  current_step?: number;
  seed_date?: string | null;
  fertilizing_date?: string | null;
  transplant_date?: string | null;
  harvest_sale_date?: string | null;
  sold_out_date?: string | null;
  completed_date?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string;
  items?: RoundItem[];
  round_items?: RoundItem[];
  total_bookable_kg?: number;
  total_available_kg?: number;
  total_estimated_kg?: number;
  total_booked_kg?: number;
  is_all_sold_out?: boolean;
  is_booking_created?: boolean;
}

export interface OrderItem {
  id: string;
  order_id: string;
  round_item_id: string;
  qty_kg: number;
  price_per_kg: number;
  discount_amount?: number;
  fulfilled_qty_kg?: number | null;
  fulfillment_source?: 'own' | 'substitute' | null;
  substitute_supplier?: string | null;
  substitute_cost_per_kg?: number | null;
  substitute_total_cost?: number | null;
  substitute_note?: string | null;
  round_items?: {
    id: string;
    crop_id?: string;
    crops?: {
      id: string;
      name: string;
    };
  };
}

export interface Order {
  id: string;
  round_id: string;
  customer_id: string;
  fulfillment_method: FulfillmentMethod;
  delivery_address?: string | null;
  district_id?: string | null;
  contact_phone: string;
  note?: string | null;
  status: OrderStatus;
  requires_confirmation: boolean;
  confirmed_at?: string | null;
  payment_status: PaymentStatus;
  payment_method?: PaymentMethod | null;
  paid_at?: string | null;
  total_amount: number;
  needs_customer_notice: boolean;
  accepted_substitution_terms_at?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  created_at: string;
  updated_at: string;
  planting_rounds?: PlantingRound;
  districts?: District;
  profiles?: {
    id: string;
    full_name: string;
    email: string;
    phone?: string;
    no_show_count?: number;
  };
  order_items?: OrderItem[];
}

export interface CustomerProfile {
  id: string;
  email: string;
  full_name: string;
  phone?: string | null;
  address_detail?: string | null;
  district_id?: string | null;
  no_show_count: number;
  is_admin?: boolean;
  districts?: District | null;
}

export interface CartItem {
  round_item_id: string;
  crop_name: string;
  price_per_kg: number;
  qty_kg: number;
  max_qty_per_order_kg?: number | null;
  available_qty_kg: number;
}

export interface EquipmentProduct {
  id: string;
  name: string;
  category: string;
  sku: string;
  image_url?: string | null;
  description?: string | null;
  price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface EquipmentOrderItem {
  id: string;
  order_id: string;
  product_id?: string | null;
  product_name: string;
  sku: string;
  quantity: number;
  unit_price: number;
}

export type EquipmentOrderStatus = 'pending_confirmation' | 'confirmed' | 'processing' | 'shipped' | 'completed' | 'cancelled';
export interface EquipmentOrder {
  id: string;
  customer_id: string;
  status: EquipmentOrderStatus;
  payment_status: PaymentStatus;
  payment_method: 'transfer' | 'cash_on_delivery';
  shipping_method: 'standard';
  shipping_address: string;
  contact_phone: string;
  tracking_number?: string | null;
  note?: string | null;
  total_amount: number;
  shipping_fee?: number;
  delivery_update_image_url?: string | null;
  delivery_update_message?: string | null;
  created_at: string;
  equipment_order_items?: EquipmentOrderItem[];
  profiles?: { full_name?: string; email?: string; phone?: string };
}
