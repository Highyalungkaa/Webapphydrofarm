import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  isAdmin: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Middleware to verify Supabase JWT token and attach user to request
 */
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนทำรายการ (Missing Bearer Token)' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user || !user.email) {
      res.status(401).json({ error: 'เซสชันหมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่' });
      return;
    }

    // Check if the user is in admin_users table
    // 1. Direct query with supabaseAdmin
    const { data: adminRecord } = await supabaseAdmin
      .from('admin_users')
      .select('email')
      .ilike('email', user.email.trim())
      .maybeSingle();

    // 2. RPC call with user's token (works even if service role key is not yet set)
    let isRpcAdmin = false;
    try {
      const { data: rpcResult } = await supabaseAdmin.rpc('is_admin');
      if (rpcResult) isRpcAdmin = true;
    } catch {
      // ignore
    }

    // 3. Fallback: check with user-scoped client if direct query blocked by RLS
    if (!adminRecord && !isRpcAdmin) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const userClient = createClient(
          process.env.SUPABASE_URL || '',
          process.env.SUPABASE_SERVICE_ROLE_KEY || '',
          {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false },
          }
        );
        const { data: userRpc } = await userClient.rpc('is_admin');
        if (userRpc) isRpcAdmin = true;
      } catch (err) {
        console.warn('RPC check fallback error:', err);
      }
    }

    const isAdmin = !!adminRecord || isRpcAdmin;

    req.user = {
      id: user.id,
      email: user.email.trim(),
      isAdmin,
    };

    next();
  } catch (err: any) {
    console.error('Auth Middleware Error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์' });
  }
}

/**
 * Middleware to restrict access to administrators only
 */
export async function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนทำรายการ' });
    return;
  }

  if (!req.user.isAdmin) {
    res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้ (สำหรับผู้ดูแลระบบเท่านั้น)' });
    return;
  }

  next();
}

/**
 * Optional Auth middleware - attaches user if token is provided, but doesn't block if missing
 */
export async function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      if (user && user.email) {
        const { data: adminRecord } = await supabaseAdmin
          .from('admin_users')
          .select('email')
          .ilike('email', user.email)
          .maybeSingle();

        req.user = {
          id: user.id,
          email: user.email,
          isAdmin: !!adminRecord,
        };
      }
    }
  } catch (err) {
    // Ignore error for optional auth
  }
  next();
}
