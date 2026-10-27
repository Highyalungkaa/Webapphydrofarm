import { supabaseAdmin } from '../config/supabase.js';

export interface AuditLogPayload {
  actorId?: string;
  actorEmail?: string;
  entityType: 'planting_rounds' | 'round_items' | 'orders' | 'order_items' | 'crops' | 'districts' | 'app_settings' | 'admin_users' | 'plots';
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'status_change' | 'reschedule' | 'payment_update' | 'cancel';
  oldData?: any;
  newData?: any;
}

export async function recordAuditLog(payload: AuditLogPayload): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('audit_logs').insert({
      actor_id: payload.actorId || null,
      actor_email: payload.actorEmail || 'system',
      entity_type: payload.entityType,
      entity_id: String(payload.entityId),
      action: payload.action,
      old_data: payload.oldData ? JSON.parse(JSON.stringify(payload.oldData)) : null,
      new_data: payload.newData ? JSON.parse(JSON.stringify(payload.newData)) : null,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Failed to write audit log:', error);
    }
  } catch (err) {
    console.error('Audit Log Error:', err);
  }
}
