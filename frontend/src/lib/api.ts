import { supabase } from './supabase.js';
import { notifyDataChange } from './liveRefresh.js';
import { sessionExpiredEvent } from './sessionLifetime.js';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
export const orderChangesEvent='hydrofarm:orders-changed';
export const equipmentOrderChangesEvent='hydrofarm:equipment-orders-changed';
const pendingReads=new Map<string,Promise<unknown>>();

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  return headers;
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = await getAuthHeaders();
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const perform=async():Promise<T>=>{
  const response = await fetch(url, {
    cache: 'no-store',
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && data.code === 'SESSION_EXPIRED') {
      window.dispatchEvent(new Event(sessionExpiredEvent));
    }
    throw new Error(data.error || `เกิดข้อผิดพลาด (${response.status})`);
  }

  if(options.method && options.method.toUpperCase()!=='GET')notifyDataChange();
  if(options.method && options.method.toUpperCase()!=='GET'
    && /^\/?(?:admin\/)?orders(?:[/?]|$)/.test(endpoint)) {
    window.dispatchEvent(new Event(orderChangesEvent));
  }
  if(options.method && options.method.toUpperCase()!=='GET'
    && /^\/?equipment\/(?:admin\/)?orders(?:[/?]|$)/.test(endpoint)) {
    window.dispatchEvent(new Event(equipmentOrderChangesEvent));
  }
  return data as T;
  };
  if((options.method||'GET').toUpperCase()!=='GET')return perform();
  const key=JSON.stringify([url,headers,options.headers]);
  const pending=pendingReads.get(key);
  if(pending)return pending as Promise<T>;
  const read=perform();pendingReads.set(key,read);
  try{return await read;}finally{if(pendingReads.get(key)===read)pendingReads.delete(key);}
}

export const api = {
  get: <T = any>(url: string) => apiRequest<T>(url, { method: 'GET' }),
  post: <T = any>(url: string, body?: any) =>
    apiRequest<T>(url, { method: 'POST', body: JSON.stringify(body) }),
  put: <T = any>(url: string, body?: any) =>
    apiRequest<T>(url, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T = any>(url: string, body?: any) =>
    apiRequest<T>(url, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T = any>(url: string) => apiRequest<T>(url, { method: 'DELETE' }),
};
