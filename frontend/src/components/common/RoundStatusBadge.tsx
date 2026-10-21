import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Badge } from './Badge.js';
import type { PlantingRound } from '../../types/index.js';

export const RoundStatusBadge: React.FC<{ round: Pick<PlantingRound, 'status' | 'closure_reason'> }> = ({ round }) => {
  if (round.closure_reason === 'unsold') {
    return <span className="inline-flex max-w-full items-center gap-2 rounded-xl border border-orange-800 bg-orange-700 px-3 py-2 text-xs font-extrabold leading-relaxed text-white shadow-sm">
      <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span>สิ้นสุดรอบ — มีผักขายไม่ออก</span>
    </span>;
  }
  return <Badge status={round.status} type="round" />;
};
