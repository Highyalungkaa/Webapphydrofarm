import { Router, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase.js';
import { AuthenticatedRequest, requireAdmin, requireAuth } from '../middlewares/auth.js';

const router = Router();
const productSchema = z.object({
  name: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(100),
  sku: z.string().trim().min(1).max(80).optional(),
  image_url: z.string().trim().url().optional().nullable().or(z.literal('')),
  description: z.string().optional().nullable(),
  price: z.number().min(0),
  stock_quantity: z.number().int().min(0).optional(),
  low_stock_threshold: z.number().int().min(0).default(5),
  is_active: z.boolean().default(true),
});

router.get('/products', async (_req, res) => {
  const { data, error } = await supabaseAdmin.from('equipment_products').select('*').eq('is_active', true).order('name');
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data || []);
});

router.get('/products/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('equipment_products').select('*').eq('id', req.params.id).eq('is_active', true).maybeSingle();
  if (error) { res.status(500).json({ error: error.message }); return; }
  if (!data) { res.status(404).json({ error: 'ไม่พบสินค้านี้' }); return; }
  res.json(data);
});

router.get('/shipping', async (_req, res) => {
  const { data, error } = await supabaseAdmin.from('app_settings').select('value').eq('key', 'equipment_shipping_fee').maybeSingle();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ shipping_fee: Number(data?.value ?? 0) });
});

router.post('/orders', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parsed = z.object({
      items: z.array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1) })).min(1),
      shipping_address: z.string().trim().min(5), contact_phone: z.string().trim().min(9),
      payment_method: z.literal('cash_on_delivery'), note: z.string().optional().nullable(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0]?.message || 'ข้อมูลสั่งซื้อไม่ถูกต้อง' }); return; }
    const { data, error } = await supabaseAdmin.rpc('create_equipment_order', {
      p_customer_id: req.user!.id, p_items: parsed.data.items,
      p_shipping_address: parsed.data.shipping_address, p_contact_phone: parsed.data.contact_phone,
      p_payment_method: parsed.data.payment_method, p_note: parsed.data.note || null,
    });
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.status(201).json({ id: data });
  } catch (error: any) { res.status(500).json({ error: error.message || 'ไม่สามารถสร้างคำสั่งซื้อได้' }); }
});

router.get('/orders/mine', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { data, error } = await supabaseAdmin.from('equipment_orders').select('*, equipment_order_items(*)').eq('customer_id', req.user!.id).order('created_at', { ascending: false });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data || []);
});

router.get('/orders/mine/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { data, error } = await supabaseAdmin.from('equipment_orders').select('*, equipment_order_items(*)').eq('id', req.params.id).eq('customer_id', req.user!.id).maybeSingle();
  if (error) { res.status(500).json({ error: error.message }); return; }
  if (!data) { res.status(404).json({ error: 'ไม่พบคำสั่งซื้อ' }); return; }
  res.json(data);
});

router.use('/admin', requireAuth, requireAdmin);

router.get('/admin/settings/shipping', async (_req, res) => {
  const { data, error } = await supabaseAdmin.from('app_settings').select('value').eq('key', 'equipment_shipping_fee').maybeSingle();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ shipping_fee: Number(data?.value ?? 0) });
});

router.put('/admin/settings/shipping', async (req, res) => {
  const parsed = z.object({ shipping_fee: z.number().min(0).max(100000) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'กรุณาระบุค่าส่งเป็นจำนวนเงินตั้งแต่ 0 ถึง 100,000 บาท' }); return; }
  const { data, error } = await supabaseAdmin.from('app_settings').upsert({ key: 'equipment_shipping_fee', value: parsed.data.shipping_fee, description: 'ค่าจัดส่งคำสั่งซื้อร้านอุปกรณ์ปลูก', updated_at: new Date().toISOString() }).select('value').single();
  if (error) { res.status(400).json({ error: error.message }); return; }
  res.json({ shipping_fee: Number(data.value) });
});

