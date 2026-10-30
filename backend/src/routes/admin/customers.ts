import { Router, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../../middlewares/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// GET /api/admin/customers - List customers and their no_show count
router.get('/', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { data: profiles, error } = await supabaseAdmin
      .from('profiles')
      .select(`
        id,
        email,
        full_name,
        phone,
        address_detail,
        no_show_count,
        created_at
      `)
      .order('no_show_count', { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const customers = profiles || [];
    const missingContactIds = customers
      .filter((profile) => !profile.phone?.trim() || !profile.address_detail?.trim())
      .map((profile) => profile.id);
    const latestEquipmentContact = new Map<string, { contact_phone: string; shipping_address: string }>();

    // Equipment checkout saves contact details on the order, not on the profile.
    // Use the most recent order when a customer has not filled in their profile.
    for (let index = 0; index < missingContactIds.length; index += 100) {
      const ids = missingContactIds.slice(index, index + 100);
      for (let start = 0; ids.some((id) => !latestEquipmentContact.has(id)); start += 500) {
        const { data: orders, error: ordersError } = await supabaseAdmin
          .from('equipment_orders')
          .select('customer_id, contact_phone, shipping_address')
          .in('customer_id', ids)
          .order('created_at', { ascending: false })
          .range(start, start + 499);

        if (ordersError) {
          res.status(500).json({ error: 'ไม่สามารถดึงข้อมูลติดต่อจากคำสั่งซื้ออุปกรณ์: ' + ordersError.message });
          return;
        }
        for (const order of orders || []) {
          if (!latestEquipmentContact.has(order.customer_id)) {
            latestEquipmentContact.set(order.customer_id, order);
          }
        }
        if (!orders || orders.length < 500) break;
      }
    }

    res.json(customers.map((profile) => {
      const contact = latestEquipmentContact.get(profile.id);
      return {
        ...profile,
        phone: profile.phone?.trim() || contact?.contact_phone || null,
        address_detail: profile.address_detail?.trim() || contact?.shipping_address || null,
      };
    }));
  } catch (err: any) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลลูกค้า' });
  }
});

export default router;
