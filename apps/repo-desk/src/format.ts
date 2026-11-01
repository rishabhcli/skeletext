const pad = (n: number) => String(n).padStart(2, '0');

/** MM-DD in UTC. */
export function monthDay(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "5 min ago", "3 h ago", "12 d ago". */
export function ago(ms: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - ms) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** 1234 becomes 1.2k, 1500000 becomes 1.5M. */
export function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** Percent of a part in a whole with no decimals, "<1" for tiny shares. */
export function percent(part: number, whole: number): string {
  if (whole <= 0) return '0%';
  const p = (part / whole) * 100;
  return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`;
}
