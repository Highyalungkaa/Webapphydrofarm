export function sessionHasExpired(deadline: string | null, now = Date.now()): boolean {
  const end = deadline ? Date.parse(deadline) : NaN;
  return !Number.isFinite(end) || now >= end;
}

export const sessionExpiredEvent = 'hydrofarm:session-expired';