router.post('/admin/products/image', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = z.object({ file_name: z.string().trim().min(1).max(180), mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']), data: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'กรุณาเลือกรูปภาพ JPEG, PNG, WebP หรือ GIF' }); return; }
  try {
    const buffer = Buffer.from(parsed.data.data, 'base64');
    if (!buffer.length || buffer.length > 5 * 1024 * 1024) { res.status(400).json({ error: 'ขนาดรูปภาพต้องไม่เกิน 5 MB' }); return; }
    const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' } as const)[parsed.data.mime_type];
    const path = `${randomUUID()}.${extension}`;
    const { error } = await supabaseAdmin.storage.from('equipment-product-images').upload(path, buffer, { contentType: parsed.data.mime_type, upsert: false });
    if (error) { res.status(400).json({ error: `อัปโหลดรูปไม่สำเร็จ: ${error.message}` }); return; }
    const { data } = supabaseAdmin.storage.from('equipment-product-images').getPublicUrl(path);
    res.status(201).json({ image_url: data.publicUrl });
  } catch (error: any) { res.status(500).json({ error: error.message || 'อัปโหลดรูปไม่สำเร็จ' }); }
});

router.post('/admin/orders/:id/shipping-image', async (req, res) => {
  const parsed = z.object({ mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']), data: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'กรุณาเลือกรูปภาพ JPEG, PNG, WebP หรือ GIF' }); return; }
  const { data: order, error: orderError } = await supabaseAdmin.from('equipment_orders').select('id').eq('id', req.params.id).maybeSingle();
  if (orderError || !order) { res.status(404).json({ error: 'ไม่พบออเดอร์นี้' }); return; }
  try {
    const buffer = Buffer.from(parsed.data.data, 'base64');
    if (!buffer.length || buffer.length > 5 * 1024 * 1024) { res.status(400).json({ error: 'ขนาดรูปภาพต้องไม่เกิน 5 MB' }); return; }
    const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' } as const)[parsed.data.mime_type];
    const path = `${req.params.id}/${randomUUID()}.${extension}`;
    const { error } = await supabaseAdmin.storage.from('equipment-order-updates').upload(path, buffer, { contentType: parsed.data.mime_type, upsert: false });
    if (error) { res.status(400).json({ error: `อัปโหลดรูปไม่สำเร็จ: ${error.message}` }); return; }
    const { data } = supabaseAdmin.storage.from('equipment-order-updates').getPublicUrl(path);
    res.status(201).json({ image_url: data.publicUrl });
  } catch (error: any) { res.status(500).json({ error: error.message || 'อัปโหลดรูปไม่สำเร็จ' }); }
});

router.get('/admin/products', async (_req, res) => {
  const { data, error } = await supabaseAdmin.from('equipment_products').select('*').order('name');
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data || []);
});

router.post('/admin/products', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0]?.message || 'ข้อมูลสินค้าไม่ถูกต้อง' }); return; }
  const { stock_quantity = 0, ...productValues } = parsed.data;
  const sku = productValues.sku || `HF-${randomUUID().slice(0, 8).toUpperCase()}`;
  const { data: product, error } = await supabaseAdmin.from('equipment_products').insert({ ...productValues, sku, stock_quantity: 0, image_url: parsed.data.image_url || null }).select().single();
  if (error) { res.status(400).json({ error: error.message }); return; }
  if (stock_quantity > 0) {
    const { error: stockError } = await supabaseAdmin.rpc('adjust_equipment_stock', { p_product_id: product.id, p_quantity_change: stock_quantity, p_actor_id: req.user!.id, p_note: 'สต็อกตั้งต้น', p_type: 'restock' });
    if (stockError) { await supabaseAdmin.from('equipment_products').delete().eq('id', product.id); res.status(400).json({ error: stockError.message }); return; }
  }
  res.status(201).json({ ...product, stock_quantity });
});

router.put('/admin/products/:id', async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0]?.message || 'ข้อมูลสินค้าไม่ถูกต้อง' }); return; }
  const { stock_quantity: _stock, sku: _sku, ...values } = parsed.data;
  const { data, error } = await supabaseAdmin.from('equipment_products').update({ ...values, image_url: values.image_url || null, updated_at: new Date().toISOString() }).eq('id', req.params.id).select().single();
  if (error) { res.status(400).json({ error: error.message }); return; }
  res.json(data);
});

router.post('/admin/products/:id/stock', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = z.object({ quantity_change: z.number().int().refine((v) => v !== 0), transaction_type: z.enum(['restock', 'adjustment']), note: z.string().trim().min(1) }).refine((value) => value.transaction_type !== 'restock' || value.quantity_change > 0).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'ระบุจำนวนปรับสต็อกและเหตุผลให้ถูกต้อง' }); return; }
  const { data, error } = await supabaseAdmin.rpc('adjust_equipment_stock', { p_product_id: req.params.id, p_quantity_change: parsed.data.quantity_change, p_actor_id: req.user!.id, p_note: parsed.data.note, p_type: parsed.data.transaction_type });
  if (error) { res.status(400).json({ error: error.message }); return; }
  res.json(data);
});

router.get('/admin/products/:id/stock-history', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('equipment_inventory_transactions').select('*').eq('product_id', req.params.id).order('created_at', { ascending: false }).limit(100);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data || []);
});

