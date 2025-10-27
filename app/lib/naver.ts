// app/lib/naver.ts
import { isQuotaBlocked, blockQuota } from "./fetchGuard";

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || "";
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || "";

export const hasNaver = !!(NAVER_CLIENT_ID && NAVER_CLIENT_SECRET);

export function naverHeaders() {
  return {
    "X-Naver-Client-Id": NAVER_CLIENT_ID,
    "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
  };
}

export async function naverJson(url: string) {
  if (isQuotaBlocked()) throw new Error("NAVER_QUOTA_BLOCKED");
  const res = await fetch(url, { headers: naverHeaders(), cache: "no-store" });
  if (res.status === 429) { blockQuota(); throw new Error("NAVER_QUOTA_REACHED"); }
  if (!res.ok) throw new Error(`NAVER_HTTP_${res.status}`);
  return res.json();
}

// HTML → 텍스트 추출 (스크립트/스타일 제거)
export function stripTags(html: string) {
  return String(html || "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchTextFromUrl(url: string, timeoutMs = 8000, maxLen = 12000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, cache: "no-store" });
    if (!res.ok) return "";
    const html = await res.text();
    return stripTags(html).slice(0, maxLen);
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}

export function hostFromUrl(u?: string) {
  try {
    if (!u) return "";
    const { hostname } = new URL(u);
    return hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
