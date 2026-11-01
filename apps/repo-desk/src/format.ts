/** Format a millisecond duration as a human-readable string. */
export function formatAge(ageMs: number): string {
  if (ageMs < 60_000) {
    return 'just now';
  }
  if (ageMs < 3_600_000) {
    const minutes = Math.floor(ageMs / 60_000);
    return `${minutes} minutes ago`;
  }
  if (ageMs < 86_400_000) {
    const hours = Math.floor(ageMs / 3_600_000);
    return `${hours} hours ago`;
  }
  if (ageMs < 7 * 86_400_000) {
    const days = Math.floor(ageMs / 86_400_000);
    return `${days} days ago`;
  }
  const weeks = Math.floor(ageMs / (7 * 86_400_000));
  return `${weeks} weeks ago`;
}

/** Format an ISO 8601 date as MM-DD. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) {
    throw new RangeError(`Invalid date: ${iso}`);
  }
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${month}-${day}`;
}

/** Format an ISO 8601 datetime as MM-DD HH:MM (UTC). */
export function formatDatetime(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) {
    throw new RangeError(`Invalid date: ${iso}`);
  }
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}`;
}

/** Truncate a string to maxLen characters. */
export function truncate(s: string, maxLen: number): string {
  return s.slice(0, maxLen);
}

/** Right-align a string in width characters, padded with spaces on left. */
export function padLeft(s: string, width: number): string {
  return s.padStart(width, ' ');
}

/** Left-align a string in width characters, padded with spaces on right. */
export function padRight(s: string, width: number): string {
  return s.padEnd(width, ' ');
}
