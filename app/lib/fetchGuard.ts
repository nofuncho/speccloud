// app/lib/fetchGuard.ts
type Key = string;
const inflight = new Map<Key, Promise<any>>();
let quotaBlockedUntil = 0; // ms epoch

export function isQuotaBlocked() {
  return Date.now() < quotaBlockedUntil;
}

export function blockQuota(ms = 60 * 60 * 1000) {
  quotaBlockedUntil = Date.now() + ms; // 기본 1시간 차단
}

export async function once<T>(key: Key, fn: () => Promise<T>): Promise<T> {
  if (inflight.has(key)) return inflight.get(key)!;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
