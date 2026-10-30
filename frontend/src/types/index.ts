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

export interface PlotOccupyingRound {
  id: string;
  name: string;
  crop_name: string;
  used_slots: number;
  status?: RoundStatus;
  current_step?: number;
  seed_date?: string | null;
  fertilizing_date?: string | null;
  planting_start_date?: string | null;
  transplant_date?: string | null;
  growing_days?: number;
  calculated_harvest_date?: string | null;
}

export interface Plot {
  has_history?: boolean;
  id: string;
  name: string;
  zone_name: string;
  slot_capacity: number;
  crop_id?: string | null;
  crop_ids?: string[];
  is_active: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  crops?: Crop | null;
  used_slots?: number;
  crop_names?: string[];
  occupying_rounds?: PlotOccupyingRound[];
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
  price_tiers?: PriceTier[];
  harvest_start_date?: string | null;
  harvest_end_date?: string | null;
  id: string;
  round_id: string;
  crop_id: string;
  crop_name?: string;
  estimated_qty_kg: number;
  plant_count?: number | null;
  planting_plants_per_kg?: number | null;
  lost_plant_count?: number;
  loss_baseline_plant_count?: number | null;
  loss_plants_per_kg?: number | null;
  remaining_estimated_qty_kg?: number | null;
  bookable_qty_kg: number;
  actual_qty_kg?: number | null;
  additional_qty_kg?: number;
  effective_bookable_qty_kg?: number | null;
  farm_reserved_qty_kg?: number;
  allocated_own_qty_kg?: number;
  physical_remaining_qty_kg?: number;
  shortage_qty_kg?: number;
  price_per_kg: number;
  growing_days?: number;
  max_qty_per_order_kg?: number | null;
  order_limit_remaining?: number | null;
  booked_qty_kg?: number;
  available_qty_kg?: number | null;
  is_sold_out?: boolean;
  plot_ids?: string[];
  plots?: Plot[];
  crops?: Crop;
}

export interface PlantingRound {
  is_pooled?: boolean;
  harvest_start_date?: string | null;
  harvest_end_date?: string | null;
  order_limit_remaining?: number | null;
  purchase_limit_enabled?: boolean;
  id: string;
  name: string;
  planted_at: string;
  growing_days: number;
  expected_harvest_date: string;
  booking_opens_at: string;
  booking_closes_at: string | null;
  fulfillment_date: string;
  delivery_start_time: string;
  delivery_end_time: string;
  status: RoundStatus;
  closure_reason?: 'unsold' | null;
  current_step?: number;
  seed_date?: string | null;
  fertilizing_date?: string | null;
  planting_start_date?: string | null;
  transplant_date?: string | null;
  harvest_sale_date?: string | null;
  sold_out_date?: string | null;
  completed_date?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string;
  items?: RoundItem[];
  round_items?: RoundItem[];
  total_bookable_kg?: number | null;
  total_available_kg?: number | null;
  total_estimated_kg?: number | null;
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
  own_qty_kg?: number | null;
  fulfillment_source?: 'own' | 'substitute' | null;
  substitute_supplier?: string | null;
  substitute_cost_per_kg?: number | null;
  substitute_total_cost?: number | null;
  substitute_note?: string | null;
  round_items?: {
    id: string;
    round_id?: string;
    planting_rounds?: { id:string; name:string };
    crop_id?: string;
    crops?: {
      id: string;
      name: string;
    };
  };
}

export interface Order {
  confirmation_expires_at?: string | null;
  confirmation_expired_at?: string | null;
  received_amount?: number | null;
  completed_at?: string | null;
  is_pooled?: boolean;
  harvest_start_date?: string | null;
  harvest_end_date?: string | null;
  id: string;
  round_id: string;
  customer_id: string | null;
  customer_name?: string | null;
  order_source?: 'website' | 'facebook_chat';
  source_reference?: string | null;
  admin_request_payload?: { order_origin?: string } | null;
  created_by?: string | null;
  fulfillment_method: FulfillmentMethod;
  delivery_address?: string | null;
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
  no_show_count: number;
  is_admin?: boolean;
}

export interface CartItem {
  price_tiers?: PriceTier[];
  round_item_id: string;
  crop_name: string;
  price_per_kg: number;
  qty_kg: number;
  max_qty_per_order_kg?: number | null;
  available_qty_kg: number | null;
}

export interface PriceTier {
  available_qty_kg: number;
  price_per_kg: number;
  round_item_id?: string;
  harvest_date?: string;
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
  updated_at?:string;
  id: string;
  customer_id: string;
  status: EquipmentOrderStatus;
  payment_status: PaymentStatus;
  payment_method: 'transfer' | 'cash_on_delivery';
  payment_slip_path?: string | null;
  payment_slip_uploaded_at?: string | null;
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

export interface EquipmentTransferAccount {
  bank_name: string;
  account_name: string;
  account_number: string;
  qr_image_url: string;
  transfer_enabled: boolean;
}
