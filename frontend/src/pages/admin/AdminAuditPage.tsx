import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { History, Search } from 'lucide-react';

interface AuditLog {
  id: string;
  actor_id?: string;
  actor_email?: string;
  entity_type: string;
  entity_id: string;
  action: string;
  old_data?: any;
  new_data?: any;
  created_at: string;
}

export const AdminAuditPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState('');

  useEffect(() => {
    loadAuditLogs();
  }, [entityFilter]);

  const loadAuditLogs = async () => {
    try {
      setLoading(true);
      const url = entityFilter ? `/admin/audit?entity_type=${entityFilter}` : '/admin/audit';
      const data = await api.get<AuditLog[]>(url);
      setLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">บันทึกประวัติการแก้ไข (Audit Logs)</h1>
          <p className="text-xs sm:text-sm text-slate-500">
            ตรวจสอบการเปลี่ยนแปลงข้อมูลสำคัญโดยแอดมิน (รอบการปลูก ราคา สต็อก การชำระเงิน)
          </p>
        </div>

        <div className="w-56">
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="w-full p-2.5 rounded-xl border border-slate-200 bg-white text-xs"
          >
            <option value="">-- ข้อมูลทุกประเภท --</option>
            <option value="planting_rounds">รอบการปลูก</option>
            <option value="orders">คำสั่งจอง</option>
            <option value="crops">แคตตาล็อกผัก</option>
            <option value="app_settings">การตั้งค่า</option>
            <option value="admin_users">แอดมิน</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-500 text-sm">กำลังโหลดประวัติการแก้ไข...</div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">ยังไม่มีบันทึกประวัติการแก้ไข</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 uppercase text-[11px] font-semibold">
                  <th className="py-3 px-4">วัน-เวลา</th>
                  <th className="py-3 px-4">ผู้กระทำ (Actor)</th>
                  <th className="py-3 px-4">ประเภท / รหัส</th>
                  <th className="py-3 px-4">การกระทำ (Action)</th>
                  <th className="py-3 px-4">ข้อมูลเดิม vs ข้อมูลใหม่</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/60 font-sans">
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap text-[11px]">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {log.actor_email || 'system'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-800">{log.entity_type}</span>
                      <span className="block text-[11px] text-slate-400 truncate max-w-[120px]">
                        #{log.entity_id}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <details className="cursor-pointer text-[11px]">
                        <summary className="text-emerald-700 font-semibold hover:underline">
                          ดูรายละเอียด JSON
                        </summary>
                        <div className="mt-2 p-2 rounded-xl bg-slate-950 text-emerald-400 font-mono text-[10px] max-w-sm overflow-x-auto">
                          {log.old_data && (
                            <div className="mb-1 text-slate-400">
                              [OLD]: {JSON.stringify(log.old_data)}
                            </div>
                          )}
                          {log.new_data && (
                            <div className="text-emerald-300">
                              [NEW]: {JSON.stringify(log.new_data)}
                            </div>
                          )}
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