router.get('/admin/orders', async (req, res) => {
  let query = supabaseAdmin.from('equipment_orders').select('*, equipment_order_items(*), profiles(id,full_name,email,phone)').order('created_at', { ascending: false });
  if (typeof req.query.status === 'string' && req.query.status !== 'all') query = query.eq('status', req.query.status);
  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data || []);
});

router.patch('/admin/orders/:id', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = z.object({
    status: z.enum(['pending_confirmation','confirmed','processing','shipped','completed','cancelled']).optional(),
    payment_status: z.enum(['unpaid','paid']).optional(), tracking_number: z.string().trim().max(100).optional().nullable(),
    delivery_update_image_url: z.string().trim().url().optional().nullable(),
    delivery_update_message: z.string().trim().max(1000).optional().nullable(),
  }).refine((v) => Object.keys(v).length > 0).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'ข้อมูลอัปเดตออเดอร์ไม่ถูกต้อง' }); return; }
  const { data: existing, error: lookupError } = await supabaseAdmin.from('equipment_orders').select('*').eq('id', req.params.id).maybeSingle();
  if (lookupError || !existing) { res.status(404).json({ error: 'ไม่พบคำสั่งซื้อ' }); return; }
  if (existing.status === 'cancelled' && parsed.data.status && parsed.data.status !== 'cancelled') { res.status(400).json({ error: 'ออเดอร์ที่ยกเลิกแล้วไม่สามารถเปิดกลับได้' }); return; }
  const transitions: Record<string, string[]> = {
    pending_confirmation: ['confirmed', 'cancelled'], confirmed: ['processing', 'cancelled'],
    processing: ['shipped', 'cancelled'], shipped: ['completed'], completed: [], cancelled: [],
  };
  if (parsed.data.status && parsed.data.status !== existing.status && !transitions[existing.status]?.includes(parsed.data.status)) {
    res.status(400).json({ error: 'ไม่สามารถเปลี่ยนสถานะออเดอร์ข้ามขั้นตอนได้' }); return;
  }
  if (parsed.data.status === 'shipped' && !((parsed.data.tracking_number || existing.tracking_number || '').trim())) { res.status(400).json({ error: 'กรุณาระบุเลขพัสดุก่อนเปลี่ยนเป็นจัดส่งแล้ว' }); return; }
  if (parsed.data.status === 'shipped' && existing.status !== 'shipped') {
    if (!(parsed.data.delivery_update_image_url || existing.delivery_update_image_url)) { res.status(400).json({ error: 'กรุณาแนบรูปหลักฐานการส่งของก่อนเปลี่ยนเป็นจัดส่งแล้ว' }); return; }
    if (!(parsed.data.delivery_update_message || existing.delivery_update_message || '').trim()) { res.status(400).json({ error: 'กรุณาเขียนข้อความแจ้งลูกค้าก่อนเปลี่ยนเป็นจัดส่งแล้ว' }); return; }
  }
  const updates: Record<string, any> = { ...parsed.data, updated_at: new Date().toISOString() };
  if (parsed.data.payment_status === 'paid') updates.paid_at = existing.paid_at || new Date().toISOString();
  if (parsed.data.payment_status === 'unpaid') updates.paid_at = null;
  if (parsed.data.status === 'shipped') updates.shipped_at = existing.shipped_at || new Date().toISOString();
  if (parsed.data.status === 'completed') updates.completed_at = existing.completed_at || new Date().toISOString();
  if (parsed.data.status === 'cancelled' && existing.status !== 'cancelled') {
    const { error: cancelError } = await supabaseAdmin.rpc('cancel_equipment_order', { p_order_id: req.params.id, p_actor_id: req.user!.id });
    if (cancelError) { res.status(400).json({ error: cancelError.message }); return; }
    delete updates.status;
    delete updates.cancelled_at;
  }
  const { data, error } = await supabaseAdmin.from('equipment_orders').update(updates).eq('id', req.params.id).select('*, equipment_order_items(*)').single();
  if (error) { res.status(400).json({ error: error.message }); return; }
  res.json(data);
});

router.get('/admin/reports', async (_req, res) => {
  const [{ data: orders, error: ordersError }, { data: products, error: productsError }] = await Promise.all([
    supabaseAdmin.from('equipment_orders').select('id,status,payment_status,total_amount,shipping_fee,created_at,equipment_order_items(product_name,sku,quantity,unit_price)'),
    supabaseAdmin.from('equipment_products').select('id,name,sku,stock_quantity,low_stock_threshold'),
  ]);
  if (ordersError || productsError) { res.status(500).json({ error: ordersError?.message || productsError?.message }); return; }
  res.json({ orders: orders || [], low_stock: (products || []).filter((p) => p.stock_quantity <= p.low_stock_threshold) });
});

export default router;
