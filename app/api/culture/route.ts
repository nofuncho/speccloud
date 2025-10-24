/* app/api/culture/route.ts
 * 간단한 "회사 문화/인재상" 스니펫 프록시
 * - 입력: /api/culture?q=회사명&limit=3
 * - 출력: { snippets: string[], sources: string[] }
 * - 동작: 회사 공식 사이트로 추정되는 도메인의 대표 페이지(about/careers/values 등)를
 *         몇 개 긁어서 가치/문화/인재상 관련 문장을 추출
 * - 보호: Authorization: Bearer <CULTURE_API_KEY> 헤더 필요(.env)
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // 항상 서버에서 실행
export const revalidate = 0;

const CULTURE_API_KEY = process.env.CULTURE_API_KEY || "";
const USER_AGENT =
  "SpecCloudCultureBot/1.0 (+https://github.com/) Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36";

/** 한국어/영어 키워드 (문화/가치/인재상) */
const KEYWORDS = [
  // ko
  "핵심가치",
  "가치",
  "조직문화",
  "문화",
  "일하는 방식",
  "우리의 방식",
  "미션",
  "비전",
  "인재상",
  "핵심역량",
  "행동강령",
  "원칙",
  "People",
  "인사철학",
  // en
  "values",
  "culture",
  "mission",
  "vision",
  "principles",
  "our ways of working",
  "leadership principles",
  "talent",
  "what we look for",
];

/** 추정 경로 후보 */
const PATH_CANDIDATES = [
  "/", "/about", "/about-us", "/company", "/mission", "/vision", "/values",
  "/careers", "/jobs", "/join", "/recruit", "/recruitment",
  "/life", "/life-at", "/culture", "/people", "/philosophy",
  "/why-us", "/who-we-are"
];

/** ko 도메인 추정: .com, .co.kr 우선 */
function candidateDomains(company: string) {
  const base = company.trim().toLowerCase().replace(/\s+/g, "");
  const alnum = base.normalize("NFKD").replace(/[^\w-]/g, "");
  // 간단 후보 (필요시 추가)
  return [
    `https://www.${alnum}.com`,
    `https://www.${alnum}.co.kr`,
    `https://${alnum}.com`,
    `https://${alnum}.co.kr`,
  ];
}

/** 외부 페이지 가져오기(타임아웃/UA/텍스트) */
async function fetchText(url: string, timeoutMs = 8000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*" },
      signal: ctrl.signal,
      redirect: "follow",
      cache: "no-store",
    });
    if (!res.ok) return "";
    const ct = res.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml/i.test(ct)) {
      // HTML이 아니면 스킵
      return "";
    }
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}

/** HTML → 평문 */
function htmlToText(html: string) {
  // 스크립트/스타일 제거
  html = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  // 태그 제거
  let text = html.replace(/<\/?[^>]+>/g, " ");
  // 엔티티 간단 치환
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  // 공백 정리
  return text.replace(/\s+/g, " ").trim();
}

/** 텍스트에서 키워드가 포함된 문장/구절 뽑기 */
function extractSnippets(text: string, maxPerDoc = 6): string[] {
  if (!text) return [];
  // 문장 단위 대충 분리(한/영)
  const rough = text
    .replace(/\. /g, ".\n")
    .replace(/! /g, "!\n")
    .replace(/\? /g, "?\n")
    .replace(/다\. /g, "다.\n")
    .replace(/요\. /g, "요.\n")
    .split(/\n+/);

  const keep: string[] = [];
  for (const line of rough) {
    const s = line.trim();
    if (s.length < 10) continue;
    if (KEYWORDS.some((k) => s.toLowerCase().includes(k.toLowerCase()))) {
      // 너무 긴 문장은 자르기
      keep.push(s.length > 280 ? s.slice(0, 277) + "…" : s);
      if (keep.length >= maxPerDoc) break;
    }
  }
  // 중복 제거
  return Array.from(new Set(keep));
}

/** 메인 핸들러 */
export async function GET(req: NextRequest) {
  // --- 인증 ---
  if (!CULTURE_API_KEY) {
    return NextResponse.json(
      { error: "CULTURE_API_KEY not set on server" },
      { status: 500 }
    );
  }
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ") || auth.slice(7) !== CULTURE_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- 파라미터 ---
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const limit = Math.max(1, Math.min(10, Number(searchParams.get("limit") || 3)));

  // 수동 URL 지정 가능 (&url=... 여러 개)
  const urlParams = searchParams.getAll("url").filter(Boolean);

  if (!q && urlParams.length === 0) {
    return NextResponse.json({ error: "Missing `q` or `url`" }, { status: 400 });
  }

  // --- 크롤 대상 URL 후보 구성 ---
  const domains = urlParams.length
    ? [] // 직접 URL이 있으면 도메인 추정 생략
    : candidateDomains(q);

  const urls: string[] = [];
  if (urlParams.length) {
    urls.push(...urlParams);
  } else {
    for (const d of domains) {
      for (const p of PATH_CANDIDATES) {
        urls.push(d.replace(/\/+$/, "") + p);
      }
    }
  }

  // --- 긁어서 스니펫 추출 ---
  const snippets: string[] = [];
  const sources: string[] = [];
  for (const u of urls) {
    try {
      const html = await fetchText(u);
      if (!html) continue;
      const text = htmlToText(html);
      const parts = extractSnippets(text);
      for (const s of parts) {
        if (snippets.length >= limit) break;
        if (!snippets.includes(s)) {
          snippets.push(s);
          if (!sources.includes(u)) sources.push(u);
        }
      }
      if (snippets.length >= limit) break;
    } catch {
      // ignore
    }
  }

  return NextResponse.json(
    {
      q,
      snippets,
      sources, // 프런트에서 표시할 수 있게 원문 출처 반환
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
